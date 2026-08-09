# Snooze presets — design

**Date:** 2026-08-07
**Status:** approved

## Problem

Snoozing is hardcoded to exactly 10 minutes. The value appears as
`SNOOZE_MINUTES = 10` in `ReminderService.ts` and drives three separate paths:
the notification-tray action button, the "Snooze 10 min" button on the reminder
detail screen, and `snoozeReminder()` in the service. A user who wants a
different interval has no way to ask for one.

This is a small, contained gap with visible daily payoff, chosen ahead of
recurring reminders (a much larger effort) as the next thing to land.

## Scope

In scope: user-selectable snooze duration, in-app and from the notification
tray. Out of scope: recurring reminders, per-reminder persisted snooze
preferences, absolute-time snooze targets other than "tomorrow same time".

## Decisions

All settled with the user during brainstorming.

| Question | Decision |
|---|---|
| How does the user pick a duration? | A bottom sheet on the reminder detail screen |
| Which presets? | 5 / 15 / 30 / 60 minutes / Tomorrow same time |
| Where does the persisted default come from? | The user's last choice in the sheet. **No Settings row.** |
| Does the tray button support "tomorrow"? | Yes, fully — label reads "Snooze to tomorrow" |
| Base for "tomorrow same time"? | The reminder's *current* `datetime` + 24h |

The default-from-last-choice decision is what keeps this feature free of new
Settings UI: the tray button converges on whatever the user actually uses.

## Data model

A new persisted setting, following the existing `dictationLanguage` pattern:

```ts
export const SNOOZE_PRESET_KEY = "@snooze_preset_v1";

export type SnoozePreset =
  | { kind: "minutes"; minutes: 5 | 15 | 30 | 60 }
  | { kind: "tomorrow" };

export const DEFAULT_SNOOZE_PRESET: SnoozePreset = { kind: "minutes", minutes: 15 };
```

`getSnoozePreset()` / `setSnoozePreset()` are JSON-encoded with a
parse-failure fallback to `DEFAULT_SNOOZE_PRESET`, so a corrupt stored value
cannot wedge snoozing.

`SnoozePreset` is a discriminated union rather than a plain minute count
because "tomorrow same time" is not a fixed number of minutes — every other
preset is a delay from *now*, while "tomorrow" is +24h from the reminder's
*scheduled* time, and those differ because the user snoozes at an arbitrary
moment rather than exactly at fire time.

**The `Reminder` interface is unchanged.** No new field, no migration. This is
what the "current datetime + 24h" decision bought: repeated snoozing to
tomorrow simply moves the reminder further out, with no anchor field needed.

### `SNOOZE_MINUTES` is removed

The constant is deleted, not left as a dead export. It is currently the
*expected value* in three arithmetic test assertions
(`ReminderService.test.ts:256`, `:583`, `notificationResponseHandler.test.ts:77`).
Retaining it while production code stopped reading it would leave tests that
pass without proving anything. Those assertions are rewritten to compute their
expectation from the preset under test.

### `SNOOZE_ACTION_ID` keeps the value `"SNOOZE_10"`

Deliberately unchanged despite now being a misleading name. The string is
embedded in the `categoryIdentifier` of notifications already scheduled on
users' devices; changing it orphans any notification sitting in a tray at
upgrade time. A comment in the source records this, and backlog item 17 tracks
the migration needed to rename it properly.

## Resolution logic

One pure function, no I/O, shared by every snooze path — this is what
guarantees the tray and the sheet cannot drift apart:

```ts
export function resolveSnoozeTarget(
  preset: SnoozePreset,
  reminderDatetime: string,
  now: Date
): Date
```

- `{kind: "minutes", minutes: n}` → `now + n minutes`
- `{kind: "tomorrow"}` → `reminderDatetime + 24h`

**Stale-reminder guard.** If the computed target is `<= now`, roll forward in
24h steps until it is in the future. Without this, a reminder whose `datetime`
is more than 24h in the past would resolve to a past target and
`scheduleNotificationAsync` would fire it immediately. Rolling forward in whole
days preserves "same time" semantics rather than degrading to "now + 24h".

## Touchpoints

### 1. `SnoozeSheet.tsx` (new)

Modeled directly on the existing `ConfirmSheet.tsx` — same `Modal`, overlay,
drag handle, rounded top, and `useColors()` hook, so it inherits the app's
established sheet language.

Five preset rows plus Cancel. The row matching the current persisted default
shows a check. Selecting a row does two things: performs the snooze, and
persists that choice as the new default.

### 2. Reminder detail screen

`handleSnooze` no longer snoozes — it opens the sheet. The button label becomes
just "Snooze", since it can no longer name a fixed duration. The existing
`testID="snooze-button"` is retained.

### 3. Notification tray

`setupSnoozeCategory()` takes the current preset and labels its button
accordingly: `"Snooze 15 min"` or `"Snooze to tomorrow"`. It is re-invoked
whenever the preset changes.

`handleNotificationResponse` gains two deps — one to read the preset, one to
load the reminder (it already has `data.reminderId`) — and routes through
`resolveSnoozeTarget`. The handler's injectable-deps shape makes this clean to
test.

### 4. Service signature changes

`scheduleSnoozeNotification` currently computes its own delay internally; it
changes to accept a target `Date`. `snoozeReminder(current, id)` likewise gains
a target-date parameter rather than computing the delay itself.
`ALARM_EARLY_OFFSET_MS` subtraction is unchanged.

## Testing

`resolveSnoozeTarget` carries the bulk of the coverage — it is pure, so every
preset, the stale-reminder roll-forward, and the boundary where the target
equals `now` are all directly assertable.

Existing tests that must be **extended, not deleted**:

- `reminder-detail.test.tsx` — the snooze test presses the button and asserts
  storage changed. That behavior genuinely changed (the button now opens a
  sheet), so the test is extended to press through the sheet to a preset.
- `ReminderService.test.ts` — the two `snoozeReminder` tests and the
  `scheduleSnoozeNotification` test lose their `SNOOZE_MINUTES` arithmetic in
  favor of an explicit target date.
- `notificationResponseHandler.test.ts` — asserts the handler resolves through
  the preset rather than a fixed 10 minutes.

## Known risks

**Category re-registration is fire-and-forget.** `setupSnoozeCategory` swallows
errors in a `catch {}`. If re-registration fails after a preset change, the
tray label goes stale while in-app behavior stays correct. This is cosmetic
only — the action ID and handler still work, so the button does the right thing
under a wrong label. Accepted rather than adding error surfacing.

**Unverifiable in Jest — needs device smoke test.** Whether Android actually
updates an already-registered notification category's button label is a genuine
unknown that cannot be resolved from the test environment. If it does not, the
new label applies only to notifications scheduled after the change. This is a
manual verification item, not an assertion.
