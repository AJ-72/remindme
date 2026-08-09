import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import {
  ALARM_EARLY_OFFSET_MS,
  DEFAULT_ALARM_KEY,
  DICTATION_LANGUAGE_KEY,
  PERMISSION_ONBOARDING_KEY,
  SNOOZE_CATEGORY_ID,
  SNOOZE_ACTION_ID,
  MARK_DONE_ACTION_ID,
  STORAGE_KEY,
  addReminder,
  cancelScheduledForReminder,
  channelIdForAlarm,
  getVibrationEnabled,
  setVibrationEnabled,
  VIBRATION_KEY,
  deleteReminder,
  editReminder,
  SNOOZE_PRESET_KEY,
  getDefaultAlarmEnabled,
  getDictationLanguage,
  getSnoozePreset,
  setSnoozePreset,
  hasCompletedPermissionOnboarding,
  markDoneById,
  markPermissionOnboardingComplete,
  requestNotificationPermissions,
  rescheduleAllFutureReminders,
  scheduleSnoozeNotification,
  setupSnoozeCategory,
  setDefaultAlarmEnabled,
  setDictationLanguage,
  setShowDescriptionEnabled,
  snoozeReminder,
  toggleComplete,
  updateSnoozeById,
  type Reminder,
  type NotificationData,
} from "@/services/ReminderService";
import {
  scheduleNotificationAsync,
  cancelScheduledNotificationAsync,
  dismissNotificationAsync,
  requestPermissionsAsync,
  setNotificationCategoryAsync,
  getAllScheduledNotificationsAsync,
} from "expo-notifications";

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

  it("scheduleSnoozeNotification schedules at the given target minus the early offset", async () => {
    const target = new Date(Date.now() + 30 * 60 * 1000);
    const data: NotificationData = {
      reminderId: "r1",
      title: "Snoozed",
      body: "body",
      alarm: true,
      channelId: "reminders-alarm",
    };
    await scheduleSnoozeNotification(data, target);

    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.trigger.date.getTime()).toBe(
      target.getTime() - ALARM_EARLY_OFFSET_MS
    );
  });
});

describe("notification body consent gate", () => {
  it("falls back to 'Reminder!' when the show-description setting is off (default)", async () => {
    await addReminder([], {
      title: "A",
      description: "Buy milk and eggs",
      datetime: FUTURE,
      alarm: true,
    });
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.body).toBe("Reminder!");
    expect(call.content.data.body).toBe("Reminder!");
  });

  it("uses the description when the show-description setting is on", async () => {
    await setShowDescriptionEnabled(true);
    await addReminder([], {
      title: "A",
      description: "Buy milk and eggs",
      datetime: FUTURE,
      alarm: true,
    });
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.body).toBe("Buy milk and eggs");
    expect(call.content.data.body).toBe("Buy milk and eggs");
  });

  it("falls back to 'Reminder!' when enabled but there is no description", async () => {
    await setShowDescriptionEnabled(true);
    await addReminder([], {
      title: "A",
      description: "",
      datetime: FUTURE,
      alarm: true,
    });
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.body).toBe("Reminder!");
  });

  it("snoozeReminder respects the setting too", async () => {
    await setShowDescriptionEnabled(true);
    const r = makeReminder({
      id: "r1",
      description: "Buy milk and eggs",
      notificationId: "notif-r1",
    });
    await snoozeReminder([r], "r1", { kind: "minutes", minutes: 15 });
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.body).toBe("Buy milk and eggs");
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

  // The duplicate-notification bug: notifications fire ALARM_EARLY_OFFSET_MS
  // before their datetime, so for that last minute a reminder has already been
  // delivered while datetime is still in the future. Rescheduling it there
  // cancels nothing (the notification is delivered, not pending) and shows a
  // second copy — the stored id is overwritten, orphaning the first.
  it("skips a reminder already delivered inside the early-trigger window", async () => {
    const r = makeReminder({
      completed: false,
      datetime: new Date(Date.now() + ALARM_EARLY_OFFSET_MS / 2).toISOString(),
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify([r])
    );
    await rescheduleAllFutureReminders();
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("still reschedules a reminder beyond the early-trigger window", async () => {
    const r = makeReminder({
      completed: false,
      datetime: new Date(Date.now() + ALARM_EARLY_OFFSET_MS + 60 * 1000).toISOString(),
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify([r])
    );
    await rescheduleAllFutureReminders();
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });
});

describe("cancelScheduledForReminder", () => {
  const makeRequest = (identifier: string, reminderId: string) => ({
    identifier,
    content: { data: { reminderId } },
  });

  it("cancels every scheduled notification carrying the reminder id", async () => {
    (getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      makeRequest("orphan-1", "r1"),
      makeRequest("current", "r1"),
      makeRequest("other-reminder", "r2"),
    ]);

    await cancelScheduledForReminder("r1");

    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("orphan-1");
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("current");
    expect(cancelScheduledNotificationAsync).not.toHaveBeenCalledWith("other-reminder");
  });

  it("does nothing when no scheduled notification matches", async () => {
    (getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      makeRequest("other", "r2"),
    ]);

    await cancelScheduledForReminder("r1");

    expect(cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it("tolerates malformed entries without throwing", async () => {
    (getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      null,
      { identifier: "no-data" },
      { content: { data: { reminderId: "r1" } } }, // no identifier
      makeRequest("good", "r1"),
    ]);

    await expect(cancelScheduledForReminder("r1")).resolves.toBeUndefined();
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("good");
  });
});

describe("default alarm setting", () => {
  it("getDefaultAlarmEnabled defaults to true when unset", async () => {
    const result = await getDefaultAlarmEnabled();
    expect(result).toBe(true);
  });

  it("setDefaultAlarmEnabled persists false, and getDefaultAlarmEnabled reflects it", async () => {
    await setDefaultAlarmEnabled(false);
    const result = await getDefaultAlarmEnabled();
    expect(result).toBe(false);
  });

  it("setDefaultAlarmEnabled persists true after being set to false", async () => {
    await setDefaultAlarmEnabled(false);
    await setDefaultAlarmEnabled(true);
    const result = await getDefaultAlarmEnabled();
    expect(result).toBe(true);
  });

  it("setDefaultAlarmEnabled writes under DEFAULT_ALARM_KEY", async () => {
    await setDefaultAlarmEnabled(false);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      DEFAULT_ALARM_KEY,
      JSON.stringify(false)
    );
  });
});

describe("dictation language setting", () => {
  beforeEach(() => {
    (getLocales as jest.Mock).mockReturnValue([
      { languageTag: "en-US", languageCode: "en", regionCode: "US" },
    ]);
  });

  it("defaults to en-US when unset and the device locale is not Malayalam", async () => {
    const result = await getDictationLanguage();
    expect(result).toBe("en-US");
  });

  it("defaults to ml-IN when unset and the device locale is Malayalam", async () => {
    (getLocales as jest.Mock).mockReturnValue([
      { languageTag: "ml-IN", languageCode: "ml", regionCode: "IN" },
    ]);
    const result = await getDictationLanguage();
    expect(result).toBe("ml-IN");
  });

  it("setDictationLanguage persists ml-IN, and getDictationLanguage reflects it regardless of device locale", async () => {
    await setDictationLanguage("ml-IN");
    const result = await getDictationLanguage();
    expect(result).toBe("ml-IN");
  });

  it("setDictationLanguage persists en-US after being set to ml-IN", async () => {
    await setDictationLanguage("ml-IN");
    await setDictationLanguage("en-US");
    const result = await getDictationLanguage();
    expect(result).toBe("en-US");
  });

  it("setDictationLanguage writes under DICTATION_LANGUAGE_KEY", async () => {
    await setDictationLanguage("ml-IN");
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(DICTATION_LANGUAGE_KEY, "ml-IN");
  });
});

describe("permission onboarding", () => {
  it("hasCompletedPermissionOnboarding is false when unset", async () => {
    const result = await hasCompletedPermissionOnboarding();
    expect(result).toBe(false);
  });

  it("markPermissionOnboardingComplete persists completion under PERMISSION_ONBOARDING_KEY", async () => {
    await markPermissionOnboardingComplete();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      PERMISSION_ONBOARDING_KEY,
      "true"
    );
  });

  it("hasCompletedPermissionOnboarding reflects a completed onboarding", async () => {
    await markPermissionOnboardingComplete();
    const result = await hasCompletedPermissionOnboarding();
    expect(result).toBe(true);
  });

  it("requestNotificationPermissions returns true when the OS grants the request", async () => {
    (requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: "granted",
    });
    const result = await requestNotificationPermissions();
    expect(result).toBe(true);
  });

  it("requestNotificationPermissions returns false when the OS denies the request", async () => {
    (requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: "denied",
    });
    const result = await requestNotificationPermissions();
    expect(result).toBe(false);
  });

  it("requestNotificationPermissions returns false on web", async () => {
    jest.replaceProperty(Platform, "OS", "web");
    const result = await requestNotificationPermissions();
    expect(result).toBe(false);
  });

  it("requestNotificationPermissions shares a single native call across concurrent callers", async () => {
    let resolvePermission: (value: { status: string }) => void = () => {};
    (requestPermissionsAsync as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => (resolvePermission = resolve))
    );

    const first = requestNotificationPermissions();
    const second = requestNotificationPermissions();
    while ((requestPermissionsAsync as jest.Mock).mock.calls.length < 1) {
      await Promise.resolve();
    }
    resolvePermission({ status: "granted" });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toBe(true);
    expect(secondResult).toBe(true);
    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

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

  it("labels the snooze action from the given preset", async () => {
    await setupSnoozeCategory({ kind: "tomorrow" });
    const actions = (setNotificationCategoryAsync as jest.Mock).mock.calls.at(-1)![1];
    const snoozeAction = actions.find(
      (a: { identifier: string }) => a.identifier === SNOOZE_ACTION_ID
    );
    expect(snoozeAction.buttonTitle).toBe("Snooze to tomorrow");
  });

  it("labels the snooze action from a stored minutes preset on permission setup", async () => {
    await setSnoozePreset({ kind: "minutes", minutes: 30 });
    await requestNotificationPermissions();
    const actions = (setNotificationCategoryAsync as jest.Mock).mock.calls.at(-1)![1];
    const snoozeAction = actions.find(
      (a: { identifier: string }) => a.identifier === SNOOZE_ACTION_ID
    );
    expect(snoozeAction.buttonTitle).toBe("Snooze 30 min");
  });
});

describe("channelIdForAlarm", () => {
  it("returns the alarm channel when alarm is true", () => {
    expect(channelIdForAlarm(true, true)).toBe("reminders-alarm");
  });

  // Device testing showed turning vibration off did nothing while sound was
  // on — the common case — because the alarm channel was returned regardless.
  // Sound and vibration are independent, so all four combinations need a
  // distinct channel.
  it("returns the silent-alarm channel when sound is on but vibration is off", () => {
    expect(channelIdForAlarm(true, false)).toBe("reminders-alarm-novibrate");
  });

  it("returns the silent-but-vibrating channel when only vibration is on", () => {
    expect(channelIdForAlarm(false, true)).toBe("reminders-vibrate");
  });

  it("returns the fully silent channel when both are off", () => {
    expect(channelIdForAlarm(false, false)).toBe("reminders-silent");
  });

  // Vibration defaults on: a user who turns off sound still expects to feel
  // the reminder. Callers that predate the setting must not silently land on
  // the fully-silent channel.
  it("defaults to vibrating when the vibration argument is omitted", () => {
    expect(channelIdForAlarm(false)).toBe("reminders-vibrate");
  });
});

describe("vibration setting persistence", () => {
  it("defaults to enabled when nothing is stored", async () => {
    expect(await getVibrationEnabled()).toBe(true);
  });

  it("round-trips a stored false value", async () => {
    await setVibrationEnabled(false);
    expect(await AsyncStorage.getItem(VIBRATION_KEY)).toBe(JSON.stringify(false));
    expect(await getVibrationEnabled()).toBe(false);
  });

  it("falls back to enabled when the stored value is corrupt", async () => {
    await AsyncStorage.setItem(VIBRATION_KEY, "not json");
    expect(await getVibrationEnabled()).toBe(true);
  });
});

describe("markDoneById", () => {
  it("marks the target reminder completed and cancels its notification, reading/writing AsyncStorage directly", async () => {
    const r = makeReminder({ id: "r1", completed: false, notificationId: "notif-r1" });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));

    await markDoneById("r1");

    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("notif-r1");
    expect(dismissNotificationAsync).toHaveBeenCalledWith("notif-r1");
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

describe("snoozeReminder", () => {
  it("cancels the old notification, schedules a new one, and updates datetime+notificationId", async () => {
    const r = makeReminder({ id: "r1", notificationId: "old-notif" });
    const preset = { kind: "minutes", minutes: 15 } as const;
    const before = Date.now();

    const result = await snoozeReminder([r], "r1", preset);

    const after = Date.now();
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("old-notif");
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);

    const updated = result.find((x) => x.id === "r1")!;
    expect(updated.notificationId).toBe("mock-notif-id");
    const updatedMs = new Date(updated.datetime).getTime();
    const snoozeMs = 15 * 60 * 1000;
    expect(updatedMs).toBeGreaterThanOrEqual(before + snoozeMs);
    expect(updatedMs).toBeLessThanOrEqual(after + snoozeMs);
  });

  it("uses the reminder's own datetime for the tomorrow preset", async () => {
    const scheduled = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const r = makeReminder({
      id: "r1",
      notificationId: "old-notif",
      datetime: scheduled.toISOString(),
    });

    const result = await snoozeReminder([r], "r1", { kind: "tomorrow" });

    const updated = result.find((x) => x.id === "r1")!;
    expect(new Date(updated.datetime).getTime()).toBe(
      scheduled.getTime() + 24 * 60 * 60 * 1000
    );
  });

  it("returns the list unchanged for an unknown id", async () => {
    const r = makeReminder({ id: "r1" });
    const result = await snoozeReminder([r], "unknown-id", {
      kind: "minutes",
      minutes: 15,
    });
    expect(result).toEqual([r]);
  });
});

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

describe("snooze preset persistence", () => {
  it("defaults to 15 minutes when nothing is stored", async () => {
    expect(await getSnoozePreset()).toEqual({ kind: "minutes", minutes: 15 });
  });

  it("round-trips a minutes preset", async () => {
    await setSnoozePreset({ kind: "minutes", minutes: 30 });
    expect(await getSnoozePreset()).toEqual({ kind: "minutes", minutes: 30 });
  });

  it("round-trips the tomorrow preset", async () => {
    await setSnoozePreset({ kind: "tomorrow" });
    expect(await getSnoozePreset()).toEqual({ kind: "tomorrow" });
  });

  it("falls back to the default when the stored value is corrupt", async () => {
    await AsyncStorage.setItem(SNOOZE_PRESET_KEY, "not json{");
    expect(await getSnoozePreset()).toEqual({ kind: "minutes", minutes: 15 });
  });

  it("falls back to the default when the stored value is valid JSON but not a preset", async () => {
    await AsyncStorage.setItem(SNOOZE_PRESET_KEY, JSON.stringify({ kind: "yearly" }));
    expect(await getSnoozePreset()).toEqual({ kind: "minutes", minutes: 15 });
  });
});
