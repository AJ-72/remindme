# Backlog

Open work, prioritized. Grouped by **dependency** first (independent items
before ones that build on something else), then by **effort** within a group
(cheapest first). Every item has a stable ID (`B#`/`M#`) — reference these in
commits, code comments and `device-tests/`, not the row position.

**Legacy numbers:** this file was renumbered on 2026-09-04 for scannability.
Old plain-numbered items (referenced from code comments, tests, and other
docs as "backlog item N") map to the new IDs in the **Legacy #** column below
— old references still resolve via that column, do not renumber again.

## Status legend

| Status | Meaning |
| --- | --- |
| `OPEN` | Not started. |
| `IN PROGRESS` | Partially built — see notes. |
| `BLOCKED` | Can't proceed until a dependency or decision lands. |
| `DEFERRED` | Deliberately postponed, not forgotten. |
| `DONE` | Shipped. Kept here briefly for traceability, then safe to prune. |

## Effort legend

| Effort | Meaning |
| --- | --- |
| S | Small — hours, single file/area, no new native module. |
| M | Medium — a day or more, several files, may need tests across layers. |
| L | Large — needs its own spec/plan, touches architecture, or needs a native build/backend. |

---

## Tier 0 — independent, no prerequisites

Ordered cheapest-first within the tier.

| # | Legacy # | Item | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| B1 | 3 | Calendar integration | S (scope only) | `OPEN` | "Integrate with calendars?" — still just a question. Needs scoping: read-events vs. create-reminder-from-event. Folds into [M5](#m5-forward-to-remind) rather than standing alone. |
| B2 | 4 | Verify the snooze flow | S | `OPEN` | Manual verification only — see [device-tests/notifications.md](device-tests/notifications.md) D3/D15/D16 for the device-level checks this maps to. |
| B3 | 1 | Google Drive backup / migration | M (pending D1), else L | `BLOCKED` | Manual JSON export/import shipped 2026-08-10 (Settings → Back up/Restore, merge is local-wins, dedupes by content not id). **Check [device-tests/cross-cutting.md#d1](device-tests/cross-cutting.md#d1) first** — Android Auto Backup may already cover phone migration and make Drive sync unnecessary; that test is cheap and changes this item's scope entirely. |
| B4 | 17 | Manglish support (regional language typed in English) | M | `OPEN` | Support for reminders typed in English letters but Malayalam words/grammar. Not started; no research done yet. |
| B5 | 18 | Rename `SNOOZE_ACTION_ID` tech debt | M | `OPEN` | String is `"SNOOZE_10"` but snooze durations are now user-configurable (5/15/30/60 min/tomorrow) — misleading name, left as-is deliberately because it's embedded in the `categoryIdentifier` of notifications already scheduled on devices. Needs a migration story (e.g. register both old and new action IDs for one release, then drop the old one). |
| B6 | 2 | Image support in shared/dictated input | M | `OPEN` | Audio half done (mic + WhatsApp voice-note forwarding, Android only — see B7). Image support not started. Part of the [M5](#m5-forward-to-remind) "forward-to-remind" area. |
| M2 | — | Recurring reminders ("every day at 8", "every Monday") | L | `OPEN` | See [Major features](#major-features) below — highest-value missing feature, needs its own spec. |
| M9 | — | Smart re-nudge (re-alert ladder) | L | `OPEN` | See [Major features](#major-features) below — prerequisite (real `snoozeCount` data) is now met; ready to spec. |
| M3 | — | Location-based reminders | L | `OPEN` | See [Major features](#major-features) below. |

---

## Tier 1 — needs a native build (blocked only on that, otherwise ready)

| # | Legacy # | Item | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| B7 | 2 | Ship next native build with current audio-transcription fixes | S (build only) | `BLOCKED` | Voice-to-text via mic + WhatsApp-audio forwarding is code-complete (Android only). Needs a native/EAS build to reach devices — see CLAUDE.md's Android build instructions. |
| B8 | — | M4 Tier 1 device sign-off | S | `PARTIAL` | The **core loop passed on device 2026-08-30** — contact picked, message sent by WhatsApp and SMS. What remains is D9's edge-case list (App-Links install order, not-on-WhatsApp numbers, other OEM messaging apps, permission denied→re-granted, 1000+ contacts, cold-start tap), each worth its own run: [device-tests/feature-e2e.md#d9](device-tests/feature-e2e.md#d9). No longer blocks shipping Tier 1. |

---

## Tier 2 — needs the backend built (shared prerequisite)

**There is a schema now, and still nothing behind it** — see CLAUDE.md.
`lib/db` defines five tables with RLS policies and tests (landed 2026-09-01 for
M4 Tier 2), but there is no Supabase project, no Edge Functions, and the app
talks to none of it. Each of these still needs device→server sync, an identity
model, and auth; whoever builds that first pays for all three. None should be
scoped as "wire up the existing API" — see each item's notes in
[Major features](#major-features).

| # | Legacy # | Item | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| M4-T2 | — | Remind someone else, Tier 2 (app-to-app + acknowledgement) | L | `IN PROGRESS` | Schema + RLS landed; needs a Supabase project and the Edge Functions. This is the item paying for the backend the other three inherit. See [M4](#m4-remind-someone-else). |
| M7 | — | Group reminders with RSVP | L | `OPEN` (needs spec) | Shares M4 Tier 2's backend. See [M7](#m7-group-reminders-with-rsvp) — the strategic reframe of Tier 2's read from the 2026-08-09 adoption assessment. |
| M8 | — | MCP server for the app | L, or S for read-only variant | `DEFERRED` | See [M8](#m8-mcp-server) — a cheap read-only variant (query an exported backup JSON) exists and doesn't need the backend, but privacy trade-offs need a decision first. |
| M6 | — | Remind a contact from natural language | M (after M4 T1 ships) | `DEFERRED` | Builds on M4 Tier 1's contact picker — resolves recipients from free text instead. See [M6](#m6-remind-a-contact-from-natural-language). |

---

## Recently shipped (kept for traceability — prune once stale)

| # | Legacy # | Item | Shipped | Notes |
| --- | --- | --- | --- | --- |
| — | 22 | Persona-based personalization onboarding | *not merged* | `DEFERRED` — see [M-persona](#persona-based-personalization-onboarding) below; ~half-built on an unreviewed branch, not in any build. |
| — | 21 | Un-completing a reminder never re-schedules its notification | 2026-08-28 | `toggleComplete` re-arms on un-complete (future branch only; past stays overdue/silent by design). Device-verified: [device-tests/data-safety.md#d21](device-tests/data-safety.md#d21). |
| — | 20 | Explain the permanent status-bar alarm icon | 2026-08-28 | Toggle relabeled, explainer added. Device-verified with one fix needed: [device-tests/cross-cutting.md#d22](device-tests/cross-cutting.md#d22). |
| — | 21 (second) | Pre-existing reminders never re-arm until the 15-min sweep after an app update | 2026-08-30 | `RemindersContext` now calls `rescheduleAllFutureReminders()` eagerly on mount. Device-verified: [device-tests/data-safety.md#d23](device-tests/data-safety.md#d23). |
| — | — | 12-hour AM/PM time display | 2026-09-03 | `hour12: true` forced everywhere times render. Jest green; device run blocked on Metro connectivity — [device-tests/malayalam-parsing.md#d24](device-tests/malayalam-parsing.md#d24). |
| — | 15 | Sort completed reminders newest-first, pending earliest-first | 2026-07-21 | |
| — | 16 | Speech-to-text bugs (language always downloaded/English, content not saved, toggle stuck) | 2026-07-23 | |
| — | 11 | "Mark as done" push notification doesn't dismiss | 2026-07-21 | |
| — | 10 | Description edits not saving | 2026-07-21 | |
| — | 12 | Reminder doesn't fire the first time without an edit+save | 2026-07-21 | Likely cause fixed; flagged for re-verification at the time. |
| — | 9 | Branding — CuriosMind Labs name + About tab | 2026-07-22 | Placeholder icon only; real icon tracked as B-icon below. |
| — | 6 | Textbox placeholder overflow | 2026-07-20 | |
| — | 5 | Show description in notification (with consent) | 2026-07-20 | |
| — | Malayalam numeral clock times | Landed | Parser-side; device checklist still open — [device-tests/malayalam-parsing.md#numeral-clock-times](device-tests/malayalam-parsing.md#numeral-clock-times). |
| — | Ambiguous-numeral confirmation sheet | Landed | Parser-side; device checklist still open — [device-tests/malayalam-parsing.md#ambiguous-numeral-sheet](device-tests/malayalam-parsing.md#ambiguous-numeral-sheet). |

## Unscoped / needs a decision before it's an item

| Legacy # | Item | Notes |
| --- | --- | --- |
| 7 | Better app icon | "How to publish to Play Store for beta" (item 8) is related packaging work — bundle these when picked up. |
| 13 | Longer-text UX in reminder box + discoverability that time is auto-parsed | Needs a brainstorm — not yet scoped into a concrete change. |
| 14 | Stronger natural-language time parsing | Ongoing direction rather than a single item — most recent work under this heading is the Malayalam numeral/ambiguous-numeral work above. Re-scope if picked up again as a distinct research task. |

---

## Major features

The headline features, tracked together so they don't get lost among bugs
and tech debt. Each needs its own brainstorm → spec → plan cycle; none is a
drop-in change.

**Strategic context** (2026-08-09 adoption assessment): the app's real moat
is on-device Malayalam parsing (no account, no network), not the reminder
list itself, and M4 ("remind someone else") is the roadmap item with no
incumbent. M7 revises that report's read of M4 Tier 2. **Prefer features that
deepen those two things over ones that widen the app's surface.**

| ID | Feature | Status | Effort |
| --- | --- | --- | --- |
| [M1](#m1-dark-mode) | Dark mode | `DONE` 2026-08-10 | — |
| [M2](#m2-recurring-reminders) | Recurring reminders | `OPEN` | L |
| [M3](#m3-location-based-reminders) | Location-based reminders | `OPEN` | L |
| [M4](#m4-remind-someone-else) Tier 1 | Remind someone else (send-only) | `DONE` 2026-08-30 (core loop on device) | — |
| [M4](#m4-remind-someone-else) Tier 2 | Remind someone else (app-to-app + ack) | `IN PROGRESS` (schema landed) | L |
| [M5](#m5-forward-to-remind) | Forward-to-remind (share intents) | `IN PROGRESS` | M |
| [M6](#m6-remind-a-contact-from-natural-language) | Remind a contact from natural language | `DEFERRED` | M |
| [M7](#m7-group-reminders-with-rsvp) | Group reminders with RSVP | `OPEN` (needs spec) | L |
| [M8](#m8-mcp-server) | MCP server for the app | `DEFERRED` | L |
| [M9](#m9-smart-re-nudge) | Smart re-nudge | `OPEN`, ready to spec | L |

### M1. Dark mode

`DONE` 2026-08-10 — follows the system setting, plus an in-app
Light/Dark/System override (Settings → Appearance). Full palette in
`constants/colors.ts`, `useColors()` switches on `useColorScheme()`.
`ThemeProvider` sits outside `ErrorBoundary` so a crash screen still honours
the chosen theme. Covered by `hooks/useColors.test.ts` plus render tests.
**Needs a fresh device walk** — several screens (Smart Alerts, Why tasks
slip, quiet-hours/name sheets) shipped after the last pass. See
[device-tests/visual-layout.md#d8](device-tests/visual-layout.md#d8).

### M2. Recurring reminders

"every day at 8", "every Monday", "monthly on the 1st". Repeatedly
identified as the highest-value missing feature. Known constraints
(2026-08-07 analysis):
(a) `chrono-node` does NOT return recurrence info — it silently drops "every
day"/"daily", stranding the word in the title, so recurrence parsing must be
built, not configured;
(b) `malayalamDateParser.ts` has no recurrence support either;
(c) the codebase schedules only one-shot `SchedulableTriggerInputTypes.DATE`
triggers, so either a repeating trigger type or a rolling
re-schedule-on-fire scheme is needed — the latter interacts with the
boot-reschedule task and `ALARM_EARLY_OFFSET_MS` (see
[device-tests/cross-cutting.md#d19](device-tests/cross-cutting.md#d19));
(d) UI surface is larger than it looks — `add-reminder.tsx` (~630 lines) and
`QuickAddInput.tsx` (~810 lines) both need changes;
(e) the `Reminder` interface and its AsyncStorage records need a migration.

### M3. Location-based reminders

"remind me when I reach home / leave office / am near a pharmacy". Needs
geofencing (`expo-location` + `expo-task-manager`, the latter already a
dependency, already used for boot-reschedule and notification-response
tasks). Significant new surface: background location permission is a
separate, more heavily-scrutinized Android/iOS permission than
notifications and requires Play Store justification; geofence limits are
per-OS (Android ~100/app); battery impact needs review; the `Reminder` model
gains a location trigger alongside the datetime one, so "when does this
fire" stops being a single timestamp. Also decide whether time and location
triggers can combine ("at 6pm only if I'm home").

### M4. Remind someone else

Remind another person/contact, or a group. Split into two tiers after a
design interview on 2026-08-09:

**Tier 1 — `BUILT` 2026-08-17, core loop `PASS` on device 2026-08-30.** The
user picked a contact from the phone's contacts and sent the pre-filled
message by **both WhatsApp and SMS** on their own OEM device, so Tier 1
counts as shipped. The edge cases listed under D9 (hostile App-Links install
order, not-on-WhatsApp numbers, other OEM messaging apps, permission
denied→re-granted, 1000+ contacts, cold-start tap) remain outstanding and are
each worth their own run. All 14
tasks done; suite now 830 tests green, typecheck clean. Ships a `recipient?` on
`Reminder` (+ `isSendReminder`), send-time phone normalization
(`utils/phoneNumber.ts`), three-stage capped invite nudges
(`utils/inviteNudges.ts`), `services/messageLinks.ts` (wa.me + `sms:`), a
contact picker, a "Sending" home section, a recipient chip,
`app/send-reminder.tsx`, and notification routing that reads storage rather
than the payload. **Needs a native build — `expo-contacts` is not OTA-able.**
Plan: [`docs/superpowers/plans/2026-08-09-remind-someone-else-tier1.md`](docs/superpowers/plans/2026-08-09-remind-someone-else-tier1.md).
At reminder time the *sender's* phone rings; they tap and send a pre-filled
WhatsApp/SMS message. Entirely on-device — no backend, no accounts, no push
tokens. Outgoing messages carry a witty app invite (capped at 3/person),
which is what makes Tier 2 viable later. **Honest framing that constrains
all copy: this is "remind me to message someone", not "remind someone
else"** — the recipient's phone never rings. Device checklist:
[device-tests/feature-e2e.md#d9](device-tests/feature-e2e.md#d9).

**Tier 2 — `DESIGNED` 2026-08-30, schema landed 2026-09-01, still not
reachable by the app.** Spec:
[`docs/superpowers/specs/2026-08-30-remind-someone-else-tier2-design.md`](docs/superpowers/specs/2026-08-30-remind-someone-else-tier2-design.md).
Plan:
[`docs/superpowers/plans/2026-08-30-remind-someone-else-tier2.md`](docs/superpowers/plans/2026-08-30-remind-someone-else-tier2.md)
— 11 phases; phases 0-5 are the walking skeleton and nothing is visible until
phase 5.

The design headline: **the server is a store-and-forward mailbox, not a
runtime.** The reminder is transferred at accept time and fires from the
recipient's own `expo-notifications` schedule, so the backend can be down all
night and nobody misses a reminder — and every punctuality property won in
D19-D23 and D26 is inherited rather than re-fought.

Identity separates *having an account* (a device key) from *binding a phone
number* (what makes you discoverable). Binding needs proof of number control
on a two-rung ladder: possession of a Tier 1 invite link (free, silent, and
the reason the older-parent case never sees a verification screen), else an
OTP at ~₹0.20 once per number. **This reverses the original no-OTP
decision** — an adversarial review
([`docs/reviews/tier2-adversarial-review.md`](docs/reviews/tier2-adversarial-review.md),
14 findings, 3 P0) showed it allowed permanent number squatting.
Re-verifying rebinds the existing account within **45 days** (the Indian
carrier recycling floor, and WhatsApp's own number); past that it is a fresh
account. Discoverability, global mute and account existence are three
separate settings. Consent is **accept-first**; blocking is honest,
per-person and reversible; snoozes are **never** reported to the sender
(caregiving, not surveillance).

Backend is **Supabase** (`ap-south-1`, ~$25/mo from the first real user — the
free tier's pause would silently drop invitations), reached only through Edge
Functions ([`docs/adr/0001`](docs/adr/0001-client-talks-to-edge-functions-not-postgrest.md)).
**Tier 1 becomes permanent infrastructure**, used three ways: bootstrap,
fallback, and recovery.

*Landed so far:* three pure client modules (`normalizeForIdentity`,
`invitationStatus`, `recipientReachability`), and `lib/db`'s five tables
(`users`, `devices`, `blocks`, `invitations`, `link_codes`) with RLS policies,
column privileges and 41 tests against a real Postgres via PGlite. **None of
it is reachable by the app** — there is no Supabase project and no Edge
Functions yet.

*Still needed from a human:* a Supabase project, and one real older-adult user
walked through onboarding (rung 1 of the ladder is currently an untested
theory).

Device checks D27-D37 are written and `BLOCKED` on the backend existing:
[device-tests/remind-others.md](device-tests/remind-others.md).

### M5. Forward-to-remind

Create a reminder by forwarding/sharing from WhatsApp, Google Calendar,
email, etc. **`IN PROGRESS`.** `expo-share-intent` already handles shared
text, URLs, and audio (WhatsApp voice notes → transcription) — see
`contexts/SharedTextContext.tsx` and [B6](#tier-0--independent-no-prerequisites)/[B7](#tier-1--needs-a-native-build-blocked-only-on-that-otherwise-ready).
Still open: images ([B6](#tier-0--independent-no-prerequisites)), calendar
integration ([B1](#tier-0--independent-no-prerequisites) — read-events vs.
create-reminder-from-event needs deciding), and a general review of which
apps' share payloads are worth first-class handling.

**Sub-item — "leave now" reminders that deep-link to a cab app.**
`DEFERRED` 2026-08-09. Fire at *leave* time ("Leave now for Dr. Menon") with
a button opening Uber/Ola pre-filled. **Deep link only — do not attempt a
ride-request API or an Uber MCP server**: requesting a ride needs a
privileged Uber scope requiring business-development approval; community MCP
servers wrapping it are unofficial and mostly gated. Would also spend the
app's on-device/no-account differentiator on a commodity feature. Note Uber
is not the Indian default — Ola, Rapido and Namma Yatri hold serious share,
and Rapido's bike taxis dominate exactly the short hops this would trigger.
Honest gap: a deep link can't compute travel time, so *when to fire* is
guesswork without a maps lookup. Reuses M4 Tier 1's `Linking.openURL` +
fallback pattern almost verbatim. Low priority — opening Uber directly takes
about four seconds.

### M6. Remind a contact from natural language

*(builds on M4 Tier 1)* "Remind my husband to pick up milk" — resolving the
recipient from reminder text instead of tapping through a picker. M4 Tier 1
deliberately uses an explicit picker, so this is a later refinement: needs
contact resolution from free text, relationship aliases ("my husband" → a
specific contact), and disambiguation ("which David?"). Would also need to
work in Malayalam, where the parser is hand-written
(`utils/malayalamDateParser.ts`).

### M7. Group reminders with RSVP

*(shares M4 Tier 2's backend)* Raised 2026-08-09: "book turfs or movie
tickets via the group reminder". The booking is **not** the feature; the
coordination around it is.

**The problem nobody owns.** Nine people in a WhatsApp group, "who's in for
Saturday 6am football?", three confirm, two go silent, someone books anyway,
two don't show, the payment split never resolves. Booking the turf itself is
already easy (Hudle/Playo, ~30 seconds). The coordination dies in WhatsApp.

**Why this is M4 Tier 2, not a new backend.** Tier 2 is app-to-app delivery
*with acknowledgement flowing back*. Acknowledgement **is** RSVP. A group
reminder tracking who confirmed is Tier 2 aimed at a group — same push
tokens, same identity model, same server.

**Why it matters strategically.** The 2026-08-09 adoption assessment priced
Tier 2 as a caregiving feature (real but narrow, one persona). Group
coordination is materially larger on the *same* infrastructure, and is the
first roadmap item giving the young-urban-professional persona a reason to
stay rather than churn week one. **This is a correction to that report's
read of Tier 2, not a new feature area.**

**Booking is the last tap, not the product.** Once N people confirm,
deep-link to Hudle / Playo / BookMyShow. Verified 2026-08-09:
**BookMyShow publishes no official public API and runs no partner program**
— available options are scraping or reverse-engineered projects, ToS-
violating and unstable. Hudle/Playo document integration only for *venue
partners*. So the division is forced and correct: we own coordination, they
own the transaction. **Do not build a booking integration.**

**Open questions before this gets a spec.** (a) Arguably a *different app* —
group RSVP for weekend football shares almost nothing with a
Malayalam-parsing personal reminder list. (b) Forks with M4 Tier 2's
caregiving use case: same infrastructure, different audience, audience
choice drives the UI. (c) Group identity without accounts is unsolved —
Tier 1's phone-number-as-key approach may or may not stretch to groups.
(d) Malayalam support for group flows is unexamined.

### M8. MCP server

*(raised 2026-08-24)* Expose reminders to an AI assistant: "what have I got
tomorrow", asked from a desktop chat rather than the phone.

**The blocker is not MCP, it is that there is nothing to connect to.**
Reminders live only in AsyncStorage on the handset. An MCP server needs a
reachable data source; there is none (verified 2026-08-24: one health route,
zero DB tables). Honest version: **"build the backend, then MCP is a thin
layer on top"** — the backend is the entire cost. Same prerequisite as M4
Tier 2 and M7 — sequence this *after* Tier 2 rather than duplicating the
work.

**A genuinely cheap version exists, read-only.** Point an MCP server at an
exported backup JSON (Settings → Back up reminders) and expose query tools
over it — what's due, overdue, what keeps getting postponed
(`snoozeCount`/`originalDatetime` since 2026-08-23). No backend, no
accounts, no native build. Two honest limits: data is **stale as of the
last manual export**, and writes can't reach the phone. Worth doing only if
the read half alone is useful.

**Do not build a device-hosted MCP server.** Phones don't host processes a
desktop client can reach; an adb-based reader works only on debuggable
builds — a debugging tool, not a product.

**Privacy is a real constraint, not a footnote.** The app's stated position
is on-device, no account, no network (`threat_model.md`, README). An MCP
server ships the user's entire reminder list to whatever model is on the
other end — the opposite of that promise. Needs explicit, revocable,
per-session consent, honest copy, never on by default. **Check this doesn't
undercut the app's differentiator before building it.**

**Prior art to reuse:** `lib/api-spec/openapi.yaml` + its orval codegen
already exist as scaffolding. Whatever MCP tools get defined should be
generated from that spec, not hand-written twice.

### M9. Smart re-nudge

*(Component 2 of the Smart Alerts spec — the only one not built)* The
re-alert engine the other four components were built to support. Spec:
[`docs/superpowers/specs/2026-08-23-smart-alerts-design.md`](docs/superpowers/specs/2026-08-23-smart-alerts-design.md)
("Component 2"). Components 1/3/4/5 shipped 2026-08-23. This one was
deliberately built last, on real data.

**Four parts:** (a) a **ladder** of re-alerts — Off / Gentle (+1 hr,
default) / Persistent (+15 min, +1 hr, +4 hr), hard stop at 3; (b) the
**dread override** — `snoozeCount >= 3` gets no further re-nudges at any
level, overriding the user's setting deliberately, the psychological thesis
of the feature; (c) the **shrink prompt** at that threshold (*Just do 2
minutes* / *Move to a better time* / *Break it into steps* / *Actually,
drop it*), plus a link into the Component 5 explainer; (d) the **check-in
notification**, once per reminder ever, next morning at a neutral moment, own
low-importance channel, suppressed entirely at Off.

**Cross-cutting rules:** quiet-hours deferral with overnight rungs
collapsing into one "3 reminders still open"; daily ceiling of 6 across all
reminders, dropped not deferred on hitting the cap; explicit snooze cancels
the whole pending ladder via the existing `cancelScheduledForReminder`
sweep.

**Prerequisite now met** — it was deferred until real `snoozeCount` data
existed; `ReminderService.ts` has incremented it on every snooze since
Component 1 shipped.

**Constraint — collides with the setAlarmClock fix.** Ladder rungs are
ordinary scheduled notifications carrying the same `reminderId` payload, so
a rung inheriting `alarm: true` would route through `setAlarmClock()` (see
[device-tests/cross-cutting.md#d19](device-tests/cross-cutting.md#d19)).
That would make **every rung** claim the system's single "next alarm clock"
slot, repeatedly overwriting the user's real clock alarm, and trip OEM
"frequently wakes your system" heuristics. **The re-nudge scheduling path
must force the non-alarm-clock route explicitly** — the reminder's own alarm
flag must not propagate to its rungs.

### Persona-based personalization onboarding

*(not in the priority table above — deferred, unreviewed branch)* Plan:
[`C:\Users\anand\.gemini\antigravity\brain\a09f2cdd-23cf-461e-b10c-cce7da152001\implementation_plan.md`](file:///C:/Users/anand/.gemini/antigravity/brain/a09f2cdd-23cf-461e-b10c-cce7da152001/implementation_plan.md)
(written by Gemini/Antigravity). A first-run 3-question quiz maps the user
to one of 4 profiles (Busy Juggler, Step-by-Step Doer, Quick Finisher, Deep
Focuser), meant to tailor lead time, alarm/vibration, snooze length and
notification tone per profile. Lives on branch `feature/persona-onboarding`
(tip `ae47295`), tagged in its own commit message **`[NOT REVIEWED — do not
ship as-is]`**. Not merged into `main`. Not in a single EAS build (checked
2026-08-30). **Deferred — take up later.**

**Status as of 2026-08-30, checked against the plan doc:** roughly
half-built.
- **Done:** `types/persona.ts`, `constants/personas.ts`,
  `utils/personaScoring.ts`, `components/onboarding/OnboardingWizard.tsx`,
  `components/PersonaComparisonSheet.tsx`; `ReminderService.ts` has
  `getUserPersona`/`setUserPersona`/`hasCompletedOnboarding`/
  `markOnboardingCompleted`; `app/_layout.tsx` wires `OnboardingWizard` in
  place of the old `NameOnboarding`. Tests exist for wizard, comparison
  sheet, scoring util; full suite (730 tests) passes, typecheck clean on
  that branch.
- **Not started:** `app/(tabs)/settings.tsx` has no "Reminder Style" section
  at all (no persona badge, comparison-sheet entry point, re-take-quiz
  control, or per-setting overrides). `app/smart-alerts.tsx` has no
  persona-tuning explanation card. `getPersonaSettings()`/
  `savePersonaSettings()` (per-setting override storage) never written.
  Scheduling doesn't apply persona lead time anywhere — `scheduleNotification`
  still uses one hardcoded `ALARM_EARLY_OFFSET_MS` (60s) for everyone, so the
  plan's headline mechanism (personas changing actual reminder *behavior*,
  not just onboarding copy) isn't wired up. No manual/device verification —
  it's never been built into a runnable artifact.
