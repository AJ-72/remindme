# Notification tap → reminder detail screen

## Problem

When a reminder fires and the user taps the push notification, the app just opens to whatever screen was last active — there's no indication of which reminder fired or what to do about it. The user has to hunt through the home list to find it, then use the list's generic checkbox/tap-to-edit/delete affordances. The only existing "quick action" is a `Snooze 10 min` button on the notification tray item itself (`SNOOZE_ACTION_ID`, handled in `app/_layout.tsx`) — tapping the notification body does nothing.

## Goals

- Tapping a notification body takes the user straight to that specific reminder with clear next-step actions.
- Provide fast actions (Mark Done, Snooze, Edit, Delete) without requiring the user to locate the reminder in the list first.
- Also add a `Mark Done` quick-action button to the notification tray itself, alongside the existing `Snooze 10 min` button, so both quick actions work without opening the app.
- No change to existing in-app list behavior (tapping a card still goes straight to edit).

## Non-goals

- No changes to the home list UI, `add-reminder` edit screen, or settings screen beyond what's needed to wire navigation.
- No recurrence/repeat feature (out of scope, no existing concept of recurrence in `Reminder`).
- No changes to Android channel/permission setup.

## UX flow

1. Reminder fires → notification appears in tray with two action buttons: `Mark Done` and `Snooze 10 min` (both already work without opening the app).
2. User taps the notification **body** → app opens/foregrounds directly to a new **Reminder Detail** screen for that specific reminder (works whether the app was backgrounded or fully killed — cold start).
3. Detail screen shows the reminder's title, description, and formatted date/time, plus four actions: **Mark Done** (primary), **Snooze 10 min**, **Edit**, **Delete**.
   - Mark Done → completes the reminder, haptic feedback, navigate back to home.
   - Snooze → reschedules the notification 10 minutes out, haptic feedback, navigate back to home.
   - Edit → pushes into the existing `add-reminder` screen in edit mode (unchanged screen).
   - Delete → same confirm-alert pattern as the home list, then navigate back to home.
4. **Edge case — already handled**: if by the time the user opens the detail screen the reminder has already been completed (e.g. via the tray's `Mark Done` button) or deleted, show an "already handled" message instead of the action buttons, with a link back to the list. No silent redirect.
5. **List behavior unchanged**: tapping a reminder card in the home list still goes straight to the edit screen, as it does today. The detail screen is reached only via notification tap (or tray `Mark Done`/`Snooze` triggering their actions directly, with no navigation).

## Technical design

### Data model change

`SnoozeData` (in `services/ReminderService.ts`) is renamed to `NotificationData` and gains a `reminderId: string` field:

```ts
export interface NotificationData {
  reminderId: string;
  title: string;
  body: string;
  alarm: boolean;
  channelId: string;
}
```

This is threaded through everywhere a notification is scheduled:
- `scheduleNotification` — needs the reminder's id in its `content.data`. Since `addReminder` currently generates the id *after* calling `scheduleNotification`, the id generation moves earlier so it can be included in the payload.
- `scheduleSnoozeNotification` — already receives a data object; it just carries `reminderId` through since callers now supply it.
- `rescheduleAllFutureReminders` — already has the full `Reminder` (with `id`) in scope when it calls `scheduleNotification`; passes `reminderId: reminder.id` through.

### Notification tray actions

`setupSnoozeCategory` (renamed conceptually to cover both actions, function name can stay or be renamed to `setupReminderCategory`) registers a second action:

```ts
export const MARK_DONE_ACTION_ID = "MARK_DONE";
```

alongside the existing `SNOOZE_ACTION_ID = "SNOOZE_10"`, both under the same `SNOOZE_CATEGORY_ID` category (or renamed `REMINDER_CATEGORY_ID` — cosmetic, not required).

### Notification response handling

The current listener in `app/_layout.tsx` only handles the snooze action and only fires for taps that occur while a JS listener is already attached — it misses cold-start taps (app fully killed, tap launches it) entirely, and does nothing for a body tap.

Changes:
- Move the notification-response handling into a small component mounted inside `<RemindersProvider>` (it needs `toggleComplete` and other context methods, which the current `RootLayout`-level effect doesn't have access to).
- On mount, call `Notifications.getLastNotificationResponseAsync()` once to catch the cold-start case, feeding its result into the same handler used by the live `addNotificationResponseReceivedListener` subscription — so cold-start and warm-start taps behave identically.
- Handler logic, branching on `response.actionIdentifier`:
  - `Notifications.DEFAULT_ACTION_IDENTIFIER` (body tap) → `router.push({ pathname: "/reminder-detail", params: { id: data.reminderId } })`.
  - `SNOOZE_ACTION_ID` → call `snoozeReminder`-equivalent logic (see below), no navigation.
  - `MARK_DONE_ACTION_ID` → `toggleComplete(data.reminderId)`, no navigation.

### RemindersContext addition

New method:

```ts
snoozeReminder: (id: string) => Promise<void>;
```

Builds a `NotificationData` payload from the in-memory `Reminder` (title, description, alarm, channelId derived from `alarm`, plus `reminderId: id`) and calls `scheduleSnoozeNotification`. This does not mutate the stored reminder's `datetime` or `notificationId` — snoozing only affects the *notification*, matching today's tray-only behavior. Both the new detail screen and the tray's `SNOOZE_ACTION_ID` handler call this same method (the tray handler already has the full `NotificationData` from the notification payload and can call `scheduleSnoozeNotification` directly, or route through `snoozeReminder` if the reminder is still in context state — either works; prefer calling `scheduleSnoozeNotification` directly in the tray-action path since it doesn't require a context lookup, and reserve `snoozeReminder(id)` for the detail screen where only the id is available via route params).

### New screen: `app/reminder-detail.tsx`

Follows the existing `app/add-reminder.tsx` modal conventions (header with close button via `router.back()`, `insets`-aware padding, `useColors()`).

- Registered in `app/_layout.tsx`'s `<Stack>` as `<Stack.Screen name="reminder-detail" options={{ headerShown: false, presentation: "modal" }} />`.
- Reads `id` from `useLocalSearchParams<{ id: string }>()`.
- Looks up the reminder via `reminders.find(r => r.id === id)` from `useReminders()`.
- Renders one of three states:
  1. `loading` (context still loading reminders) → `ActivityIndicator`, same pattern as `index.tsx`.
  2. Not found, or found with `completed === true` → "This reminder was already completed or removed" message + a link/button back to the home list (`router.replace("/(tabs)")`).
  3. Found and not completed → title, description, formatted datetime, and four action buttons:
     - Mark Done → `toggleComplete(id)`, haptic feedback, navigate back.
     - Snooze 10 min → `snoozeReminder(id)`, haptic feedback, navigate back.
     - Edit → `router.push({ pathname: "/add-reminder", params: { id } })`.
     - Delete → same `Alert.alert` confirm pattern as `app/(tabs)/index.tsx`'s `handleDelete`, then `deleteReminder(id)` and navigate back.
- Navigate-back behavior: use `router.back()` if there's a screen to return to; since this screen can be the app's entry point (cold start from a notification tap), guard with `router.canGoBack()` and fall back to `router.replace("/(tabs)")`.

### Shared formatting util

`formatDatetime` currently lives only in `components/ReminderCard.tsx`. Extract it to a shared util (e.g. `utils/formatDatetime.ts`) so both `ReminderCard` and the new detail screen use one implementation.

## Testing

- New `__tests__/screens/reminder-detail.test.tsx` (same harness pattern as existing screen tests: `RemindersProvider` + `SafeAreaProvider`, seed `AsyncStorage`, mock `expo-router`). Cases:
  - Renders reminder title/description/datetime when found and not completed.
  - Mark Done calls `toggleComplete` and navigates back.
  - Snooze calls `scheduleSnoozeNotification` (via `snoozeReminder`).
  - Delete shows confirm alert, then calls `deleteReminder` on confirm.
  - Edit navigates to `/add-reminder` with the correct `id` param.
  - Renders "already handled" state when reminder is missing or `completed === true`.
- Extend `services/ReminderService.test.ts` for: `addReminder` generating the id before scheduling, and `reminderId` present in the data payload passed to `scheduleNotificationAsync`/`scheduleSnoozeNotification`.
- Extend `contexts/RemindersContext.test.tsx` for the new `snoozeReminder` method.
- Cold-start / warm-start notification-tap routing (the `getLastNotificationResponseAsync` + unified listener logic in `_layout.tsx`) is not practically unit-testable against `jest-expo`'s mocks — verify manually: tray body tap (warm and cold start), tray `Mark Done` button, tray `Snooze 10 min` button.

## Out of scope / explicitly deferred

- Unifying the home list's card-tap behavior with the new detail screen (list keeps going straight to edit).
- Any recurrence/repeat-reminder feature.
- Changes to Android notification channel or permission setup.
