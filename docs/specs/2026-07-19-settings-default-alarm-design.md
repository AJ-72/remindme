# Settings Screen — Default Alarm/Notification Toggle

**Date:** 2026-07-19
**Scope:** `artifacts/mobile`
**Goal:** Let the user choose, globally, whether new reminders default to playing an alarm sound or a silent push notification — without removing the existing per-reminder override.

## Context

`Reminder.alarm` already exists and is wired end-to-end: `ReminderService.scheduleNotification` picks the `reminders-alarm` (sound + vibration) or `reminders-silent` channel based on it, and both reminder-creation UIs (`components/QuickAddInput.tsx`, `app/add-reminder.tsx`) expose a per-reminder bell toggle. Both currently hardcode the toggle's initial state to `useState(true)`. There is no Settings screen or second tab in the app yet.

## Approach

Approved as Approach A from brainstorming: a new persisted default, read through `RemindersContext` (the existing single source of truth for reminder-related state — per `CLAUDE.md`, screens never call `ReminderService` directly), consumed by a new Settings tab and by the two existing creation UIs as the initial value of their already-existing per-reminder toggle.

## Data layer — `services/ReminderService.ts`

- `DEFAULT_ALARM_KEY = "@default_alarm_v1"` (follows existing `STORAGE_KEY` naming convention).
- `getDefaultAlarmEnabled(): Promise<boolean>` — reads the key, defaults to `true` when unset (preserves current behavior for existing installs; matches the current hardcoded default).
- `setDefaultAlarmEnabled(enabled: boolean): Promise<void>` — writes the key.

## Context — `contexts/RemindersContext.tsx`

- Loads `defaultAlarmEnabled` alongside `reminders` in the existing mount-time `loadReminders()` effect.
- Exposes `defaultAlarmEnabled: boolean` and `setDefaultAlarmEnabled: (enabled: boolean) => Promise<void>` on the context value, alongside the existing `reminders`/`loading`/CRUD functions.

## UI — new Settings tab

- New file `app/(tabs)/settings.tsx`, registered in `app/(tabs)/_layout.tsx` in both `NativeTabLayout` (SF Symbol `bell`/`bell.fill`) and `ClassicTabLayout` (Feather `bell`), alongside the existing Home tab.
- Single card, reusing the existing `alarmCard`/`Switch` visual pattern from `add-reminder.tsx:567-588` (same colors, same on/off copy: "Notification will play a sound" / "Notification will be silent"). No section/grouping scaffolding — scope is one setting only.
- Toggling calls `setDefaultAlarmEnabled` from context.

## Existing creation UIs — read the new default

- `components/QuickAddInput.tsx:112` — `useState(true)` → `useState(defaultAlarmEnabled)`, reading from context.
- `app/add-reminder.tsx:100` — same change; existing `existing?.alarm !== false` edit-mode precedence is unchanged (editing a reminder still shows that reminder's own saved value, not the global default).
- The per-reminder bell toggle in both screens is otherwise untouched — still fully overridable per reminder, as today.

## Testing

- `contexts/RemindersContext.test.tsx` — new test(s) for `defaultAlarmEnabled` load-on-mount and `setDefaultAlarmEnabled` round-trip (AsyncStorage persistence), following existing test patterns in that file.
- New `app/(tabs)/settings.test.tsx` — renders the switch, toggling calls the context setter, following the render/provider-wrapping pattern in `app/index.test.tsx`.
- `services/ReminderService.test.ts` — unit tests for `getDefaultAlarmEnabled` (defaults to `true` when unset) and `setDefaultAlarmEnabled`.

## Out of scope

- No other settings (snooze length, theme, etc.) — explicitly deferred per user's scope decision.
- No change to the exact-alarm-permission banner (`ExactAlarmBanner`) — orthogonal concern (OS permission state, not user preference), not folded into this screen.
