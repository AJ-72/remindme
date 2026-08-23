# Smart Alerts — design

**Date:** 2026-08-23
**Status:** approved — all open decisions resolved 2026-08-23; ready for an implementation plan
**Scope:** five components sharing one foundation — vague-task detection at input, reminder-lifecycle instrumentation, user-owned quiet hours, an in-app explainer of the research, and an adaptive re-nudge engine with a dread override.

---

## Problem

Reminders fire and nothing happens. The app currently treats this as an event with no consequence: the notification is delivered once, the card turns red in the list, and that is the end of the system's involvement.

Users read that silence as the app's failure. The design question is what to do about it, and the naive answer — ping again — is wrong for the most common cause.

### Why people don't complete reminders

Six mechanisms, ordered by how much they matter and how detectable they are from data this app can hold:

1. **Avoidance, not forgetting.** The best-supported finding in procrastination research (Sirois & Pychyl) is that procrastination is *mood repair*: you postpone a task because contemplating it feels bad, and postponing delivers immediate relief. This is the dominant cause of the repeatedly-postponed reminder. It is also the most detectable, because **snooze count is a dread meter** — a deliberate user action, not an inference. Critically, additional notifications are the *worst* response: they raise avoidance and train reflexive dismissal.
2. **The task isn't a task.** "Sort out insurance" is a project wearing a reminder's clothing. With no obvious first physical action there is nothing to start, so it stalls. Partially detectable from the verb.
3. **Context mismatch.** Time-based reminders assume the clock predicts availability; it doesn't. Gollwitzer's implementation-intentions work found situation-anchored plans ("when I sit down at my desk") substantially outperform clock-anchored ones. Every reminder in this app is clock-anchored, so this failure is structural.
4. **Alert habituation.** When most alerts aren't actionable in the moment, dismissal stops being a decision. Any re-nudge adds to this pressure and must earn its place.
5. **Planning fallacy at the day level.** Eleven reminders on one day means none get done, and then the list itself becomes something to avoid opening.
6. **Phantom incompletes.** Some incomplete reminders were done in life and never marked. Note that tray Mark-Done was broken until `53bc7b9` (2026-08-23), so **any data collected before that commit is contaminated and skews pessimistic.** Do not treat pre-fix history as a baseline.

### The constraint this imposes

The obvious build — a completion-rate dashboard with streaks — is the wrong one and would likely worsen behavior. Shame reliably *increases* procrastination; self-compassion reduces it. A red completion percentage and a breakable streak are shame engines.

**Everything here is diagnostic and specific, never evaluative.** "You finish most morning reminders and few evening ones — move this one to 9am?" is in scope. "You missed 12 tasks this month" is not, and no surface may compute or display such a number.

## Non-goals

- **No insights/statistics screen.** Explicitly deferred. Instrumentation lands now so it becomes possible later; the screen itself is out of scope. Component 5 ("Why tasks slip") is **not** this — it is fixed editorial content about how procrastination works in general, containing no data about the individual user and no numbers derived from their history.
- **No completion rate, score, streak, or any aggregate the user could read as a grade.** This is a hard constraint on every surface, not a matter of visual treatment.
- **No location or activity triggers.** Fixing cause #3 properly means situation-anchored reminders, which is a separate feature requiring new permissions.
- **No Malayalam vague-task detection.** See "Input fix" below — the English heuristic does not transfer, and machine translation of the prompt copy produces exactly the tone this design exists to avoid. Follows the `INVITE_NUDGES_ML` precedent in `utils/inviteNudges.ts`.
- **No backend.** Everything stays local, consistent with the rest of the app.

---

## Build order

The components deliberately ship in this order:

1. **Input fix** — needs no history, so it delivers value immediately.
2. **Instrumentation** — lands alongside, and quietly accumulates the data the re-nudge needs.
3. **Quiet hours** — the setting plus its input-time confirmation. Independently useful, and a hard prerequisite for anything that schedules a second notification.
4. **"Why tasks slip"** — pure content, no dependencies. Can land any time from here.
5. **Smart re-nudge, shrink prompt, and check-in** — built last, on real data, and depending on all of the above.

Reversing this means a long release with nothing visible to the user. The input fix is also the only component addressing a cause at its source rather than after the failure.

---

## Component 1 — Instrumentation

### The problem it solves

The `Reminder` record holds `{id, title, description, datetime, completed, notificationId, alarm, recipient}` and nothing else. Consequently:

- No `createdAt` — a reminder set three weeks ahead is indistinguishable from one set an hour ahead.
- No `completedAt` — we cannot tell *when* things get done versus when they were scheduled. This is the single most valuable missing field.
- **Snoozing overwrites `datetime` in place and keeps no counter** (`snoozeReminder` in `services/ReminderService.ts`), so the strongest avoidance signal in the system is erased every time it occurs.

### Fields

Added to `Reminder`, all optional so existing records stay valid:

| Field | Type | Written by |
| --- | --- | --- |
| `createdAt` | ISO string | `addReminder` |
| `completedAt` | ISO string | `toggleComplete`, `markDoneById` — cleared when un-completing |
| `snoozeCount` | number | `snoozeReminder`, incremented; never reset |
| `originalDatetime` | ISO string | `snoozeReminder`, set once on first snooze only |
| `nudgesSent` | number | the re-nudge scheduler |
| `checkInSent` | boolean | the check-in scheduler — guarantees at most one check-in per reminder, ever |

`originalDatetime` is set **once** and never overwritten, so the distance a task has slid from its first intended time stays measurable across many snoozes.

### Migration and compatibility

- **Every field is optional and every reader must tolerate its absence.** Existing reminders are not back-filled — there is no honest value to back-fill with, and inventing one poisons the data.
- Treat `snoozeCount ?? 0` and `nudgesSent ?? 0` as the reading convention. `isValidReminder` does not type-check the new fields, so a corrupt backup could deliver a string where a number is expected; read defensively rather than trusting the shape.

### Backup interaction (verified against `utils/reminderBackup.ts`)

New **reminder** fields need no work: `parseBackup` and `mergeReminders` both spread (`{...entry}`, `{...clean}`), so unrecognised fields already survive a round-trip. Two real gaps remain:

- **`BackupSettings` is an explicit allow-list**, not a spread. The re-nudge level is a *setting*, so it will be silently dropped from every backup unless added there. This is the gap that actually bites.
- **`mergeReminders` resolves conflicts as "local always wins"**, discarding the incoming copy wholesale. That rule is correct for its original purpose — a restore must never un-complete a reminder — but it means a locally re-typed reminder (fresh, no history) beats a backup copy carrying real accumulated `snoozeCount`. Instrumentation is lost precisely in the export → reinstall → re-type-a-few → import path the merge was built for. **Accept this loss rather than reworking the merge rule**: inverting it to preserve history would risk un-completing reminders, which is far worse than losing a counter. Document it; do not fix it. Confirmed 2026-08-23.
- Bumping `BACKUP_VERSION` is **not** required and should be avoided: `parseBackup` refuses any backup whose version exceeds its own, so a bump makes new backups unreadable by older installs for no gain, since the fields are additive and optional.

---

## Component 2 — Smart re-nudge

### Levels

Configurable, defaulting to Gentle.

| | **Off** | **Gentle** (default) | **Persistent** |
| --- | --- | --- | --- |
| Re-alerts | none | 1 | 3 |
| Schedule | — | +1 hour | +15 min, +1 hr, +4 hr |
| Then | card sits overdue | card sits overdue | card sits overdue |

**Off** is today's behavior and must stay reachable in one tap. Some users experience any repeat alert as harassment; for them this feature is a reason to uninstall, and the escape hatch matters more than the adoption number.

**Gentle** is the default because it is the smallest intervention addressing the most common benign failure — the alert arrived while your hands were full, and an hour later is a different context. Defaulting to Persistent would quadruple every existing user's notification volume on upgrade, unasked.

**Persistent** serves people who want to be chased. **The hard stop at 3 is not negotiable.** An unbounded ladder is precisely what trains reflexive dismissal, and once that reflex forms it degrades every notification the app sends.

### Rules applying at every level

**Quiet hours.** No re-nudge fires inside the user's quiet window (see Component 3). One scheduled inside that window is deferred to the window's end, not dropped. If several reminders have rungs deferred across the same night, they collapse into **one** notification at the window's end naming the count ("3 reminders still open") rather than a burst of separate alerts — waking to a stack of overnight notifications is the same fatigue failure quiet hours exist to prevent. Without any of this, the 4-hour rung on an evening reminder fires at 2am.

**The dread override.** A reminder with `snoozeCount >= 3` gets **no further re-nudge notifications at any level, Persistent included.** It has demonstrated that more pings do not work on it. Instead it surfaces the shrink prompt in-app. The setting must not be able to override the evidence; this is the psychological thesis of the feature, not a tunable.

**Daily ceiling.** Re-nudges across all reminders are capped per day, starting at 6. Eleven reminders on Persistent would otherwise add 33 notifications in a day and burn the channel down. On hitting the cap the remainder are dropped silently rather than deferred — deferring merely moves the flood.

**Snooze wins.** An explicit snooze cancels that reminder's entire pending ladder and starts it fresh from the new time. Otherwise a snoozed reminder is re-nudged at its old rungs while also waiting on its new one. This is the same double-fire failure `cancelScheduledForReminder` already exists to prevent, and it must reuse that sweep rather than track ids independently.

### Mechanics

Re-nudges are ordinary scheduled notifications carrying the same `reminderId` payload, so the existing `cancelScheduledForReminder` sweep already reaches them. They must **not** reuse `notificationId` on the `Reminder`, which names one notification only; the ladder is found by payload.

Interactions to get right:

- **Completion cancels the ladder** — via `toggleComplete`, `markDoneById`, and the notification action path alike.
- **Editing a reminder re-arms it** — `editReminder` already cancels and reschedules.
- **Boot reschedule** (`tasks/rescheduleTask.ts`) must re-arm pending ladders, or a phone restart silently disarms them.
- **A ladder rung whose reminder is already complete must not fire.** The cheapest guard is checking storage at schedule time and relying on the completion sweep; a stale rung firing on a done task is the most damaging possible failure for trust in this feature.

### The shrink prompt

Shown in-app when a reminder crosses `snoozeCount >= 3`. **Level-independent** — it is the replacement for pinging, not a companion to it, so it appears at Gentle and Persistent alike. It is not a notification, so it does not violate Off's promise either; it appears only when the user has already chosen to open the app.

Offers, in this order:

- **Just do 2 minutes** — the smallest credible first action, targeting cause #1 directly.
- **Move to a better time** — targeting cause #3.
- **Break it into steps** — targeting cause #2; splits into a first concrete action plus the remainder.
- **Actually, drop it** — deleting is a legitimate outcome and must be offered without friction or guilt copy. A task avoided ten times is often a task that should never have been on the list.

Copy discipline: it names the observation ("This one keeps sliding") and never the user's character. No "you", no counts, no "you've snoozed this 4 times".

It also carries a **"Why does this keep happening?"** link, opening the explainer in Component 5. This is the primary entry point to that content, and the reason it exists: someone reading about avoidance *while looking at a task they have avoided four times* is in a completely different learning state from someone browsing an About page.

### The check-in notification

**This corrects an error in the first draft of this design.** That draft made the shrink prompt in-app only, reasoning that it therefore did not violate Off's promise. That reasoning quietly conceded the prompt is nearly invisible: the person who most needs it is, by definition, the person avoiding the app. A help offer that reaches only the already-engaged reaches nobody who needs it.

The underlying thesis needed sharpening, not abandoning. What backfires is **repeating the demand** — "Call the dentist" for the fifth time re-activates precisely the aversion driving the avoidance. An offer that **lowers the cost** is the opposite act: it shrinks the perceived task instead of raising the pressure. Same channel, opposite psychological direction.

So: **one check-in notification per reminder, ever**, guarded by `checkInSent`. Not a ladder and not repeatable, because a repeated offer of help degrades into nagging.

- **Sent at a neutral moment** — the next morning inside the user's good window, never at the reminder's own scheduled time. That slot is already loaded with dread, and an offer delivered into it inherits the dread.
- **Its own Android notification channel** ("Check-ins"), separate from the reminder channels, so a user can silence check-ins without losing actual reminders. Silent and low-importance: this is an offer, never an alarm.
- **Names the task but frames the offer**, never restating the demand. Tapping it opens the shrink prompt.
- **Counts against the daily ceiling.**
- **Suppressed entirely at Off.** Off must mean *no notifications*, without exception. A level that still pings you is a lie, and one dishonest exception poisons trust in the whole setting. Off users keep the in-app shrink prompt only — which is a real reduction in the feature's reach for them, and the correct price of an honest setting.

---

## Component 3 — Quiet hours

Currently implicit and hardcoded in the rules above; this makes it a real, user-owned setting.

- **User-configurable start and end**, suggested default 22:00–08:00. Suggest, never impose — sleep schedules vary enormously, and a night-shift user's quiet hours may be 09:00–17:00.
- **Applies automatically to re-nudges and check-ins** (deferred silently — the *app* chose those times, so it needs no permission to move them).
- **Applies as a confirmation, never a block, to primary reminders.** A reminder the user deliberately set for 23:40 gets: *"That's 23:40, inside your quiet hours. Keep it, or move to 08:00?"* — with **Keep it** as the un-penalised default path. 2am medication and night-shift work are real; an app that refuses to set them is simply broken. This asymmetry is the whole point: the user's explicit choice is confirmed, the app's own choice is silently deferred.

Two implementation traps, both belonging in the pure util:

- **The window wraps midnight.** 22:00–08:00 is not a simple `start <= t && t <= end` comparison, and this is the classic off-by-one in every quiet-hours implementation ever written.
- **start == end must mean "no quiet hours"**, not "always quiet" — the degenerate case that silently disables every notification the app sends.

---

## Component 4 — Input fix

Detects a vague task at creation and offers a concrete first action before saving. Targets cause #2 at its source.

- **Advisory, never blocking.** The user can always save exactly what they typed. A creation flow that argues with you is a creation flow you stop using — and the quick-add bar's whole value is that it is fast.
- **Triggered by leading verb**, on a small curated list: "sort out", "deal with", "look into", "figure out", "think about", "handle", "organise/organize", "review", "plan". Kept deliberately short; a broad list fires on ordinary tasks and becomes noise.
- **Never fires twice for the same text.** Dismissing the hint suppresses it for that input.
- **English only.** The heuristic is verb-position-dependent and does not transfer to Malayalam, whose verbs are final and inflected. `MALAYALAM_RANGE` (exported from `utils/parseNaturalLanguage.ts` — do not redefine) gates it off. Deferred exactly as `INVITE_NUDGES_ML` is.

Lives in `QuickAddInput` and the add/edit screen, as a hint below the input rather than a modal.

---

## Component 5 — "Why tasks slip"

The research behind this design, in the app.

The argument for including it at all is not documentation: **the content is itself an intervention.** Learning that procrastination is mood-regulation rather than laziness measurably reduces it, because shame sustains the cycle and self-compassion interrupts it. It runs on the same mechanism as the rest of this feature.

**Structure — progressive disclosure, two layers:**

*Layer 1: four short cards*, each naming one mechanism and one concrete response. Skimmable in about a minute.

1. **It's about mood, not laziness.** Putting it off gives real relief. → Shrink it: do just two minutes.
2. **"Sort out insurance" isn't a task.** There's no first move to make. → Name the first phone call.
3. **The clock isn't the problem.** 2pm found you in a meeting. → Move it to when you're actually free.
4. **Eleven things on a Tuesday.** So none of them happen. → Pick the three that matter.

*Layer 2: the full article with citations*, behind a "Read more" from the cards. The evidence stated properly and attributed, for anyone who wants to check the claims rather than take them on faith.

**Entry points:** primarily the "Why does this keep happening?" link in the shrink prompt (the moment of felt relevance); secondarily a row in Smart Alerts settings for deliberate reading.

**Copy discipline, inherited from the shrink prompt and non-negotiable here:** normalising, never diagnosing. It describes how this works *for everyone*, not what is wrong with the reader. A sentence that could be read as an accusation fails, however accurate.

> **Task for implementation:** every citation must be **verified against the actual paper before shipping** — author, year, title, venue, and that the paper genuinely supports the claim attributed to it. The relevant literature includes Sirois & Pychyl on mood regulation, Steel's meta-analysis on procrastination, Gollwitzer on implementation intentions, and Sirois on self-compassion. These are recalled, not verified, and **shipping a misattributed citation inside a screen whose entire purpose is credibility would be self-defeating.** Do not copy this list into the app unchecked.

---

## Settings — "Smart Alerts"

A dedicated screen, reached from a prominent row at the **top** of Settings rather than buried among the existing toggles.

> **Decided:** a Settings row, not a fourth tab. The tab bar is Home/Settings/About, and a configuration screen does not earn permanent bottom-bar real estate. Confirmed 2026-08-23.

The screen shows three choices as full-width cards, each with a one-line plain-language description and a concrete example of what it does. No per-reminder overrides — the whole point is that one choice covers it.

Below the choice, exactly three further rows:

- **Quiet hours** — start and end pickers, defaulting to 22:00–08:00.
- **Why tasks slip** — opens the explainer (Component 5).
- A short static footer stating the one remaining automatic behavior, so it never reads as a bug: that the app stops sending alerts for tasks you keep postponing, and offers to help instead.

Quiet hours is the only control here with any configuration surface, and it earns it because the default is wrong for a meaningful minority of users (night shifts, different sleep schedules) in a way the intensity levels are not.

Name: **Smart Alerts**. "Intelligent alerting" reads as infrastructure; "Smart Alerts" is shorter, is what the user will call it, and fits a settings row without wrapping.

---

## Persistence — why this stays on AsyncStorage

Asked directly during review: do these requirements need SQLite? **No — but the question surfaced two real problems that must be addressed regardless.** Recording the reasoning here because this decision gets silently revisited otherwise.

**Volume does not justify it.** A reminder is roughly 200–400 bytes of JSON. A thousand reminders is ~300KB, five thousand ~1.5MB; serialising that is single-digit milliseconds. The instrumentation adds five small scalar fields per record and does not move the needle. The deferred insights screen wants grouping by hour and weekday, which SQL would express elegantly, but over a few thousand rows in JS it is trivially fast.

**Migration cost is the counterweight.** AsyncStorage holds the *only* copy of a user's data — no backend, and backup is manual. A migration bug destroys real reminders unrecoverably. `expo-sqlite` is also a native module, and this repo has documented, painful local-Android native build failures (the CMake/Ninja and JDK traps in `CLAUDE.md`). That is substantial risk to buy capacity nobody needs yet.

**The one honest argument in favour.** `markDoneById` and `updateSnoozeById` run in the *headless* notification task and do load-whole-array → modify → save-whole-array; `markDoneById` even `await`s `cancelNotification()` between load and save, widening the window with a native call. `RemindersContext` separately writes the whole array from a long-lived React state snapshot. This design **adds** background writers (`nudgesSent`, `checkInSent`, `snoozeCount`), so concurrent whole-array writers increase. Be precise about the limit: **a JS-level mutex cannot fix this**, because the headless task runs in a separate JS runtime and would not share the lock. `UPDATE ... SET nudges_sent = nudges_sent + 1 WHERE id = ?` genuinely would. The risk is today mitigated — but not eliminated — by the AppState-active reload in `RemindersContext`.

**Decision: stay on AsyncStorage, with three mitigations that also defer the migration.**

1. **Keep high-frequency scheduler state out of the reminders blob.** The daily-ceiling counter gets its own key, so frequent writes never rewrite the big array.
2. **Make `nudgesSent` / `checkInSent` writes narrow and idempotent** — re-read immediately before writing, and design so a lost update is harmless rather than corrupting. Setting `checkInSent = true` twice is fine; losing one costs at most one extra check-in. **Never** make a scheduler write a read-modify-write that must not be lost.
3. **Add an archival policy for completed reminders.** Unbounded array growth is what will *actually* force this migration eventually, and it is far cheaper to address before the array is large.

**Revisit when** the insights screen is built, or lost-update bugs are observed in the wild, or reminder counts climb materially — whichever comes first.

### Required regardless: harden the corrupt-read path

`loadReminders` catches a JSON parse failure and returns `[]`. The app then renders an empty list, and **the next write persists that empty array over the user's real data.** Rare, unrecoverable, and a latent bug independent of this feature. Distinguish "store is empty" from "store is unreadable", and refuse to write over an unreadable store. This is a prerequisite task, not a nice-to-have — the instrumentation makes each record more valuable and therefore the loss worse.

## Error handling

- All new storage reads follow the established `try/catch` + sensible-default pattern in `ReminderService`. A corrupt or missing value must never wedge scheduling.
- A failed re-nudge schedule is swallowed like existing scheduling failures — the reminder itself is unaffected; only the extra alert is lost.
- The daily-ceiling counter is keyed by local date and read defensively; a corrupt counter degrades to allowing nudges, never to blocking them permanently.

## Testing

- **Pure logic first.** Ladder computation, quiet-hours deferral, dread override, and daily-ceiling arithmetic all belong in a pure, fully-unit-tested util taking an injected `now` — mirroring `utils/snoozePresets.ts`. No timing-dependent tests.
- **Quiet-hours edge cases get explicit tests**, because both failure modes are silent: a window **wrapping midnight** (22:00–08:00 — times before start *and* after end are both inside it), and **start == end meaning "never quiet"** rather than "always quiet". A bug in the second disables every notification the app sends, with no error anywhere.
- **Service tests** for each instrumentation field, including that `originalDatetime` is written once and only once across repeated snoozes, and that un-completing clears `completedAt`.
- **A test that the check-in fires at most once per reminder**, across repeated qualifying conditions. `checkInSent` is the only thing standing between "an offer of help" and "nagging".
- **A test that Off suppresses the check-in**, since that is the exception most likely to be lost in a later refactor and the one that breaks the setting's promise.
- **Backup round-trip tests** proving the new fields survive `serializeBackup` → `parseBackup` → `mergeReminders`, and that the new *settings* survive — the `BackupSettings` allow-list is the half that actually drops things.
- **Screen tests** for the Smart Alerts screen, the shrink prompt at each level (including that it appears on Gentle), the quiet-hours input confirmation offering **Keep it** as a real path, and the input hint's advisory/dismissible behavior.
- **A regression test that no surface renders a completion rate.** The hardest constraint to keep is the one no test enforces.

## Risks

- **Notification fatigue is the failure mode that kills the feature**, and it is invisible in tests. The daily ceiling, the hard stop, and quiet hours are all load-bearing; none should be relaxed without evidence.
- **The re-nudge cannot be validated locally.** It depends on real scheduling over hours across a device sleep cycle. It needs the same device-verification treatment as backlog item D3, which is still unverified.
- **`snoozeCount >= 3` as the dread threshold is a guess.** It is a constant, deliberately, so it can be tuned once real data exists.
- **The check-in is the riskiest notification in the app.** It is unsolicited, it arrives about a task the user is actively avoiding, and its whole value rests on landing as help rather than as nagging — a distinction carried entirely by copy and by firing exactly once. If any single piece of this design warrants real user testing before wide release, it is this one. The `checkInSent` guard and the separate channel are its safety rails; treat both as load-bearing.
- **The explainer's credibility is all-or-nothing.** A screen that cites research to persuade someone their procrastination is normal fails completely if a citation is wrong, because the reader's reasonable response to one error is to discount the whole thing — including the parts that would have helped.
