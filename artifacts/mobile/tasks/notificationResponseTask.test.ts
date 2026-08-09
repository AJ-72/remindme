import {
  buildBackgroundResponseDeps,
  NOTIFICATION_RESPONSE_TASK_NAME,
} from "@/tasks/notificationResponseTask";
// The manual mock adds this helper; the real module's types don't declare it.
const { __getDefinedTask } =
  jest.requireMock("expo-task-manager") as typeof import("@/__mocks__/expo-task-manager");
import { handleNotificationResponse } from "@/services/notificationResponseHandler";
import {
  MARK_DONE_ACTION_ID,
  SNOOZE_ACTION_ID,
  SNOOZE_MORE_ACTION_ID,
  STORAGE_KEY,
  type Reminder,
} from "@/services/ReminderService";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("expo-task-manager");

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    title: "Test reminder",
    description: "",
    datetime: FUTURE,
    completed: false,
    notificationId: "notif-r1",
    ...overrides,
  };
}

function makeResponse(actionIdentifier: string) {
  return {
    actionIdentifier,
    notification: {
      request: {
        identifier: "notif-1",
        content: { data: { reminderId: "r1" } },
      },
    },
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
});

// These run in a headless JS context woken by TaskManager: there is no
// navigator and no React tree, so the deps must not assume either.
describe("buildBackgroundResponseDeps", () => {
  it("marks a reminder done from a headless tray action", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));

    await handleNotificationResponse(
      makeResponse(MARK_DONE_ACTION_ID),
      buildBackgroundResponseDeps()
    );

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].completed).toBe(true);
    expect(stored[0].notificationId).toBeUndefined();
  });

  it("snoozes from a headless tray action", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));

    await handleNotificationResponse(
      makeResponse(SNOOZE_ACTION_ID),
      buildBackgroundResponseDeps()
    );

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].datetime).not.toBe(FUTURE);
    expect(stored[0].completed).toBe(false);
  });

  // Navigation is impossible without a mounted app. The action that needs it
  // sets opensAppToForeground, so the foreground listener handles it instead —
  // this must be an inert no-op here, never a crash that kills the task.
  it("does not throw when a navigating action reaches the headless path", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));

    await expect(
      handleNotificationResponse(
        makeResponse(SNOOZE_MORE_ACTION_ID),
        buildBackgroundResponseDeps()
      )
    ).resolves.toBeUndefined();

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].datetime).toBe(FUTURE);
    expect(stored[0].completed).toBe(false);
  });

  // The deps tests above bypass the task body. These drive the registered
  // handler itself, which is where the payload unwrapping lives.
  describe("the registered task body", () => {
    const runTask = async (arg: unknown) => {
      const task = __getDefinedTask(NOTIFICATION_RESPONSE_TASK_NAME);
      expect(task).toBeDefined();
      return task!(arg);
    };

    it("is registered at module load", () => {
      expect(__getDefinedTask(NOTIFICATION_RESPONSE_TASK_NAME)).toBeDefined();
    });

    it("marks done when the response arrives nested under notificationResponse", async () => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));

      await runTask({
        data: { notificationResponse: makeResponse(MARK_DONE_ACTION_ID) },
        error: null,
      });

      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored[0].completed).toBe(true);
    });

    it("marks done when the response arrives as the bare data payload", async () => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));

      await runTask({ data: makeResponse(MARK_DONE_ACTION_ID), error: null });

      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored[0].completed).toBe(true);
    });

    it("ignores a task invocation carrying an error", async () => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));

      await runTask({
        data: { notificationResponse: makeResponse(MARK_DONE_ACTION_ID) },
        error: new Error("boom"),
      });

      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored[0].completed).toBe(false);
    });

    it("ignores an unrecognized payload without throwing", async () => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));

      await expect(runTask({ data: { junk: true }, error: null })).resolves.toBeUndefined();
      await expect(runTask({ data: null, error: null })).resolves.toBeUndefined();

      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored[0].completed).toBe(false);
    });
  });

  // The foreground component dedupes via a ref that lives as long as the app.
  // A headless task gets a fresh one per wake, so each invocation must act.
  it("gives each headless invocation a fresh dedupe ref", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));

    await handleNotificationResponse(
      makeResponse(MARK_DONE_ACTION_ID),
      buildBackgroundResponseDeps()
    );
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ completed: false })])
    );
    await handleNotificationResponse(
      makeResponse(MARK_DONE_ACTION_ID),
      buildBackgroundResponseDeps()
    );

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].completed).toBe(true);
  });
});
