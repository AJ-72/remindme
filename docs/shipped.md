# Shipped

Everything that has landed, newest first. **This is the source for release
notes and feature announcements** — each entry carries a plain-language
"user-facing" line you can lift directly, plus the technical record for
traceability.

Items move here from [backlog.md](../backlog.md) when they ship, and the
backlog row is deleted in the same commit. Deep technical root causes live in
[system_learnings.md](../system_learnings.md), not here; design reasoning
lives in [docs/roadmap.md](roadmap.md).

**Announce-ready** marks entries safe to put in front of users. Entries
marked `jest only` are code-complete but unproven on hardware — do not
advertise these until a device run logs a pass in `device-tests/`.

---

## 2026-09

### Home screen refresh: thumb-side check, one mic button, readable dark mode — 2026-09-23 · jest only

**User-facing:** None yet (unproven on hardware). The circle that marks a
reminder done now sits on the right, under your thumb. The quick-add row is
simpler: one mic button that shows the language it listens in, plus repeat,
alarm, notes and save. Circles, outlines and icons are much easier to see in
dark mode. To delete a reminder, open it.

- `ReminderCard`: complete toggle moved to the right edge, 48pt target with a
  26pt ring, `checkbox` role and state; the trash button (and the `onDelete`
  prop) removed. Home's single-delete confirm path removed; clear-all stays.
- `QuickAddInput`: the mic is a pill carrying `LANGUAGE_NAMES[dictationLanguage]`
  (`quick-add-mic-language`), label "Speak in …". `DictationLanguageChooser`
  deleted — the listening bar's switch is the one place to change it. The
  `quick-add-recipient` row icon removed; `quick-add-remind-someone` now
  carries the recipient in its label and icon.
- `constants/colors.ts`: new `control` and `icon` tokens in both palettes;
  dark `border`, `input`, `mutedForeground`, `destructiveBorder` raised; light
  `input` and `mutedForeground` darkened. `constants/colors.test.ts` pins WCAG
  3:1 for controls and 4.5:1 for muted text and icons.
- Card layout covered by a fast-check property test over any title (either
  script), done state, time, alarm and recurrence.
- Maestro `remind_someone_else_bolt.yaml` taps the labelled button now.
  Device check: D100.

### Phone-number collision recovery: reset or migrate on registration (B9, part 2) — 2026-09-22 · jest only

**User-facing:** None yet (unproven on hardware). If you register your number
on a new phone and it's still tied to your old account, you can now choose
either to bring your sending/receiving history over to the new phone, or to
erase the old account and start fresh — instead of a dead-end "already
registered" error with no way forward.

Two gaps, raised together: (1) the national-number length used to normalize
a bare phone number (no `+`, no leading `00`) was hardcoded to 10 digits
everywhere, which happens to fit India/US/UK but silently rejected valid
numbers from most other supported regions (Germany 7-11 digits, UAE 8-9,
etc.) — `artifacts/mobile/utils/phoneNumber.ts` now carries a per-region
`NATIONAL_LENGTH_RANGE` table instead, defaulting to 10-10 for any
unlisted region so existing behavior is unchanged there. (2)
`self_register()`'s existing "number already registered to a different
account" refusal was a hard dead end — OTP verification (the eventual fix)
is still deferred, so there was no way to recover a number honestly tied to
you. Two new SQL functions close this: `reset_phone_number()`
(`lib/db/src/functions/resetPhoneNumber.sql`) deletes the old account and
everything that cascades from it, then claims the number fresh; `migrate_
phone_number()` (`migratePhoneNumber.sql`) instead re-points that account's
`invitations` (both sender and recipient side) and `blocks` onto the new
caller's own id before deleting the emptied old row — devices deliberately
do not carry over, matching `devices.ts`'s existing "a rebind revokes every
device" design. Both are the same SECURITY DEFINER / no-caller-liable-
argument / search_path-pinned risk class as `self_register()` and
`bind_via_invite_token()`, and are trusted the same way (no OTP yet means
no proof beyond the caller's own assertion). The `self-register` Edge
Function now takes an `action: "register" | "reset" | "migrate"` field
routing to the matching RPC, and `register-number.tsx` offers the
reset/migrate choice — behind an explicit, irreversible confirmation
screen — only at the exact moment `self_register()` reports `number_taken`,
never proactively. 174 db tests (PGlite), 6 new Deno Edge Function tests,
27 register-number.tsx tests, all green; not yet verified against a real
two-device collision on hardware.

### Recipient lookup retries alternate regions on an ambiguous miss (B9) — 2026-09-22 · jest only

**User-facing:** None yet (bug fix, unproven on hardware). Sending a
reminder to someone whose contact number was saved without a country code
should now find them even when your phone's region setting doesn't match
their number's real country — instead of a single guess that silently missed.

`normalizeForIdentity()` (`artifacts/mobile/utils/phoneNumber.ts`) still makes
one region guess as before, but a new `alternateIdentityCandidates()` returns
a short fixed list of other plausible regions (India, US, UK, Saudi Arabia,
UAE — this app's actual NRI/Gulf-diaspora cohort) to retry when that guess is
ambiguous. `RecipientLookupService.checkReachability()` retries each
candidate against the existing `lookup` Edge Function in turn on a miss,
stopping at the first hit. Deliberately client-side only — the `lookup`
Edge Function's single-hash matching was left unchanged, keeping this out of
the security-sensitive `SECURITY DEFINER`/hash-matching surface. Jest-green
(`phoneNumber.test.ts`, `RecipientLookupService.test.ts`), not yet verified
against a real cross-region mismatch on hardware.

### Snooze notification actions device-verified (B2) — 2026-09-20 · Announce-ready

**User-facing:** None (bug fix). Snoozing and marking done directly from
notifications now works reliably when the app is fully closed, and re-alert
after snooze shows your name in the notification.

Device-verified:
[D3](../device-tests/notifications.md#d3),
[D15](../device-tests/notifications.md#d15),
[D16](../device-tests/notifications.md#d16).

### Recurring reminders (M2) — 2026-09-19 · `jest only`

**User-facing:** Set a reminder once and have it repeat — "every day at 8",
"every Monday", monthly or yearly. Snoozing today's reminder doesn't move
the whole series, and a completed repeating reminder still shows you what's
coming next.

English only; Malayalam recurrence is not built. Notification behavior across
occurrences is unproven on hardware (D85-D90). Detail:
[roadmap.md#m2](roadmap.md#m2-recurring-reminders).

### Skip one occurrence of a recurring reminder (B22) — 2026-09-20 · Announce-ready

**User-facing:** Deleting a repeating reminder now asks what you mean:
skip just today's occurrence and keep the series going, or delete the
whole thing. Skipping doesn't count against your completion stats — it's
neither a "done" nor a "missed".

### Editable date/time/recurrence chips in quick add (B23) — 2026-09-21 · Announce-ready

**User-facing:** If the app parses the wrong day, time, or repeat pattern from
what you typed, you can now tap the chip under the box to fix it directly —
no need to re-word the sentence or save and edit afterwards. Once you correct
a chip, further typing won't silently overwrite your correction.

Tapping a date/time chip opens the existing native picker; tapping the repeat
chip opens the existing recurrence picker. Each is seeded with the current
value and, once confirmed, "pinned" so later re-parses of the title don't
reset it; cancelling leaves the prior value untouched, and saving or clearing
the input resets all pins. A live Android regression (native picker appearing
stacked on top of the app's own edit sheet) was found and fixed during device
testing — see the RCA note under D95.

Device-confirmed, [device-tests/feature-e2e.md#d95](../device-tests/feature-e2e.md#d95).

### Recurring reminder preview cards — 2026-09-20 · Announce-ready

**User-facing:** After you finish today's repeating reminder, the next few
occurrences stay visible as dimmed cards under their own day headings,
instead of the reminder vanishing from your list.

Device-confirmed, [device-tests/feature-e2e.md#d92](../device-tests/feature-e2e.md#d92).

### Remind someone else, Tier 2 (M4) — 2026-09-11 · Announce-ready

**User-facing:** Send a reminder straight to someone else's phone. They get a
notification saying who it's from, and can accept or decline. Works without
either of you sharing anything but a phone number, and reminders still fire
even if the service is down.

Live end-to-end on two physical devices. Covers: registration and invite-link
binding, push naming the sender, accept/decline, a list screen when several
arrive at once, a sender chip on received reminders, and per-person blocking.
Backend is Supabase (`remindme-tier2`), reached only via Edge Functions.
Design: [roadmap.md#m4](roadmap.md#m4-remind-someone-else).

| Sub-item | ID | Note |
| --- | --- | --- |
| Persist registered number; block silent re-registration | B10 | Adds an "already registered" state and a "Remove this number" step. |
| Push shows the sender's name | B11 | "{name} sent you a reminder" instead of generic copy. |
| Optional registration on first install | B12 | Skippable; core reminders never require it. |
| Home screen provenance chip + date sort | B13 | "From {name}" chip; list already sorted earliest-first. |
| B11's fix redeployed to the live function | B14 | Live function had drifted from repo source. |
| Multiple pending invitations to a list screen | B15 | 2+ arriving at once no longer dropped. |

### Android push notifications (FCM) — 2026-09-11 · Announce-ready

**User-facing:** Reminders sent to you by other people now actually arrive as
notifications on Android.

Needed two separate credentials — `google-services.json` **and** an FCM
service-account key uploaded to Expo's dashboard. See CLAUDE.md's "Gotchas".

### Internal cleanups — 2026-09-12

Not user-facing; no release-note value. Recorded for traceability only.

| Item | ID | Note |
| --- | --- | --- |
| Collapse duplicated cancel-to-schedule sequence | B17 | `rearmReminder()` now backs all four call sites; the "still in the future" guard applied everywhere. |
| Extract dictation seam; remove shipped debug logs | B18 | **Reverted 2026-09-17** — `main` had grown a larger dictation surface the hook predated. Re-extraction still open. |
| Deduplicate date-picker plumbing | B19 | New `utils/dateTimePicker.ts`. Divergent picker sequencing left alone deliberately (different UX, not drift). |
| Centralize dictation-readiness | B20 | `resolveDictationReadiness()`; the two call sites had silently disagreed on what "still downloading" means. |

### 12-hour AM/PM time display — 2026-09-03 · `jest only`

**User-facing:** Times show as "6:30 PM" rather than "18:30".

Device run blocked on Metro connectivity at the time —
[device-tests/malayalam-parsing.md#d24](../device-tests/malayalam-parsing.md#d24).

### Malayalam numeral clock times + ambiguous-numeral sheet — 2026-09 · `jest only`

**User-facing:** Malayalam reminders understand clock times written in
numerals, and ask you which time you meant when a number is genuinely
ambiguous.

Parser-side only; device checklist still open.

---

## 2026-08

### Smart alerts, components 1/3/4/5 — 2026-08-23 · Announce-ready

**User-facing:** Quiet hours, so reminders don't wake you, plus a
plain-English explainer of why tasks slip and what to do about it.

Component 2 (the re-nudge ladder) was deliberately deferred — see
[roadmap.md#m9](roadmap.md#m9-smart-re-nudge).

### Insights — "How you're doing" · Announce-ready

**User-facing:** See your own completion rate, which hours you actually
follow through, how your week is loaded, and which tasks you keep putting
off. It stays quiet rather than guessing when it doesn't have enough data
yet.

Derived entirely from reminder records — no separate event log.

### Remind someone else, Tier 1 (M4) — 2026-08-30 · Announce-ready

**User-facing:** Set a reminder to message someone — at the right time your
phone rings and hands you a pre-filled WhatsApp or SMS message to send.

Core loop passed on device. **Honest framing that constrains all copy: this
is "remind me to message someone", not "remind someone else"** — the
recipient's phone never rings. Edge cases outstanding under B8/D9.

### Dark mode (M1) — 2026-08-10 · Announce-ready

**User-facing:** Full dark mode, following your system setting, with a
Light/Dark/System override in Settings.

Needs a fresh device walk — several screens shipped after the last pass (D8).

### Manual backup / restore — 2026-08-10 · Announce-ready

**User-facing:** Back up your reminders to a file and restore them on another
phone.

Merge is local-wins, dedupes by content not id.

### Re-arm fixes — 2026-08-28 / 2026-08-30 · Announce-ready

**User-facing:** Un-completing a reminder schedules its notification again,
and your existing reminders keep working immediately after an app update
instead of waiting for the next sweep.

Device-verified: [D21](../device-tests/data-safety.md#d21),
[D23](../device-tests/data-safety.md#d23).

### Alarm icon explainer — 2026-08-28 · Announce-ready

**User-facing:** The permanent alarm icon in your status bar is now
explained, and the setting that causes it is labelled clearly.

Device-verified with one fix needed:
[D22](../device-tests/cross-cutting.md#d22).

---

## 2026-07

Earlier work, before this log was split out. User-facing where noted.

| Item | Shipped | User-facing |
| --- | --- | --- |
| Speech-to-text fixes (language always English, content not saved, toggle stuck) | 2026-07-23 | Voice dictation works in your chosen language and saves what you said. |
| Branding — CuriosMind Labs name + About tab | 2026-07-22 | — (placeholder icon only) |
| Sort completed newest-first, pending earliest-first | 2026-07-21 | Your list is ordered the way you would expect. |
| "Mark as done" notification doesn't dismiss | 2026-07-21 | Marking done from the notification clears it. |
| Description edits not saving | 2026-07-21 | Edits to a reminder's notes save correctly. |
| Reminder doesn't fire first time without an edit+save | 2026-07-21 | New reminders fire without needing a re-save. |
| Show description in notification (with consent) | 2026-07-20 | Your reminder's notes can show in the notification. |
| Textbox placeholder overflow | 2026-07-20 | — (visual fix) |
