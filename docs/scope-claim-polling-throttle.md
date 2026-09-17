# Scope: throttle the invitation claim poll

Date: 2026-09-15. Owner: unassigned. Size: small.

## Why

`claim-invitations` is the largest Edge Function consumer in the app. On
Supabase Free the limit is 500,000 invocations per month, and that limit
binds before MAU and before storage. See
`docs/backend-cost-analysis-2026-09-15.md`.

Cutting this call from about 35 per bound user per month to about 12 raises
the free-tier ceiling from about 55,000 to about 160,000 installed users.

## What the code does today

`hooks/useInvitationCheck.ts` calls `checkForInvitations()`:

1. once on mount (cold start and every JS reload), and
2. on **every** `AppState` transition to `"active"`.

`app/_layout.tsx:114` mounts the hook, so this runs for the whole app.

A user who opens the app 30 times in a month makes 30 calls, and almost all
of them return an empty list.

## The important finding

**The push-triggered claim path already exists and is complete.** Three
triggers already claim without the poll:

| Trigger | Location |
|---|---|
| Push arrives while the app is open | `NotificationResponseHandler.tsx`, `addNotificationReceivedListener` |
| Push is tapped | `notificationResponseHandler.ts`, `deps.checkForInvitations` |
| Push is tapped while the app is dead | `tasks/notificationResponseTask.ts` (relies on launch) |

So this is **not** a task to add push triggering. It is a task to stop the
unconditional poll, and to keep a bounded safety net for the cases where push
fails (no FCM token, permission denied, dead token, OEM power manager).

`claimPendingInvitations()` already returns `[]` with no network call when
there is no session (`InvitationService.ts:134`). An unbound user costs
nothing today. Do not change that.

## Design

Add a gate in front of the two polling calls only. Leave all three
push-driven calls ungated.

The gate is a pure function, so it tests without AsyncStorage. This matches
the pattern already used in `services/notificationResponseHandler.ts` and in
the Edge Functions.

```ts
// services/invitationClaimThrottle.ts (new)
export const CLAIM_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Pure. No storage, no clock, no network - both inputs are passed in. */
export function shouldClaimNow(
  lastClaimAt: number | null,
  now: number,
  pushPending: boolean
): boolean {
  if (pushPending) return true;      // a push landed; the cooldown does not apply
  if (lastClaimAt === null) return true; // never claimed on this install
  return now - lastClaimAt >= CLAIM_COOLDOWN_MS;
}
```

Around it, thin AsyncStorage accessors in the same file:
`getLastClaimAt()`, `setLastClaimAt()`, `getPushPending()`, `setPushPending()`.

### Rules

1. `useInvitationCheck` (mount and foreground) asks the gate first. It skips
   the network call when the gate says no.
2. Every successful claim writes `lastClaimAt`, whatever started it. This
   includes the push-driven claims, so a push resets the cooldown.
3. A claim started by a push clears `pushPending`.
4. `notificationResponseTask.ts` is headless and has no navigator. It sets
   `pushPending = true`. The next launch then claims, and the cooldown does
   not block it.
5. A cold start with `lastClaimAt === null` always claims. A fresh install
   must never wait.

### Why 6 hours

It caps the poll at 4 calls per day, and in practice gives 4 to 8 calls per
month, because the app must be opened for a poll to happen at all. Put the
value in one exported constant, so it is one edit if the numbers change.

## Files to change

| File | Change |
|---|---|
| `services/invitationClaimThrottle.ts` | **New.** `shouldClaimNow()` plus 4 storage accessors. |
| `hooks/useInvitationCheck.ts` | Gate the mount call and the `AppState` call. Record `lastClaimAt` after a claim. |
| `components/NotificationResponseHandler.tsx` | Record `lastClaimAt` and clear `pushPending` after the received-listener claim. Add no gate. |
| `services/notificationResponseHandler.ts` | Record `lastClaimAt` after `deps.checkForInvitations()`. Add no gate. |
| `tasks/notificationResponseTask.ts` | Set `pushPending = true`. |

## Tests

| File | Cases |
|---|---|
| `services/invitationClaimThrottle.test.ts` | **New.** Null last-claim claims. Inside the cooldown skips. Outside claims. `pushPending` overrides the cooldown. Boundary at exactly `CLAIM_COOLDOWN_MS`. |
| `hooks/useInvitationCheck.test.ts` | Add: a second foreground resume inside the cooldown makes no network call. A resume after the cooldown does. |
| `components/NotificationResponseHandler.test.tsx` | Add: a push-received claim happens inside the cooldown. It writes `lastClaimAt`. |

Run after the change:

```
pnpm --filter @workspace/mobile run typecheck
pnpm --filter @workspace/mobile run test
```

## Device tests

Add to `device-tests/remind-others.md`, status `PENDING`:

1. Send an invitation to a device that has push working. Confirm the
   recipient sees it without opening and re-opening the app.
2. Turn off notification permission on the recipient device. Send an
   invitation. Confirm the recipient still sees it on the next cold start.
3. Foreground and background the app 5 times inside one hour. Confirm only
   one claim reaches the server. Read `pg_stat_statements`, or the Supabase
   Edge Function log, for the count.

Item 3 is the one that proves the saving. Jest cannot prove it.

## Risk

| Risk | Control |
|---|---|
| A recipient with broken push waits up to 6 hours. | The push path stays ungated, so this only affects a device where push already fails. Item 2 in the device tests covers it. |
| The cooldown blocks a fresh install. | Rule 5. `lastClaimAt === null` always claims. |
| A stale `pushPending` flag forces a claim every launch. | Clear the flag in the same step that records `lastClaimAt`. |

## Out of scope

- No change to `claim_invitations()` SQL.
- No change to the `claim-invitations` Edge Function.
- No change to `lookup`, `send-invitation` or `respond-invitation`.
- No move off Supabase.

---

## Correction, 2026-09-15 (post-implementation review)

The design above shipped, then an adversarial review found six defects. All
six are fixed. Three changes contradict what this document specified:

1. **`CLAIM_COOLDOWN_MS` is 1 hour, not 6.** `invitations.expires_at` equals
   the reminder's own `datetime`, so a cooldown longer than the invitation's
   horizon does not delay the invitation, it destroys it. A 6-hour cooldown
   outlives most reminders people send. The "Why 6 hours" section above is
   wrong and is kept only to show what the mistake was.
2. **A claim that fails must not start a cooldown.** `checkForInvitations()`
   now returns `ClaimOutcome { ok, claimed }`, because "the server said
   nothing is waiting" and "we never reached the server" were the same empty
   array. Rule 2 above said "every successful claim writes `lastClaimAt`";
   the code could not tell success from failure, so an offline app-open
   blinded the app for the whole window.
3. **`pushPending` clears on any reached-server claim, not only one that
   returned rows.** The headless task claims the row itself, so the launch
   that follows sees an empty list; gating the clear on `claimed.length`
   left the flag set forever and disabled the throttle permanently.

Also added: a `now < lastClaimAt` guard for a backward clock jump; the
received-push listener arms `pushPending` *before* claiming so a failed claim
is not lost; and `hooks/useInvitationCheck.integration.test.ts`, which runs
the hook against the real throttle and real AsyncStorage (the original tests
stubbed the gate, so every defect above was invisible to them).

### Known gap, not fixed here

A push that arrives while the app is fully backgrounded and is **dismissed
without a tap** sets no flag, because no JS runs to set one. Closing that
needs a background received-notification task, which is a larger change.

Separately, and pre-existing: the headless tap path claims the invitation but
has no navigator, so the launch that follows claims nothing and shows nothing.
The row is the recipient's in the database, but no preview is presented.
