# Roadmap

Design essays for the headline features, moved out of `backlog.md` on
2026-09-20 so the backlog can stay a list of open work. Each needs its own
brainstorm → spec → plan cycle; none is a drop-in change.

Status for each lives in [backlog.md](../backlog.md) (open work) or
[docs/features.md](features.md) (shipped). **This file holds the reasoning,
not the status** — if the two disagree, backlog/features wins.

**Strategic context** (2026-08-09 adoption assessment): the app's real moat
is on-device Malayalam parsing (no account, no network), not the reminder
list itself, and M4 ("remind someone else") is the roadmap item with no
incumbent. M7 revises that report's read of M4 Tier 2. **Prefer features that
deepen those two things over ones that widen the app's surface.**

| ID | Feature | Status |
| --- | --- | --- |
| [M1](#m1-dark-mode) | Dark mode | `DONE` 2026-08-10 |
| [M2](#m2-recurring-reminders) | Recurring reminders | `DONE` 2026-09-19 (Jest only) |
| [M3](#m3-location-based-reminders) | Location-based reminders | `OPEN` |
| [M4](#m4-remind-someone-else) Tier 1 | Remind someone else (send-only) | `DONE` 2026-08-30 |
| [M4](#m4-remind-someone-else) Tier 2 | Remind someone else (app-to-app) | `DONE` 2026-09-11 (live) |
| [M5](#m5-forward-to-remind) | Forward-to-remind (share intents) | `IN PROGRESS` |
| [M6](#m6-remind-a-contact-from-natural-language) | Remind a contact from natural language | `DEFERRED` |
| [M7](#m7-group-reminders-with-rsvp) | Group reminders with RSVP | `OPEN` (needs spec) |
| [M8](#m8-mcp-server) | MCP server for the app | `DEFERRED` |
| [M9](#m9-smart-re-nudge) | Smart re-nudge | `OPEN`, ready to spec |
| [M10](#m10-voice-reminders) | Voice reminders | `OPEN`, needs spec |
| [M11](#m11-habits-and-care-nudges) | Habits and care nudges | `OPEN`, needs spec |
| [M-persona](#persona-based-personalization-onboarding) | Persona onboarding | `DEFERRED`, unreviewed branch |

---

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

`DONE` 2026-09-19 (English only — Malayalam recurrence is still unbuilt,
`ParsedReading.recurrence` is type-only there) — "every day at 8", "every
Monday", "monthly on the 1st". Plan: `docs/superpowers/plans/2026-09-18-recurring-reminders-m2.md`.
Advance-in-place (one record rolls forward, no per-occurrence history) via a
rolling reschedule-on-fire scheme — see the "Recurrence model" entry under
Architecture decisions in `CLAUDE.md` for the full design. Covers: NL parsing
in both QuickAddInput and add-reminder (typing "every day at 8" fills a
`RecurrenceRule` live), a shared `RecurrencePicker` for explicit
set/edit, the home-list card marker, the detail screen's rule line and "Next
3" preview, adherence-stats tallying so a recurring reminder's completions
aren't invisible to Insights, snooze-vs-anchor semantics (a snooze defers one
occurrence, never moves the series), and Tier 2 (a recurring reminder sent to
someone else carries its rule to their device on accept). Also covers home
screen preview cards: a completed recurring reminder's next occurrences now
show as read-only, dimmed cards under their correct day headers instead of
the series disappearing once today's instance is done — device-confirmed
2026-09-20, [device-tests/feature-e2e.md#d92](device-tests/feature-e2e.md#d92).
**Notification/alarm behavior still unproven on hardware** — see
[device-tests/notifications.md](device-tests/notifications.md) D85-D90 for
the device-only checks (killed-app re-arm across occurrences, notification-
tray mark-done advancing the series, DST).

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

**Tier 2 — `DONE`, live end-to-end on two physical devices 2026-09-11.**
(Designed 2026-08-30, schema landed 2026-09-01, backend deployed 2026-09-09.)
Spec:
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
column privileges and 41 tests against a real Postgres via PGlite.

*Shipped:* all of the above plus the Supabase project (`remindme-tier2`,
`ap-south-1`), 10 SQL functions, 5 Edge Functions, FCM push, and the client
screens — see [shipped.md](shipped.md) for the release-notes entry and
[features.md](features.md) for the capability list.

*Still needed from a human:* one real older-adult user walked through
onboarding (rung 1 of the ladder is still an untested theory).

Device checks D27-D37:
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

### M10. Voice reminders

*Brainstormed 2026-09-25.* Started as "self-improvement nudges" (journal,
gratitude, walk, meditate) and was reshaped during the brainstorm into
three layered ideas: voice reminders (this item), habits and care nudges
([M11](#m11-habits-and-care-nudges)), and an alarm style for medicines
(later — see the full-screen-intent B24 row in backlog.md).

**Target user:** people in Indian metros setting reminders for family —
an adult child for parents in another city, a parent for a child, a
spouse for a spouse. The reminder speaks in the setter's own recorded
voice ("Amma, time for your walk" in her son's voice). This deepens M4, the
roadmap item with no incumbent, which is what the strategic context above
asks for.

**Decisions made:**
- **Real recordings only. No AI voice cloning** — legal, ethical and cost
  risk, and a recording carries the consent of the person who made it.
- **Voice is an option on every reminder type**, not only habits: one-time,
  recurring, sent to someone else (M4 Tier 2), and later M11's habits.
- **Two clip sources:** (1) in-app, the **same flow as dictation** — the
  user taps the mic and speaks the reminder; the text becomes the title and
  time via `parseNaturalLanguage`, and the audio is kept as the sound;
  (2) a shared WhatsApp voice note, through the existing
  `SharedTextContext` → `transcribeAudioFile` pipeline, keeping the audio
  instead of discarding it after transcription.
- **The recording makes the title.** The clip holds the whole sentence
  (time included); the recipient hears it as spoken.
- **Maximum 30 seconds** (also iOS's notification-sound limit), with a
  visible counter and a hard stop.
- **Silent mode: no bypass in v1.** The voice plays only when the phone
  has sound on; the notification text ("Walk — from Arun") covers the silent
  case. An alarm style that plays through silent comes later, for medicines
  only.
- The notification still shows text alongside the clip.

**Build order:** (1) voice on a local reminder, (2) voice on a reminder sent
to someone else, then M11.

**Open risks, to settle in the spec:**
- **Android notification sound (spike first).** A channel's sound is fixed
  at creation, and `expo-notifications` only accepts sounds bundled at build
  time. A clip recorded or received at runtime likely needs a native module
  creating one channel per clip with a file/`content://` URI. **Run a device
  spike before any other work; if it fails, stop and report — the user
  decides the fallback then** (e.g. default sound, voice plays on tap). iOS
  can play a runtime file from `Library/Sounds` (≤30 s).
- **Saving dictation audio.** As understood, `expo-speech-recognition`
  (v3.1.3 here) can persist the recognizer's audio on Android 13+ and iOS
  only — confirm in the spike. Acceptable: the recorder is usually the
  adult child on a newer phone; any Android version can *play* a clip.
- **Transfer (step 2).** The backend stores no files today; clips need
  Supabase Storage with access rules matching the invitation's RLS, and the
  recipient must accept before a clip plays. `send_invitation()`'s 30-day
  content cap may interact with recurring voice reminders — check.
- **Privacy.** A voice is personal data under India's DPDP Act 2023. Keep
  audio out of analytics and crash reports (extend `scrubEvent()` if needed).
- **Stale clips.** The same clip 365 times a year goes stale; allow a few
  clips per reminder and rotate them.

### M11. Habits and care nudges

*Brainstormed 2026-09-25, after [M10](#m10-voice-reminders).* One model, two
layers:
- **Habit** — a recurring item with a "Done" check-off, presets (walk,
  water, journal, gratitude, meditate, read), and a **soft consistency
  measure** ("5 of the last 7 days") rather than a hard streak: a broken
  long streak is a common reason users abandon habit apps, and it fits the
  gentle "dread override" stance of [M9](#m9-smart-re-nudge).
- **Care nudge** — a habit one person sets for another, over M4 Tier 2's
  invitation flow, with an optional M10 voice clip. The recipient can
  accept, pause, stop and block, and chooses what the setter can see.

Recommended data shape: a habit is a recurring reminder with a flag, not a
separate store.

**Decision needed first:** CLAUDE.md's "adherence is derived, not logged"
rule. A recurring reminder keeps only totals (`occurrencesCompleted`/
`occurrencesMissed`); a per-day consistency view needs per-occurrence
history the record does not keep.

**Risks:** spouse nudges can read as control rather than care (hence full
recipient control); data about children under 18 falls under DPDP's
verifiable-parental-consent rules — get legal advice before storing it
server-side; a small child often has no phone, so the parent-for-child case
may be a same-device reminder rather than a sent one; health habits (BP
check, sugar test) are sensitive content — keep them out of analytics, as
today. Links to [B27](../backlog.md) (tell the setter when a recipient
misses one). **Later:** an optional alarm style for medicine habits.

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
