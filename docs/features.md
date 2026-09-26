# Features

What the app can do today. One row per user-visible capability, with where it
lives and how well it's proven. **This file answers "what exists"** — for what's
left, see [backlog.md](../backlog.md); for the reasoning behind a feature's
design, see [docs/roadmap.md](roadmap.md).

## Proof legend

| Proof | Meaning |
| --- | --- |
| `device` | Verified by a human on real hardware, logged in `device-tests/`. |
| `jest` | Green in the suite, **never run on a device**. Not evidence it works — see [device-tests/README.md](../device-tests/README.md). |
| `live` | Confirmed end-to-end against the deployed backend. |

---

## Core reminders

| Capability | Where | Proof |
| --- | --- | --- |
| Create/edit/delete reminders, stored on-device (AsyncStorage, no account) | `services/ReminderService.ts`, `contexts/RemindersContext.tsx` | `device` |
| Local notifications at the reminder time, incl. Android channels | `ReminderService.ts` (`setupNotificationChannel`) | `device` |
| Alarm-style reminders (`setAlarmClock`, exact-alarm permission banner) | `ReminderService.ts`, `components/ExactAlarmBanner.tsx` | `device` |
| Delivery self-check: permission / channel / exact-alarm / battery-optimization status with fix buttons, plus a real test-fire (B26) | `app/delivery-check.tsx`, `services/DeliveryHealthService.ts`, `modules/delivery-health` | `jest` |
| Snooze (5/15/30/60 min, "tomorrow") from the notification tray | `services/notificationResponseHandler.ts` | `device` |
| Mark done from the tray; un-completing re-arms the notification | `notificationResponseHandler.ts`, `toggleComplete` | `device` |
| Boot/mount reschedule sweep (survives reboot and app update) | `rescheduleAllFutureReminders()` | `device` |
| Home list: chronological, completed newest-first | `app/(tabs)/index.tsx` | `device` |
| Manual JSON backup / restore (Settings → Back up) | Settings | `device` |
| 12-hour AM/PM time display everywhere | `utils/formatDatetime.ts` | `jest` |

## Recurring reminders (M2)

| Capability | Where | Proof |
| --- | --- | --- |
| "every day at 8" / "every Monday" / monthly / yearly, English only | `utils/recurrence.ts`, `utils/parseNaturalLanguage.ts` | `jest` |
| Explicit recurrence picker (set/edit a rule) | `RecurrencePicker` | `jest` |
| Series rolls forward in place; snooze defers one occurrence only | `advanceRecurringReminder()` | `jest` |
| Detail screen rule line + "Next 3" preview | `app/reminder-detail.tsx` | `jest` |
| Completed series shows dimmed upcoming occurrence cards | `app/(tabs)/index.tsx` | `device` (D92) |
| Recurring reminder sent to someone else carries its rule | Tier 2 accept path | `jest` |

**Not proven on hardware:** killed-app re-arm across occurrences, tray mark-done
advancing the series, DST — `device-tests/notifications.md` D85-D90.
**Not built:** Malayalam recurrence (`ParsedReading.recurrence` is type-only there).

## Language & input

| Capability | Where | Proof |
| --- | --- | --- |
| Natural-language date/time parsing, English | `utils/parseNaturalLanguage.ts` (chrono-node) | `device` |
| Natural-language parsing, Malayalam script (relative days, weekdays, clock times, durations, spelled-out numbers) | `utils/malayalamDateParser.ts` | `jest` |
| Malayalam numeral clock times + ambiguous-numeral confirmation sheet | `malayalamDateParser.ts`, `QuickAddInput.tsx` | `jest` |
| Per-string font selection (Inter vs. Noto Sans Malayalam) | `utils/getFontFamily.ts` | `device` |
| Voice dictation, English or Malayalam (user-selectable) | `services/SpeechService.ts` | `device` |
| Share-sheet intake: text, URLs | `contexts/SharedTextContext.tsx` | `device` |
| Shared audio (WhatsApp voice notes) → transcription | `SpeechService.transcribeAudioFile` | `jest` — needs the B7 build |
| System-wide "Remind Me" text-selection menu (Android) | `modules/process-text/`, `plugins/withProcessText.ts` | `device` |

## Remind someone else (M4)

| Capability | Where | Proof |
| --- | --- | --- |
| **Tier 1** — pick a contact, sender's phone rings, pre-filled WhatsApp/SMS | `app/send-reminder.tsx`, `services/messageLinks.ts` | `device` (core loop) |
| Capped in-message app invites (3/person) | `utils/inviteNudges.ts` | `device` |
| **Tier 2** — app-to-app invitation delivery | `supabase/functions/send-invitation` | `live` 2026-09-11 |
| Phone-number registration + invite-link binding | `app/register-number.tsx`, `app/bind-invite.tsx` | `live` |
| Push notification naming the sender | `send-invitation`, FCM via Expo | `live` |
| Accept/decline a received reminder | `app/invitation-preview.tsx` | `live` |
| Multiple pending invitations → list screen + grouped summary | `app/pending-invitations.tsx` | `jest` |
| Sender chip on received reminders | `components/ReminderCard.tsx` | `live` |
| Blocking, per-person and reversible | `blocks` table + RLS | `jest` |

**Known gap:** ambiguous phone numbers can silently miss — see B9.

## Insights & smart alerts

| Capability | Where | Proof |
| --- | --- | --- |
| Completion rate, strongest/weakest hours, weekday load, typical slip | `utils/adherenceStats.ts`, `app/insights.tsx` | `jest` |
| Repeatedly-postponed task list | `adherenceStats.ts` | `jest` |
| Save-time hour advice banner | `app/add-reminder.tsx` | `jest` |
| Quiet hours | `app/smart-alerts.tsx` | `device` |
| "Why tasks slip" cited explainer | `app/why-tasks-slip.tsx` | `device` |

**Not built:** the smart re-nudge ladder itself (M9).

## Appearance & platform

| Capability | Where | Proof |
| --- | --- | --- |
| Dark mode — system-following + Light/Dark/System override | `constants/colors.ts`, `useColors()` | `device` — needs a fresh walk (D8) |
| iOS 26 liquid-glass `NativeTabs`, classic `Tabs` elsewhere | `app/(tabs)/_layout.tsx` | `jest` |
| Crash reporting (Sentry) + product analytics (PostHog), opt-out in Settings | `services/CrashReportingService.ts`, `AnalyticsService.ts` | `jest` (D79-D81) |

## Not features (deliberately)

- **No account required** for core reminders — Tier 2 registration is optional and skippable.
- **No event log** — adherence is derived from the reminder records themselves.
- **No booking integration** (M7) and **no ride-request API** (M5) — deep links only.
