# 03 — Code map

Use this page instead of a search when you need to find a file.

## Top level

| Path | Holds |
| --- | --- |
| `artifacts/mobile/` | **The product.** React Native + Expo. |
| `artifacts/api-server/` | One health route. Slated for deletion (ADR 0001). |
| `artifacts/mockup-sandbox/` | UI mockups. Not shipped. |
| `lib/db/` | Drizzle schema, SQL functions, RLS tests (PGlite). |
| `lib/api-spec/` | `openapi.yaml`. Source for the two generated packages. |
| `lib/api-client-react/`, `lib/api-zod/` | **Generated. Never edit by hand.** |
| `supabase/functions/` | Deno Edge Functions. |
| `Maestro/` | End-to-end device flows (`*.yaml`). |
| `device-tests/` | What is green in Jest but unproven on hardware. |
| `design/`, `UIChangeOptions/` | Palettes and mockups. Mostly unwired (see B21). |
| `scripts/`, `*.ps1` | Deploy and device helper scripts. |

## Mobile screens — `artifacts/mobile/app/`

Expo Router. The file path is the route. `@/` maps to the project root.

| File | Screen |
| --- | --- |
| `_layout.tsx` | Fonts, provider tree, first-launch permissions, exact-alarm banner. |
| `index.tsx` | Redirect to `(tabs)`. |
| `(tabs)/_layout.tsx` | Tab bar. `NativeTabs` on iOS 26, classic `Tabs` elsewhere. |
| `(tabs)/index.tsx` | Home list. The main screen. |
| `(tabs)/settings.tsx` | All switches: alarm, description, dictation language, privacy. |
| `(tabs)/about.tsx` | Static. |
| `add-reminder.tsx` | Add and edit modal. Hosts `QuickAddInput`. |
| `reminder-detail.tsx` | Detail modal. Stamps `openedAt` on mount. |
| `insights.tsx` | "How you're doing". Reads `adherenceStats.ts`. |
| `smart-alerts.tsx` | Quiet hours. |
| `why-tasks-slip.tsx` | Cited explainer. |
| `backup.tsx` | Manual JSON export and import, plus the Google Drive card (`components/DriveBackupCard.tsx`). |
| `welcome-back.tsx` | Fresh-install Drive restore: reminders + registered number in one confirm. Reached from the first-launch name sheet. |
| `send-reminder.tsx` | Remind someone else — Tier 1 and Tier 2 entry. |
| `register-number.tsx` | Self-registration of the user's own number. |
| `bind-invite.tsx` | Binding by invite link. |
| `pending-invitations.tsx` | List of received invitations. |
| `invitation-preview.tsx` | Accept or decline one invitation. |
| `+not-found.tsx` | Unmatched route. |

## Services — `artifacts/mobile/services/`

| File | Owns |
| --- | --- |
| **`ReminderService.ts`** | **All AsyncStorage. All settings. All `expo-notifications`.** The largest and most important file. |
| `SpeechService.ts` | Live dictation and file transcription. Offline model download. |
| `notificationResponseHandler.ts` | Pure logic for a tapped or actioned notification. |
| `InvitationService.ts` | Tier 2 send, claim, respond. |
| `RecipientLookupService.ts` | Reachability check and staleness rule. |
| `SessionService.ts`, `OtpService.ts` | Supabase auth session, OTP. |
| `DeviceIdentityService.ts`, `DeviceRegistrationService.ts` | Push token registration. |
| `ContactsService.ts` | Contact picker access. |
| `AnalyticsService.ts`, `CrashReportingService.ts` | PostHog and Sentry. No screen imports either SDK. |
| `telemetryConsent.ts` | The single opt-out. Its own module, to break an import cycle. |
| `DriveBackupService.ts` | Google Drive backup (B3). The only module that knows Google exists. Auto-backup, restore, the no-overwrite invariants. |
| `backupDirty.ts` | "A backed-up value changed" signal from `ReminderService`. Its own module, to break an import cycle. |
| `welcomeBack.ts` | Restore reminders, then optionally move the number (register → migrate). |
| `registration.ts` | `completeRegistration()` — the one success path after a number is accepted, shared by register-number and welcome-back. |
| `messageLinks.ts` | WhatsApp and SMS deep links. |
| `DebugLogService.ts` | Ring-buffer log, 200 entries. |

### Storage keys

Every key is exported from `ReminderService.ts` and versioned (`@name_v1`).
Reminders live under `@reminders_v1`. A corrupt array is moved to
`@reminders_corrupt_*` rather than dropped.

### Write serialization

`ReminderService` has a private `withWriteLock()` queue. It guards
`rescheduleAllFutureReminders()`, `markNotifiedById()` and
`markOpenedById()` — the three writers known to run at the same moment on a
cold start from a notification tap. **It does not yet cover every writer.**
`addReminder`, `editReminder`, `deleteReminder(s)`, `toggleComplete`,
`snoozeReminder` and `updateSnoozeById` share the same risk in theory.

## Contexts — `artifacts/mobile/contexts/`

| File | Gives |
| --- | --- |
| `RemindersContext.tsx` | `useReminders()` — all reminder CRUD and every setting. |
| `SharedTextContext.tsx` | Text, URL and audio arriving from other apps. |
| `ThemeContext.tsx` | Light / Dark / System. |
| `TourContext.tsx` | First-run feature tour. |

## Utils — `artifacts/mobile/utils/`

Pure functions. Heavily tested.

| File | Does |
| --- | --- |
| `parseNaturalLanguage.ts` | **The single entry point** for free text → title + date. Detects Malayalam and routes. Exports `MALAYALAM_RANGE`. |
| `malayalamDateParser.ts` | The Malayalam parser, written from scratch. |
| `recurrence.ts` | `RecurrenceRule`, `computeNthOccurrence`, date arithmetic. |
| `recurrencePreviews.ts` | "Next 3" preview. |
| `adherenceStats.ts` | Every statistic the app shows. Returns `null` below the sample floors. |
| `adherenceCopy.ts` | Renders each `null` as an em dash plus a sentence. |
| `quietHours.ts` | The silent window. Uses local-time APIs. |
| `phoneNumber.ts` | `normalizeForIdentity()`. Region guessing lives here (see B9). |
| `getFontFamily.ts` | Inter vs. Noto Sans Malayalam, per string. |
| `formatDatetime.ts` | "Today · 8:00 PM" style output. |
| `reminderBackup.ts` | Export and import shape (v2 adds name + registered number), and the content hash auto-backup compares. |
| `analyticsProps.ts` | The only builder of reminder-shaped analytics properties. |

## Components — `artifacts/mobile/components/`

`QuickAddInput.tsx` is the largest and most complex: title field, mic button,
live parse preview, date and time picker, ambiguous-numeral sheet, tour
target. Treat it with care.

Others worth knowing: `ReminderCard.tsx` (list item and sender chip),
`NotificationResponseHandler.tsx` (listeners), `ExactAlarmBanner.tsx`
(Android), `RecurrencePicker.tsx`, `SnoozeSheet.tsx`, `ErrorBoundary.tsx`.

## Native additions — `artifacts/mobile/`

| Path | Purpose |
| --- | --- |
| `plugins/withProcessText.ts` | Config plugin. Adds the Android `ACTION_PROCESS_TEXT` intent filter. |
| `modules/process-text/` | Local Expo module, Android only. Reads the selected text from the Intent extra, which the Linking API cannot do. |
| `google-services.json` | Firebase config. Gitignored. See `.example`. |

Both native items need a native rebuild. A Metro reload cannot add an intent
filter.

## Database — `lib/db/src/`

| Path | Holds |
| --- | --- |
| `schema/*.ts` | One file per table. Each exports the table, `insertXSchema`, and types. |
| `schema/index.ts` | Re-exports. **A table not re-exported is never deployed and never tested.** |
| `schema/privileges.sql` | Table and column grants. Starts from `revoke all`. |
| `functions/*.sql` | The SQL functions. |
| `functions/manifest.json` | Apply order. The test harness reads it too, so the two cannot drift. |
| `functions/*.test.ts` | Vitest + PGlite. Real Postgres in process. |

## Tests

| Location | Covers |
| --- | --- |
| `*.test.ts(x)` beside the source | Services, contexts, utils, some components. |
| `artifacts/mobile/__tests__/` | Screens and integration (`screens/`, `components/`, `contexts/`). |
| `artifacts/mobile/__mocks__/` | Manual Jest mocks for Expo native modules. |
| `Maestro/*.yaml` | On-device end-to-end flows. |
| `device-tests/*.md` | Human-run checklists. |

**Check both Jest locations** before you conclude a file has no coverage.
