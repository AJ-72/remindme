import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ALARM_EARLY_OFFSET_MS,
  SNOOZE_MINUTES,
  addReminder,
  deleteReminder,
  editReminder,
  rescheduleAllFutureReminders,
  scheduleSnoozeNotification,
  toggleComplete,
  type Reminder,
  type SnoozeData,
} from "@/services/ReminderService";
import { scheduleNotificationAsync, cancelScheduledNotificationAsync } from "expo-notifications";

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();

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

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage as any).clear();
  jest.replaceProperty(Platform, "OS", "ios");
});

describe("addReminder", () => {
  it("creates a reminder with a unique id", async () => {
    const { added } = await addReminder([], {
      title: "A",
      description: "",
      datetime: FUTURE,
      alarm: true,
    });
    expect(added.id).toBeTruthy();
    expect(typeof added.id).toBe("string");
  });

  it("prepends to the existing list", async () => {
    const existing = makeReminder({ id: "old" });
    const { reminders } = await addReminder([existing], {
      title: "New",
      description: "",
      datetime: FUTURE,
      alarm: true,
    });
    expect(reminders[0].title).toBe("New");
    expect(reminders[1].id).toBe("old");
  });

  it("sets completed to false", async () => {
    const { added } = await addReminder([], {
      title: "A",
      description: "",
      datetime: FUTURE,
      alarm: true,
    });
    expect(added.completed).toBe(false);
  });
});

describe("editReminder", () => {
  it("updates the correct item and leaves others unchanged", async () => {
    const r1 = makeReminder({ id: "r1", title: "Original" });
    const r2 = makeReminder({ id: "r2", title: "Other" });
    const result = await editReminder([r1, r2], "r1", {
      title: "Updated",
      description: "",
      datetime: FUTURE,
      alarm: true,
    });
    expect(result.find((r) => r.id === "r1")?.title).toBe("Updated");
    expect(result.find((r) => r.id === "r2")?.title).toBe("Other");
  });
});

describe("deleteReminder", () => {
  it("removes the correct item and leaves others unchanged", async () => {
    const r1 = makeReminder({ id: "r1" });
    const r2 = makeReminder({ id: "r2" });
    const result = await deleteReminder([r1, r2], "r1");
    expect(result.find((r) => r.id === "r1")).toBeUndefined();
    expect(result.find((r) => r.id === "r2")).toBeDefined();
  });
});

describe("toggleComplete", () => {
  it("flips the completed flag on the correct item", async () => {
    const r = makeReminder({ id: "r1", completed: false });
    const result = await toggleComplete([r], "r1");
    expect(result.find((x) => x.id === "r1")?.completed).toBe(true);
  });

  it("flipping back to incomplete restores the reminder", async () => {
    const r = makeReminder({ id: "r1", completed: true });
    const result = await toggleComplete([r], "r1");
    expect(result.find((x) => x.id === "r1")?.completed).toBe(false);
  });

  it("returns list unchanged for an unknown id", async () => {
    const r = makeReminder({ id: "r1" });
    const result = await toggleComplete([r], "unknown-id");
    expect(result).toEqual([r]);
  });
});

describe("notification scheduling", () => {
  it("addReminder schedules the trigger ALARM_EARLY_OFFSET_MS before the reminder's datetime", async () => {
    await addReminder([], {
      title: "A",
      description: "",
      datetime: FUTURE,
      alarm: true,
    });
    const expectedTriggerDate = new Date(
      new Date(FUTURE).getTime() - ALARM_EARLY_OFFSET_MS
    );
    expect(scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: { type: "date", date: expectedTriggerDate },
      })
    );
  });

  it("does not offset the trigger into the past for a reminder due sooner than the offset", async () => {
    const almostNow = new Date(
      Date.now() + ALARM_EARLY_OFFSET_MS / 2
    ).toISOString();
    const before = Date.now();
    await addReminder([], {
      title: "A",
      description: "",
      datetime: almostNow,
      alarm: true,
    });
    const after = Date.now();
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    const triggerMs = call.trigger.date.getTime();
    expect(triggerMs).toBeGreaterThanOrEqual(before);
    expect(triggerMs).toBeLessThanOrEqual(after);
  });

  it("addReminder does not schedule for past-dated reminders", async () => {
    await addReminder([], {
      title: "A",
      description: "",
      datetime: PAST,
      alarm: true,
    });
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("editReminder cancels the old notification and schedules the new datetime", async () => {
    const NEW_FUTURE = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const r = makeReminder({ id: "r1", notificationId: "old-notif" });
    await editReminder([r], "r1", {
      title: "Updated",
      description: "",
      datetime: NEW_FUTURE,
      alarm: true,
    });
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("old-notif");
    const expectedTriggerDate = new Date(
      new Date(NEW_FUTURE).getTime() - ALARM_EARLY_OFFSET_MS
    );
    expect(scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: { type: "date", date: expectedTriggerDate },
      })
    );
  });

  it("deleteReminder cancels the reminder's notification", async () => {
    const r = makeReminder({ id: "r1", notificationId: "notif-to-cancel" });
    await deleteReminder([r], "r1");
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      "notif-to-cancel"
    );
  });

  it("toggleComplete marking done cancels the notification without rescheduling", async () => {
    const r = makeReminder({
      id: "r1",
      completed: false,
      notificationId: "notif-r1",
    });
    await toggleComplete([r], "r1");
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("notif-r1");
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("scheduleSnoozeNotification schedules at now + SNOOZE_MINUTES minus the early offset", async () => {
    const before = Date.now();
    const data: SnoozeData = {
      title: "Snoozed",
      body: "body",
      alarm: true,
      channelId: "reminders-alarm",
    };
    await scheduleSnoozeNotification(data);
    const after = Date.now();

    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    const triggerMs = call.trigger.date.getTime();
    const snoozeMs = SNOOZE_MINUTES * 60 * 1000;
    expect(triggerMs).toBeGreaterThanOrEqual(
      before + snoozeMs - ALARM_EARLY_OFFSET_MS
    );
    expect(triggerMs).toBeLessThanOrEqual(
      after + snoozeMs - ALARM_EARLY_OFFSET_MS
    );
  });
});

describe("platform paths", () => {
  it("routes to the alarm channel via the trigger on android, not content", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await addReminder([], {
      title: "A",
      description: "",
      datetime: FUTURE,
      alarm: true,
    });
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    // Android only reads channelId off `trigger` (see expo-notifications'
    // scheduleNotificationAsync.ts: parseDateTrigger copies trigger.channelId,
    // content has no channelId field at all). Setting it on `content` is a
    // silent no-op and the OS falls back to its auto-created fallback
    // channel, which has no custom alarm sound.
    expect(call.trigger.channelId).toBe("reminders-alarm");
  });

  it("does not include channelId in content on android", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await addReminder([], {
      title: "A",
      description: "",
      datetime: FUTURE,
      alarm: true,
    });
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.channelId).toBeUndefined();
  });

  it("does not include channelId in content on ios", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    await addReminder([], {
      title: "A",
      description: "",
      datetime: FUTURE,
      alarm: true,
    });
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.channelId).toBeUndefined();
  });

  it("sets sound: false in content on ios when alarm is off", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    await addReminder([], {
      title: "A",
      description: "",
      datetime: FUTURE,
      alarm: false,
    });
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.sound).toBe(false);
  });
});

describe("rescheduleAllFutureReminders", () => {
  it("skips completed reminders", async () => {
    const r = makeReminder({ completed: true, datetime: FUTURE });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify([r])
    );
    await rescheduleAllFutureReminders();
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("skips past-dated reminders", async () => {
    const r = makeReminder({ completed: false, datetime: PAST });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify([r])
    );
    await rescheduleAllFutureReminders();
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
