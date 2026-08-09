# Remind Someone Else (Tier 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a reminder name a recipient from phone contacts; at the reminder's time the sender's phone rings, and tapping the notification opens a review screen one tap from a pre-filled WhatsApp or SMS message.

**Architecture:** One optional `recipient` object on `Reminder` plus a single `isSendReminder()` predicate that every consumer routes through. All the risky logic is pure and unit-testable — phone normalization, invite-nudge staging, message composition, link building — with the notification-routing branch reusing the existing dependency-injected handler. No backend, no accounts, no push tokens.

**Tech Stack:** React Native / Expo, TypeScript, AsyncStorage, expo-contacts (new), expo-notifications, Jest + @testing-library/react-native.

**Backlog:** item M4 (`backlog.md`). Tier 2 (app-to-app delivery + acknowledgement) is deferred and tracked there.

**Status:** approved 2026-08-09, not yet started.

---

## Context

Backlog item M4. Today the app has no way to involve another person in a
reminder: the sole outbound share in the entire codebase is `Share.share` for
debug logs (`app/(tabs)/settings.tsx:51`).

An interview settled the scope. The user wants to remind **family elsewhere,
friends/colleagues, and groups**, and wants **acknowledgement** — but accepts
that acknowledgement only works for people who install the app. That splits the
feature in two:

- **Tier 1 (this plan):** at reminder time the *sender's* phone rings. They tap,
  review a pre-filled message, and send it via WhatsApp or SMS. Entirely
  on-device — no backend, no accounts, no push tokens.
- **Tier 2 (deferred, designed later):** real app-to-app delivery with
  acknowledgement, for recipients who install the app. Needs a users table,
  auth, push tokens, and a deployed server — none of which exist today
  (verified: the API server has exactly one endpoint, `GET /api/healthz`, and
  `lib/db/src/schema/index.ts` defines zero tables).

Tier 1 ships alone and is useful alone. Every outgoing message carries a witty
invite so recipients discover the app — which is what makes Tier 2 viable later.

**Outcome:** a reminder can name a recipient; at its time the sender gets a
notification, taps it, and is one tap from a pre-filled WhatsApp/SMS message.

### The honest framing — this constrains the copy

This is **"remind me to message someone,"** not "remind someone else." The
recipient's phone never rings. If the sender ignores the notification, nothing
reaches the recipient and they never know.

**No user-facing string may imply delivery.** Section header is "Sending", the
button is "Send now", never "Remind Priya". Getting this wrong produces "my wife
never got the reminder" complaints and poisons Tier 2 before it exists.

Also settled and non-negotiable: **a phone app cannot send a message silently.**
Not on iOS, not on Android, not with any API available here. Every path ends
with the user in WhatsApp/Messages with text pre-filled, tapping send themselves.

### Decisions from the interview

| Decision | Choice |
|---|---|
| Recipient source | Phone contacts (`expo-contacts`) — not free-typed |
| Notification behavior | Tap opens the app to a review screen. **Not** a 4th tray action |
| Home screen | Own section, separate from personal reminders |
| Invite nudge | On by default, **capped at 3 per person**; messages 2–3 are *follow-ups*, not repeat invitations |
| Nudge opt-out | Global setting **and** a per-send toggle |
| Completion | Explicit — never auto-complete on Send |
| Completed reminders | Still openable and sendable (covers mis-taps and re-sends) |

## Scope

**Tier 1 only.** No backend, no accounts, no push tokens, no acknowledgement.
The data model must not corner Tier 2 — hence `recipient` is an *object*, so
`appUserId`/`deliveryStatus`/`acknowledgedAt` can be added later as purely
additive optional fields.

Do **not** add a `deliveryMode` discriminator now. A speculative enum with one
value invites code to switch on it before the second case exists.

## Data model

One optional field on `Reminder` in `services/ReminderService.ts`:

```ts
export interface ReminderRecipient {
  name: string;        // snapshot at pick time — never re-resolved
  phone: string;       // raw, exactly as the OS gave it
  contactId?: string;  // advisory only
}

export interface Reminder {
  // ...existing
  recipient?: ReminderRecipient;
}
```

Plus one predicate, used **everywhere** so "is this a send reminder" has a
single definition:

```ts
export function isSendReminder(r: Reminder): boolean {
  return !!r.recipient?.phone;
}
```

Three constraints drive this shape:

- **Optional, not required.** `loadReminders` does a bare
  `JSON.parse(raw) as Reminder[]` with no migration mechanism — the `_v1` in
  `STORAGE_KEY` is naming convention only, nothing reads it. A required field
  would be `undefined` on every existing record with no type error. Follows the
  `alarm?: boolean` precedent.
- **Name is a snapshot.** Never re-resolve from contacts. If the contact is
  deleted the reminder still works; if the user revokes READ_CONTACTS the home
  screen still renders; and no async contacts lookup happens per card.
- **Phone stored raw, normalized at send time.** Contact strings vary wildly
  (`+91 98765 43210`, `098765 43210`, `9876543210`). Normalizing on save bakes
  in a heuristic permanently; normalizing at send means a fixed heuristic
  repairs every existing reminder with no migration.

A `recipient` object with an empty `phone` must behave as a normal reminder —
otherwise the send screen renders with a dead Send button.

Widen `scheduleNotification`'s `Pick` to include `recipient` so the notification
body can read "Message Priya" instead of "Reminder!" — small change, real
lock-screen clarity win.

**Do not add `isSend` to `NotificationData`.** Notifications already in the tray
at upgrade time won't carry it, and an unused payload field that looks
authoritative is a trap. Routing reads storage instead (see below).

## Sending mechanism

**WhatsApp:** `https://wa.me/<digits>?text=<encoded>` — the `wa.me` universal
link, **not** `whatsapp://`. It resolves to the installed app via App/Universal
Links and degrades to a browser install page when WhatsApp is absent;
`whatsapp://` needs an iOS `LSApplicationQueriesSchemes` entry and hard-fails.
`<digits>` must be digits only with country code, no `+` or spaces.

**SMS:** `sms:<phone>?body=` on Android, `sms:<phone>&body=` on iOS. The
separator genuinely differs — a `Platform.OS` branch in a pure tested function.

**Normalization** (`utils/phoneNumber.ts`, pure): strip to digits and a leading
`+`; leading `+` → use as-is; leading `00` → strip; leading `0` with 10 digits
remaining → strip and prepend country code; exactly 10 digits → prepend country
code; otherwise → `null`, do not guess.

Derive the country code from `getLocales()[0].regionCode` (already a dependency;
the mock already returns `regionCode`) via a small region→calling-code table.
**Do not hardcode `91`** — that breaks NRI users, a meaningful cohort for a
Malayalam-supporting app.

On `null`, skip WhatsApp entirely, use SMS with the raw number, and say why:
*"Couldn't read this number for WhatsApp — SMS will be used."* A broken `wa.me`
link is worse than a working SMS.

**No automatic fallback chain.** `Linking.openURL` resolving means an app
opened, not that a message was composed — an automatic WhatsApp→SMS fallback
would fire for cases that actually worked. Instead the send screen shows **both
buttons**, WhatsApp primary, SMS secondary, with emphasis swapped when
normalization failed or WhatsApp is absent.

Cap the composed message at ~900 chars in the pure compose function — title
(300) + description (1000) + nudge can exceed practical intent-URI limits.

**Unfixable, must be designed around:** there is no API to check whether a
number is registered on WhatsApp. It will happen. The only mitigation is the
SMS button being one tap away when the user returns.

## The invite nudge

New pure module `utils/inviteNudges.ts` — no React, no storage, no I/O.

**Three-stage, capped.** Per the user's refinement, messages 2 and 3 are
follow-ups that acknowledge the recipient has seen this before — funnier than a
repeated pitch, and less like spam:

1. First send — introduces the app.
2. Second — acknowledges the repeat.
3. Third — last one, says so.
4. Fourth onward — **nothing appended, ever.**

Sample lines (English; all frame the *sender* as forgetful, never the recipient
— mocking the recipient is the cringe failure mode; all parenthesised so they
read as a footnote; no emoji, no URL):

- *First:* `(Sent via Reminders — because my memory has a free trial that expired.)`
- *First:* `(Reminders app: for people who mean well and forget anyway. Guilty.)`
- *First:* `(Yes, an app told me to send this. No, I'm not proud.)`
- *Second:* `(Still the Reminders app doing the remembering. Still not me.)`
- *Second:* `(Me again. Well — the app again, technically.)`
- *Third:* `(Last plug, promise. Reminders app. Then I'll stop.)`
- *Third:* `(Third and final mention of the app that runs my life. Carry on.)`

**No URL in any line** — deliberate. A bare store link makes the message look
like spam, risks WhatsApp's link heuristics, and with no backend there's no
attribution to gain. Revisit in Tier 2 with a real link.

**Variety within a stage:** pick deterministically from a hash of the phone
number, so different recipients get different lines and the same recipient never
repeats. Advance the per-contact counter **only on actual Send**, not on screen
render, or opening the screen twice burns a stage.

State lives in `@invite_nudge_count_v1`, keyed by normalized phone digits (not
`contactId` — that changes across devices and contact merges). FIFO-cap the map
at ~200 entries.

**Opt-out at both levels:**
- Global: a Settings switch (`@invite_nudge_enabled_v1`), mirroring
  `defaultAlarmEnabled` exactly. Default **on**.
- Per-send: a toggle on the send screen, seeded from the global. This is the one
  that matters — "is this appropriate for this person right now" is inherently
  per-message.

The nudge lives *inside* the editable message `TextInput` so the preview updates
visibly. If the user has manually edited the text, the toggle must
append/remove only the exact nudge line by string match; if the match fails,
disable the toggle rather than mangling their text.

**Malayalam nudges are deliberately deferred.** These lines are idiom-heavy and
machine translation produces exactly the cringe the requirement exists to avoid.
They need a native speaker to write, not translate. The module structure
supports `INVITE_NUDGES_ML` keyed off `dictationLanguage` whenever that happens.

## Screen flow

**A new `app/send-reminder.tsx`** — not a param on `reminder-detail.tsx`.

Three reasons, the first decisive:

1. `reminder-detail.tsx:219-227` renders *only* "already completed or removed"
   when `!reminder || reminder.completed`. Any Send button in the action stack
   (248-281) is unreachable there. Restructuring that branch is risky — three
   tests pin it (`reminder-detail.test.tsx:82-98`).
2. Different job: detail is triage (four equal actions, no input); send needs a
   multiline editable input, a nudge toggle, a recipient header, and two
   differently-weighted send buttons.
3. Notification routing gets simpler — branch once, pick a pathname.

**Routing** — replace the body-tap branch at
`services/notificationResponseHandler.ts:59-62`:

```ts
if (response.actionIdentifier === deps.defaultActionIdentifier) {
  const reminder = await deps.loadReminderById(data.reminderId);
  deps.navigateToDetail(data.reminderId, {
    openSnoozeSheet: false,
    isSend: !!reminder?.recipient?.phone,
  });
  return;
}
```

**Trust storage, not the payload** — same discipline the snooze branch already
uses at line 76, for the same reason: a notification sitting in the tray across
an upgrade carries no new fields (the `SNOOZE_ACTION_ID` comment at
`ReminderService.ts:31-41` documents this class of bug). The function is already
`async` and `loadReminderById` is already a dep, so no new deps are needed.

A missing reminder yields `isSend: false` → routes to `reminder-detail`, which
already handles the missing case. Correct degradation.

`components/NotificationResponseHandler.tsx:36-44` picks the pathname. Params
serialize to strings — follow the existing `"1"`-not-boolean convention.
`tasks/notificationResponseTask.ts:75` keeps its no-op: body taps always
foreground the app.

**The send screen must NOT gate on `completed`.** Per the user's decision, a
completed send reminder still renders its message and Send buttons — the likely
reasons for opening one are "marked done by mistake" or "want to send again."
It does need a missing-reminder guard, a not-a-send-reminder redirect, and the
loading-gate ordering from `reminder-detail.test.tsx:69` (loading before the
missing branch, or a cold start from a notification flashes "removed").

**Completion is explicit, never automatic.** `Linking.openURL` returns when an
app *opens*, not when a message is sent — auto-completing would silently hide
unsent messages, defeating the feature. Four paths, all already cheap:

1. "Mark done" on the send screen (one extra tap — the only added cost).
2. The card checkbox on Home — unchanged, one tap.
3. The notification's Mark Done button — one tap, works headlessly.
4. Otherwise it stays visible in "Sending", which is the point.

**Entry points:** notification tap; tapping a send card on Home (route to
`/send-reminder`, not `/add-reminder` — tapping "message Priya" should let you
send, not edit); and sending early, which falls out of the same route.

## Home screen third section

`app/(tabs)/index.tsx` — order **Sending → Upcoming → Completed**. Sending goes
first: it has an action attached and a missed send can't be recovered by the
recipient.

Label `"Sending"` (the header style uppercases via `textTransform`). "Reminders
I'm sending" is the right concept but wraps at 13px letterspaced.

**Carve `sending` out of `upcoming`, don't layer it** — otherwise send reminders
appear twice:

```ts
const sending   = reminders.filter(r => !r.completed &&  isSendReminder(r)).sort(byDatetimeAsc);
const upcoming  = reminders.filter(r => !r.completed && !isSendReminder(r)).sort(byDatetimeAsc);
const completed = reminders.filter(r =>  r.completed).sort(byDatetimeDesc);
```

Completed stays mixed — a fourth section for completed-sends is over-engineering.

**Header subtitle must count both** (`upcoming.length + sending.length`).
Otherwise the count silently drops when a send reminder is added, which reads as
a bug. The existing test (`index.test.tsx:59-75`) will *not* catch this — its
fixtures have no recipients.

The `marginTop` chain at line 250 stops scaling at three sections; replace with
a positional "first rendered section" helper. Cosmetic — don't let it block.

**`components/ReminderCard.tsx`:** recipient chip in the title row (130-140,
which already has a conditional trailing-icon slot for `bell-off`) — a small
`send` icon plus first name, `numberOfLines={1}`, with `flexShrink: 1` on the
title so a long name can't push it off. Chip and bell-off coexist. Checkbox
behavior unchanged. Body press routes by `isSendReminder`.

## Contact picking

**In-app searchable full-screen modal** — not the OS picker, not a bottom sheet.

The OS picker looks alien, returns unpredictable field sets, and behaves
inconsistently across Android OEM skins. A bottom sheet leaves ~200px of list
with the keyboard up. Use `SnoozeSheet`'s visual language (handle, title,
Pressable rows, `accessibilityState.selected`, per-item testID helper) in a
full-screen container with a search input.

**Use `FlatList` here specifically** — the rest of the app uses `.map()` in
ScrollViews, fine for tens of reminders but not for 500–2000 contacts. Comment
the deviation so nobody "fixes" it.

**Permission flow:** `getPermissionsAsync()` first; only call
`requestPermissionsAsync()` in direct response to a "Choose contact" tap — never
on mount. Show a one-line rationale before the OS dialog: *"Contacts stay on
your phone — nothing is uploaded"* (true in Tier 1, and it doubles as the Play
Store justification).

**On denial:** non-fatal. The reminder is still creatable without a recipient;
show an inline "Contacts access is off — Open Settings" row using
`Linking.openSettings()`, the pattern already at `QuickAddInput.tsx:279`. Do not
add free-text phone entry as a hidden fallback — the user ruled out free-typing,
and it would mean maintaining an unvalidated-number path for a minority.

**Multiple numbers:** flatten, so a 3-number contact is 3 rows labeled
`Priya · Mobile`. Dedupe on normalized digits — contacts often store the same
number twice with different formatting.

**In `add-reminder.tsx`:** a card between the "Parsed as" preview and the Alarm
toggle — after the *what/when*, before the *how it notifies*. A `previewRow`-like
Pressable: `user` icon, 44px "To" label, then the name or "Nobody — just remind
me", with a clear (`x`) affordance when set. Seed in edit mode inside the
existing `seededFromExisting` guard (81-89). The payload at 127-132 gains
`recipient: recipient ?? undefined` — **never `null`**, or storage gets an
object whose `?.` checks pass while `phone` is missing.

**`app.json`:** `READ_CONTACTS`, `NSContactsUsageDescription`, and the
`expo-contacts` plugin. `expo-contacts` is not currently installed (verified).
**This requires a new native build — it will not work over OTA.**

## Tasks

Dependency-ordered; each independently testable and committable. Repo
convention: failing test first, verified failing for the right reason, then
implement, then commit. All tests green at every commit —
`npx jest` from `artifacts/mobile`, `pnpm run typecheck` from root.

| # | Task | Notes |
|---|---|---|
| T1 | `ReminderRecipient` type + `isSendReminder` | Assert legacy JSON with no `recipient` still parses |
| T2 | `utils/phoneNumber.ts` normalization | **Do early** — highest-risk logic, cheapest to verify. Pure |
| T3 | `utils/inviteNudges.ts` — 3 stages + compose | Pure. Cap, variety, truncation |
| T4 | Per-contact nudge count persistence | Defensive corrupt-JSON read, mirroring `getSnoozePreset` |
| T5 | Global nudge setting + Settings switch | Clone the `default-alarm-switch` test |
| T6 | `services/messageLinks.ts` | URL shape + the iOS/Android `sms:` separator split |
| T7 | `services/ContactsService.ts` + `__mocks__/expo-contacts.ts` | Flatten, dedupe, denied-permission result |
| T8 | `components/ContactPickerModal.tsx` | Search by name and number; denied state |
| T9 | Recipient row in `add-reminder`, wired to picker | Assert `'recipient' in stored[0] === false` when unset |
| T10 | `app.json` permissions + install `expo-contacts` | **No Jest coverage. Needs a native build** |
| T11 | Home screen third section | No duplication across sections; subtitle counts both |
| T12 | `ReminderCard` chip + routing | Chip and bell-off coexist |
| T13 | `app/send-reminder.tsx` + route registration | **Must include the "renders send buttons when completed" regression guard** |
| T14 | Notification routing | Recipient → send; none → detail; not-found → detail (upgrade safety) |

T10 is sequenced late so it doesn't block T1–T9's testable work.

## Verification

**Automated** — `npx jest` from `artifacts/mobile` (currently 312 passing across
21 suites; all must stay green) and `pnpm run typecheck` from the repo root.

The high-value pure units — phone normalization, nudge staging, message
composition, link building, and the notification routing branch (pure and
dependency-injected) — are fully Jest-testable and carry most of the risk.

**Device-only — Jest cannot verify any of this:**

- `wa.me` actually opening WhatsApp rather than a browser. Test on a device
  where WhatsApp was installed *after* this app — Android App Links
  verification is a real failure mode.
- WhatsApp actually pre-filling the text.
- The "number not on WhatsApp" path.
- `sms:` pre-fill on real iOS and Android — Samsung Messages, Google Messages,
  and iOS Messages each differ.
- Contacts permission dialogs, and the denied-then-re-granted path.
- Contacts list scroll performance at 1000+ contacts.
- Notification tap → send screen from **cold start** (the
  `getLastNotificationResponseAsync` path; Jest covers only the listener).
- Anything involving `expo-contacts` in Expo Go — it needs the native module,
  so a dev build is required.

**Manual smoke sequence:** create a reminder with a recipient a minute out →
lock the phone → tap the notification when it fires → confirm the send screen
opens with the message and the invite line → toggle the invite off and watch the
preview update → send on WhatsApp → return → confirm the reminder is still in
"Sending" → mark done → confirm it moves to Completed.

## Risks

1. **The name oversells it.** Tier 1 cannot deliver to the recipient. Copy
   discipline is the mitigation; this is the top risk and it's a copy risk, not
   a code risk.
2. **Success is unobservable.** The app cannot know a message was sent — hence
   explicit completion.
3. **WhatsApp registration is uncheckable.** No API exists. SMS must be
   prominent, not hidden.
4. **Normalization will be wrong for someone.** Mitigated by normalizing at send
   time (fixable without migration) and falling back to SMS with a visible
   reason.
5. **`READ_CONTACTS` raises Play Store review friction.** Contacts access in a
   reminders app isn't self-evident. Write the justification before submitting;
   the in-app rationale doubles as it.
6. **Three unbounded sections in a non-virtualized ScrollView.** Not a Tier 1
   blocker at realistic counts, but this file needs `SectionList` before a
   fourth section lands.
7. **Malayalam nudges deferred deliberately** — flagged as a decision, not an
   oversight.
