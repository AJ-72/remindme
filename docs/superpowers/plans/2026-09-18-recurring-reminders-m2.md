# M2 — Recurring reminders (English), implementation plan

**Backlog item:** M2 (`backlog.md`, "Major features"). Effort: L.
**Scope of this plan:** English only. Malayalam recurrence is explicitly out of
scope and gets its own follow-up item.
**Design decisions** were settled in a brainstorming session on 2026-09-12;
the "Decisions and why" section below records them so this plan can be
executed without re-litigating them.

---

## Decisions and why

These were argued through and settled. Do not re-open them mid-implementation;
if one turns out to be wrong, stop and flag it rather than quietly choosing
differently.

| Decision | Rationale |
| --- | --- |
| **Hand-rolled on-device parser.** Not Duckling. | Duckling is a server-only Haskell service with no JS/RN binding — using it means a network call per parse. The app's stated differentiator is on-device, no-account, no-network parsing (CLAUDE.md, "Strategic context"). A network dependency for English recurrence while Malayalam stays on-device is both inconsistent and a real offline regression. |
| **Full pattern set**: daily, weekly, monthly, yearly, and custom intervals ("every 2 weeks", "every 3 days"). | Chosen deliberately over a daily+weekly-only v1. |
| **Rolling reschedule-on-fire.** Keep one-shot `SchedulableTriggerInputTypes.DATE` triggers; re-arm for the next occurrence. Do **not** adopt `expo-notifications`' native repeating/calendar trigger types. | A native repeating trigger is a second, parallel scheduling path next to the existing DATE-trigger code, and every existing mechanism — snooze, exact-alarm/`setAlarmClock`, the boot-reschedule task, `cancelScheduledForReminder` — assumes one trigger means one upcoming fire time. Rolling re-arm inherits all of that unchanged. |
| **Advance in place.** A completed occurrence rolls the *same* record forward to the next occurrence. No per-occurrence history rows. | Matches how `snoozeCount`/`originalDatetime` already treat a reminder as one mutable timeline rather than a log, and avoids unbounded storage growth (a row per occurrence, forever). Accepted cost: no per-occurrence completion history. This is consistent with CLAUDE.md's "Adherence is derived, not logged". |
| **Advance on fire, not only on explicit completion.** | "Every day at 8" means tomorrow's is still expected even if today's was ignored. Advancing only on Mark Done would let one ignored occurrence stall the series permanently. |
| **Fire-hook gap is covered by best-effort listener + catch-up sweep.** | `addNotificationReceivedListener` only runs while the app process is alive (already documented as a real limitation on `Reminder.notifiedAt`). A killed app at 8am would otherwise stall the series. The catch-up pass self-heals it on next app open / next sweep. |
| **Both NL parsing and an explicit editable "Repeats" control**, in both entry screens. | Mirrors how date/time already works: parsed from text, but also editable via picker rows. Editing a recurring reminder's pattern must not require retyping the phrase. |
| **Adherence: count the occurrence as it advances** (Option 1). Confirmed 2026-09-18. | Advance-in-place otherwise makes every completed occurrence score as `pending`, so a perfectly-kept daily habit contributes nothing to completion rate or streak (proved by probe, see "Cross-cutting impact" A). Recording the retiring occurrence's outcome on the record keeps the "derived, not logged" principle while letting a recurring reminder contribute N decided outcomes instead of one permanent `pending`. |
| **Snooze anchors on the ORIGINAL schedule**, never the snoozed time. Confirmed 2026-09-18. | "Every day at 8" is a standing intent, not a preference restated each morning. Anchoring on the snoozed `datetime` makes one two-hour snooze silently convert the series to 10am forever. Needs its own series-anchor field — `originalDatetime` is already taken (first-ever time, read by adherence) and must not be overloaded. |
| **Tier 2 CAN carry recurrence** — send the rule, let the recipient's app own the series. Confirmed 2026-09-18, reversing an earlier "block it in v1" recommendation. | The server is a store-and-forward mailbox, not a runtime (`invitations.ts` header): accept transfers the reminder to the recipient's device and it fires from her own local schedule. A recurring invitation is therefore accepted **once** and the series lives on her phone — no repeat sends, no server scheduling. This is the "remind Amma to take her tablet every day" case, which is the feature's headline use. |

---

## Architectural context the implementer must know first

Read these before writing code. Each one is a trap that has already been paid
for once in this codebase.

### 1. The `rearmReminder` guard rejects past-due reminders — by design

`services/ReminderService.ts` has a shared `rearmReminder(reminder, {guard, schedule})`
(landed as backlog B17) backing four call sites: `toggleComplete`,
`snoozeReminder`, `rescheduleAllFutureReminders`, `setAlarmForPendingReminders`.

Its default guard is `isPendingForAlarmRewrite`:

```ts
function isPendingForAlarmRewrite(reminder: Reminder, now: number): boolean {
  if (reminder.completed) return false;
  return new Date(reminder.datetime).getTime() > now;
}
```

**This returns `false` for any past-due reminder, and that is correct** — its
doc explains that rescheduling an already-delivered reminder cancels nothing
and shows a second copy while orphaning the first.

**Consequence for this feature:** a recurring reminder whose occurrence has
just fired *is* past-due. The existing sweep will skip it. The catch-up pass
must therefore **advance `datetime` into the future first, and only then**
re-arm. Do not weaken or special-case `isPendingForAlarmRewrite` — advance
before it, not around it.

### 2. `parseNaturalLanguage.ts` already has the exact precedent to follow

`utils/parseNaturalLanguage.ts` handles `ORDINAL_DAY_RELATIVE_MONTH` — a shape
chrono-node mishandles. The established pattern is: detect the shape with our
own regex, let chrono resolve what it can, override the result, then push the
matched span onto `ranges` so it is stripped from the title
highest-index-first. Recurrence detection follows this pattern exactly.
`daysInMonth(year, month)` already exists in that file for month-end clamping.

**Confirmed behaviour of chrono-node here (verified, do not re-assume):**
chrono resolves the *first* occurrence's date/time correctly for daily/weekly
phrases, but returns **no** recurrence metadata and does not reliably include
the "every …" word in its matched span — so "every day" leaks into the title
today. Monthly/yearly/custom-interval recurrence phrases it does not recognise
as dates at all.

### 3. `Omit<Reminder, "id" | "completed" | "notificationId">` threads new fields automatically

`addReminder`/`editReminder` in both `ReminderService.ts` and
`contexts/RemindersContext.tsx` take that `Omit<…>` payload type. Adding
`recurrence?` to `Reminder` makes it flow through both without any signature
change. Do not add a parallel parameter.

### 4. Optional-field convention: absent means off

`alarm?` and `exactTiming?` both use "undefined means the default", explicitly
so records predating the field keep working with **no migration**. `recurrence?`
follows the same convention: absent means one-shot. **No AsyncStorage migration
is needed or wanted** — this contradicts the original backlog note (e) for M2,
which predates this convention being established.

### 5. The write lock exists and is not universal

`withWriteLock()` currently guards `rescheduleAllFutureReminders`,
`markNotifiedById`, `markOpenedById` — the three known to actually run
concurrently. The new advance path runs from the received listener at the same
moment the mount-time sweep can be in flight, which is **the same race that
motivated the lock**. Any new function that does a load→mutate→save cycle on
the reminders array must go inside `withWriteLock`.

### 6. `isSameReminder` will treat an advanced series as a new reminder

`utils/reminderBackup.ts`'s dedupe compares title + `datetime` only. Because a
recurring reminder advances its `datetime` in place, a backup taken before an
advance and restored after looks like a different reminder and merges in as a
duplicate series. This is addressed in Task 8.

### 7. Analytics has a closed catalogue with a build-failing test

`constants/analytics.ts` is a closed event catalogue, and
`constants/analytics.test.ts` fails the build if a catalogued event loses its
last emitter. `utils/analyticsProps.ts` is the only place reminder-shaped
properties are built, and `AnalyticsProps` accepts only primitives (passing a
whole reminder deliberately fails to compile). **Never send the recurrence rule
as an object.**

### 8. Relevant file sizes (larger than the backlog's 2026-08 estimates)

`components/QuickAddInput.tsx` is **1647** lines (backlog said ~810);
`app/add-reminder.tsx` is **1090** (backlog said ~630). Budget accordingly;
prefer additive changes and a new child component over editing deep inside
either render tree.

---

## Task breakdown

Tasks are ordered so each is independently verifiable and the suite stays green
throughout. **Follow TDD** (`superpowers:test-driven-development`): write the
failing test first, watch it fail for the right reason, then implement.

After **every** task run, from `artifacts/mobile/`:

```bash
pnpm --filter @workspace/mobile run typecheck
pnpm --filter @workspace/mobile run test
```

Baseline before starting: **75 test files**, suite green, typecheck clean.
Quote actual output — do not report a task done from code inspection
(CLAUDE.md, "Verify before claiming done").

---

### Task 1 — `utils/recurrence.ts`: the rule type and next-occurrence math

**Pure module, no I/O, no React.** This is the foundation; everything else
depends on it.

Define:

```ts
export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  /** Every N periods. 1 = every period. Must be >= 1. */
  interval: number;
  /** Weekly only: which weekdays, 0=Sun..6=Sat. Absent = same weekday as the anchor. */
  byWeekday?: number[];
}
```

Deliberately minimal — an RFC5545-*shaped* subset, not an iCal implementation.
No `until`/`count`/`bysetpos` in this version.

Implement `computeNextOccurrence(rule: RecurrenceRule, from: Date): Date`,
returning the next occurrence **strictly after** `from`.

Required behaviours, each its own test:

- **daily**, interval 1 and N: adds N days, preserves clock time.
- **weekly**, no `byWeekday`: adds 7×N days.
- **weekly** with `byWeekday`: advances to the next listed weekday; wraps to
  the following week (×N) after the last one in the list; handles an unsorted
  and a duplicate-containing `byWeekday` without misbehaving.
- **monthly**: same day-of-month, N months on, **clamped** via the existing
  `daysInMonth` logic — Jan 31 + 1 month is Feb 28 (or 29 in a leap year), not
  Mar 3. Test Jan 31 → Feb, and a leap year explicitly.
- **yearly**: same month/day, N years on. **Feb 29 clamps to Feb 28** in a
  non-leap year. Test this explicitly.
- **DST**: preserves wall-clock time across a DST boundary rather than drifting
  by an hour. (Construct dates via local-time components, not by adding
  milliseconds — adding `86400000` ms is the bug this test exists to catch.)
- **Defensive**: `interval < 1`, a non-finite `from`, an unknown `freq` — each
  must not throw or loop. Decide a single documented fallback and test it.

Also export a `describeRecurrence(rule): string` returning the human label used
by the UI ("Daily", "Every 2 days", "Weekly on Mon, Wed", "Monthly on the
15th", "Yearly on 18 Sep"). Keep copy generation here so both screens and the
card agree, and so it is unit-testable without rendering.

**Verify:** new `utils/recurrence.test.ts` green; typecheck clean.

---

### Task 2 — `parseRecurrencePhrase`: detect the pattern in English text

Still pure. Add to `utils/recurrence.ts` (or a sibling — keep the date math and
the text matching in clearly separate exported functions either way):

```ts
export function parseRecurrencePhrase(text: string):
  | { rule: RecurrenceRule; match: { start: number; end: number } }
  | null;
```

It returns the rule **and the matched span**, because the caller must strip
that span from the title using the existing `ranges` mechanism.

Phrases to support (case-insensitive, tolerant of surrounding whitespace):

- `every day`, `daily`, `each day`
- `every weekday` → weekly with `byWeekday: [1,2,3,4,5]`
- `every weekend` → weekly with `byWeekday: [0,6]`
- `every <weekday>` / `<weekday>s` (e.g. "every Monday", "Mondays"), including
  multi-day forms: `every Monday and Thursday`, `every Mon, Wed, Fri`
- `every week`, `weekly`
- `every month`, `monthly`, `monthly on the <N>(st|nd|rd|th)`
- `every year`, `yearly`, `annually`
- `every <N> days|weeks|months|years` and `every other day|week|month|year`
  (→ interval 2)

Test each shape, plus these **negative** cases which must return `null`:

- `"every day"` appearing as part of a longer word or an unrelated phrase
  (e.g. "everyday carry" — no recurrence)
- `"take medicine 3 times every day"` — decide and document whether the count
  interferes; at minimum it must not crash or produce interval 3
- text with no recurrence phrase at all

**Verify:** tests green; typecheck clean.

---

### Task 3 — Thread recurrence through `parseNaturalLanguage`

Extend `ParsedReading`/`ParsedDateTime` (`utils/malayalamDateParser.ts` owns
these types) with an optional `recurrence?: RecurrenceRule`. Optional, so the
Malayalam path simply never sets it and nothing there changes.

In `utils/parseNaturalLanguage.ts`, in the English branch only:

1. Call `parseRecurrencePhrase(text)` **before** the `chrono.parse` call, the
   same way `ORDINAL_DAY_RELATIVE_MONTH` is matched first.
2. If it matched, push its span onto the existing `ranges` array so the phrase
   is stripped from the title by the existing highest-index-first loop. **Do not
   write a second stripping mechanism.**
3. Return `recurrence` on the result.

Critical case to get right and test: **a recurrence phrase with no explicit
time** — "every Monday" with no clock time. chrono may return a date, or may
return nothing. Decide the anchor deliberately:

- If chrono returned a date, that date is the first occurrence.
- If it did not, the first occurrence must be derived from the rule itself
  applied to "now" (e.g. "every Monday" → the next Monday), at a documented
  default time. **Pick one default, document it in a comment, and test it.**
  Do not leave this to chance — it is the difference between a reminder that
  fires and one that silently never does.

Also test that `"buy milk every day at 8am"` yields title `"buy milk"` (not
`"buy milk every day"`) — the title-leak this feature is partly meant to fix.

**Verify:** `utils/parseNaturalLanguage.test.ts` (existing) still green plus
new cases; typecheck clean.

---

### Task 4 — `Reminder.recurrence` and the advance function

In `services/ReminderService.ts`:

Add to the `Reminder` interface, with a doc comment in the established style
(explain the *why*, and state that absent means one-shot / no migration
needed):

```ts
recurrence?: RecurrenceRule;
```

Add an exported pure helper so every consumer agrees on the predicate, mirroring
`isSendReminder`/`isReceivedReminder`:

```ts
export function isRecurring(r: Reminder): boolean {
  return !!r.recurrence;
}
```

Add the advance function. **Pure where possible** — take the reminder, return
the next state — so it is testable without mocking storage:

```ts
/** The reminder advanced to its next future occurrence, or null if it isn't
 *  recurring / has nothing to advance to. Catches up past MULTIPLE missed
 *  occurrences: a phone off for three days must land on the next FUTURE
 *  occurrence, not three days ago. */
export function advanceRecurringReminder(r: Reminder, now: Date): Reminder | null;
```

Required behaviours, each tested:

- Non-recurring → `null`.
- Recurring, `datetime` still in the future → `null` (nothing to advance).
- Recurring and past-due → advanced to the **next strictly-future** occurrence,
  looping `computeNextOccurrence` until it passes `now`. **Bound the loop**
  (a sane max iteration count) so a pathological rule cannot hang the app, and
  test that bound.
- The advanced record **resets per-occurrence state**: `completed: false`,
  `completedAt: undefined`, `notificationId: undefined`, `notifiedAt: undefined`,
  `openedAt: undefined`. A new occurrence has not been notified, opened or
  completed.
- The advanced record **preserves series-level state**: `snoozeCount`,
  `snoozeHistory`, `originalDatetime`, `createdAt`, `recurrence` itself,
  `recipient`/`senderName` and the rest.

**`snoozeCount` persists across occurrences — this is intended** (it is the
series-level avoidance signal, and M9's dread-override reads it). It is
`stuck`'s use of it that was wrong, which Task 5b fixes by adding
`currentOccurrenceSnoozes`. Both statements stand, with different consumers —
document that in a comment, because it is exactly the kind of thing a later
reader would "fix" wrongly in either direction.

**Task 5b adds three more fields to this same advance path**
(`occurrencesCompleted`, `occurrencesMissed`, `currentOccurrenceSnoozes`) and
changes the anchor it computes from (`recurrenceAnchor`, never the snoozed
`datetime`). Read Task 5b before finalising this function's signature — it is
the same code, split across two tasks only so the tests stay small.

**Verify:** new tests in `services/ReminderService.test.ts`; typecheck clean.

---

### Task 5 — Wire the advance into the three trigger sites

All three must go through the single `advanceRecurringReminder` from Task 4.
No duplicated advance logic.

**(a) The catch-up sweep — the one that actually guarantees correctness.**

In `rescheduleAllFutureReminders()`, inside the existing `withWriteLock`, before
the `rearmReminder` call for each reminder: if the reminder is recurring and
past-due, advance it, then re-arm the advanced record. Order matters — see
Architectural context §1. The existing `changed` flag must be set so the new
`datetime` is persisted.

This one path alone makes the feature correct even if (b) never fires; (b) is
latency, not correctness.

**(b) Best-effort advance on delivery.**

`components/NotificationResponseHandler.tsx`, in the
`addNotificationReceivedListener` callback, at the existing site (currently
around lines 185–187) where `markNotifiedById(data.reminderId)` is called for a
reminder's own notification. Advance there too, so a series moves on
immediately while the app is alive.

Add a new service function for this (it does load→mutate→save, so it **must**
be inside `withWriteLock`, same as its neighbours):

```ts
export async function advanceRecurringById(id: string): Promise<void>;
```

It must be a silent no-op for an unknown id and for a non-recurring reminder,
matching `markNotifiedById`'s convention.

**Ordering note:** advancing resets `notifiedAt`, and `markNotifiedById` stamps
it. Decide the order deliberately and comment it — stamping the *fired*
occurrence's delivery before advancing loses the stamp, since the advanced
record resets it. The defensible reading: `notifiedAt` describes the occurrence
that just fired, the advanced record is a *new* occurrence that has not been
notified, so the reset is correct and the stamp is simply not carried forward.
Write that down in a comment and test the resulting order.

**(c) Explicit completion.**

`toggleComplete` (used by the list/detail UI) and `markDoneById` (used by the
notification action) both currently just complete-and-cancel. For a recurring
reminder, completing an occurrence must advance the series instead of leaving
it completed forever.

Both paths must behave the same way — a user marking done from the tray and
from the list must not get different results. Extract the shared decision
rather than writing it twice.

**Do not** advance on *un*-completing; that path is already subtle (see
`toggleComplete`'s existing comment about past-due reminders staying overdue).

**Verify:** tests for each of the three paths, including one asserting (a)
recovers a series after a simulated killed-app miss of several occurrences;
typecheck clean.

---

## UI design

This section is the visual contract for Tasks 6 and 7. The mockups are drawn
against the **actual current markup** (read 2026-09-18), not an idealised
screen — component names, chip anatomy, badge copy and `testID` conventions
below all match what is in the files today.

### The existing visual vocabulary this feature must fit into

Read this before drawing anything new. These are already spoken for:

| Element | Current meaning | Where |
| --- | --- | --- |
| **Coral `primary` chip, `send` icon** | Outgoing — "I'm reminding this person" | `ReminderCard` `recipient-chip` |
| **`accent` chip, `arrow-down-left` icon** | Incoming — "someone sent me this" | `ReminderCard` `sender-chip` |
| **`warningSurface` chip, `bell-off`** | "Will not ring" (no permission) | `ReminderCard` `will-not-ring-chip` |
| **`clock` / `alert-circle` + muted text** | The time row; `alert-circle` + `destructive` when overdue | `ReminderCard` `timeRow` |
| **`zap` icon + "auto" badge** | This value came from parsing, not from you | `add-reminder` Date/Time rows |
| **`edit-2` icon + "tap to set" badge** | Nothing parsed; tap to choose | `add-reminder` Date/Time rows |
| **Coral pill, `calendar`/`clock`, `·` divider** | Read-only parse confirmation | `QuickAddInput` `pillRow` |

**Two constraints that fall straight out of this:**

1. **A repeat indicator must not reuse `primary` or `accent` as a chip
   background** — those two already encode outgoing vs. incoming direction, and
   a third chip in either colour would read as a third direction. Use the
   **muted/neutral** treatment (`colors.muted` background, `mutedForeground`
   text) so repeat reads as an *attribute of the time*, not a fourth kind of
   reminder.
2. **`QuickAddInput`'s `pillRow` is `pointerEvents: "none"`** — it is a
   read-only confirmation strip, deliberately not tappable. The repeat pill may
   be *displayed* there, but the repeat **control** cannot live there. It goes
   in the action row (see below).

### 1. Home screen — how a recurring reminder reads

Recurring reminders are **not** a new section. They sit in `Upcoming`, inside
whichever Today / Tomorrow / weekday / Later group their *next* occurrence falls
in (`groupByDate` in `app/(tabs)/index.tsx`), sorted by `byDateAsc` like
everything else. A recurring reminder is simply a reminder that has a next
occurrence — the list's job is still "what's coming, soonest first".

The card gains one element: a small repeat marker on the **time row**, because
"every day" is a fact *about the time*, not about the task.

```
┌──────────────────────────────────────────────────────────┐
│  ○   Take blood-pressure tablet                      🗑  │
│      ⏱ Today · 8:00 AM   ⟳ Daily                         │
└──────────────────────────────────────────────────────────┘
      └── existing timeRow ──┘  └─ NEW: repeat marker ─┘
```

Anatomy: `⟳` is Feather `repeat` at **size 11** and `colors.mutedForeground`,
followed by `describeRecurrence(rule)` at the same `timeText` size (12) and
colour. It is appended **inside the existing `timeRow`**, after the datetime
text — one more child in a row that already has `flexDirection: "row"` and
`gap: 4`. No new chip, no new row, no extra vertical space.

Interaction with the states the card already has:

```
Overdue + recurring (destructive time, repeat marker stays muted):
┌──────────────────────────────────────────────────────────┐
│  ○   Water the plants                                🗑  │
│      ⚠ Yesterday · 6:00 PM   ⟳ Every 3 days              │
└──────────────────────────────────────────────────────────┘

Recurring + received from someone (both chips coexist):
┌──────────────────────────────────────────────────────────┐
│  ○   Call Amma                                       🗑  │
│      ↙ From Priya                                        │
│      ⏱ Sun · 7:00 PM   ⟳ Weekly on Sun                   │
└──────────────────────────────────────────────────────────┘

Silenced + recurring (bell-off stays on the title row, unchanged):
┌──────────────────────────────────────────────────────────┐
│  ○   Stretch  🔕                                     🗑  │
│      ⏱ Today · 3:00 PM   ⟳ Daily                         │
└──────────────────────────────────────────────────────────┘
```

**Behaviour the implementer must get right, and test:**

- **A recurring reminder must never come to rest in `Completed`.** Completing an
  occurrence advances the series (Task 5c), so the card leaves `Completed` and
  reappears under `Upcoming` at its next occurrence. If the advance is
  asynchronous, the card must not visibly sit in `Completed` and then jump —
  advance first, then re-render. Test this at the list level, not just the
  service level.
- **An advancing series changes group.** A daily reminder completed on Monday
  moves from `Today` to `Tomorrow`. That is correct and needs no special
  handling beyond `groupByDate` re-running — but it *does* mean the
  `upcomingCount` badge and group headers must be derived from the post-advance
  state. They already are (`useMemo` over `reminders`), so the requirement is
  simply: do not cache anything that bypasses it.
- `testID="repeat-marker"` on the marker so Maestro can assert on it.

### 2. `QuickAddInput` — setting recurrence while typing

Two distinct surfaces: a **read-only pill** (it parsed) and a **control** (set
it by hand).

**(a) Parsed from text — the pill row gains a third pill.**

Typing `"take tablet every day at 8am"`:

```
┌──────────────────────────────────────────────────────────┐
│  take tablet                                          ✕  │
│                                                          │
│   📅 Today  ·  🕗 8:00 AM  ·  ⟳ Daily                    │
│   └────────── existing ─────────┘ └─ NEW third pill ─┘   │
│                                                          │
│  🎤   👤   📄   🔔   ⟳                              ✓   │
│                      └ NEW repeat button (lit: coral)    │
└──────────────────────────────────────────────────────────┘
```

Note the title is `"take tablet"`, **not** `"take tablet every day"` — the
recurrence phrase is stripped by Task 3. This is one of the visible
improvements of the feature and is worth an explicit test.

The third pill reuses the existing `styles.pill` / `pillText` exactly, with
Feather `repeat` at size 11 and the same `·` `pillDivider` before it. It
animates in with the existing `pillAnim`/`pillTranslate` — **do not add a
second animation**. It stays inside the `pointerEvents: "none"` row.

**(b) Set by hand — a new action-row button.**

The action row today is: `mic · recipient · notes · alarm · [spacer] · save`.
Add a **repeat** button between `notes` and `alarm`, styled exactly like its
neighbours (`styles.alarmBtn`, Feather icon at 16, `colors.primary` when
active / `colors.mutedForeground` when not) — the row's established idiom is
"one icon, lit when on".

```
 🎤    👤    📄    ⟳    🔔                              ✓
 mic  recip notes repeat alarm                        save
                   │
                   └── mutedForeground when off
                       primary (coral) when a rule is set
```

Tapping it opens a **bottom sheet**, matching the existing `No time found`
sheet's anatomy (`styles.sheet`, `sheetHandle`, `sheetTitle`, `sheetBtnRow`
with Cancel/Confirm) so it feels like the same app:

```
┌──────────────────────────────────────────────────────────┐
│                        ────                              │
│  Repeat                                                  │
│  How often should this come back?                        │
│                                                          │
│   ┌────────────────────────────────────────────────┐    │
│   │  Doesn't repeat                              ✓ │    │
│   ├────────────────────────────────────────────────┤    │
│   │  Daily                                         │    │
│   ├────────────────────────────────────────────────┤    │
│   │  Weekly on Thursday                            │    │
│   ├────────────────────────────────────────────────┤    │
│   │  Monthly on the 18th                           │    │
│   ├────────────────────────────────────────────────┤    │
│   │  Yearly on 18 Sep                              │    │
│   ├────────────────────────────────────────────────┤    │
│   │  Custom…                                       │    │
│   └────────────────────────────────────────────────┘    │
│                                                          │
│            [  Cancel  ]        [  Done  ]                │
└──────────────────────────────────────────────────────────┘
```

**The preset labels are generated from the currently-selected date**, via
`describeRecurrence` — "Weekly on Thursday" because the reminder is set for a
Thursday, "Monthly on the 18th" because it is the 18th. Do not hardcode
weekday/day-of-month names. This is why `describeRecurrence` lives in
`utils/recurrence.ts` (Task 1) and not in a component.

`Custom…` expands an interval stepper in place, rather than opening a second
sheet:

```
│   │  Custom…                                       │    │
│   └────────────────────────────────────────────────┘    │
│                                                          │
│     Every  [ − ]   2   [ + ]   [ days ▾ ]                │
│                                weeks                     │
│                                months                    │
│                                years                     │
```

For **weekly**, selecting multiple weekdays uses a day strip (this is the one
shape a plain list cannot express):

```
│     Repeat on:                                           │
│      ( S )  ( M )  ( T )  ( W )  ( T )  ( F )  ( S )     │
│             ▓▓▓                 ▓▓▓                      │
│             selected = primary fill, white text          │
```

`testID`s required: `quick-add-repeat` (action-row button),
`repeat-sheet`, `repeat-option-none` / `-daily` / `-weekly` / `-monthly` /
`-yearly` / `-custom`, `repeat-interval-plus` / `-minus`, `repeat-weekday-0`…`-6`,
`repeat-sheet-confirm` / `-cancel`.

**Sync rule between (a) and (b)** — mirror exactly how `parsedDate` /
`dateWasParsed` already behave in this file: the parse effect sets the rule on
every keystroke; a rule chosen in the sheet wins until the text changes again
and re-parses. Reset it alongside the other post-save resets in `performSave`
(`setInput("")`, `setParsedTitle("")`, `setParsedDate(null)`, …) — a forgotten
reset here means the next reminder silently inherits the last one's recurrence,
which is the worst available bug in this feature.

### 3. `add-reminder.tsx` — the "Parsed as" card gains a Repeats row

This screen's idiom is different by design (B19 established that the two
screens' date/time UX diverge deliberately and must not be forced into one
shape): here there are always-visible labelled rows inside a `Parsed as` card,
each with a `zap`+"auto" badge when parsed or an `edit-2`+"tap to set" badge
when not.

The Repeats row is a **third row with identical anatomy**, after Time:

```
  Parsed as
┌──────────────────────────────────────────────────────────┐
│  🔤  Title     take tablet                               │
├──────────────────────────────────────────────────────────┤
│  📅  Date      Thu, Sep 18, 2026          ⚡ auto        │
├──────────────────────────────────────────────────────────┤
│  🕗  Time      8:00 AM                    ⚡ auto        │
├──────────────────────────────────────────────────────────┤
│  ⟳   Repeats   Daily                      ⚡ auto        │  ← NEW
└──────────────────────────────────────────────────────────┘
```

Nothing parsed a recurrence — same row, the established "tap to set" affordance:

```
├──────────────────────────────────────────────────────────┤
│  ⟳   Repeats   Doesn't repeat          ✎ tap to set      │
└──────────────────────────────────────────────────────────┘
```

Tapping it expands the **same picker used by the sheet in QuickAddInput**,
inline within the card (this screen expands pickers in place — see
`pickerMode === "date"` rendering `pickerWrap` inline). Extract the picker body
as a shared component so the sheet and this row render the identical control;
only the container differs.

```
├──────────────────────────────────────────────────────────┤
│  ⟳   Repeats   Weekly on Thursday         ⚡ auto        │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Doesn't repeat                                    │  │
│  │  Daily                                             │  │
│  │  Weekly on Thursday                             ✓  │  │
│  │  Monthly on the 18th                               │  │
│  │  Yearly on 18 Sep                                  │  │
│  │  Custom…                                           │  │
│  │                                                    │  │
│  │  Repeat on:                                        │  │
│  │   ( S ) ( M ) ( T ) ( W ) (▓T▓) ( F ) ( S )        │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

The row must be `previewRow` for Date/Time and the **Repeats row becomes
`previewRowLast`** (Time currently carries that style — move it).

**Live parse → recurrence sync, stated explicitly for all three surfaces**
(this was asked directly, so it is spelled out rather than implied):

| Surface | Typed recurrence phrase updates the rule? | How |
| --- | --- | --- |
| `QuickAddInput` | **Yes**, on every keystroke | The existing parse effect (`useEffect` on `[input]`) already re-runs `parseNaturalLanguage` per character; Task 3 makes it return `recurrence`, so it sets state alongside `setParsedTitle`/`setParsedDate`. Pill and action-row button both reflect it live. |
| `add-reminder.tsx` **add** mode | **Yes**, on every keystroke | Same — the `useEffect` on `[input, isEditing]` at line ~142. |
| `add-reminder.tsx` **edit** mode | **Yes, but never destructively** | The second effect (on `[editTitle, isEditing]`) re-parses an existing reminder's title. Task 3's `recurrence` must be applied here too — typing "every Monday" into an existing title sets the rule. |
| `reminder-detail.tsx` | **N/A — no parsing** | Verified: the title renders as read-only `<Text>` (line ~363); this screen has no text input. Editing routes to `add-reminder.tsx`, which handles it above. The detail screen only *displays* the rule and offers Edit. |

**Edit mode:** seed from `existing.recurrence` in the `seededFromExisting`
effect alongside `setAlarm`/`setRecipient`. Note the existing asymmetry in this
screen — in edit mode the title re-parse only *updates* the date when a date
phrase is present, deliberately never blanking it. Apply the same rule to
recurrence: typing a recurrence phrase into an existing title sets it; removing
the phrase does **not** silently clear an existing rule. Clearing is done
explicitly via the row's "Doesn't repeat". Comment this, because it looks like
an inconsistency until you know why.

`testID`s: `repeat-row`, then the shared picker's ids as listed above.

### 4. `reminder-detail.tsx` — read + edit

Show the rule where the reminder's other facts are shown, and route editing
into the **same** shared picker. Do not build a third implementation.

```
┌──────────────────────────────────────────────────────────┐
│  Take blood-pressure tablet                              │
│                                                          │
│  ⏱  Today · 8:00 AM                                      │
│  ⟳  Daily                                     [ Edit ]   │
│                                                          │
│  Next 3:  Thu 18 Sep · Fri 19 Sep · Sat 20 Sep           │
└──────────────────────────────────────────────────────────┘
```

The **"Next 3"** line is worth building: it is the one place the user can
verify a rule means what they think before trusting it overnight, and it costs
three calls to `computeNextOccurrence` (Task 1). It answers the question a
recurrence UI otherwise leaves open — *"every other Tuesday from when?"*

`testID`: `repeat-detail`, `repeat-next-occurrences`.

### 5. Copy rules

- Say **"Doesn't repeat"**, not "None" / "Off" — it states the resulting
  behaviour, and matches the plain-language register of the rest of the app
  ("Will not ring", "No time found", "tap to set").
- `describeRecurrence` output is the single source of every recurrence label on
  every surface. Card, pill, row, sheet and detail screen must never
  independently format a rule.
- **Do not apply `getFontFamily`** to any of this control's own chrome — that
  utility is for *user-entered* content only (title/description). The reminder
  title next to a repeat marker still uses it, as it does today.
- Every new interactive element carries a `testID`; Maestro selects by `id:`
  (CLAUDE.md, Testing) and text selectors are brittle against copy changes.

---

### Task 5b — Adherence tallies and the snooze anchor (mobile only)

All decisions here are **settled** (see "Decisions and why" and the
"Cross-cutting impact" section at the end of this plan, which is the analysis
they act on). This task implements them. Do not build the UI until it is done —
Task 6 and 7's tests depend on these fields existing.

Scope: `artifacts/mobile` only. No backend, no deploy. Task 5c is the backend
half and is **independent of this one** — neither blocks the other, and they
can be done in either order or in parallel.

1. **Adherence, Option 1** — per (A). Add `occurrencesCompleted`,
   `occurrencesMissed`, `currentOccurrenceSnoozes` to `Reminder`; tally them in
   `advanceRecurringReminder`; fold them into `computeAdherenceStats`; make
   `stuck` read `currentOccurrenceSnoozes ?? snoozeCount`. Tests must cover the
   three cases a probe already proved fail without this: a completed occurrence
   counts as completed; a series is not permanently `stuck` from snoozes spread
   across occurrences; the streak behaves as documented.
2. **`suggestBetterHour` copy** — per (A). A recurring-specific variant saying
   the change affects all future occurrences. Both branches tested.
3. **Snooze anchor** — per (D). Add `recurrenceAnchor`; compute the advance from
   it; leave it untouched on snooze; move it on a deliberate time edit. Test
   snooze-then-advance, repeated snoozes, and an explicit edit.

**Verify:** `utils/adherenceStats.test.ts`, `utils/adherenceCopy.test.ts`,
`services/ReminderService.test.ts` green;
`pnpm --filter @workspace/mobile run typecheck` clean.

---

### Task 5c — Tier 2: carry the recurrence rule to the recipient (backend + accept path)

Split out of 5b deliberately: this one crosses `lib/db`, `supabase/functions/`
and the mobile client, uses a different test harness (PGlite) and needs a
**two-step deploy**. It shares no code with 5b.

**Independent of Tasks 5b, 6 and 7** — it can land before or after them. It is
only meaningful once Task 1's `RecurrenceRule` exists (for validation), so
sequence it after Task 1.

Per (C) in the cross-cutting section. Sub-steps, each independently verifiable:

1. **Schema.** `recurrence jsonb` (nullable — null means one-shot) on
   `invitations` in `lib/db/src/schema/invitations.ts`. Confirm the table stays
   re-exported from `index.ts` (an unexported table is absent from the generated
   DDL and goes untested *and* unpushed — there is a test pinning the table list
   for exactly this reason).
2. **`send_invitation()`.** New `p_recurrence jsonb default null` parameter,
   written straight through. **Use the `drop function if exists` idiom** (as
   `respondToInvitation.sql` already does) — changing a signature without it
   leaves both overloads alive and callers bind unpredictably. Re-`revoke`/
   `grant` on the new signature naming `public, anon, authenticated` explicitly
   (CLAUDE.md's Supabase default-privileges gotcha). **Validate the rule
   server-side** — reject `interval < 1`, unknown `freq`, malformed shape.
3. **`claim_invitations()`** returns the new column.
4. **Edge Function `send-invitation`** accepts and forwards `recurrence`,
   keeping `handleSendInvitation` testable against a fake client as the existing
   ones are.
5. **`app/invitation-preview.tsx`** threads `recurrence` through the params into
   `addReminder`, **validates it client-side before scheduling** (it crosses a
   trust boundary — reuse Task 1's validity definition, do not re-derive it),
   and **shows the rule before Accept** ("Daily at 8:00 AM"). Accepting a
   recurring reminder is a materially bigger commitment than a one-off; the
   recipient must see that before tapping, not discover it next morning.

**Deploy is two steps, both required** (CLAUDE.md): `pnpm --filter @workspace/db
run push` **and** `pnpm --filter @workspace/db run push:sql` — `drizzle-kit
push` manages neither grants nor functions. Edge Function deploy is a third,
separate step (`scripts/deploy-edge-functions.ps1`, or the
`mcp__Supabase__deploy_edge_function` fallback documented in CLAUDE.md).

**Verify:** `lib/db`'s PGlite suite green (add coverage for the new column and
signature), the `send-invitation` Edge Function tests green,
`__tests__/screens/invitation-preview.test.tsx` green, `pnpm run typecheck`
(full workspace) clean. **After deploying, re-read the live function** to
confirm it matches repo source — B14 in `backlog.md` records a case where a
fix sat undeployed and nothing caught it.

---

### Task 6 — Build the shared recurrence picker + wire both entry screens

Implement the UI specified above.

1. **`components/RecurrencePicker.tsx`** — the option list + custom interval
   stepper + weekday strip. Presentation-only: takes
   `{ value: RecurrenceRule | undefined, anchorDate: Date, onChange }` and
   renders. It must not know whether it is inside a sheet or inline in a card.
   Labels come from `describeRecurrence(rule)` (Task 1), generated against
   `anchorDate` — never hardcoded weekday/day names.
2. **`components/RepeatRow.tsx`** — the `add-reminder` row (icon + "Repeats"
   label + value + auto/tap-to-set badge) that expands `RecurrencePicker`
   inline, matching the existing Date/Time row anatomy.
3. **`QuickAddInput.tsx`** — the action-row `quick-add-repeat` button, the
   bottom sheet wrapping `RecurrencePicker`, and the third parse pill. Include
   `recurrence` in `performSave`'s `addReminder` payload using the existing
   `...(x ? { x } : {})` spread idiom so an unset value omits the key entirely.
   **Reset it with the other post-save resets.**
4. **`add-reminder.tsx`** — mount `RepeatRow` as the new last row of the
   `Parsed as` card (move `previewRowLast` off Time), seed from
   `existing.recurrence` in edit mode, and include `recurrence` in `handleSave`'s
   payload with the same spread idiom.

**Verify:** existing `__tests__/screens/add-reminder.test.tsx` and
`components/QuickAddInput.test.tsx` green — they assert on existing testIDs, so
**do not rename or remove any**. New tests: set-from-parse, edit-via-picker,
clear-to-none, multi-weekday selection, custom interval, the value reaching the
save payload, and the post-save reset actually clearing it. Typecheck clean.

---

### Task 7 — Card, home-list behaviour, and detail screen

1. **`ReminderCard.tsx`** — the `repeat-marker` inside the existing `timeRow`
   (Feather `repeat`, size 11, `mutedForeground`). Verify it coexists correctly
   with overdue styling, the sender/recipient chips and `will-not-ring`.
2. **`app/(tabs)/index.tsx`** — no structural change expected, but **test the
   behaviour**: a completed recurring reminder leaves `Completed` and reappears
   in `Upcoming` under its next occurrence's group; the `upcomingCount` badge
   reflects post-advance state.
3. **`app/reminder-detail.tsx`** — the rule line, the "Next 3" preview via
   `computeNextOccurrence`, and Edit routing into the shared
   `RecurrencePicker`.

**Verify:** existing card/detail/home tests green plus the new assertions;
typecheck clean.

---

### Task 8 — Backup/restore and analytics

**Backup.** `recurrence` rides along automatically in `serializeBackup`
(whole-`Reminder` serialization) — confirm with a test rather than assuming.

The real work is the dedupe gap from Architectural context §6:
`isSameReminder` compares title + `datetime`, so an advanced series restored
from an older backup merges in as a duplicate. Fix this deliberately and
document the choice in that file's existing comment block (which already
explains why id is not a valid shortcut). A defensible rule: for two reminders
that both carry an equivalent `recurrence` and the same title, treat them as
the same series regardless of `datetime`. Test both directions — a genuine
duplicate is collapsed, and two genuinely different recurring reminders are
not.

**Analytics.** Add recurrence to `utils/analyticsProps.ts`'s `ReminderShape`
and `reminderProps` as **primitives only** — e.g. `is_recurring: boolean` and
`recurrence_freq: string` (the freq name, or `"none"`). Never pass the rule
object; `AnalyticsProps` accepts only primitives and passing a whole reminder
deliberately fails to compile.

If you add an event to `constants/analytics.ts`, it **must** have a live
emitter or `constants/analytics.test.ts` fails the build. Prefer extending the
existing `REMINDER_CREATED` properties over inventing a new event.

**Verify:** `utils/reminderBackup.test.ts`, `utils/analyticsProps.test.ts`,
`constants/analytics.test.ts` all green; typecheck clean.

---

### Task 9 — Device-test entries and docs

Per CLAUDE.md: *"When a feature lands, add its device-only checks to the
relevant file in that folder in the same change"* — green Jest is not evidence
a feature works. **Never mark an item `PASS`; a pass comes from a human who
watched it happen.**

Add to `device-tests/notifications.md` (new D-numbers, following the existing
numbering):

1. A daily reminder fires two days running with the app **killed** between
   fires — the core claim of the whole feature, and the one Jest structurally
   cannot make.
2. A weekly reminder fires, and the next occurrence is armed **without** the
   app being opened in between.
3. A recurring reminder with `alarm: true` does not repeatedly hijack the
   system's single "next alarm clock" slot across occurrences (the
   `setAlarmClock` constraint that M9 also has to respect — see
   `device-tests/cross-cutting.md#d19`).
4. Phone off / app killed across **several** missed occurrences → on next open,
   the reminder lands on the next *future* occurrence, not a past one, and does
   not fire a burst of backdated notifications.
5. Marking a recurring reminder done from the **notification tray** advances the
   series (parity with marking done in-app).
6. Timezone/DST: a daily 8am reminder still fires at 8am wall-clock after a DST
   transition.

Then update:
- `backlog.md` — M2 status, in the established format.
- `CLAUDE.md` — a short entry under "Architecture decisions" describing the
  recurrence model (advance-in-place, rolling re-arm, the catch-up path), since
  this is exactly the kind of non-obvious cross-cutting decision that file
  exists to record.
- `system_learnings.md` — only if something non-obvious was actually discovered
  while implementing (a chrono quirk, a trigger behaviour). Do not pad it.

---

## Cross-cutting impact — subsystems this feature breaks or changes

Advance-in-place is a mutation of a record other subsystems already read.
Each interaction below was **checked against the actual code**, and the three
adherence findings were **confirmed by executing a probe test** (2026-09-18),
not inferred from reading. Do not treat any of these as optional polish: the
first one silently destroys data the user is shown as fact.

### A. Insights / adherence — **BROKEN, must be fixed in this feature**

`utils/adherenceStats.ts` derives every number on `app/insights.tsx` from the
reminder records themselves, with no separate event log (CLAUDE.md, "Adherence
is derived, not logged"). Advance-in-place erases exactly the fields it reads.

**Confirmed by execution.** A probe run against the real `computeAdherenceStats`
proved all three of these:

1. **Every completed occurrence becomes invisible.** `advanceRecurringReminder`
   sets `completed: false`, clears `completedAt`, and moves `datetime` into the
   future — which is precisely `outcomeOf`'s definition of `pending`. A user who
   completes a daily reminder every day for a month shows `completed: 0`,
   `scored: 0`. Their completion rate is unaffected by their most reliable habit.
2. **`snoozeCount` persisting across occurrences permanently marks the series
   "stuck".** `stuck` is `!completed && snoozeCount >= 3`. Three snoozes spread
   across three *separate* occurrences of a daily reminder is normal behaviour,
   but reads identically to one task avoided three times, and the series is
   never completed (it always advances), so it stays on the "Repeatedly
   postponed" list on `insights.tsx` **forever**.
3. **Streaks are unaffected by recurring reminders.** `computeStreak` counts
   days with a decided outcome; an advanced reminder is always `pending`, so a
   perfectly-kept daily reminder contributes zero days to the streak.

This also contradicts Task 4's current instruction, which tells the implementer
that `snoozeCount` persisting across occurrences is intended because M9 reads
it. That reasoning is right for M9 and wrong for `stuck`. **Resolve it here, do
not leave both instructions standing.**

**DECIDED: Option 1 — count the occurrence at the moment it advances.**
(Confirmed 2026-09-18; recorded in "Decisions and why".)

`advanceRecurringReminder` knows the outcome of the occurrence it is retiring,
so it records it on the record itself. This stays inside the "derived, not
logged" principle — it is still the reminder record, not a parallel event
store — while letting a recurring reminder contribute *N* decided outcomes
instead of one permanent `pending`.

Add to `Reminder`, all optional (absent means "no occurrences retired yet",
same convention as every other added field, so no migration):

```ts
/** Retired occurrences of a recurring series, tallied as each one advances.
 *  A recurring reminder's CURRENT record is always pending by construction
 *  (it always has a next occurrence), so without these the series contributes
 *  nothing to any adherence number - see adherenceStats.ts. */
occurrencesCompleted?: number;
occurrencesMissed?: number;
/** Snoozes on the CURRENT occurrence only, reset on each advance. `stuck` must
 *  read this, not the series-total snoozeCount: three snoozes across three
 *  separate days is normal, and must not read as one task avoided 3 times. */
currentOccurrenceSnoozes?: number;
```

`snoozeCount` keeps its existing meaning — the **series** total, never reset —
because M9's dread-override reads it and `snoozeHistory` is already series-wide.
**This resolves the contradiction flagged against Task 4**: `snoozeCount`
persisting IS intended; what was wrong was `stuck` reading it. Both statements
now stand, with different consumers.

In `utils/adherenceStats.ts`:

- **Fold the tallies into the totals.** `occurrencesCompleted` adds to
  `scored`+`completed`; `occurrencesMissed` adds to `scored`+`missed`. A daily
  reminder kept for a month then contributes 30 completions, which is the
  truth.
- **`stuck` reads `currentOccurrenceSnoozes ?? snoozeCount`** — the fallback
  keeps non-recurring reminders behaving exactly as today.
- **Bucket the retired occurrences.** `byHour`/`byWeekday` bucket by
  `plannedTime`. A retired occurrence's own hour equals the series' hour (the
  anchor is stable — see (D)), so credit the tallies to the current record's
  planned hour/weekday rather than storing per-occurrence timestamps. Document
  this approximation in a comment: it is exact for a stable series and wrong
  only if the user edits the time mid-series, which is acceptable and far
  cheaper than an unbounded per-occurrence array.
- **`computeStreak`** counts days with a decided outcome. Decide explicitly
  whether retired occurrences extend the streak. **Recommended: they do not** —
  the streak walks real calendar days back from today, and the tallies carry no
  dates, so crediting them would require inventing dates. Document the limit
  rather than faking it.

Bound the tallies: they are plain counters and grow by one per occurrence, so
no cap is needed, but they **must** be included in the backup round-trip (see G).

**`suggestBetterHour` copy must say the change is series-wide.** Confirmed
requirement 2026-09-18. `utils/adherenceCopy.ts` renders the save-time banner in
`add-reminder.tsx` suggesting a better hour. For a **recurring** reminder that
suggestion moves *every future occurrence*, not one event — a materially bigger
change that the current copy does not convey. Add a recurring-specific variant
that says so explicitly (e.g. "Moving this changes all future repeats"), keep
the non-recurring copy unchanged, and test both branches. Do not silently reuse
one string for two different consequences.

### B. "Remind someone else" Tier 1 (send-reminder) — needs a guard

`app/send-reminder.tsx` completes via `toggleComplete`, so it inherits the
advance automatically and a recurring send-reminder correctly comes back next
period. Two real consequences:

1. **Invite nudges are safe.** `MAX_NUDGE_SENDS = 3` in `utils/inviteNudges.ts`
   caps appended invite lines per contact permanently, and
   `incrementInviteNudgeCount` only advances on an actual send. A daily
   send-reminder cannot spam a contact with app plugs. **Verified — no change
   needed, but add a test pinning it**, because it is only true by accident of
   the cap living per-contact rather than per-reminder.
2. **The recipient is re-messaged every occurrence, by design** — that *is*
   "remind Amma to take her tablet every day". Confirm the copy on the send
   screen does not imply a one-off.

### C. "Remind someone else" Tier 2 (invitations) — **carries recurrence; this is the headline use case**

**A correction to an earlier draft of this analysis, which recommended
blocking recurring Tier 2 sends in v1. That recommendation was wrong and is
withdrawn.** It rested on a misreading of `sendInvitation.sql` (see the
correction below) and on missing what the architecture already gives us.

**Why it works — the server is a mailbox, not a runtime.** From
`lib/db/src/schema/invitations.ts`'s own header: *"an accepted reminder is
transferred to the recipient's device and fires from her own local schedule.
Nothing here is on the critical path of a reminder going off."* And
`respond_to_invitation()` accepts **once**, nulling content on response.

So a recurring invitation is: **sent once, accepted once, and the series then
lives entirely on the recipient's device**, firing from her own
`expo-notifications` schedule via exactly the same advance/catch-up machinery
Tasks 4 and 5 build for local reminders. The server schedules nothing, stores
no series, and is never asked again. This is the "remind Amma to take her
tablet every day" case — the feature's headline use.

**Correction on the 30-day cap.** An earlier draft claimed
`least(p_datetime, now() + interval '30 days')` clamps the reminder *time*,
putting a monthly reminder at the wrong date. **That is a misread.** Reading
`sendInvitation.sql`'s INSERT: `datetime` and `original_datetime` are both
inserted as `p_datetime`, **unclamped**. The `least(...)` applies only to
`content_expires_at` — a *content-retention* policy (title/description are
nulled after 30 days), not a scheduling clamp. The fire time is always correct.

**What this actually constrains** — two real limits, neither fatal:

1. **`expires_at = datetime`**: an invitation not accepted by its first fire
   time dies. For a recurring reminder that is arguably wrong (the *series* is
   still meaningful even if occurrence 1 was missed), but it is the existing
   behaviour for all invitations and changing it is out of scope here. Accept
   it: the recipient must accept before the first occurrence.
2. **`content_expires_at`**: a first occurrence more than 30 days out arrives
   with content nulled. Same constraint as any Tier 2 reminder, unchanged by
   recurrence.

**What must be built for this (v1 scope):**

- **Schema**: one nullable column on `invitations` carrying the rule —
  `recurrence jsonb` (nullable; null means one-shot, matching the client's own
  "absent means one-shot" convention). Nullable and additive, so it needs no
  backfill. Follow `lib/db/src/schema/` conventions: add it to the table file,
  confirm the table stays re-exported from `index.ts`, and remember
  **`drizzle-kit push` manages neither grants nor functions** — `push:sql` is a
  required second step (CLAUDE.md).
- **`send_invitation()`**: a new `p_recurrence jsonb default null` parameter,
  written straight through to the column. **Note the existing
  `drop function if exists` idiom** at the top of `respondToInvitation.sql` —
  changing a function's signature in Postgres needs the old one dropped, or
  both overloads survive and callers bind unpredictably. Do the same here.
  Re-`revoke`/`grant` on the new signature, naming `public, anon, authenticated`
  explicitly (CLAUDE.md's Supabase default-privileges gotcha).
- **`claim_invitations()`** and the read path: return the new column so the
  recipient's client receives it.
- **Edge Function `send-invitation`**: accept and forward `recurrence`. Keep
  `handleSendInvitation` testable against a fake client, as the existing ones are.
- **`app/invitation-preview.tsx`**: currently builds its reminder from URL
  params (`title`/`description`/`datetime`/`senderId`) and so is structurally
  one-shot. Thread `recurrence` through the params and into the `addReminder`
  call. **Show the rule on the preview before accepting** — "Daily at 8:00 AM"
  — because accepting a recurring reminder is a materially bigger commitment
  than accepting a one-off, and the recipient must see that before tapping
  Accept, not discover it the next morning.
- **The sender's own local copy** already works: it is an ordinary local
  recurring reminder (the sender's "Sending" card), advancing via Task 5.
- **`recurrence` must be validated on the way in, not trusted.** It crosses a
  trust boundary (another user's client → your device → your notification
  schedule). Validate the shape server-side in `send_invitation()` *and*
  client-side in `invitation-preview.tsx` before it reaches `addReminder`; a
  malformed or hostile rule (`interval: 0`, a huge interval, an unknown `freq`)
  must be rejected, not scheduled. Task 1's defensive cases already define what
  valid means — reuse that, do not re-derive it.

**What does NOT need building, and must not be:**

- **No repeat sends.** The sender's device does not re-send each occurrence.
  One invitation, one accept, then the recipient's local schedule owns it.
  (This is also why the `check_first_contact_rate_limit()` observation in an
  earlier draft — that repeat sends to a known contact are unthrottled — turns
  out not to matter: nothing repeats.)
- **No server-side scheduling, cron, or series state.** The mailbox stays a
  mailbox. Do not add a job that emits an invitation per occurrence; that
  would put the backend on the critical path of a reminder going off, which is
  the one property the Tier 2 design exists to protect.

**Sender-side visibility — a real question, deliberately deferred.** If the
recipient later deletes or stops a series she accepted, the sender is not told.
That is consistent with the existing design (snoozes are never reported to the
sender — caregiving, not surveillance) and needs no change here, but note it:
"I set up Amma's tablet reminder" and "Amma still has a tablet reminder" are
different facts, and v1 only establishes the first. File as a follow-up if it
matters later.

**Device test (add to Task 9):** send a recurring reminder from device A,
accept on device B, confirm it fires on B on two consecutive days **with
device A powered off** — proving the series is genuinely local to the
recipient and the sender is not in the loop.

### D. Snooze — **DECIDED: anchor on the original schedule**

Confirmed 2026-09-18; recorded in "Decisions and why".

Snoozing a recurring occurrence overwrites `datetime` (and sets
`originalDatetime` on first snooze). The advance must compute the next
occurrence **from the series anchor, never from the snoozed `datetime`** —
otherwise one two-hour snooze of "every day at 8" silently converts it to a
10am reminder forever.

The snooze applies to **that occurrence only**; the series is a standing intent.

**This needs its own field.** `originalDatetime` is already taken — it means
"the first datetime this reminder ever had, written once on first snooze", and
`adherenceStats.plannedTime()` reads it. Overloading it would corrupt adherence.
Add instead:

```ts
/** The series' anchor: what "every day at 8" actually means. Set when a
 *  recurrence rule is attached, and NEVER moved by a snooze - a snooze defers
 *  one occurrence, it does not restate the schedule. advanceRecurringReminder
 *  computes from this, not from `datetime`, which snooze overwrites. */
recurrenceAnchor?: string;
```

`advanceRecurringReminder` computes `computeNextOccurrence(rule, anchor)` and
loops until strictly after `now`, then writes the result to `datetime` **and
leaves `recurrenceAnchor` untouched**.

Editing a recurring reminder's time *deliberately* (via the date/time rows, not
a snooze) **must** move the anchor — that is the user restating the schedule.
Snooze must not. These two paths are easy to conflate; test both.

**Required tests:** snooze-then-advance lands on the original clock time, not
the snoozed one; several consecutive snoozes still do not drift the series;
an explicit time edit does move it.

### E. Quiet hours — asked once, applies forever

Both entry screens check `isQuietAt` at save time and prompt (`QuickAddInput`'s
`quietPrompt` sheet). For a recurring reminder that prompt now governs **every
future occurrence** from one answer. Worth one line of copy acknowledging it
("every day at 11:30 PM" is inside quiet hours *every* night). No mechanism
change; the existing "ask, never block" rule still stands.

### F. M9 smart re-nudge — do not make it harder

M9 is out of scope, but note for whoever builds it: a re-nudge ladder attached
to a recurring reminder must be cancelled when the reminder advances, or rungs
from occurrence *N* fire against occurrence *N+1*. The existing
`cancelScheduledForReminder` payload sweep already cancels by `reminderId`, and
the advance path calls it — so this works today **provided the advance keeps
going through `rearmReminder`/`cancelScheduledForReminder` rather than
scheduling directly.** Say so in a comment at the advance site.

### G. Backup/restore — already covered, but note the ordering

Task 8 handles the `isSameReminder` dedupe gap. One addition: if Option 1 in
(A) is chosen, the new occurrence tallies are part of the record and must
survive export/import — add them to the backup round-trip test.

### H. Confirmed *not* affected

Checked and no change needed — recorded so nobody re-checks them:

- **`getFontFamily` / Malayalam rendering** — recurrence labels are app chrome,
  not user content; the utility is correctly not applied to them.
- **`utils/vagueTask.ts`, `utils/personInTitle.ts`** — operate on title text,
  which the recurrence strip only shortens.
- **Notification channels / exact alarm / `setAlarmClock`** — a recurring
  reminder schedules one ordinary DATE trigger at a time, identical to a
  one-shot. (The *repeated* claiming of the single alarm-clock slot across
  occurrences is a device-test item, already listed in Task 9.)
- **`expo-share-intent` / process-text entry** — both feed the same
  `QuickAddInput` parse path and inherit recurrence parsing for free.

---

## Out of scope — do not build these here

- **Malayalam recurrence.** `utils/malayalamDateParser.ts` is untouched beyond
  the optional type field. File a follow-up backlog item.
- **`until` / `count` / end conditions** on a rule ("every day for 2 weeks").
- **Per-occurrence completion history as separate records.** Decided against —
  but note Task 5b *does* add bounded per-series **tallies**
  (`occurrencesCompleted`/`occurrencesMissed`). Counters on the existing record,
  not a row or an event per occurrence.
- **Native repeating triggers.** Explicitly decided against.
- **Recurring Tier 2 beyond one accept.** The recipient's series is local after
  accept (see (C)); sender-side visibility into a series she later deletes is
  deliberately *not* built.
- **M9 smart re-nudge interaction.** M9 is a separate item; just do not make it
  harder — hence device check 3 above.

---

## Definition of done

1. Every task's tests written first, seen failing, then passing.
2. `pnpm --filter @workspace/mobile run typecheck` — clean, output quoted.
3. `pnpm --filter @workspace/mobile run test` — green, output quoted, with the
   file/test count compared against the 75-file baseline.
4. `pnpm run typecheck` (full workspace) and `pnpm --filter @workspace/db run test`
   green — Task 5c touches `lib/db` and `supabase/functions/`, and its two-step
   deploy (`push` **and** `push:sql`) has been run and the live function
   re-read to confirm it matches repo source.
5. **Edge-case testing** — each of these has a test, and each was chosen because
   it is a way this feature can silently produce a wrong time rather than an
   obvious crash:
   - **Month-end**: Jan 31 monthly → Feb 28/29, not Mar 3. Leap and non-leap.
   - **Feb 29 yearly** → Feb 28 in a non-leap year.
   - **DST both directions**: a daily 8am reminder stays 8am wall-clock across
     spring-forward and fall-back. (Constructed from local-time components, not
     by adding 86_400_000 ms — that shortcut is the bug this catches.)
   - **Multiple missed occurrences**: a phone off for 3 days lands on the next
     *future* occurrence, fires once, not a backdated burst.
   - **Snooze-then-advance**: lands on the original clock time; repeated
     snoozes do not drift the series; a deliberate time edit does move it.
   - **Interval bounds**: `interval: 0`, negative, absurdly large, unknown
     `freq`, malformed rule from a Tier 2 payload — rejected, never scheduled,
     never an infinite loop (the advance loop's bound is tested).
   - **Weekly `byWeekday`** unsorted, duplicated, empty, all-seven.
   - **Post-save reset**: the next reminder does not inherit the last one's
     recurrence. (The worst available bug in this feature.)
   - **Recurring + received-from-sender + overdue + silenced** render together
     on one card without collision.
   - **Backup round-trip**: recurrence, anchor and occurrence tallies survive
     export→import; an advanced series is not merged as a duplicate.
6. **Exploratory testing** — a timeboxed unscripted pass (~30 min) *after* the
   scripted tests are green, looking for what the tests were not written to
   find. Not a checklist to complete; a session to run and write down. Seed it
   with: type a recurrence phrase and delete it mid-word; set a rule then change
   the date; set a rule then clear the title; snooze an occurrence then
   immediately complete it; accept a recurring Tier 2 invitation then delete it;
   switch dictation language mid-entry; rotate the device with the picker open;
   create a recurring reminder inside quiet hours. **Record what was tried and
   what happened** — including "nothing broke" — in the PR description or
   `system_learnings.md`, so the next person knows what ground is already
   covered.
7. Device-test entries added (status `PENDING`, never `PASS`) — including the
   two-device Tier 2 check from (C): accept on device B, confirm it fires on two
   consecutive days **with device A powered off**.
8. `backlog.md`, `CLAUDE.md` updated.
9. `git status` reviewed; staged **by explicit path**, never `git add -A`.
   Branch off `main` first — do not commit to `main` directly.
