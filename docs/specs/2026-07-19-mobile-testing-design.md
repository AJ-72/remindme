# Mobile Testing Design

**Date:** 2026-07-19  
**Scope:** `artifacts/mobile`  
**Goal:** 100% automated regression coverage — no device, no emulator required.

## Approach

Three test layers over the existing service/context/screen architecture, using `jest-expo` to run the React Native environment in Node.js. TypeScript typecheck is a free fourth layer.

No end-to-end testing of OS notification delivery — that is the OS/Expo contract. We verify we hand the OS the correct data.

---

## Section 1: Setup & Configuration

**Test runner:** `jest-expo` preset inside `artifacts/mobile`.

**New dependencies (devDependencies in `artifacts/mobile/package.json`):**
- `jest-expo` — Expo's Jest preset; handles React Native environment in Node.js
- `@testing-library/react-native` — render, fire events, assert on output
- `@testing-library/jest-native` — custom matchers (`toBeVisible`, `toHaveTextContent`, etc.)

`@react-native-async-storage/async-storage` already ships a Jest mock — no extra package needed.

**New scripts:**
```json
"test": "jest",
"test:watch": "jest --watch",
"test:coverage": "jest --coverage"
```

**`jest.config.js` at `artifacts/mobile`:**
```js
module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    "@react-native-async-storage/async-storage":
      "@react-native-async-storage/async-storage/jest/async-storage-mock",
  },
  setupFilesAfterFramework: ["@testing-library/jest-native/extend-expect"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)",
  ],
};
```

**Test file locations:** colocated with source.
```
services/ReminderService.test.ts
contexts/RemindersContext.test.tsx
app/index.test.tsx
```

---

## Section 2: Mock Strategy

**AsyncStorage** — via `moduleNameMapper` above. The mock resets between tests automatically.

**`expo-notifications`** — manual mock at `artifacts/mobile/__mocks__/expo-notifications.ts`:
```ts
export const scheduleNotificationAsync = jest.fn().mockResolvedValue("notif-id");
export const cancelScheduledNotificationAsync = jest.fn().mockResolvedValue(undefined);
export const requestPermissionsAsync = jest.fn().mockResolvedValue({ status: "granted" });
export const getPermissionsAsync = jest.fn().mockResolvedValue({ status: "granted", android: { alarm: true } });
export const setNotificationChannelAsync = jest.fn().mockResolvedValue(undefined);
export const deleteNotificationChannelAsync = jest.fn().mockResolvedValue(undefined);
export const setNotificationCategoryAsync = jest.fn().mockResolvedValue(undefined);
export const setNotificationHandler = jest.fn();
export const AndroidImportance = { MAX: 5, HIGH: 4 };
export const AndroidNotificationVisibility = { PUBLIC: 1 };
export const SchedulableTriggerInputTypes = { DATE: "date" };
```

**`expo-haptics`** — auto-mocked in each test file that needs it:
```ts
jest.mock("expo-haptics");
```

**`Platform.OS`** — overridden per test:
```ts
jest.replaceProperty(Platform, "OS", "android");
```

**What is NOT mocked:** `Reminder[]` array operations, sorting/filtering logic, context state transitions. These run as real code.

---

## Section 3: Test Coverage

### Layer 1 — `ReminderService.test.ts`

Direct calls with hand-crafted `Reminder[]`. No rendering. Fastest tests.

**CRUD correctness:**
- `addReminder` creates a reminder with a unique id
- `addReminder` prepends to the list
- `editReminder` updates the correct item, leaves others unchanged
- `deleteReminder` removes the correct item, leaves others unchanged
- `toggleComplete` flips the `completed` flag on the correct item
- `toggleComplete` on an unknown id returns the list unchanged (safe no-op)
- `rescheduleAllFutureReminders` skips completed reminders
- `rescheduleAllFutureReminders` skips past-dated reminders

**Notification scheduling — what we hand the OS:**
- `addReminder` calls `scheduleNotificationAsync` with trigger `type: "date"` and `date` exactly matching the reminder's `datetime`
- `addReminder` does NOT call `scheduleNotificationAsync` for past-dated reminders
- `editReminder` calls `cancelScheduledNotificationAsync` with the old `notificationId`, then `scheduleNotificationAsync` with the new `datetime`
- `deleteReminder` calls `cancelScheduledNotificationAsync` with the reminder's `notificationId`
- `toggleComplete` (marking done) calls `cancelScheduledNotificationAsync` — no re-fire after complete
- `scheduleSnoozeNotification` schedules with trigger date = `now + SNOOZE_MINUTES * 60 * 1000`
- After edit, the trigger date in the `scheduleNotificationAsync` call reflects the updated `datetime`, not the original

**Platform paths:**
- On `Platform.OS === "android"`, scheduling includes `channelId` in content
- On `Platform.OS === "ios"` with `alarm: false`, scheduling includes `sound: false`

### Layer 2 — `RemindersContext.test.tsx`

Renders `RemindersProvider` with a test child reading from context.

- Initial load reads reminders from AsyncStorage and populates state
- `loading` is `true` initially, `false` after load completes
- `addReminder` appends a new reminder to `reminders` state
- `editReminder` updates the correct item in `reminders` state
- `deleteReminder` removes the correct item from `reminders` state
- `toggleComplete` flips the `completed` flag in `reminders` state

### Layer 3 — `app/index.test.tsx`

Renders the home screen inside `RemindersProvider` with AsyncStorage pre-seeded.

- Reminder titles from storage appear in the list
- Upcoming and completed reminders appear in their correct sections
- Delete removes a reminder from the visible list
- Empty state renders when no reminders exist (no crash)

---

## Boundary: What Automated Tests Cannot Cover

| Scenario | Why |
|----------|-----|
| OS fires notification at the exact scheduled time | OS scheduler contract — not our code |
| Alarm sound plays on device | Native audio layer |
| Notifications survive reboot and reschedule | OS boot broadcast — requires device |
| `SCHEDULE_EXACT_ALARM` actually grants exact timing on Android 12+ | Special app-access permission — device only |

For these, the guarantee is: our tests confirm we pass the correct data to the Expo API. Expo's own test suite covers the API-to-OS boundary.
