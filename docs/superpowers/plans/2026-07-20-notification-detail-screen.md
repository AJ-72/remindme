# Notification-Tap Reminder-Detail Screen Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping a fired reminder notification opens a dedicated detail screen for that reminder (including cold start), and the notification tray gains a headless-safe `Mark Done` action alongside the existing `Snooze 10 min` action.

**Architecture:** Thread a `reminderId` through every scheduled notification's data payload. Add two AsyncStorage-direct, context-independent service functions (`markDoneById`, `updateSnoozeById`) for headless tray-action safety, and one context-facing service function (`snoozeReminder`) for the in-app path — both following patterns already established by `editReminder`/`toggleComplete`/`rescheduleAllFutureReminders`. Extract the notification-response branching logic into a pure, dependency-injected function so it's unit-testable without mocking the OS layer, then wire it up via a small headless component mounted inside `RemindersProvider`. Add a new modal screen, `app/reminder-detail.tsx`, following `app/add-reminder.tsx`'s existing conventions.

**Tech Stack:** React Native / Expo Router, `expo-notifications`, AsyncStorage, Jest + `@testing-library/react-native`, `jest-expo` preset (auto-mocks `expo-notifications` via `__mocks__/expo-notifications.ts`).

**Verified facts locked in from recon (do not re-derive):**
- `addReminder` (`services/ReminderService.ts:290-300`) generates `id` *after* calling `scheduleNotification` — this plan reorders it.
- `Notifications.DEFAULT_ACTION_IDENTIFIER` = `'expo.modules.notifications.actions.DEFAULT'` (confirmed in `node_modules/expo-notifications/build/NotificationsEmitter.js:11`).
- `Notifications.getLastNotificationResponseAsync()` and `addNotificationResponseReceivedListener()` are real APIs (`NotificationsEmitter.d.ts`).
- `NotificationAction.options.opensAppToForeground` defaults to `true` (`Notifications.types.d.ts:660`) — must be set `false` explicitly for headless Mark Done.
- `router.canGoBack()` exists (`expo-router/build/imperative-api.d.ts:29`).
- No `utils/` directory exists yet in `artifacts/mobile/` — this plan creates it.
- `jest-expo`'s `testMatch` covers any `*.test.[jt]s?(x)` file anywhere in the tree (not just `__tests__/`), so colocated test files (matching the existing `ReminderService.test.ts` / `RemindersContext.test.tsx` convention) work without config changes.
- pnpm is not on default PATH in this shell — prepend `export PATH="/private/tmp/pnpm-shim:$PATH"` before any `pnpm` command below.

---

## Task 1: Rename `SnoozeData` → `NotificationData`, add `reminderId`, reorder id generation

**Files:**
- Modify: `artifacts/mobile/services/ReminderService.ts:36-41` (interface), `:149-188` (`scheduleNotification`), `:199-223` (`scheduleSnoozeNotification` param type only — return type changes in Task 6), `:290-304` (`addReminder`), `:306-319` (`editReminder`), `:354-377` (`rescheduleAllFutureReminders`)
- Modify: `artifacts/mobile/contexts/RemindersContext.tsx:12,23` (type import/re-export)
- Modify: `artifacts/mobile/services/ReminderService.test.ts:20,217-222` (type import + literal)
- Test: `artifacts/mobile/services/ReminderService.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `artifacts/mobile/services/ReminderService.test.ts`, inside the existing `describe("addReminder", ...)` block:

```ts
  it("generates the reminder id before scheduling, and includes it as reminderId in the notification payload", async () => {
    const { added } = await addReminder([], {
      title: "A",
      description: "",
      datetime: FUTURE,
      alarm: true,
    });
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.data.reminderId).toBe(added.id);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- ReminderService -t "generates the reminder id before scheduling"`
Expected: FAIL — `call.content.data.reminderId` is `undefined` (no `reminderId` field exists yet).

- [ ] **Step 3: Write minimal implementation**

In `artifacts/mobile/services/ReminderService.ts`, replace the `SnoozeData` interface (lines 36-41):

```ts
export interface NotificationData {
  reminderId: string;
  title: string;
  body: string;
  alarm: boolean;
  channelId: string;
}
```

Replace `scheduleNotification` (lines 149-188) — this also folds in the `channelIdForAlarm` call from Task 2, written now to avoid a second edit pass over this function:

```ts
export function channelIdForAlarm(alarm: boolean): string {
  return alarm ? "reminders-alarm" : "reminders-silent";
}

export async function scheduleNotification(
  reminder: Pick<Reminder, "title" | "description" | "datetime" | "alarm">,
  reminderId: string
): Promise<string | undefined> {
  if (!Notifications) return undefined;
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return undefined;
    const trigger = new Date(reminder.datetime);
    const now = new Date();
    if (trigger <= now) return undefined;
    const earlyTrigger = new Date(
      Math.max(now.getTime(), trigger.getTime() - ALARM_EARLY_OFFSET_MS)
    );
    const alarmOn = reminder.alarm !== false;
    const channelId = channelIdForAlarm(alarmOn);
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: reminder.title,
        body: reminder.description || "Reminder!",
        sound: alarmOn,
        categoryIdentifier: SNOOZE_CATEGORY_ID,
        data: {
          reminderId,
          title: reminder.title,
          body: reminder.description || "Reminder!",
          alarm: alarmOn,
          channelId,
        } satisfies NotificationData,
        ...(Platform.OS === "ios" && !alarmOn ? { sound: false } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: earlyTrigger,
        ...(Platform.OS === "android" ? { channelId } : {}),
      },
    });
    return id;
  } catch {
    return undefined;
  }
}
```

Update `scheduleSnoozeNotification`'s parameter type only (line 200): `data: SnoozeData` → `data: NotificationData`. (Its return type stays `Promise<void>` for now — Task 6 changes it to return the new id.)

Replace `addReminder` (lines 290-304):

```ts
export async function addReminder(
  current: Reminder[],
  data: Omit<Reminder, "id" | "completed" | "notificationId">
): Promise<{ reminders: Reminder[]; added: Reminder }> {
  const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
  const notificationId = await scheduleNotification(data, id);
  const added: Reminder = {
    id,
    ...data,
    completed: false,
    notificationId,
  };
  const reminders = [added, ...current];
  await saveReminders(reminders);
  return { reminders, added };
}
```

Update `editReminder` (line 313) — change `await scheduleNotification(data);` to `await scheduleNotification(data, id);` (the function already has `id` in scope as a parameter).

Update `rescheduleAllFutureReminders` (line 366) — change `const notificationId = await scheduleNotification(reminder);` to `const notificationId = await scheduleNotification(reminder, reminder.id);`.

In `artifacts/mobile/contexts/RemindersContext.tsx`, update the import (line 12) and re-export (line 23): `type SnoozeData` → `type NotificationData`, in both places.

In `artifacts/mobile/services/ReminderService.test.ts`, update the import (line 20): `type SnoozeData` → `type NotificationData`, and the literal at lines 217-222 (in the `scheduleSnoozeNotification schedules at...` test) to add the field:

```ts
    const data: NotificationData = {
      reminderId: "r1",
      title: "Snoozed",
      body: "body",
      alarm: true,
      channelId: "reminders-alarm",
    };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- ReminderService`
Expected: PASS (all existing + new tests in this file).

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/services/ReminderService.ts artifacts/mobile/contexts/RemindersContext.tsx artifacts/mobile/services/ReminderService.test.ts
git commit -m "feat(mobile): thread reminderId through scheduled notifications"
```

---

## Task 2: `channelIdForAlarm` helper test coverage

Task 1 already introduced the `channelIdForAlarm` function (needed inline to keep `scheduleNotification`'s edit atomic). This task adds its direct unit test.

**Files:**
- Test: `artifacts/mobile/services/ReminderService.test.ts`

- [ ] **Step 1: Write the failing test**

Add a new top-level `describe` block:

```ts
describe("channelIdForAlarm", () => {
  it("returns the alarm channel when alarm is true", () => {
    expect(channelIdForAlarm(true)).toBe("reminders-alarm");
  });

  it("returns the silent channel when alarm is false", () => {
    expect(channelIdForAlarm(false)).toBe("reminders-silent");
  });
});
```

Add `channelIdForAlarm` to the import list from `@/services/ReminderService` at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- ReminderService -t "channelIdForAlarm"`
Expected: FAIL — `channelIdForAlarm is not exported` (the import will throw/be undefined) if Task 1 wasn't applied yet in the same session; if Task 1 already landed, this should PASS immediately since the function already exists.

- [ ] **Step 3: Confirm implementation already satisfies the test**

No implementation change needed — `channelIdForAlarm` was added in Task 1, Step 3.

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- ReminderService -t "channelIdForAlarm"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/services/ReminderService.test.ts
git commit -m "test(mobile): cover channelIdForAlarm helper"
```

---

## Task 3: Add `MARK_DONE_ACTION_ID` and register it as a headless-safe tray action

**Files:**
- Modify: `artifacts/mobile/services/ReminderService.ts:17` (new constant), `:121-135` (`setupSnoozeCategory`)
- Test: `artifacts/mobile/services/ReminderService.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `artifacts/mobile/services/ReminderService.test.ts`, inside `describe("permission onboarding", ...)`:

```ts
  it("registers both Snooze and Mark Done tray actions, with Mark Done set to not foreground the app", async () => {
    await requestNotificationPermissions();
    expect(setNotificationCategoryAsync).toHaveBeenCalledWith(
      SNOOZE_CATEGORY_ID,
      expect.arrayContaining([
        expect.objectContaining({ identifier: SNOOZE_ACTION_ID }),
        expect.objectContaining({
          identifier: MARK_DONE_ACTION_ID,
          options: expect.objectContaining({ opensAppToForeground: false }),
        }),
      ])
    );
  });
```

Add `setNotificationCategoryAsync` to the `expo-notifications` import block, and `SNOOZE_CATEGORY_ID`, `MARK_DONE_ACTION_ID` to the `@/services/ReminderService` import block, at the top of the test file. (`SNOOZE_ACTION_ID` is likely already imported by that point — check before adding a duplicate.)

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- ReminderService -t "registers both Snooze and Mark Done"`
Expected: FAIL — `MARK_DONE_ACTION_ID` is not exported / not present in the actual call args.

- [ ] **Step 3: Write minimal implementation**

In `artifacts/mobile/services/ReminderService.ts`, add the constant next to `SNOOZE_ACTION_ID` (line 17):

```ts
export const SNOOZE_ACTION_ID = "SNOOZE_10";
export const MARK_DONE_ACTION_ID = "MARK_DONE";
```

Replace `setupSnoozeCategory` (lines 121-135):

```ts
async function setupSnoozeCategory(): Promise<void> {
  if (Platform.OS === "web" || !Notifications) return;
  try {
    await Notifications.setNotificationCategoryAsync(SNOOZE_CATEGORY_ID, [
      {
        identifier: SNOOZE_ACTION_ID,
        buttonTitle: `Snooze ${SNOOZE_MINUTES} min`,
        options: {
          isDestructive: false,
          isAuthenticationRequired: false,
        },
      },
      {
        identifier: MARK_DONE_ACTION_ID,
        buttonTitle: "Mark Done",
        options: {
          isDestructive: false,
          isAuthenticationRequired: false,
          opensAppToForeground: false,
        },
      },
    ]);
  } catch {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- ReminderService`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/services/ReminderService.ts artifacts/mobile/services/ReminderService.test.ts
git commit -m "feat(mobile): add headless Mark Done tray action"
```

---

## Task 4: `markDoneById` — headless-safe, AsyncStorage-direct completion

**Files:**
- Modify: `artifacts/mobile/services/ReminderService.ts` (new function, placed near `rescheduleAllFutureReminders`, i.e. after line 377)
- Test: `artifacts/mobile/services/ReminderService.test.ts`

- [ ] **Step 1: Write the failing test**

Add a new `describe` block to `artifacts/mobile/services/ReminderService.test.ts`:

```ts
describe("markDoneById", () => {
  it("marks the target reminder completed and cancels its notification, reading/writing AsyncStorage directly", async () => {
    const r = makeReminder({ id: "r1", completed: false, notificationId: "notif-r1" });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));

    await markDoneById("r1");

    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("notif-r1");
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].completed).toBe(true);
  });

  it("no-ops safely when the id does not exist", async () => {
    const r = makeReminder({ id: "r1" });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));

    await expect(markDoneById("unknown")).resolves.toBeUndefined();

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].completed).toBe(false);
  });
});
```

Add `markDoneById` and `STORAGE_KEY` to the `@/services/ReminderService` import block (check `STORAGE_KEY` isn't already imported before adding).

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- ReminderService -t "markDoneById"`
Expected: FAIL — `markDoneById is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `artifacts/mobile/services/ReminderService.ts`, after `rescheduleAllFutureReminders`:

```ts
export async function markDoneById(id: string): Promise<void> {
  const reminders = await loadReminders();
  const target = reminders.find((r) => r.id === id);
  if (!target) return;
  await cancelNotification(target.notificationId);
  const updated = reminders.map((r) =>
    r.id === id ? { ...r, completed: true, notificationId: undefined } : r
  );
  await saveReminders(updated);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- ReminderService`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/services/ReminderService.ts artifacts/mobile/services/ReminderService.test.ts
git commit -m "feat(mobile): add markDoneById for headless tray completion"
```

---

## Task 5: `updateSnoozeById` — headless-safe snooze persistence

**Files:**
- Modify: `artifacts/mobile/services/ReminderService.ts` (new function, next to `markDoneById`)
- Test: `artifacts/mobile/services/ReminderService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe("updateSnoozeById", () => {
  it("updates datetime and notificationId for the target reminder, reading/writing AsyncStorage directly", async () => {
    const r = makeReminder({ id: "r1", notificationId: "old-notif" });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));
    const NEW_DATETIME = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await updateSnoozeById("r1", NEW_DATETIME, "new-notif");

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].datetime).toBe(NEW_DATETIME);
    expect(stored[0].notificationId).toBe("new-notif");
  });

  it("no-ops safely when the id does not exist", async () => {
    const r = makeReminder({ id: "r1" });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));

    await expect(
      updateSnoozeById("unknown", new Date().toISOString(), "x")
    ).resolves.toBeUndefined();
  });
});
```

Add `updateSnoozeById` to the `@/services/ReminderService` import block.

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- ReminderService -t "updateSnoozeById"`
Expected: FAIL — `updateSnoozeById is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `artifacts/mobile/services/ReminderService.ts`, next to `markDoneById`:

```ts
export async function updateSnoozeById(
  id: string,
  datetime: string,
  notificationId: string | undefined
): Promise<void> {
  const reminders = await loadReminders();
  const target = reminders.find((r) => r.id === id);
  if (!target) return;
  const updated = reminders.map((r) =>
    r.id === id ? { ...r, datetime, notificationId } : r
  );
  await saveReminders(updated);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- ReminderService`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/services/ReminderService.ts artifacts/mobile/services/ReminderService.test.ts
git commit -m "feat(mobile): add updateSnoozeById for headless snooze persistence"
```

---

## Task 6: `snoozeReminder` service function (in-app, context-facing path)

Changes `scheduleSnoozeNotification`'s return type to `Promise<string | undefined>` so callers can persist the new notification id — this is required for both this task and the tray path in Task 10.

**Files:**
- Modify: `artifacts/mobile/services/ReminderService.ts:199-223` (`scheduleSnoozeNotification` return), new function placed near `editReminder`/`deleteReminder`/`toggleComplete` (after line 352)
- Test: `artifacts/mobile/services/ReminderService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe("snoozeReminder", () => {
  it("cancels the old notification, schedules a new one, and updates datetime+notificationId", async () => {
    const r = makeReminder({ id: "r1", notificationId: "old-notif" });
    const before = Date.now();

    const result = await snoozeReminder([r], "r1");

    const after = Date.now();
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("old-notif");
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);

    const updated = result.find((x) => x.id === "r1")!;
    expect(updated.notificationId).toBe("mock-notif-id");
    const updatedMs = new Date(updated.datetime).getTime();
    const snoozeMs = SNOOZE_MINUTES * 60 * 1000;
    expect(updatedMs).toBeGreaterThanOrEqual(before + snoozeMs);
    expect(updatedMs).toBeLessThanOrEqual(after + snoozeMs);
  });

  it("returns the list unchanged for an unknown id", async () => {
    const r = makeReminder({ id: "r1" });
    const result = await snoozeReminder([r], "unknown-id");
    expect(result).toEqual([r]);
  });
});
```

Add `snoozeReminder` to the `@/services/ReminderService` import block.

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- ReminderService -t "snoozeReminder"`
Expected: FAIL — `snoozeReminder is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `artifacts/mobile/services/ReminderService.ts`, change `scheduleSnoozeNotification`'s signature and return (lines 199-223):

```ts
export async function scheduleSnoozeNotification(
  data: NotificationData
): Promise<string | undefined> {
  if (Platform.OS === "web" || !Notifications) return undefined;
  try {
    const snoozeDate = new Date(
      Date.now() + SNOOZE_MINUTES * 60 * 1000 - ALARM_EARLY_OFFSET_MS
    );
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: data.title,
        body: data.body,
        sound: data.alarm,
        categoryIdentifier: SNOOZE_CATEGORY_ID,
        data,
        ...(Platform.OS === "ios" && !data.alarm ? { sound: false } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: snoozeDate,
        ...(Platform.OS === "android" ? { channelId: data.channelId } : {}),
      },
    });
    return id;
  } catch {
    return undefined;
  }
}
```

Add `snoozeReminder`, placed after `toggleComplete` (line 352):

```ts
export async function snoozeReminder(
  current: Reminder[],
  id: string
): Promise<Reminder[]> {
  const target = current.find((r) => r.id === id);
  if (!target) return current;
  await cancelNotification(target.notificationId);
  const alarmOn = target.alarm !== false;
  const notificationId = await scheduleSnoozeNotification({
    reminderId: id,
    title: target.title,
    body: target.description || "Reminder!",
    alarm: alarmOn,
    channelId: channelIdForAlarm(alarmOn),
  });
  const datetime = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000).toISOString();
  const reminders = current.map((r) =>
    r.id === id ? { ...r, datetime, notificationId } : r
  );
  await saveReminders(reminders);
  return reminders;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- ReminderService`
Expected: PASS (all tests in the file, including the pre-existing `scheduleSnoozeNotification` test — it doesn't assert on the return value, so the type change doesn't break it).

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/services/ReminderService.ts artifacts/mobile/services/ReminderService.test.ts
git commit -m "feat(mobile): add snoozeReminder service function"
```

---

## Task 7: Wire `snoozeReminder` into `RemindersContext`, add foreground-reload

Adds the context method the detail screen will call, plus an `AppState`-driven reload so a running app's in-memory list doesn't go stale after a headless tray action (Mark Done/Snooze) writes to AsyncStorage directly. Mirrors the `AppState` pattern already used in `app/_layout.tsx` for the exact-alarm banner.

**Files:**
- Modify: `artifacts/mobile/contexts/RemindersContext.tsx`
- Test: `artifacts/mobile/contexts/RemindersContext.test.tsx`

- [ ] **Step 1: Write the failing test**

In `artifacts/mobile/contexts/RemindersContext.test.tsx`, add `snoozeReminder` to `Probe`'s destructure and render a trigger:

```tsx
function Probe() {
  const {
    reminders,
    loading,
    addReminder,
    editReminder,
    deleteReminder,
    toggleComplete,
    snoozeReminder,
    defaultAlarmEnabled,
    setDefaultAlarmEnabled,
  } = useReminders();
  return (
    <View>
      {/* ...existing children unchanged... */}
      <Text testID="snooze-r1" onPress={() => snoozeReminder("r1")}>
        snooze
      </Text>
    </View>
  );
}
```

(Insert the new `<Text testID="snooze-r1" .../>` alongside the existing `toggle-r1` element; leave everything else in `Probe` as-is.)

Add a new test in the `describe("RemindersProvider", ...)` block:

```tsx
  it("snoozeReminder updates the reminder's datetime and notificationId in storage", async () => {
    const seeded = [makeReminder({ id: "r1", notificationId: "old-notif" })];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));

    const { getByTestId } = render(
      <RemindersProvider>
        <Probe />
      </RemindersProvider>
    );
    await waitFor(() => expect(getByTestId("loading").props.children).toBe("false"));

    await act(async () => {
      getByTestId("snooze-r1").props.onPress();
    });

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored[0].notificationId).toBe("mock-notif-id");
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].datetime).not.toBe(FUTURE);
  });
```

Add `STORAGE_KEY` to the `@/services/ReminderService` import at the top of the file (check it's not already imported — it is not, currently only `DEFAULT_ALARM_KEY, STORAGE_KEY` — confirm and avoid duplicate; `STORAGE_KEY` is in fact already imported at line 10 of the existing file, so no change needed there).

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- RemindersContext -t "snoozeReminder"`
Expected: FAIL — `snoozeReminder is not a function` (destructured as `undefined` from `useReminders()`).

- [ ] **Step 3: Write minimal implementation**

In `artifacts/mobile/contexts/RemindersContext.tsx`:

Update the import block (lines 10-21) to add `snoozeReminder as serviceSnooze`:

```ts
import {
  type Reminder,
  type NotificationData,
  addReminder as serviceAdd,
  deleteReminder as serviceDelete,
  editReminder as serviceEdit,
  getDefaultAlarmEnabled,
  initNotifications,
  loadReminders,
  setDefaultAlarmEnabled as serviceSetDefaultAlarmEnabled,
  snoozeReminder as serviceSnooze,
  toggleComplete as serviceToggle,
} from "@/services/ReminderService";
```

Add `AppState` to the `react-native` import at the top of the file (add a new import line since the file doesn't currently import from `react-native`):

```ts
import { AppState } from "react-native";
```

Update `RemindersContextType` (lines 31-45) to add:

```ts
  snoozeReminder: (id: string) => Promise<void>;
```

(placed after `toggleComplete`).

Add the `snoozeReminder` callback, placed after `toggleComplete` (after line 112):

```ts
  const snoozeReminder = useCallback(
    async (id: string) => {
      const updated = await serviceSnooze(reminders, id);
      setReminders(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [reminders]
  );
```

Add it to the context value object (in the `<RemindersContext.Provider value={{...}}>` block):

```ts
        toggleComplete,
        snoozeReminder,
```

Add the foreground-reload effect, placed after the existing initial-load `useEffect` (after line 68):

```ts
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        loadReminders().then(setReminders);
      }
    });
    return () => sub.remove();
  }, []);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- RemindersContext`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/contexts/RemindersContext.tsx artifacts/mobile/contexts/RemindersContext.test.tsx
git commit -m "feat(mobile): add snoozeReminder to RemindersContext, reload on foreground"
```

---

## Task 8: Extract `formatDatetime` to a shared util

**Files:**
- Create: `artifacts/mobile/utils/formatDatetime.ts`
- Modify: `artifacts/mobile/components/ReminderCard.tsx:16-32` (remove local function, import shared one)
- Test: none new — existing `artifacts/mobile/__tests__/screens/index.test.tsx` renders `ReminderCard` and is the regression check.

- [ ] **Step 1: Create the shared util**

Create `artifacts/mobile/utils/formatDatetime.ts`:

```ts
export function formatDatetime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const isTomorrow =
    d.getDate() === now.getDate() + 1 &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Today · ${time}`;
  if (isTomorrow) return `Tomorrow · ${time}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + ` · ${time}`;
}
```

- [ ] **Step 2: Update `ReminderCard.tsx` to use it**

In `artifacts/mobile/components/ReminderCard.tsx`, remove the local `formatDatetime` function (lines 16-32) and add an import:

```ts
import { formatDatetime } from "@/utils/formatDatetime";
```

(placed with the other `@/` imports, e.g. after `import { Reminder, useReminders } from "@/contexts/RemindersContext";`).

- [ ] **Step 3: Run existing tests and typecheck to verify no regression**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- index.test`
Expected: PASS (same output as before the extraction — `formatDatetime`'s logic is unchanged, only relocated).

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile run typecheck`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/mobile/utils/formatDatetime.ts artifacts/mobile/components/ReminderCard.tsx
git commit -m "refactor(mobile): extract formatDatetime to a shared util"
```

---

## Task 9: Expand the `expo-notifications` Jest mock

**Files:**
- Modify: `artifacts/mobile/__mocks__/expo-notifications.ts`

- [ ] **Step 1: Add the new exports**

Replace the full contents of `artifacts/mobile/__mocks__/expo-notifications.ts`:

```ts
export const scheduleNotificationAsync = jest
  .fn()
  .mockResolvedValue("mock-notif-id");
export const cancelScheduledNotificationAsync = jest
  .fn()
  .mockResolvedValue(undefined);
export const requestPermissionsAsync = jest
  .fn()
  .mockResolvedValue({ status: "granted" });
export const getPermissionsAsync = jest.fn().mockResolvedValue({
  status: "granted",
  android: { alarm: true },
});
export const setNotificationChannelAsync = jest
  .fn()
  .mockResolvedValue(undefined);
export const deleteNotificationChannelAsync = jest
  .fn()
  .mockResolvedValue(undefined);
export const setNotificationCategoryAsync = jest
  .fn()
  .mockResolvedValue(undefined);
export const setNotificationHandler = jest.fn();
export const getLastNotificationResponseAsync = jest
  .fn()
  .mockResolvedValue(null);
export const addNotificationResponseReceivedListener = jest
  .fn()
  .mockReturnValue({ remove: jest.fn() });

export const DEFAULT_ACTION_IDENTIFIER =
  "expo.modules.notifications.actions.DEFAULT";
export const AndroidImportance = { MAX: 5, HIGH: 4 };
export const AndroidNotificationVisibility = { PUBLIC: 1 };
export const SchedulableTriggerInputTypes = { DATE: "date" };
```

- [ ] **Step 2: Run the full mobile test suite to verify no regression**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test`
Expected: PASS (adding exports is additive; nothing consumes the new ones yet).

- [ ] **Step 3: Commit**

```bash
git add artifacts/mobile/__mocks__/expo-notifications.ts
git commit -m "test(mobile): expand expo-notifications mock for response handling"
```

---

## Task 10: Pure notification-response handler function

This is the core branching logic (body tap → navigate, Snooze action → reschedule+persist, Mark Done action → complete, with dedup), written as a pure function so it's fully unit-testable without touching the OS notification layer.

**Files:**
- Create: `artifacts/mobile/services/notificationResponseHandler.ts`
- Test: `artifacts/mobile/services/notificationResponseHandler.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `artifacts/mobile/services/notificationResponseHandler.test.ts`:

```ts
import {
  handleNotificationResponse,
  type NotificationResponseLike,
} from "@/services/notificationResponseHandler";
import {
  MARK_DONE_ACTION_ID,
  SNOOZE_ACTION_ID,
  SNOOZE_MINUTES,
} from "@/services/ReminderService";

const DEFAULT_ACTION_IDENTIFIER = "expo.modules.notifications.actions.DEFAULT";

function makeResponse(
  actionIdentifier: string,
  overrides: { identifier?: string; data?: unknown } = {}
): NotificationResponseLike {
  return {
    actionIdentifier,
    notification: {
      request: {
        identifier: overrides.identifier ?? "notif-1",
        content: {
          data: overrides.data ?? { reminderId: "r1" },
        },
      },
    },
  };
}

function makeDeps() {
  return {
    defaultActionIdentifier: DEFAULT_ACTION_IDENTIFIER,
    lastHandledId: { current: null as string | null },
    markDoneById: jest.fn().mockResolvedValue(undefined),
    scheduleSnoozeNotification: jest.fn().mockResolvedValue("new-notif"),
    updateSnoozeById: jest.fn().mockResolvedValue(undefined),
    navigateToDetail: jest.fn(),
  };
}

describe("handleNotificationResponse", () => {
  it("navigates to the detail screen on a body tap", async () => {
    const deps = makeDeps();
    await handleNotificationResponse(makeResponse(DEFAULT_ACTION_IDENTIFIER), deps);
    expect(deps.navigateToDetail).toHaveBeenCalledWith("r1");
    expect(deps.markDoneById).not.toHaveBeenCalled();
    expect(deps.scheduleSnoozeNotification).not.toHaveBeenCalled();
  });

  it("marks the reminder done on the Mark Done action, without navigating", async () => {
    const deps = makeDeps();
    await handleNotificationResponse(makeResponse(MARK_DONE_ACTION_ID), deps);
    expect(deps.markDoneById).toHaveBeenCalledWith("r1");
    expect(deps.navigateToDetail).not.toHaveBeenCalled();
  });

  it("schedules a snooze and persists the new schedule on the Snooze action, without navigating", async () => {
    const deps = makeDeps();
    const data = {
      reminderId: "r1",
      title: "T",
      body: "B",
      alarm: true,
      channelId: "reminders-alarm",
    };
    const before = Date.now();
    await handleNotificationResponse(makeResponse(SNOOZE_ACTION_ID, { data }), deps);
    const after = Date.now();

    expect(deps.scheduleSnoozeNotification).toHaveBeenCalledWith(data);
    expect(deps.navigateToDetail).not.toHaveBeenCalled();

    const [id, datetime, notificationId] = deps.updateSnoozeById.mock.calls[0];
    expect(id).toBe("r1");
    expect(notificationId).toBe("new-notif");
    const ms = new Date(datetime).getTime();
    const snoozeMs = SNOOZE_MINUTES * 60 * 1000;
    expect(ms).toBeGreaterThanOrEqual(before + snoozeMs);
    expect(ms).toBeLessThanOrEqual(after + snoozeMs);
  });

  it("ignores an unknown action identifier", async () => {
    const deps = makeDeps();
    await handleNotificationResponse(makeResponse("SOMETHING_ELSE"), deps);
    expect(deps.navigateToDetail).not.toHaveBeenCalled();
    expect(deps.markDoneById).not.toHaveBeenCalled();
    expect(deps.scheduleSnoozeNotification).not.toHaveBeenCalled();
  });

  it("ignores a response with no reminderId in its data payload", async () => {
    const deps = makeDeps();
    await handleNotificationResponse(
      makeResponse(DEFAULT_ACTION_IDENTIFIER, { data: null }),
      deps
    );
    expect(deps.navigateToDetail).not.toHaveBeenCalled();
  });

  it("dedups: does not re-handle a response with an identifier already processed", async () => {
    const deps = makeDeps();
    const response = makeResponse(DEFAULT_ACTION_IDENTIFIER, { identifier: "notif-1" });
    await handleNotificationResponse(response, deps);
    await handleNotificationResponse(response, deps);
    expect(deps.navigateToDetail).toHaveBeenCalledTimes(1);
  });

  it("processes a different notification identifier normally after a previous one was handled", async () => {
    const deps = makeDeps();
    await handleNotificationResponse(
      makeResponse(DEFAULT_ACTION_IDENTIFIER, { identifier: "notif-1" }),
      deps
    );
    await handleNotificationResponse(
      makeResponse(DEFAULT_ACTION_IDENTIFIER, { identifier: "notif-2" }),
      deps
    );
    expect(deps.navigateToDetail).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- notificationResponseHandler`
Expected: FAIL — module `@/services/notificationResponseHandler` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `artifacts/mobile/services/notificationResponseHandler.ts`:

```ts
import {
  MARK_DONE_ACTION_ID,
  SNOOZE_ACTION_ID,
  SNOOZE_MINUTES,
  type NotificationData,
} from "@/services/ReminderService";

export interface NotificationResponseLike {
  actionIdentifier: string;
  notification: {
    request: {
      identifier: string;
      content: {
        data: unknown;
      };
    };
  };
}

export interface NotificationResponseHandlerDeps {
  defaultActionIdentifier: string;
  lastHandledId: { current: string | null };
  markDoneById: (id: string) => Promise<void>;
  scheduleSnoozeNotification: (data: NotificationData) => Promise<string | undefined>;
  updateSnoozeById: (
    id: string,
    datetime: string,
    notificationId: string | undefined
  ) => Promise<void>;
  navigateToDetail: (id: string) => void;
}

function isNotificationData(value: unknown): value is NotificationData {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as NotificationData).reminderId === "string"
  );
}

export async function handleNotificationResponse(
  response: NotificationResponseLike,
  deps: NotificationResponseHandlerDeps
): Promise<void> {
  const notificationIdentifier = response.notification.request.identifier;
  if (deps.lastHandledId.current === notificationIdentifier) return;
  deps.lastHandledId.current = notificationIdentifier;

  const data = response.notification.request.content.data;
  if (!isNotificationData(data)) return;

  if (response.actionIdentifier === deps.defaultActionIdentifier) {
    deps.navigateToDetail(data.reminderId);
    return;
  }

  if (response.actionIdentifier === SNOOZE_ACTION_ID) {
    const notificationId = await deps.scheduleSnoozeNotification(data);
    const datetime = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000).toISOString();
    await deps.updateSnoozeById(data.reminderId, datetime, notificationId);
    return;
  }

  if (response.actionIdentifier === MARK_DONE_ACTION_ID) {
    await deps.markDoneById(data.reminderId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- notificationResponseHandler`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/services/notificationResponseHandler.ts artifacts/mobile/services/notificationResponseHandler.test.ts
git commit -m "feat(mobile): add pure notification-response handler"
```

---

## Task 11: `NotificationResponseHandler` component (OS wiring)

Wires the pure handler from Task 10 to the real `expo-notifications` listener API and cold-start check, using the same guarded `require()` pattern already used in `ReminderService.ts` and `_layout.tsx` (to avoid crashing in non-native environments, per the existing codebase convention).

**Files:**
- Create: `artifacts/mobile/components/NotificationResponseHandler.tsx`
- Test: `artifacts/mobile/components/NotificationResponseHandler.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `artifacts/mobile/components/NotificationResponseHandler.test.tsx`:

```tsx
import React from "react";
import { render } from "@testing-library/react-native";
import NotificationResponseHandler from "@/components/NotificationResponseHandler";
import {
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
} from "expo-notifications";

describe("NotificationResponseHandler", () => {
  it("subscribes to live responses and checks for a cold-start response on mount", () => {
    render(<NotificationResponseHandler />);
    expect(addNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
    expect(getLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
  });

  it("removes the subscription on unmount", () => {
    const remove = jest.fn();
    (addNotificationResponseReceivedListener as jest.Mock).mockReturnValueOnce({
      remove,
    });
    const { unmount } = render(<NotificationResponseHandler />);
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- NotificationResponseHandler`
Expected: FAIL — module `@/components/NotificationResponseHandler` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `artifacts/mobile/components/NotificationResponseHandler.tsx`:

```tsx
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";

import {
  markDoneById,
  scheduleSnoozeNotification,
  updateSnoozeById,
} from "@/services/ReminderService";
import { handleNotificationResponse } from "@/services/notificationResponseHandler";

// eslint-disable-next-line
let Notifications: any = null;
try {
  // @ts-ignore
  Notifications = require("expo-notifications");
} catch {
  Notifications = null;
}

export default function NotificationResponseHandler() {
  const lastHandledId = useRef<string | null>(null);

  useEffect(() => {
    if (!Notifications) return;

    const deps = {
      defaultActionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
      lastHandledId,
      markDoneById,
      scheduleSnoozeNotification,
      updateSnoozeById,
      navigateToDetail: (id: string) => {
        router.push({ pathname: "/reminder-detail", params: { id } });
      },
    };

    Notifications.getLastNotificationResponseAsync()
      .then((response: any) => {
        if (response) handleNotificationResponse(response, deps);
      })
      .catch(() => {});

    let subscription: { remove: () => void } | null = null;
    try {
      subscription = Notifications.addNotificationResponseReceivedListener(
        (response: any) => {
          handleNotificationResponse(response, deps);
        }
      );
    } catch {
      // ignore — listener may not be available in all environments
    }

    return () => {
      try {
        subscription?.remove();
      } catch {}
    };
  }, []);

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- NotificationResponseHandler`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/components/NotificationResponseHandler.tsx artifacts/mobile/components/NotificationResponseHandler.test.tsx
git commit -m "feat(mobile): wire notification response handler to OS listeners"
```

---

## Task 12: Wire into `app/_layout.tsx` — remove old listener, mount new component, register the route

Removes the old snooze-only listener (which misses cold starts and body taps entirely — the bug this whole feature fixes), mounts the new headless handler inside `RemindersProvider`, and registers the `reminder-detail` modal route.

**Files:**
- Modify: `artifacts/mobile/app/_layout.tsx`

- [ ] **Step 1: Remove the old listener and its now-dead imports**

In `artifacts/mobile/app/_layout.tsx`:

Remove the `useEffect` block at lines 124-145 (the one checking `response.actionIdentifier !== SNOOZE_ACTION_ID`).

Remove these now-unused imports:
- From the `@/contexts/RemindersContext` import (lines 20-25): remove `SNOOZE_ACTION_ID`, `scheduleSnoozeNotification`, `type SnoozeData` — leaving only `RemindersProvider`.
- Remove the guarded `Notifications` require block (lines 36-43) — it was only used by the removed listener.

The `@/contexts/RemindersContext` import becomes:

```ts
import { RemindersProvider } from "@/contexts/RemindersContext";
```

- [ ] **Step 2: Mount the new handler and register the route**

Add an import for the new component, alongside the other `@/components` imports:

```ts
import NotificationResponseHandler from "@/components/NotificationResponseHandler";
```

In `RootLayoutNav`, add the new screen to the `<Stack>`:

```tsx
function RootLayoutNav() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="add-reminder"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="reminder-detail"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
```

Mount `<NotificationResponseHandler />` inside `<RemindersProvider>`, as a sibling before `<SharedTextProvider>`:

```tsx
              <RemindersProvider>
                <NotificationResponseHandler />
                <SharedTextProvider>
                  <View style={{ flex: 1 }}>
                    {showAlarmBanner && (
                      <ExactAlarmBanner
                        onDismiss={() => setShowAlarmBanner(false)}
                      />
                    )}
                    <RootLayoutNav />
                  </View>
                </SharedTextProvider>
              </RemindersProvider>
```

- [ ] **Step 3: Run the full test suite and typecheck to verify no regression**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test`
Expected: PASS (no existing test covers `_layout.tsx` directly, so this is a regression check on everything else).

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile run typecheck`
Expected: no new errors — this will also catch any missed reference to the removed `SNOOZE_ACTION_ID`/`scheduleSnoozeNotification`/`SnoozeData` imports.

- [ ] **Step 4: Commit**

```bash
git add artifacts/mobile/app/_layout.tsx
git commit -m "feat(mobile): route notification taps through the new response handler"
```

---

## Task 13: `app/reminder-detail.tsx` screen

**Files:**
- Create: `artifacts/mobile/app/reminder-detail.tsx`

- [ ] **Step 1: Create the screen**

Create `artifacts/mobile/app/reminder-detail.tsx`:

```tsx
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";
import { formatDatetime } from "@/utils/formatDatetime";

function goBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/(tabs)");
  }
}

export default function ReminderDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { reminders, loading, toggleComplete, snoozeReminder, deleteReminder } =
    useReminders();
  const { id } = useLocalSearchParams<{ id: string }>();

  const reminder = reminders.find((r) => r.id === id);

  const handleMarkDone = async () => {
    await toggleComplete(id);
    goBack();
  };

  const handleSnooze = async () => {
    await snoozeReminder(id);
    goBack();
  };

  const handleEdit = () => {
    router.push({ pathname: "/add-reminder", params: { id } });
  };

  const handleDelete = () => {
    Alert.alert("Delete Reminder", "Are you sure you want to delete this reminder?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteReminder(id);
          goBack();
        },
      },
    ]);
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    content: {
      flex: 1,
      padding: 20,
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20,
    },
    loadingWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 8,
    },
    description: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 12,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 24,
    },
    timeText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    actionsWrap: { gap: 12 },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 14,
      paddingVertical: 14,
    },
    primaryBtn: { backgroundColor: colors.primary },
    secondaryBtn: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    destructiveBtn: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: "#fca5a5",
    },
    primaryBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    secondaryBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    destructiveBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: "#ef4444",
    },
    handledWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    handledText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textAlign: "center",
      marginBottom: 16,
    },
    handledLinkText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.closeBtn} onPress={goBack} testID="close-button">
          <Feather name="x" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Reminder</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
            testID="loading-indicator"
          />
        </View>
      ) : !reminder || reminder.completed ? (
        <View style={styles.handledWrap}>
          <Text style={styles.handledText}>
            This reminder was already completed or removed.
          </Text>
          <Pressable onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.handledLinkText}>Back to list</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.content}>
          <Text style={styles.title}>{reminder.title}</Text>
          {!!reminder.description && (
            <Text style={styles.description}>{reminder.description}</Text>
          )}
          <View style={styles.timeRow}>
            <Feather name="clock" size={14} color={colors.mutedForeground} />
            <Text style={styles.timeText}>{formatDatetime(reminder.datetime)}</Text>
          </View>

          <View style={styles.actionsWrap}>
            <Pressable
              style={[styles.actionBtn, styles.primaryBtn]}
              onPress={handleMarkDone}
              testID="mark-done-button"
            >
              <Feather name="check" size={16} color={colors.primaryForeground} />
              <Text style={styles.primaryBtnText}>Mark Done</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn]}
              onPress={handleSnooze}
              testID="snooze-button"
            >
              <Feather name="clock" size={16} color={colors.foreground} />
              <Text style={styles.secondaryBtnText}>Snooze 10 min</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn]}
              onPress={handleEdit}
              testID="edit-button"
            >
              <Feather name="edit-2" size={16} color={colors.foreground} />
              <Text style={styles.secondaryBtnText}>Edit</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.destructiveBtn]}
              onPress={handleDelete}
              testID="delete-button"
            >
              <Feather name="trash-2" size={16} color="#ef4444" />
              <Text style={styles.destructiveBtnText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile run typecheck`
Expected: no errors (Task 14 adds the test that actually exercises this screen).

- [ ] **Step 3: Commit**

```bash
git add artifacts/mobile/app/reminder-detail.tsx
git commit -m "feat(mobile): add reminder-detail screen"
```

---

## Task 14: `reminder-detail.tsx` screen tests

**Files:**
- Create: `artifacts/mobile/__tests__/screens/reminder-detail.test.tsx`

- [ ] **Step 1: Write the tests**

Create `artifacts/mobile/__tests__/screens/reminder-detail.test.tsx`:

```tsx
import React from "react";
import { Alert } from "react-native";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ReminderDetailScreen from "@/app/reminder-detail";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { STORAGE_KEY, type Reminder } from "@/services/ReminderService";

jest.mock("expo-haptics");

const push = jest.fn();
const back = jest.fn();
const replace = jest.fn();
const canGoBack = jest.fn().mockReturnValue(true);

jest.mock("expo-router", () => ({
  router: {
    push: (...args: any[]) => push(...args),
    back: (...args: any[]) => back(...args),
    replace: (...args: any[]) => replace(...args),
    canGoBack: (...args: any[]) => canGoBack(...args),
  },
  useLocalSearchParams: () => ({ id: "r1" }),
}));

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    title: "Test reminder",
    description: "Some details",
    datetime: FUTURE,
    completed: false,
    notificationId: "notif-r1",
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <RemindersProvider>
        <ReminderDetailScreen />
      </RemindersProvider>
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  canGoBack.mockReturnValue(true);
  await (AsyncStorage as any).clear();
});

describe("ReminderDetailScreen", () => {
  it("shows the loading spinner while reminders are still loading, even before the id matches anything", () => {
    const { getByTestId, queryByText } = renderScreen();
    expect(getByTestId("loading-indicator")).toBeTruthy();
    expect(queryByText("This reminder was already completed or removed.")).toBeNull();
  });

  it("renders title, description, and formatted datetime when found and not completed", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByText } = renderScreen();
    expect(await findByText("Test reminder")).toBeTruthy();
    expect(await findByText("Some details")).toBeTruthy();
  });

  it("shows the already-handled message when the reminder is missing", async () => {
    const { findByText } = renderScreen();
    expect(
      await findByText("This reminder was already completed or removed.")
    ).toBeTruthy();
  });

  it("shows the already-handled message when the reminder is completed", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ completed: true })])
    );
    const { findByText } = renderScreen();
    expect(
      await findByText("This reminder was already completed or removed.")
    ).toBeTruthy();
  });

  it("Mark Done completes the reminder and navigates back", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId } = renderScreen();
    const button = await findByTestId("mark-done-button");

    fireEvent.press(button);

    await waitFor(() => expect(back).toHaveBeenCalled());
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].completed).toBe(true);
  });

  it("Snooze reschedules the reminder and updates its datetime and notificationId", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId } = renderScreen();
    const button = await findByTestId("snooze-button");

    fireEvent.press(button);

    await waitFor(() => expect(back).toHaveBeenCalled());
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].datetime).not.toBe(FUTURE);
    expect(stored[0].notificationId).toBe("mock-notif-id");
  });

  it("Edit navigates to add-reminder with the correct id param", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId } = renderScreen();
    const button = await findByTestId("edit-button");

    fireEvent.press(button);

    expect(push).toHaveBeenCalledWith({
      pathname: "/add-reminder",
      params: { id: "r1" },
    });
  });

  it("Delete shows a confirm alert, then deletes on confirm and navigates back", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_title, _msg, buttons) => {
        buttons?.find((btn) => btn.text === "Delete")?.onPress?.();
      });

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId } = renderScreen();
    const button = await findByTestId("delete-button");

    fireEvent.press(button);

    await waitFor(() => expect(back).toHaveBeenCalled());
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored.find((r: Reminder) => r.id === "r1")).toBeUndefined();
    alertSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test -- reminder-detail`
Expected: PASS (all cases). If the "loading spinner" test is flaky because `loading` resolves synchronously in the test environment, that's a signal the fake AsyncStorage resolves faster than expected — if so, keep the assertion but note it's inherently timing-sensitive like the equivalent test in `RemindersContext.test.tsx:97` (which uses the same immediate-assertion pattern successfully today), so no special handling should be needed.

- [ ] **Step 3: Run the full mobile suite one more time**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test`
Expected: PASS — every test file in the package, confirming no cross-file regression.

- [ ] **Step 4: Commit**

```bash
git add artifacts/mobile/__tests__/screens/reminder-detail.test.tsx
git commit -m "test(mobile): cover reminder-detail screen"
```

---

## Task 15: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm --filter mobile test`
Expected: PASS, 0 failures, across every file touched in this plan plus all pre-existing tests.

- [ ] **Step 2: Full typecheck**

Run: `export PATH="/private/tmp/pnpm-shim:$PATH" && pnpm run typecheck`
Expected: no errors (this typechecks the whole workspace, including `artifacts/`, catching any stray reference to the removed `SnoozeData` name or old `scheduleNotification`/`scheduleSnoozeNotification` signatures anywhere outside `artifacts/mobile`).

- [ ] **Step 3: Self-review checklist**

- [ ] Every acceptance criterion in the spec's "UX flow" section (1-5) is covered by either an automated test or the manual-only device-testing note in the spec's Testing section.
- [ ] No placeholder code, no `TODO`, no stubbed function bodies remain in any file this plan touched.
- [ ] `SnoozeData` no longer appears anywhere in `artifacts/mobile` (renamed to `NotificationData` everywhere): `grep -rn "SnoozeData" artifacts/mobile --include="*.ts" --include="*.tsx"` returns no matches.
- [ ] `scheduleNotification`'s two-argument signature is used consistently at all three call sites (`addReminder`, `editReminder`, `rescheduleAllFutureReminders`).
- [ ] The home list's card-tap behavior is unchanged (`components/ReminderCard.tsx`'s `handlePress` still routes to `/add-reminder`, not `/reminder-detail`) — this plan never touched that function.

- [ ] **Step 4: Manual verification note (not automatable in this environment)**

Per the spec's Testing section, the following remain manual-only and require a real Android/iOS device (not available in this environment): tray body tap warm start, tray body tap cold start (app fully killed), tray `Mark Done` with the app fully killed, tray `Snooze 10 min` with the app fully killed. Flag these to the user as outstanding manual verification before considering the feature fully done.
