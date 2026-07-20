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
   - Mark Done → completes the reminder (context handles haptic feedback), navigate back to home.
   - Snooze → reschedules the reminder 10 minutes out and updates its stored `datetime`/`notificationId` to match (see "Snooze persistence" below), navigate back to home.
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
- Move the *navigation-only* part of notification-response handling (body tap → push to detail screen) into a small component mounted inside `<RemindersProvider>`, since routing to `/reminder-detail` doesn't strictly need context but living alongside the other reminder-related setup keeps things together. This component imports directly from `services/ReminderService` (not through `RemindersContext`'s re-exports), so the import direction stays one-way: `contexts` depends on `services`, never the reverse.
- `Mark Done` from the tray must work even if the app is fully killed (headless action-button tap) — this cannot rely on React context, which may not exist yet or may hold stale/empty state. Add a service-level function, `markDoneById(id: string): Promise<void>`, that reads reminders directly from AsyncStorage, finds the reminder, cancels its notification, marks it completed, and writes back — independent of any React state, following the same direct-AsyncStorage pattern `rescheduleAllFutureReminders` already uses. The tray's `MARK_DONE_ACTION_ID` handler calls `markDoneById` directly; it does not go through `toggleComplete`/context. If the app happens to be running with the provider mounted, `RemindersProvider` should still refresh its in-memory `reminders` state afterward (e.g. by re-running `loadReminders()` when the app returns to foreground, or by having the handler also update context state if the provider is mounted) so the list doesn't show a stale "not completed" reminder if the user then opens the app.
- On mount, call `Notifications.getLastNotificationResponseAsync()` once to catch the cold-start case, feeding its result into the same handler used by the live `addNotificationResponseReceivedListener` subscription — so cold-start and warm-start taps behave identically. **Dedup guard**: `getLastNotificationResponseAsync()` keeps returning the same response indefinitely across remounts (provider re-mount, fast refresh). Track the last-handled notification's identifier (e.g. in a module-level variable or a ref) and skip re-handling a response whose identifier was already processed.
- Handler logic, branching on `response.actionIdentifier`:
  - `Notifications.DEFAULT_ACTION_IDENTIFIER` (body tap) → `router.push({ pathname: "/reminder-detail", params: { id: data.reminderId } })`. Always `push` (never `replace`), including on cold start: `app/index.tsx` redirects to `/(tabs)` first, so by the time the handler runs there's already a tabs screen underneath for the detail modal to sit on top of and back out to.
  - `SNOOZE_ACTION_ID` → call `scheduleSnoozeNotification` directly with the notification's own `NotificationData` payload, then call `markDoneById`'s sibling `updateSnoozeById(id, newDatetime, newNotificationId)` (see below) to persist the new schedule — no navigation.
  - `MARK_DONE_ACTION_ID` → `markDoneById(data.reminderId)`, no navigation.
- Tapping the notification body dismisses that notification from the tray automatically (standard OS behavior on both platforms), taking its action buttons with it — no extra code needed to neutralize `Mark Done`/`Snooze` on a notification the user just opened.

### RemindersContext addition

New method:

```ts
snoozeReminder: (id: string) => Promise<void>;
```

**Snooze persistence**: snoozing updates the reminder's stored `datetime` to the new snooze time and its `notificationId` to the newly-scheduled notification's id — the same way `editReminder` updates both fields together. This avoids the orphaned-notification bug where the original `notificationId` (now stale) is what delete/edit would try to cancel, while the actual live notification is the snoozed one. Concretely: `snoozeReminder(id)` computes the snooze `datetime` (`now + SNOOZE_MINUTES`), calls a new service function `scheduleSnoozeNotification` variant (or reuses it) that returns the new notification id, then updates the reminder in place via the same `current.map(...)` + `saveReminders` pattern `editReminder` uses, and updates context state. The tray's `SNOOZE_ACTION_ID` path uses the equivalent AsyncStorage-direct version (`updateSnoozeById`, alongside `markDoneById`) for the same headless-safety reason as Mark Done.

Both the in-app detail screen (via context `snoozeReminder`) and the tray action (via the direct service function) end up persisting the same fields; the difference is only whether the update happens through React context (app is running, provider mounted) or directly against AsyncStorage (headless).

### New screen: `app/reminder-detail.tsx`

Follows the existing `app/add-reminder.tsx` modal conventions (header with close button via `router.back()`, `insets`-aware padding, `useColors()`).

- Registered in `app/_layout.tsx`'s `<Stack>` as `<Stack.Screen name="reminder-detail" options={{ headerShown: false, presentation: "modal" }} />`.
- Reads `id` from `useLocalSearchParams<{ id: string }>()`.
- Looks up the reminder via `reminders.find(r => r.id === id)` from `useReminders()`.
- Renders one of three states, checked in this order (loading always wins — a still-loading context must never be misread as "not found"):
  1. `loading === true` (context still loading reminders from AsyncStorage) → `ActivityIndicator`, same pattern as `index.tsx`. This check happens *before* the lookup below.
  2. `loading === false` and (not found, or found with `completed === true`) → "This reminder was already completed or removed" message + a link/button back to the home list (`router.replace("/(tabs)")`).
  3. `loading === false` and found and not completed → title, description, formatted datetime, and four action buttons:
     - Mark Done → `toggleComplete(id)` (context already fires haptic feedback — screen does not add its own), navigate back.
     - Snooze 10 min → `snoozeReminder(id)` (context fires haptic feedback), navigate back.
     - Edit → `router.push({ pathname: "/add-reminder", params: { id } })`.
     - Delete → same `Alert.alert` confirm pattern as `app/(tabs)/index.tsx`'s `handleDelete`, then `deleteReminder(id)` (context fires haptic feedback) and navigate back.
- Navigate-back behavior: use `router.back()` if there's a screen to return to; since this screen can be the app's entry point (cold start from a notification tap), guard with `router.canGoBack()` and fall back to `router.replace("/(tabs)")`.

### Shared formatting util

`formatDatetime` currently lives only in `components/ReminderCard.tsx`. Extract it to a shared util (e.g. `utils/formatDatetime.ts`) so both `ReminderCard` and the new detail screen use one implementation.

### Shared channelId helper

The `alarm ? "reminders-alarm" : "reminders-silent"` mapping currently lives inline in `scheduleNotification` (`ReminderService.ts`). Extract it to a small helper (e.g. `channelIdForAlarm(alarm: boolean): string`) so `scheduleNotification`, `snoozeReminder`, and the new `markDoneById`/`updateSnoozeById` functions all derive the channel id the same way — avoiding drift given the documented Android channel-caching fragility (channel settings are cached per-ID on-device; getting this mapping wrong for a given reminder would misroute it to the wrong channel).

## Testing

- New `__tests__/screens/reminder-detail.test.tsx` (same harness pattern as existing screen tests: `RemindersProvider` + `SafeAreaProvider`, seed `AsyncStorage`, mock `expo-router`). Cases:
  - Renders reminder title/description/datetime when found and not completed.
  - Shows the loading spinner (not "already handled") while `loading === true`, even if the id doesn't (yet) match any loaded reminder.
  - Mark Done calls `toggleComplete` and navigates back.
  - Snooze calls `snoozeReminder` and asserts the reminder's `datetime`/`notificationId` are updated (not just that a notification was scheduled).
  - Delete shows confirm alert, then calls `deleteReminder` on confirm.
  - Edit navigates to `/add-reminder` with the correct `id` param.
  - Renders "already handled" state when `loading === false` and the reminder is missing or `completed === true`.
- Extend `services/ReminderService.test.ts` for:
  - `addReminder` generating the id before scheduling, and `reminderId` present in the data payload passed to `scheduleNotificationAsync`.
  - New `markDoneById`: marks the target reminder completed and cancels its notification directly against AsyncStorage, without requiring any context/provider; no-ops safely if the id doesn't exist.
  - New `updateSnoozeById` (and/or `snoozeReminder`'s underlying logic): updates `datetime` and `notificationId` to the new snoozed values.
  - `channelIdForAlarm` helper: correct channel id for both `alarm` states.
- Extend `contexts/RemindersContext.test.tsx` for the new `snoozeReminder` method, asserting it updates the reminder's `datetime`/`notificationId` in context state.
- **Extract the notification-response handler as a pure function** (`(response, { markDoneById, snoozeById, navigate }) => void` or similar) so the branching logic (default tap → navigate, `SNOOZE_10` → snooze, `MARK_DONE` → mark done, dedup-by-response-id) is unit-testable directly, rather than only through the OS-integration surface. Expand `__mocks__/expo-notifications.ts` to export `DEFAULT_ACTION_IDENTIFIER`, `getLastNotificationResponseAsync`, and `addNotificationResponseReceivedListener` so this is mockable.
- What remains manual-only: actual OS notification delivery and action-button wiring — verify by hand on a real device: tray body tap (warm and cold start), tray `Mark Done` button (including with the app fully killed), tray `Snooze 10 min` button (including with the app fully killed).

## Out of scope / explicitly deferred

- Unifying the home list's card-tap behavior with the new detail screen (list keeps going straight to edit).
- Any recurrence/repeat-reminder feature.
- Changes to Android notification channel or permission setup.
