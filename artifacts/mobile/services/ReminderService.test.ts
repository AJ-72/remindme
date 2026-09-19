import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import {
  DEFAULT_ALARM_KEY,
  DICTATION_LANGUAGE_KEY,
  NOTIF_PROMPT_COUNT_KEY,
  MAX_NOTIF_PROMPTS,
  MAX_REGISTER_PROMPTS,
  getRegisterPromptCount,
  incrementRegisterPromptCount,
  shouldOfferNumberRegistration,
  setRegisteredPhone,
  clearRegisteredPhone,
  SNOOZE_CATEGORY_ID,
  SNOOZE_ACTION_ID,
  MARK_DONE_ACTION_ID,
  STORAGE_KEY,
  QUARANTINE_KEY_PREFIX,
  QUIET_HOURS_KEY,
  getQuietHours,
  setQuietHours,
  addReminder,
  buildBackupJson,
  importRemindersFromJson,
  cancelScheduledForReminder,
  scheduleNotification,
  channelIdForAlarm,
  getVibrationEnabled,
  setVibrationEnabled,
  VIBRATION_KEY,
  deleteReminder,
  deleteReminders,
  editReminder,
  SNOOZE_PRESET_KEY,
  getDefaultAlarmEnabled,
  getDictationLanguage,
  getSnoozePreset,
  setSnoozePreset,
  getNotifPromptCount,
  incrementNotifPromptCount,
  ensureNotificationPermission,
  getNotificationPermissionState,
  loadReminders,
  saveReminders,
  markDoneById,
  markNotifiedById,
  advanceRecurringById,
  markOpenedById,
  MAX_SNOOZE_HISTORY_ENTRIES,
  requestNotificationPermissions,
  rescheduleAllFutureReminders,
  setAlarmForPendingReminders,
  countPendingRemindersDisagreeingWithAlarm,
  scheduleSnoozeNotification,
  USER_NAME_KEY,
  setupSnoozeCategory,
  setDefaultAlarmEnabled,
  setDictationLanguage,
  setShowDescriptionEnabled,
  snoozeReminder,
  toggleComplete,
  updateSnoozeById,
  attachInvitationId,
  applyRecipientTimeChangeByInvitationId,
  isSendReminder,
  isRecurring,
  advanceRecurringReminder,
  INVITE_NUDGE_COUNT_KEY,
  INVITE_NUDGE_ENABLED_KEY,
  INVITE_NUDGE_MAX_ENTRIES,
  getInviteNudgeCount,
  incrementInviteNudgeCount,
  getInviteNudgeEnabled,
  setInviteNudgeEnabled,
  type Reminder,
  type ReminderRecipient,
  type NotificationData,
} from "@/services/ReminderService";
import { DEFAULT_QUIET_HOURS } from "@/utils/quietHours";
import type { RecurrenceRule } from "@/utils/recurrence";
import * as recurrenceModule from "@/utils/recurrence";
import {
  scheduleNotificationAsync,
  cancelScheduledNotificationAsync,
  dismissNotificationAsync,
  requestPermissionsAsync,
  getPermissionsAsync,
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

  // A newly-created recurring reminder's anchor IS its first datetime - the
  // UI never has to know about recurrenceAnchor at all, it just sets
  // `recurrence` and the service derives the standing schedule from where
  // the reminder was actually set.
  it("sets recurrenceAnchor to the reminder's own datetime when recurrence is present", async () => {
    const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };
    const { added } = await addReminder([], {
      title: "A",
      description: "",
      datetime: FUTURE,
      alarm: true,
      recurrence: dailyRule,
    });
    expect(added.recurrenceAnchor).toBe(FUTURE);
  });

  it("does not set recurrenceAnchor for a non-recurring reminder", async () => {
    const { added } = await addReminder([], {
      title: "A",
      description: "",
      datetime: FUTURE,
      alarm: true,
    });
    expect(added.recurrenceAnchor).toBeUndefined();
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

  // A deliberate time edit through the edit screen IS the user restating
  // the schedule, unlike a snooze - the anchor must move to match. This is
  // the one path (besides creation) allowed to move recurrenceAnchor.
  it("moves recurrenceAnchor to the new datetime when moveAnchor is explicitly requested", async () => {
    const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };
    const newTime = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const r1 = makeReminder({
      id: "r1",
      recurrence: dailyRule,
      recurrenceAnchor: FUTURE,
      datetime: FUTURE,
    });
    const result = await editReminder(
      [r1],
      "r1",
      {
        title: "Original",
        description: "",
        datetime: newTime,
        alarm: true,
        recurrence: dailyRule,
      },
      { moveAnchor: true }
    );
    expect(result.find((r) => r.id === "r1")?.recurrenceAnchor).toBe(newTime);
  });

  // The default (moveAnchor omitted) must NOT move the anchor just because
  // datetime changed - editReminder is called from more than the
  // add-reminder Save button (e.g. reminder-detail's "move to strongest
  // hour" nudge), and only a genuinely deliberate schedule restatement
  // should move the standing anchor.
  it("does not move recurrenceAnchor when moveAnchor is omitted, even if datetime changes", async () => {
    const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };
    const newTime = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const r1 = makeReminder({
      id: "r1",
      recurrence: dailyRule,
      recurrenceAnchor: FUTURE,
      datetime: FUTURE,
    });
    const result = await editReminder([r1], "r1", {
      title: "Original",
      description: "",
      datetime: newTime,
      alarm: true,
      recurrence: dailyRule,
    });
    expect(result.find((r) => r.id === "r1")?.recurrenceAnchor).toBe(FUTURE);
  });

  it("sets recurrenceAnchor when recurrence is newly added via edit", async () => {
    const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };
    const r1 = makeReminder({ id: "r1", datetime: FUTURE });
    const result = await editReminder([r1], "r1", {
      title: "Original",
      description: "",
      datetime: FUTURE,
      alarm: true,
      recurrence: dailyRule,
    });
    expect(result.find((r) => r.id === "r1")?.recurrenceAnchor).toBe(FUTURE);
  });

  it("clears recurrenceAnchor when recurrence is removed via edit", async () => {
    const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };
    const r1 = makeReminder({
      id: "r1",
      recurrence: dailyRule,
      recurrenceAnchor: FUTURE,
      datetime: FUTURE,
    });
    const result = await editReminder([r1], "r1", {
      title: "Original",
      description: "",
      datetime: FUTURE,
      alarm: true,
      // recurrence omitted - "Doesn't repeat" was chosen.
    });
    expect(result.find((r) => r.id === "r1")?.recurrenceAnchor).toBeUndefined();
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

describe("deleteReminders", () => {
  it("removes every listed id and leaves the rest unchanged", async () => {
    const r1 = makeReminder({ id: "r1" });
    const r2 = makeReminder({ id: "r2" });
    const r3 = makeReminder({ id: "r3" });
    const result = await deleteReminders([r1, r2, r3], ["r1", "r3"]);
    expect(result.map((r) => r.id)).toEqual(["r2"]);
  });

  it("does nothing for an empty id list", async () => {
    const r1 = makeReminder({ id: "r1" });
    const result = await deleteReminders([r1], []);
    expect(result).toEqual([r1]);
  });

  it("ignores ids that don't match anything", async () => {
    const r1 = makeReminder({ id: "r1" });
    const result = await deleteReminders([r1], ["unknown"]);
    expect(result).toEqual([r1]);
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

  it("re-schedules the notification when un-completing a future reminder", async () => {
    (scheduleNotificationAsync as jest.Mock).mockClear();
    // Once, not a persistent implementation: this mock is shared file-wide and
    // a permanent override leaks into every later scheduling assertion.
    (scheduleNotificationAsync as jest.Mock).mockResolvedValueOnce("new-notif-id");
    const r = makeReminder({
      id: "r1",
      completed: true,
      datetime: FUTURE,
      notificationId: undefined,
    });

    const result = await toggleComplete([r], "r1");

    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(result.find((x) => x.id === "r1")?.notificationId).toBe(
      "new-notif-id"
    );
  });

  it("does not schedule anything when un-completing a past reminder", async () => {
    (scheduleNotificationAsync as jest.Mock).mockClear();
    const r = makeReminder({
      id: "r1",
      completed: true,
      datetime: PAST,
      notificationId: undefined,
    });

    const result = await toggleComplete([r], "r1");

    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(result.find((x) => x.id === "r1")?.completed).toBe(false);
    expect(result.find((x) => x.id === "r1")?.notificationId).toBeUndefined();
  });

  it("does not schedule when completing a reminder", async () => {
    (scheduleNotificationAsync as jest.Mock).mockClear();
    const r = makeReminder({ id: "r1", completed: false, datetime: FUTURE });

    await toggleComplete([r], "r1");

    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  // Completing a recurring reminder must advance the series, not leave it
  // completed forever - "every day at 8" means tomorrow's occurrence is
  // still expected even though today's was just marked done.
  it("advances a recurring reminder instead of completing it forever", async () => {
    (scheduleNotificationAsync as jest.Mock).mockClear();
    (scheduleNotificationAsync as jest.Mock).mockResolvedValueOnce("advanced-notif-id");
    const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };
    const r = makeReminder({
      id: "r1",
      completed: false,
      datetime: PAST,
      recurrence: dailyRule,
    });

    const result = await toggleComplete([r], "r1");
    const updated = result.find((x) => x.id === "r1")!;

    // Never left completed=true - it rolled forward to the next occurrence.
    expect(updated.completed).toBe(false);
    expect(new Date(updated.datetime).getTime()).toBeGreaterThan(Date.now());
    // The advanced occurrence gets a fresh scheduled notification, since
    // its own future datetime makes it eligible again.
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  // Un-completing must never advance - that path is deliberately subtle
  // (see the existing "past reminders stay overdue" comment above) and
  // advancing here would silently skip an occurrence the user is actively
  // trying to restore, not retire.
  it("does not advance a recurring reminder when un-completing it", async () => {
    const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };
    const r = makeReminder({
      id: "r1",
      completed: true,
      datetime: FUTURE,
      recurrence: dailyRule,
    });
    const originalDatetime = r.datetime;

    const result = await toggleComplete([r], "r1");
    const updated = result.find((x) => x.id === "r1")!;

    expect(updated.completed).toBe(false);
    expect(updated.datetime).toBe(originalDatetime);
  });

  // A non-recurring reminder must behave exactly as before - no advance
  // logic should engage for it.
  it("still completes a non-recurring reminder normally (no regression)", async () => {
    const r = makeReminder({ id: "r1", completed: false, datetime: FUTURE });
    const result = await toggleComplete([r], "r1");
    expect(result.find((x) => x.id === "r1")?.completed).toBe(true);
  });
});

describe("notification scheduling", () => {
  it("addReminder schedules the trigger at exactly the reminder's datetime", async () => {
    await addReminder([], {
      title: "A",
      description: "",
      datetime: FUTURE,
      alarm: true,
    });
    expect(scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: { type: "date", date: new Date(FUTURE) },
      })
    );
  });

  it("schedules an imminent reminder at its own datetime, never in the past", async () => {
    const almostNow = new Date(Date.now() + 30 * 1000).toISOString();
    await addReminder([], {
      title: "A",
      description: "",
      datetime: almostNow,
      alarm: true,
    });
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.trigger.date.getTime()).toBe(new Date(almostNow).getTime());
  });

  // The `exactTiming` flag in content.data is the ONLY thing the native patch
  // reads to decide between setAlarmClock() (punctual) and
  // setExactAndAllowWhileIdle() (silently downgraded to inexact by ColorOS --
  // see D7/D19/D25). If it stops reaching the payload, reminders go back to
  // arriving minutes late with every JS test still green, so pin it here.
  it("marks the notification payload exact by default", async () => {
    await addReminder([], {
      title: "A",
      description: "",
      datetime: FUTURE,
      alarm: false,
    });
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.data.exactTiming).toBe(true);
  });

  it("carries exactTiming: false through to the notification payload", async () => {
    await addReminder([], {
      title: "A",
      description: "",
      datetime: FUTURE,
      alarm: true,
      exactTiming: false,
    });
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.data.exactTiming).toBe(false);
  });

  // Records written before this field existed have it undefined. They must
  // stay punctual rather than silently regressing, which is why every read is
  // `!== false` and not a plain truthiness check.
  it("treats a reminder with no exactTiming field as exact", async () => {
    const legacy = makeReminder({ datetime: FUTURE });
    delete (legacy as Partial<Reminder>).exactTiming;
    await scheduleNotification(legacy, legacy.id);
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.data.exactTiming).toBe(true);
  });

  // exactTiming and alarm are independent: a silent reminder is still punctual.
  it("keeps a silent reminder exact", async () => {
    await addReminder([], {
      title: "A",
      description: "",
      datetime: FUTURE,
      alarm: false,
    });
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.data.alarm).toBe(false);
    expect(call.content.data.exactTiming).toBe(true);
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
    expect(scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: { type: "date", date: new Date(NEW_FUTURE) },
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

  it("scheduleSnoozeNotification schedules at exactly the given target", async () => {
    const target = new Date(Date.now() + 30 * 60 * 1000);
    const data: NotificationData = {
      reminderId: "r1",
      title: "Snoozed",
      body: "body",
      alarm: true,
      exactTiming: true,
      channelId: "reminders-alarm",
    };
    await scheduleSnoozeNotification(data, target);

    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.trigger.date.getTime()).toBe(target.getTime());
  });
});

describe("snooze re-nudge personalization", () => {
  const data: NotificationData = {
    reminderId: "r1",
    title: "Call the plumber",
    body: "body",
    alarm: true,
    exactTiming: true,
    channelId: "reminders-alarm",
  };

  it("names the user in the snooze notification title", async () => {
    await AsyncStorage.setItem(USER_NAME_KEY, "Anand");
    await scheduleSnoozeNotification(data, new Date(Date.now() + 30 * 60 * 1000));

    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.title).toBe("Still waiting, Anand — Call the plumber");
  });

  // The name is skippable, so the unnamed path is the one that must not
  // regress into a dangling greeting.
  it("keeps the plain reminder title when no name is stored", async () => {
    await scheduleSnoozeNotification(data, new Date(Date.now() + 30 * 60 * 1000));

    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.title).toBe("Call the plumber");
  });

  // Only the snooze re-alert is personalized: an ordinary reminder fires all
  // day and the name would wear out fast.
  it("leaves an ordinary reminder's notification title unpersonalized", async () => {
    await AsyncStorage.setItem(USER_NAME_KEY, "Anand");
    await addReminder([], {
      title: "Call the plumber",
      description: "",
      datetime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.title).toBe("Call the plumber");
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

  // The duplicate-notification bug: a reminder whose datetime has passed has
  // already been delivered. Rescheduling it cancels nothing (the notification
  // is delivered, not pending) and shows a second copy — the stored id is
  // overwritten, orphaning the first.
  it("skips a reminder whose datetime has already passed", async () => {
    const r = makeReminder({
      completed: false,
      datetime: new Date(Date.now() - 30 * 1000).toISOString(),
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify([r])
    );
    await rescheduleAllFutureReminders();
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("still reschedules a reminder whose datetime is in the future", async () => {
    const r = makeReminder({
      completed: false,
      datetime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify([r])
    );
    await rescheduleAllFutureReminders();
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  // The one path that makes the whole feature correct even if the
  // best-effort received-listener advance (Task 5b) never runs: a killed
  // app that missed a recurring reminder's fire time must self-heal on the
  // next mount-time sweep, not stay stuck past-due forever. This is the
  // sweep's own catch-up responsibility, independent of any UI ever opening.
  it("advances a past-due recurring reminder before re-arming it", async () => {
    const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };
    const r = makeReminder({
      completed: false,
      datetime: PAST,
      recurrence: dailyRule,
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify([r])
    );
    await rescheduleAllFutureReminders();
    // isPendingForAlarmRewrite rejects past-due reminders by design - the
    // sweep must advance datetime into the future FIRST, then re-arm the
    // advanced (now-future) record, or this reminder is silently skipped
    // forever.
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(
      (AsyncStorage.setItem as jest.Mock).mock.calls.slice(-1)[0][1]
    );
    expect(new Date(saved[0].datetime).getTime()).toBeGreaterThan(Date.now());
  });

  // A non-recurring past-due reminder must still be skipped exactly as
  // before - the sweep's new recurring-aware branch must not change
  // behavior for the reminder shape every other test in this block covers.
  it("still skips a non-recurring past-due reminder (no regression)", async () => {
    const r = makeReminder({ completed: false, datetime: PAST });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify([r])
    );
    await rescheduleAllFutureReminders();
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  // Phone off for several days: the sweep must land on the next FUTURE
  // occurrence in one pass, not require multiple app opens to catch up one
  // missed day at a time.
  it("catches up a recurring reminder missed for multiple days in one sweep", async () => {
    const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000
    ).toISOString();
    const r = makeReminder({
      completed: false,
      datetime: threeDaysAgo,
      recurrence: dailyRule,
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify([r])
    );
    await rescheduleAllFutureReminders();
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(
      (AsyncStorage.setItem as jest.Mock).mock.calls.slice(-1)[0][1]
    );
    const advancedTime = new Date(saved[0].datetime).getTime();
    expect(advancedTime).toBeGreaterThan(Date.now());
    // Should NOT be several days in the future either - only advanced to the
    // next occurrence past now, not overshot. Generous margin (not exactly
    // 24h) since the reminder's own datetime and this assertion's Date.now()
    // are captured at different moments - a tight boundary here is flaky,
    // not meaningfully stricter.
    expect(advancedTime).toBeLessThan(Date.now() + 2 * 24 * 60 * 60 * 1000);
  });
});

describe("setAlarmForPendingReminders", () => {
  // The whole point of the retroactive prompt: the Settings toggle is only a
  // default for NEW reminders, so reminders created before the flip keep their
  // own alarm value and keep ringing (or keep arriving late) until something
  // rewrites them. This is that something.
  it("silences pending reminders whose alarm disagrees", async () => {
    const r = makeReminder({ id: "r1", alarm: true, datetime: FUTURE });

    const result = await setAlarmForPendingReminders([r], false);

    expect(result[0].alarm).toBe(false);
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it("turns alarm on for pending silent reminders", async () => {
    const r = makeReminder({ id: "r1", alarm: false, datetime: FUTURE });

    const result = await setAlarmForPendingReminders([r], true);

    expect(result[0].alarm).toBe(true);
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  // A reminder with no alarm field predates the field (or came from a backup
  // missing it) and is treated as alarm-on everywhere else — `!== false`, not
  // `=== true`. Silencing must reach it; turning alarm on must not touch it.
  it("treats a missing alarm field as alarm-on", async () => {
    const legacy = makeReminder({ id: "r1", datetime: FUTURE });
    delete (legacy as Partial<Reminder>).alarm;

    const silenced = await setAlarmForPendingReminders([legacy], false);
    expect(silenced[0].alarm).toBe(false);

    jest.clearAllMocks();
    const unchanged = await setAlarmForPendingReminders([legacy], true);
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(unchanged[0]).toBe(legacy);
  });

  it("leaves reminders that already agree untouched", async () => {
    const r = makeReminder({ id: "r1", alarm: false, datetime: FUTURE });

    const result = await setAlarmForPendingReminders([r], false);

    expect(result[0]).toBe(r);
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it("skips completed reminders", async () => {
    const r = makeReminder({ id: "r1", alarm: true, completed: true });

    const result = await setAlarmForPendingReminders([r], false);

    expect(result[0]).toBe(r);
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("skips past-dated reminders", async () => {
    const r = makeReminder({ id: "r1", alarm: true, datetime: PAST });

    const result = await setAlarmForPendingReminders([r], false);

    expect(result[0]).toBe(r);
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  // Same trap rescheduleAllFutureReminders guards: a past-dated reminder has
  // already been DELIVERED, so rescheduling cancels nothing and shows a
  // second copy.
  it("skips a reminder whose datetime has already passed", async () => {
    const r = makeReminder({
      id: "r1",
      alarm: true,
      datetime: new Date(Date.now() - 30 * 1000).toISOString(),
    });

    const result = await setAlarmForPendingReminders([r], false);

    expect(result[0]).toBe(r);
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("cancels by payload as well as by stored id before rescheduling", async () => {
    (getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: "orphan", content: { data: { reminderId: "r1" } } },
    ]);
    const r = makeReminder({ id: "r1", alarm: true, datetime: FUTURE });

    await setAlarmForPendingReminders([r], false);

    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("orphan");
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("notif-r1");
  });

  it("reschedules onto the silent channel when switching off", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const r = makeReminder({ id: "r1", alarm: true, datetime: FUTURE });

    await setAlarmForPendingReminders([r], false);

    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.data.alarm).toBe(false);
    expect(call.content.data.channelId).toBe(channelIdForAlarm(false));
  });

  it("stores the new notification id so the reminder stays cancellable", async () => {
    (scheduleNotificationAsync as jest.Mock).mockResolvedValueOnce("notif-new");
    const r = makeReminder({ id: "r1", alarm: true, datetime: FUTURE });

    const result = await setAlarmForPendingReminders([r], false);

    expect(result[0].notificationId).toBe("notif-new");
  });

  it("changes only the disagreeing reminders in a mixed list", async () => {
    const loud = makeReminder({ id: "r1", alarm: true, datetime: FUTURE });
    const quiet = makeReminder({ id: "r2", alarm: false, datetime: FUTURE });
    const done = makeReminder({ id: "r3", alarm: true, completed: true });

    const result = await setAlarmForPendingReminders([loud, quiet, done], false);

    expect(result.map((r) => r.alarm)).toEqual([false, false, true]);
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it("persists the updated list", async () => {
    const r = makeReminder({ id: "r1", alarm: true, datetime: FUTURE });

    await setAlarmForPendingReminders([r], false);

    const saved = (AsyncStorage.setItem as jest.Mock).mock.calls.find(
      ([key]) => key === STORAGE_KEY
    );
    expect(saved).toBeDefined();
    expect(JSON.parse(saved![1])[0].alarm).toBe(false);
  });

  it("does not write storage when nothing changed", async () => {
    const r = makeReminder({ id: "r1", alarm: false, datetime: FUTURE });

    await setAlarmForPendingReminders([r], false);

    const saved = (AsyncStorage.setItem as jest.Mock).mock.calls.find(
      ([key]) => key === STORAGE_KEY
    );
    expect(saved).toBeUndefined();
  });
});

describe("countPendingRemindersDisagreeingWithAlarm", () => {
  it("counts pending reminders that would change", () => {
    const list = [
      makeReminder({ id: "r1", alarm: true, datetime: FUTURE }),
      makeReminder({ id: "r2", alarm: false, datetime: FUTURE }),
      makeReminder({ id: "r3", alarm: true, completed: true }),
      makeReminder({ id: "r4", alarm: true, datetime: PAST }),
    ];

    expect(countPendingRemindersDisagreeingWithAlarm(list, false)).toBe(1);
    expect(countPendingRemindersDisagreeingWithAlarm(list, true)).toBe(1);
  });

  it("counts a missing alarm field as alarm-on", () => {
    const legacy = makeReminder({ id: "r1", datetime: FUTURE });
    delete (legacy as Partial<Reminder>).alarm;

    expect(countPendingRemindersDisagreeingWithAlarm([legacy], false)).toBe(1);
    expect(countPendingRemindersDisagreeingWithAlarm([legacy], true)).toBe(0);
  });

  it("returns zero for an empty list", () => {
    expect(countPendingRemindersDisagreeingWithAlarm([], false)).toBe(0);
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

describe("the registration offer", () => {
  it("offers to a new user who has not been asked", async () => {
    expect(await shouldOfferNumberRegistration()).toBe(true);
  });

  it("counts each offer", async () => {
    await incrementRegisterPromptCount();
    expect(await getRegisterPromptCount()).toBe(1);
    await incrementRegisterPromptCount();
    expect(await getRegisterPromptCount()).toBe(2);
  });

  it("stops at the cap, because a refusal repeated twice is an answer", async () => {
    for (let i = 0; i < MAX_REGISTER_PROMPTS; i++) {
      await incrementRegisterPromptCount();
    }
    expect(await shouldOfferNumberRegistration()).toBe(false);
  });

  it("never offers once the number is registered, whatever the count says", async () => {
    await setRegisteredPhone("+919876543210");
    expect(await shouldOfferNumberRegistration()).toBe(false);
  });

  it("offers again if the registered number is removed", async () => {
    await setRegisteredPhone("+919876543210");
    await clearRegisteredPhone();
    expect(await shouldOfferNumberRegistration()).toBe(true);
  });
});

describe("notification permission ladder", () => {
  it("getNotifPromptCount is 0 when unset", async () => {
    expect(await getNotifPromptCount()).toBe(0);
  });

  it("incrementNotifPromptCount persists the next count", async () => {
    expect(await incrementNotifPromptCount()).toBe(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(NOTIF_PROMPT_COUNT_KEY, "1");
    expect(await incrementNotifPromptCount()).toBe(2);
    expect(await getNotifPromptCount()).toBe(2);
  });

  it("getNotificationPermissionState reports granted and canAskAgain", async () => {
    (getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: "denied",
      canAskAgain: false,
    });
    expect(await getNotificationPermissionState()).toEqual({
      granted: false,
      canAskAgain: false,
    });
  });

  it("getNotificationPermissionState treats a missing canAskAgain as askable", async () => {
    (getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: "denied" });
    expect(await getNotificationPermissionState()).toEqual({
      granted: false,
      canAskAgain: true,
    });
  });

  it("ensureNotificationPermission asks nothing when already granted", async () => {
    (getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: "granted",
      canAskAgain: true,
    });
    expect(await ensureNotificationPermission()).toBe(true);
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(await getNotifPromptCount()).toBe(0);
  });

  it("ensureNotificationPermission asks and counts the ask when it may", async () => {
    (getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: "denied",
      canAskAgain: true,
    });
    (requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: "granted",
    });
    expect(await ensureNotificationPermission()).toBe(true);
    expect(requestPermissionsAsync).toHaveBeenCalled();
    expect(await getNotifPromptCount()).toBe(1);
  });

  it("ensureNotificationPermission never asks after a permanent refusal", async () => {
    (getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: "denied",
      canAskAgain: false,
    });
    expect(await ensureNotificationPermission()).toBe(false);
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(await getNotifPromptCount()).toBe(0);
  });

  it("ensureNotificationPermission stops asking once the cap is spent", async () => {
    for (let i = 0; i < MAX_NOTIF_PROMPTS; i++) await incrementNotifPromptCount();
    (getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: "denied",
      canAskAgain: true,
    });
    expect(await ensureNotificationPermission()).toBe(false);
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
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

  // Parity with toggleComplete: marking done from the notification tray
  // must advance a recurring series exactly the same way marking done
  // in-app does - a user must not get a different result depending on
  // which path they used.
  it("advances a recurring reminder instead of completing it forever, same as toggleComplete", async () => {
    (scheduleNotificationAsync as jest.Mock).mockClear();
    (scheduleNotificationAsync as jest.Mock).mockResolvedValueOnce("advanced-notif-id");
    const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };
    const r = makeReminder({
      id: "r1",
      completed: false,
      datetime: PAST,
      recurrence: dailyRule,
      notificationId: "notif-r1",
    });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));

    await markDoneById("r1");

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].completed).toBe(false);
    expect(new Date(stored[0].datetime).getTime()).toBeGreaterThan(Date.now());
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

  // Task 5b: currentOccurrenceSnoozes increments alongside the existing
  // series-wide snoozeCount, but resets on every advance (see
  // advanceRecurringReminder) - the two answer different questions ("has
  // this ever been avoided" vs. "is the user stuck on THIS occurrence").
  it("increments currentOccurrenceSnoozes alongside snoozeCount", async () => {
    const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };
    const r = makeReminder({
      id: "r1",
      recurrence: dailyRule,
      snoozeCount: 5,
      currentOccurrenceSnoozes: 1,
    });
    const result = await snoozeReminder([r], "r1", {
      kind: "minutes",
      minutes: 15,
    });
    const updated = result.find((x) => x.id === "r1")!;
    expect(updated.snoozeCount).toBe(6);
    expect(updated.currentOccurrenceSnoozes).toBe(2);
  });

  it("starts currentOccurrenceSnoozes at 1 on the first snooze", async () => {
    const r = makeReminder({ id: "r1" });
    const result = await snoozeReminder([r], "r1", {
      kind: "minutes",
      minutes: 15,
    });
    expect(result.find((x) => x.id === "r1")?.currentOccurrenceSnoozes).toBe(1);
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

describe("attachInvitationId", () => {
  it("tags the target reminder with the given invitation id", async () => {
    const r = makeReminder({ id: "r1" });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));

    await attachInvitationId("r1", "inv-1");

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].invitationId).toBe("inv-1");
  });

  it("no-ops safely when the id does not exist", async () => {
    const r = makeReminder({ id: "r1" });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));

    await expect(attachInvitationId("unknown", "inv-1")).resolves.toBeUndefined();
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].invitationId).toBeUndefined();
  });
});

describe("applyRecipientTimeChangeByInvitationId", () => {
  it("moves the matching reminder's datetime, reschedules its notification, and records who moved it", async () => {
    const r = makeReminder({ id: "r1", notificationId: "old-notif", invitationId: "inv-1" });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));
    const from = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const returnedId = await applyRecipientTimeChangeByInvitationId("inv-1", to, from, "Amma");

    expect(returnedId).toBe("r1");
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("old-notif");
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].datetime).toBe(to);
    expect(stored[0].notificationId).toBe("mock-notif-id");
    expect(stored[0].recipientTimeChange).toEqual({ from, to, by: "Amma" });
  });

  it("no-ops and returns undefined when no local reminder carries that invitation id", async () => {
    const r = makeReminder({ id: "r1" });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));

    const returnedId = await applyRecipientTimeChangeByInvitationId(
      "inv-does-not-exist",
      new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Amma"
    );

    expect(returnedId).toBeUndefined();
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].recipientTimeChange).toBeUndefined();
  });
});

describe("snoozeReminder snoozeHistory", () => {
  it("records how far this snooze actually pushed it, not just that it happened", async () => {
    const r = makeReminder({ id: "r1", notificationId: "old-notif" });
    const before = Date.now();

    const result = await snoozeReminder([r], "r1", { kind: "minutes", minutes: 15 });

    const updated = result.find((x) => x.id === "r1")!;
    expect(updated.snoozeHistory).toHaveLength(1);
    const entry = updated.snoozeHistory![0];
    expect(entry.minutes).toBe(15);
    expect(new Date(entry.at).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("appends rather than replacing across repeated snoozes", async () => {
    let reminders = [makeReminder({ id: "r1" })];
    reminders = await snoozeReminder(reminders, "r1", { kind: "minutes", minutes: 5 });
    reminders = await snoozeReminder(reminders, "r1", { kind: "minutes", minutes: 60 });

    const updated = reminders.find((x) => x.id === "r1")!;
    expect(updated.snoozeHistory).toHaveLength(2);
    expect(updated.snoozeHistory!.map((e) => e.minutes)).toEqual([5, 60]);
  });

  it("caps history at MAX_SNOOZE_HISTORY_ENTRIES, dropping the oldest first", async () => {
    let reminders = [makeReminder({ id: "r1" })];
    for (let i = 0; i < MAX_SNOOZE_HISTORY_ENTRIES + 3; i += 1) {
      reminders = await snoozeReminder(reminders, "r1", { kind: "minutes", minutes: 5 });
    }
    const updated = reminders.find((x) => x.id === "r1")!;
    expect(updated.snoozeHistory).toHaveLength(MAX_SNOOZE_HISTORY_ENTRIES);
  });

  it("records a large positive delay for the tomorrow preset, not zero", async () => {
    const r = makeReminder({
      id: "r1",
      datetime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    const result = await snoozeReminder([r], "r1", { kind: "tomorrow" });
    const entry = result.find((x) => x.id === "r1")!.snoozeHistory![0];
    // Roughly 25 hours: 1 hour until the original time, plus the +24h push.
    expect(entry.minutes).toBeGreaterThan(24 * 60);
  });
});

describe("markNotifiedById", () => {
  it("stamps notifiedAt on the target reminder", async () => {
    const r = makeReminder({ id: "r1" });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));
    const before = Date.now();

    await markNotifiedById("r1");

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(new Date(stored[0].notifiedAt).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("no-ops safely for an id with no matching reminder", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder({ id: "r1" })]));
    await expect(markNotifiedById("unknown")).resolves.toBeUndefined();
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].notifiedAt).toBeUndefined();
  });
});

describe("advanceRecurringById", () => {
  // Best-effort: while the app is alive, a delivered notification advances
  // its series immediately rather than waiting for the next mount-time
  // sweep. This is latency, not correctness - rescheduleAllFutureReminders'
  // catch-up handles the case where this never runs (app killed at the
  // fire moment).
  it("advances a recurring reminder whose datetime is now past-due", async () => {
    const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };
    const r = makeReminder({ id: "r1", datetime: PAST, recurrence: dailyRule });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));

    await advanceRecurringById("r1");

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(new Date(stored[0].datetime).getTime()).toBeGreaterThan(Date.now());
  });

  it("no-ops safely for an id with no matching reminder", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder({ id: "r1" })]));
    await expect(advanceRecurringById("unknown")).resolves.toBeUndefined();
  });

  it("no-ops safely for a non-recurring reminder", async () => {
    const r = makeReminder({ id: "r1", datetime: PAST });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));

    await advanceRecurringById("r1");

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].datetime).toBe(PAST);
  });

  // Ordering: markNotifiedById stamps notifiedAt on the occurrence that just
  // fired. advanceRecurringById resets notifiedAt on the NEW occurrence it
  // creates (a new occurrence has not been notified yet). Calling both for
  // the same delivery must not leave the fired occurrence's stamp inherited
  // by the fresh one.
  it("resets notifiedAt on the advanced occurrence even if markNotifiedById ran first", async () => {
    const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };
    const r = makeReminder({ id: "r1", datetime: PAST, recurrence: dailyRule });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));

    await markNotifiedById("r1");
    await advanceRecurringById("r1");

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].notifiedAt).toBeUndefined();
  });
});

describe("markOpenedById", () => {
  it("stamps openedAt on the target reminder", async () => {
    const r = makeReminder({ id: "r1" });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));
    const before = Date.now();

    await markOpenedById("r1");

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(new Date(stored[0].openedAt).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("no-ops safely for an id with no matching reminder", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder({ id: "r1" })]));
    await expect(markOpenedById("unknown")).resolves.toBeUndefined();
  });
});

describe("concurrent writes do not clobber each other", () => {
  // Regression for a real race: rescheduleAllFutureReminders (mount-time)
  // and markOpenedById (a screen mounting at the same moment - e.g. a
  // killed app cold-started straight into reminder-detail via a
  // notification tap) each used to do their own independent load-then-save,
  // with no ordering guarantee between them. Whichever saved last won,
  // silently discarding the other's write.
  it("survives markOpenedById racing rescheduleAllFutureReminders", async () => {
    const r = makeReminder({ id: "r1" });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));

    // Both started together, as they are at a real cold start into the
    // detail screen: the provider's mount-time reschedule sweep, and the
    // screen's own open-stamp.
    await Promise.all([rescheduleAllFutureReminders(), markOpenedById("r1")]);

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].openedAt).toBeTruthy();
  });

  it("survives markNotifiedById racing rescheduleAllFutureReminders", async () => {
    const r = makeReminder({ id: "r1" });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));

    await Promise.all([rescheduleAllFutureReminders(), markNotifiedById("r1")]);

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].notifiedAt).toBeTruthy();
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

describe("buildBackupJson", () => {
  it("includes every stored reminder", async () => {
    await saveReminders([
      {
        id: "a",
        title: "Pay land tax",
        description: "",
        datetime: "2027-03-25T04:30:00.000Z",
        completed: false,
      },
    ]);

    const parsed = JSON.parse(await buildBackupJson());
    expect(parsed.reminders).toHaveLength(1);
    expect(parsed.reminders[0].title).toBe("Pay land tax");
  });

  it("captures the current settings", async () => {
    await setDefaultAlarmEnabled(false);
    await setDictationLanguage("ml-IN");

    const parsed = JSON.parse(await buildBackupJson());
    expect(parsed.settings.defaultAlarmEnabled).toBe(false);
    expect(parsed.settings.dictationLanguage).toBe("ml-IN");
  });

  it("produces a file importRemindersFromJson accepts", async () => {
    await saveReminders([
      {
        id: "a",
        title: "Renew passport",
        description: "",
        datetime: "2034-01-01T00:00:00.000Z",
        completed: false,
      },
    ]);
    const json = await buildBackupJson();
    await saveReminders([]);

    const result = await importRemindersFromJson(json);
    expect(result.ok).toBe(true);
    expect((await loadReminders())[0].title).toBe("Renew passport");
  });
});

describe("importRemindersFromJson", () => {
  const backup = (reminders: unknown[]) =>
    JSON.stringify({
      format: "curiousmind.reminders.backup",
      version: 1,
      exportedAt: "2026-08-10T00:00:00.000Z",
      reminders,
      settings: {},
    });

  it("rejects a file that is not one of our backups without touching storage", async () => {
    await saveReminders([
      { id: "keep", title: "Keep me", description: "", datetime: "2027-01-01T00:00:00.000Z", completed: false },
    ]);

    const result = await importRemindersFromJson('{"some":"other file"}');

    expect(result.ok).toBe(false);
    expect(await loadReminders()).toHaveLength(1);
  });

  it("merges into existing reminders rather than replacing them", async () => {
    await saveReminders([
      { id: "local", title: "Local", description: "", datetime: "2027-01-01T00:00:00.000Z", completed: false },
    ]);

    const result = await importRemindersFromJson(
      backup([
        { id: "incoming", title: "Incoming", description: "", datetime: "2027-02-01T00:00:00.000Z", completed: false },
      ])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.added).toBe(1);
    expect(await loadReminders()).toHaveLength(2);
  });

  it("does not duplicate a reminder the device already has", async () => {
    const same = {
      id: "same",
      title: "Same thing",
      description: "",
      datetime: "2027-01-01T00:00:00.000Z",
      completed: false,
    };
    await saveReminders([same]);

    const result = await importRemindersFromJson(backup([same]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.added).toBe(0);
    expect(result.duplicates).toBe(1);
    expect(await loadReminders()).toHaveLength(1);
  });

  it("reports how many corrupt entries it skipped", async () => {
    const result = await importRemindersFromJson(
      backup([
        { id: "ok", title: "Fine", description: "", datetime: "2027-01-01T00:00:00.000Z", completed: false },
        { id: "broken", title: "No datetime" },
      ])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(1);
    expect(result.added).toBe(1);
  });

  it("schedules notifications for imported future reminders", async () => {
    (scheduleNotificationAsync as jest.Mock).mockClear();

    await importRemindersFromJson(
      backup([
        {
          id: "future",
          title: "Future thing",
          description: "",
          datetime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          completed: false,
        },
      ])
    );

    expect(scheduleNotificationAsync).toHaveBeenCalled();
    const stored = await loadReminders();
    expect(stored[0].notificationId).toBeDefined();
  });

  it("does not schedule anything for an imported past reminder", async () => {
    (scheduleNotificationAsync as jest.Mock).mockClear();

    await importRemindersFromJson(
      backup([
        {
          id: "past",
          title: "Past thing",
          description: "",
          datetime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          completed: false,
        },
      ])
    );

    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("restores settings from the backup", async () => {
    await setDefaultAlarmEnabled(true);
    const json = JSON.stringify({
      format: "curiousmind.reminders.backup",
      version: 1,
      exportedAt: "2026-08-10T00:00:00.000Z",
      reminders: [],
      settings: { defaultAlarmEnabled: false, dictationLanguage: "ml-IN" },
    });

    await importRemindersFromJson(json);

    expect(await getDefaultAlarmEnabled()).toBe(false);
    expect(await getDictationLanguage()).toBe("ml-IN");
  });

  it("leaves settings alone when the backup carries none", async () => {
    await setDictationLanguage("ml-IN");
    await importRemindersFromJson(backup([]));
    expect(await getDictationLanguage()).toBe("ml-IN");
  });
});

describe("isSendReminder", () => {
  const base: Reminder = {
    id: "1",
    title: "t",
    description: "",
    datetime: "2026-09-01T10:00:00.000Z",
    completed: false,
  };

  it("is false for a reminder with no recipient", () => {
    expect(isSendReminder(base)).toBe(false);
  });

  it("is true when a recipient has a phone number", () => {
    const r: Reminder = {
      ...base,
      recipient: { name: "Priya", phone: "+91 98765 43210" },
    };
    expect(isSendReminder(r)).toBe(true);
  });

  it("is false when the recipient object has an empty phone", () => {
    // A recipient with no usable phone must behave as a normal reminder,
    // otherwise the send screen renders with a dead Send button.
    const r: Reminder = { ...base, recipient: { name: "Priya", phone: "" } };
    expect(isSendReminder(r)).toBe(false);
  });

  it("is false when the recipient object is present but phone is whitespace", () => {
    const r: Reminder = { ...base, recipient: { name: "Priya", phone: "   " } };
    expect(isSendReminder(r)).toBe(false);
  });

  it("keeps contactId advisory and optional", () => {
    const withId: ReminderRecipient = {
      name: "Priya",
      phone: "9876543210",
      contactId: "abc",
    };
    const withoutId: ReminderRecipient = { name: "Priya", phone: "9876543210" };
    expect(isSendReminder({ ...base, recipient: withId })).toBe(true);
    expect(isSendReminder({ ...base, recipient: withoutId })).toBe(true);
  });
});

describe("legacy reminders without a recipient field", () => {
  it("parses stored JSON written before recipient existed", async () => {
    // loadReminders does a bare JSON.parse with no migration mechanism, so a
    // record written by an older build must still round-trip untouched.
    const legacy = [
      {
        id: "old-1",
        title: "Legacy",
        description: "",
        datetime: "2026-09-01T10:00:00.000Z",
        completed: false,
      },
    ];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify(legacy)
    );
    const loaded = await loadReminders();
    expect(loaded).toHaveLength(1);
    expect("recipient" in loaded[0]).toBe(false);
    expect(isSendReminder(loaded[0])).toBe(false);
  });
});

describe("invite nudge count persistence", () => {
  it("returns 0 for a phone never sent to", async () => {
    expect(await getInviteNudgeCount("919876543210")).toBe(0);
  });

  it("increments per phone independently", async () => {
    await incrementInviteNudgeCount("919876543210");
    await incrementInviteNudgeCount("919876543210");
    await incrementInviteNudgeCount("911111111111");
    expect(await getInviteNudgeCount("919876543210")).toBe(2);
    expect(await getInviteNudgeCount("911111111111")).toBe(1);
  });

  it("returns 0 rather than throwing when stored JSON is corrupt", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce("{not json");
    expect(await getInviteNudgeCount("919876543210")).toBe(0);
  });

  it("ignores a non-numeric stored value for a phone", async () => {
    await AsyncStorage.setItem(
      INVITE_NUDGE_COUNT_KEY,
      JSON.stringify({ "919876543210": "lots" })
    );
    expect(await getInviteNudgeCount("919876543210")).toBe(0);
  });

  it("FIFO-caps the map so it cannot grow without bound", async () => {
    const entries: Record<string, number> = {};
    for (let i = 0; i < INVITE_NUDGE_MAX_ENTRIES + 10; i++) {
      entries[`9${String(i).padStart(11, "0")}`] = 1;
    }
    await AsyncStorage.setItem(INVITE_NUDGE_COUNT_KEY, JSON.stringify(entries));
    await incrementInviteNudgeCount("919999999999");
    const raw = await AsyncStorage.getItem(INVITE_NUDGE_COUNT_KEY);
    const parsed = JSON.parse(raw as string);
    expect(Object.keys(parsed).length).toBeLessThanOrEqual(
      INVITE_NUDGE_MAX_ENTRIES
    );
    // The just-written entry must survive the eviction.
    expect(parsed["919999999999"]).toBe(1);
  });
});

describe("global invite nudge setting", () => {
  it("defaults to enabled", async () => {
    expect(await getInviteNudgeEnabled()).toBe(true);
  });

  it("round-trips a disabled value", async () => {
    await setInviteNudgeEnabled(false);
    expect(await getInviteNudgeEnabled()).toBe(false);
  });

  it("round-trips back to enabled", async () => {
    await setInviteNudgeEnabled(false);
    await setInviteNudgeEnabled(true);
    expect(await getInviteNudgeEnabled()).toBe(true);
  });

  it("falls back to enabled when storage throws", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
      new Error("boom")
    );
    expect(await getInviteNudgeEnabled()).toBe(true);
  });
});

describe("send reminder notification body", () => {
  it("says who to message instead of the generic Reminder! body", async () => {
    await addReminder([], {
      title: "Pick up milk",
      description: "",
      datetime: FUTURE,
      alarm: true,
      recipient: { name: "Priya", phone: "9876543210" },
    });
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.body).toBe("Message Priya");
  });

  it("leaves an ordinary reminder's body alone", async () => {
    await addReminder([], {
      title: "Pick up milk",
      description: "",
      datetime: FUTURE,
      alarm: true,
    });
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.body).toBe("Reminder!");
  });

  it("prefers the recipient body over a description, which is consent-gated", async () => {
    await setShowDescriptionEnabled(true);
    await addReminder([], {
      title: "Pick up milk",
      description: "Two litres",
      datetime: FUTURE,
      alarm: true,
      recipient: { name: "Priya", phone: "9876543210" },
    });
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.body).toBe("Message Priya");
  });

  it("ignores a recipient with no usable phone", async () => {
    await addReminder([], {
      title: "Pick up milk",
      description: "",
      datetime: FUTURE,
      alarm: true,
      recipient: { name: "Priya", phone: "  " },
    });
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.body).toBe("Reminder!");
  });
});


describe("corrupt store quarantine", () => {
  it("preserves an unreadable payload instead of letting the next write destroy it", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, "{ this is not json");

    // Reads as empty, so the UI shows an empty list rather than crashing.
    expect(await loadReminders()).toEqual([]);

    // The corrupt payload is still recoverable under a quarantine key.
    const keys = await AsyncStorage.getAllKeys();
    const quarantined = keys.filter((k) => k.startsWith(QUARANTINE_KEY_PREFIX));
    expect(quarantined).toHaveLength(1);
    expect(await AsyncStorage.getItem(quarantined[0])).toBe("{ this is not json");
  });

  it("does not quarantine a genuinely empty store", async () => {
    expect(await loadReminders()).toEqual([]);
    const keys = await AsyncStorage.getAllKeys();
    expect(keys.filter((k) => k.startsWith(QUARANTINE_KEY_PREFIX))).toHaveLength(0);
  });

  // A second failed read must not bury the first quarantine under a new one,
  // nor spawn unbounded copies on every cold start.
  it("quarantines at most once per corrupt payload", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, "{ bad");
    await loadReminders();
    await loadReminders();

    const keys = await AsyncStorage.getAllKeys();
    expect(keys.filter((k) => k.startsWith(QUARANTINE_KEY_PREFIX))).toHaveLength(1);
  });

  // Valid JSON that is not an array would break every consumer that maps over
  // it, so it is treated as corrupt rather than returned.
  it("treats valid-but-wrong-shaped JSON as corrupt", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ not: "an array" }));
    expect(await loadReminders()).toEqual([]);

    const keys = await AsyncStorage.getAllKeys();
    expect(keys.filter((k) => k.startsWith(QUARANTINE_KEY_PREFIX))).toHaveLength(1);
  });
});


describe("reminder instrumentation", () => {
  it("stamps createdAt when a reminder is added", async () => {
    const { reminders } = await addReminder([], {
      title: "Call the plumber",
      description: "",
      datetime: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(typeof reminders[0].createdAt).toBe("string");
    expect(Number.isNaN(Date.parse(reminders[0].createdAt!))).toBe(false);
  });

  it("stamps completedAt on completion and clears it on un-completion", async () => {
    const r: Reminder = {
      id: "r1",
      title: "T",
      description: "",
      datetime: new Date(Date.now() + 3600_000).toISOString(),
      completed: false,
    };
    const done = await toggleComplete([r], "r1");
    expect(typeof done[0].completedAt).toBe("string");

    // Un-completing must clear it, or the record claims a completion time for
    // a task that is not complete.
    const undone = await toggleComplete(done, "r1");
    expect(undone[0].completed).toBe(false);
    expect(undone[0].completedAt).toBeUndefined();
  });

  it("stamps completedAt from the notification Mark Done path too", async () => {
    const r: Reminder = {
      id: "r1",
      title: "T",
      description: "",
      datetime: new Date(Date.now() + 3600_000).toISOString(),
      completed: false,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));
    await markDoneById("r1");

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
    expect(typeof stored[0].completedAt).toBe("string");
  });

  it("counts snoozes and records the ORIGINAL datetime only once", async () => {
    const first = new Date(Date.now() + 3600_000).toISOString();
    const r: Reminder = {
      id: "r1",
      title: "T",
      description: "",
      datetime: first,
      completed: false,
    };

    const once = await snoozeReminder([r], "r1", { kind: "minutes", minutes: 15 });
    expect(once[0].snoozeCount).toBe(1);
    expect(once[0].originalDatetime).toBe(first);

    const twice = await snoozeReminder(once, "r1", { kind: "minutes", minutes: 15 });
    expect(twice[0].snoozeCount).toBe(2);
    // Still the FIRST intended time - this is how far the task has slid.
    expect(twice[0].originalDatetime).toBe(first);
  });
});


describe("quiet hours persistence", () => {
  it("defaults to 22:00-08:00 when nothing is stored", async () => {
    expect(await getQuietHours()).toEqual(DEFAULT_QUIET_HOURS);
  });

  it("round-trips a stored window", async () => {
    await setQuietHours({ startMinute: 9 * 60, endMinute: 17 * 60 });
    expect(await getQuietHours()).toEqual({ startMinute: 540, endMinute: 1020 });
  });

  // A corrupt value must not be able to wedge scheduling, matching the
  // defensive read used for every other setting in this service.
  it("falls back to the default on a corrupt stored value", async () => {
    await AsyncStorage.setItem(QUIET_HOURS_KEY, "not json");
    expect(await getQuietHours()).toEqual(DEFAULT_QUIET_HOURS);

    await AsyncStorage.setItem(QUIET_HOURS_KEY, JSON.stringify({ startMinute: "9pm" }));
    expect(await getQuietHours()).toEqual(DEFAULT_QUIET_HOURS);

    await AsyncStorage.setItem(
      QUIET_HOURS_KEY,
      JSON.stringify({ startMinute: -5, endMinute: 99999 })
    );
    expect(await getQuietHours()).toEqual(DEFAULT_QUIET_HOURS);
  });

  // Two separate per-setting lists have to know about a new setting:
  // buildBackupJson writes it, importRemindersFromJson applies it. Missing
  // either drops it silently, with no error on the round-trip.
  it("applies quiet hours from an imported backup", async () => {
    await setQuietHours({ startMinute: 1320, endMinute: 480 });
    const json = await buildBackupJson();
    await setQuietHours({ startMinute: 0, endMinute: 0 });

    await importRemindersFromJson(json);
    expect(await getQuietHours()).toEqual({ startMinute: 1320, endMinute: 480 });
  });

  it("ignores a malformed window in an imported backup", async () => {
    const json = await buildBackupJson();
    const tampered = JSON.parse(json);
    tampered.settings.quietHours = { startMinute: "10pm", endMinute: 480 };

    await importRemindersFromJson(JSON.stringify(tampered));
    // Unchanged, not corrupted: a backup is user-editable text.
    expect(await getQuietHours()).toEqual(DEFAULT_QUIET_HOURS);
  });

  it("includes quiet hours in the backup payload", async () => {
    await setQuietHours({ startMinute: 1320, endMinute: 480 });
    const parsed = JSON.parse(await buildBackupJson());
    expect(parsed.settings.quietHours).toEqual({ startMinute: 1320, endMinute: 480 });
  });
});

describe("scheduleNotification and the permission ask", () => {
  it("never asks for permission for a reminder whose time has already passed", async () => {
    (getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "denied",
      canAskAgain: true,
    });

    const id = await scheduleNotification(
      {
        title: "Already gone",
        description: "",
        datetime: new Date(Date.now() - 60_000).toISOString(),
        alarm: true,
        exactTiming: true,
      },
      "r-past"
    );

    expect(id).toBeUndefined();
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    // The prompt budget is for reminders that can still ring.
    expect(await getNotifPromptCount()).toBe(0);
  });

  it("asks for a reminder that still has a ring ahead of it", async () => {
    (getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "denied",
      canAskAgain: true,
    });

    await scheduleNotification(
      {
        title: "Still ahead",
        description: "",
        datetime: new Date(Date.now() + 3_600_000).toISOString(),
        alarm: true,
        exactTiming: true,
      },
      "r-future"
    );

    expect(requestPermissionsAsync).toHaveBeenCalled();
    expect(await getNotifPromptCount()).toBe(1);
  });
});

describe("isRecurring", () => {
  const base: Reminder = {
    id: "1",
    title: "t",
    description: "",
    datetime: "2026-09-01T10:00:00.000Z",
    completed: false,
  };

  it("is false when there is no recurrence rule", () => {
    expect(isRecurring(base)).toBe(false);
  });

  it("is true when a recurrence rule is present", () => {
    const rule: RecurrenceRule = { freq: "daily", interval: 1 };
    expect(isRecurring({ ...base, recurrence: rule })).toBe(true);
  });
});

describe("advanceRecurringReminder", () => {
  const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };

  const base: Reminder = {
    id: "1",
    title: "t",
    description: "",
    datetime: "2026-09-01T10:00:00.000Z",
    completed: false,
  };

  it("returns null for a non-recurring reminder", () => {
    const now = new Date("2026-09-05T00:00:00.000Z");
    expect(advanceRecurringReminder(base, now)).toBeNull();
  });

  it("returns null when the recurring reminder's datetime is still in the future", () => {
    const r: Reminder = { ...base, recurrence: dailyRule };
    const now = new Date("2026-08-01T00:00:00.000Z"); // before base.datetime
    expect(advanceRecurringReminder(r, now)).toBeNull();
  });

  it("advances a single missed occurrence to the next strictly-future occurrence", () => {
    const r: Reminder = {
      ...base,
      datetime: "2026-09-01T10:00:00.000Z",
      recurrence: dailyRule,
    };
    // Just past due, no catch-up needed beyond one step.
    const now = new Date("2026-09-01T11:00:00.000Z");
    const advanced = advanceRecurringReminder(r, now);
    expect(advanced).not.toBeNull();
    expect(new Date(advanced!.datetime).toISOString()).toBe(
      "2026-09-02T10:00:00.000Z"
    );
    expect(new Date(advanced!.datetime).getTime()).toBeGreaterThan(now.getTime());
  });

  it("catches up past multiple missed occurrences to land on the next future one", () => {
    const r: Reminder = {
      ...base,
      datetime: "2026-09-01T10:00:00.000Z",
      recurrence: dailyRule,
    };
    // Phone "off" for three days: now is well past three missed dailies.
    const now = new Date("2026-09-04T12:00:00.000Z");
    const advanced = advanceRecurringReminder(r, now);
    expect(advanced).not.toBeNull();
    // Next daily occurrence strictly after now, not the day right after the
    // original due date.
    expect(new Date(advanced!.datetime).toISOString()).toBe(
      "2026-09-05T10:00:00.000Z"
    );
  });

  it("catching up a monthly reminder anchored on the 31st across several months lands on the 30th/31st, not drifted to the 28th", () => {
    // Regression for a real bug: the catch-up loop used to compute each
    // candidate by chaining computeNextOccurrence from the PREVIOUS
    // candidate, which compounds the day-of-month clamp every step (Jan 31
    // -> Feb 28 -> Mar 28 (from the already-clamped Feb 28, not from the
    // real anchor) -> Apr 28), permanently losing the 31st the user actually
    // set. Fixed by computing every candidate fresh from recurrenceAnchor via
    // computeNthOccurrence, which clamps at most once. Confirmed as a live
    // bug via a throwaway probe before this fix: catching up from Jan 31 to
    // "now" of May 1 landed on May 28, not May 31.
    const r: Reminder = {
      ...base,
      datetime: new Date(2026, 0, 31, 9, 0, 0).toISOString(),
      recurrenceAnchor: new Date(2026, 0, 31, 9, 0, 0).toISOString(),
      recurrence: { freq: "monthly", interval: 1 },
    };
    const now = new Date(2026, 4, 1, 0, 0, 0); // May 1 2026 - phone off since Jan 31
    const advanced = advanceRecurringReminder(r, now);
    expect(advanced).not.toBeNull();
    const result = new Date(advanced!.datetime);
    // Walking the anchor day (31) forward month by month: Feb clamps to 28
    // (Feb has no 31st), Mar 31 is real (31 days), Apr clamps to 30 (Apr has
    // no 31st) - Apr 30 is still not strictly after "now" (May 1 00:00), so
    // the next actual future occurrence is May 31 (May has 31 days, no
    // clamp needed). The bug this regresses against would have instead
    // compounded every step's clamp and landed on May 28.
    expect(result.getMonth()).toBe(4); // May (0-indexed)
    expect(result.getDate()).toBe(31);
  });

  it("advances quickly for a large-but-under-cap number of missed occurrences", () => {
    // Not the cap-hitting case (see below) - this just confirms a large,
    // realistic catch-up (~9700 daily occurrences) stays fast and lands
    // strictly in the future.
    const r: Reminder = {
      ...base,
      datetime: "2000-01-01T10:00:00.000Z",
      recurrence: dailyRule,
    };
    const now = new Date("2026-09-18T00:00:00.000Z"); // ~9700 days later
    const start = Date.now();
    const advanced = advanceRecurringReminder(r, now);
    const elapsed = Date.now() - start;
    expect(advanced).not.toBeNull();
    expect(elapsed).toBeLessThan(2000);
    expect(new Date(advanced!.datetime).getTime()).toBeGreaterThan(now.getTime());
  });

  it("returns null instead of a still-past-due result when the iteration cap is genuinely hit", () => {
    // No real RecurrenceRule can fail to progress (normalizeInput floors
    // interval >= 1, and every addX() helper advances by at least a day) -
    // but Task 5c will feed rules parsed from an external Tier 2 invitation
    // payload through this same path, so the cap itself must be proven to
    // fail safely rather than assumed unreachable. Force it here by
    // stubbing computeNthOccurrence to never progress past `anchor`.
    //
    // Mocks computeNthOccurrence, not computeNextOccurrence: the catch-up
    // loop now computes each candidate fresh from the anchor via
    // computeNthOccurrence (see advanceRecurringReminder's own comment on
    // why - avoiding compounded monthly/yearly day-of-month clamping), so
    // that is the call the cap-exhaustion path actually drives.
    const spy = jest
      .spyOn(recurrenceModule, "computeNthOccurrence")
      .mockImplementation((_rule, anchor) => anchor);

    const r: Reminder = {
      ...base,
      datetime: "2026-09-01T10:00:00.000Z",
      recurrence: dailyRule,
    };
    const now = new Date("2026-09-05T00:00:00.000Z");

    const advanced = advanceRecurringReminder(r, now);

    // computeNthOccurrence was called MAX_ADVANCE_ITERATIONS + 1 times
    // (the initial call, then one per loop iteration) before the loop gave
    // up - proves the cap was actually exercised, not just "under budget".
    expect(spy).toHaveBeenCalledTimes(10001);
    expect(advanced).toBeNull();

    spy.mockRestore();
  });

  it("resets per-occurrence state", () => {
    const r: Reminder = {
      ...base,
      datetime: "2026-09-01T10:00:00.000Z",
      recurrence: dailyRule,
      completed: true,
      completedAt: "2026-09-01T10:05:00.000Z",
      notificationId: "notif-1",
      notifiedAt: "2026-09-01T10:00:05.000Z",
      openedAt: "2026-09-01T10:01:00.000Z",
    };
    const now = new Date("2026-09-01T11:00:00.000Z");
    const advanced = advanceRecurringReminder(r, now)!;
    expect(advanced.completed).toBe(false);
    expect(advanced.completedAt).toBeUndefined();
    expect(advanced.notificationId).toBeUndefined();
    expect(advanced.notifiedAt).toBeUndefined();
    expect(advanced.openedAt).toBeUndefined();
  });

  it("preserves series-level state", () => {
    const r: Reminder = {
      ...base,
      datetime: "2026-09-01T10:00:00.000Z",
      recurrence: dailyRule,
      snoozeCount: 3,
      snoozeHistory: [{ at: "2026-09-01T09:00:00.000Z", minutes: 30 }],
      originalDatetime: "2026-08-30T10:00:00.000Z",
      createdAt: "2026-08-29T00:00:00.000Z",
      senderName: "Priya",
      recipient: { name: "Priya", phone: "+911234567890" },
    };
    const now = new Date("2026-09-01T11:00:00.000Z");
    const advanced = advanceRecurringReminder(r, now)!;
    expect(advanced.snoozeCount).toBe(3);
    expect(advanced.snoozeHistory).toEqual(r.snoozeHistory);
    expect(advanced.originalDatetime).toBe(r.originalDatetime);
    expect(advanced.createdAt).toBe(r.createdAt);
    expect(advanced.recurrence).toEqual(dailyRule);
    expect(advanced.senderName).toBe("Priya");
    expect(advanced.recipient).toEqual(r.recipient);
  });

  // Task 5b: occurrence tallies. Without these, a completed occurrence
  // advances into a `pending` record and contributes nothing to adherence -
  // proved by a probe against the real computeAdherenceStats before this
  // was fixed. Tallying on the record itself (not a separate event log)
  // keeps the "derived, not logged" principle while letting a recurring
  // series contribute N decided outcomes instead of one permanent pending.
  it("tallies the retiring occurrence as completed when it was completed", () => {
    const r: Reminder = {
      ...base,
      datetime: "2026-09-01T10:00:00.000Z",
      recurrence: dailyRule,
      completed: true,
      occurrencesCompleted: 2,
    };
    const now = new Date("2026-09-01T11:00:00.000Z");
    const advanced = advanceRecurringReminder(r, now)!;
    expect(advanced.occurrencesCompleted).toBe(3);
    expect(advanced.occurrencesMissed).toBeUndefined();
  });

  it("tallies the retiring occurrence as missed when it was never completed", () => {
    const r: Reminder = {
      ...base,
      datetime: "2026-09-01T10:00:00.000Z",
      recurrence: dailyRule,
      completed: false,
      occurrencesMissed: 1,
    };
    const now = new Date("2026-09-01T11:00:00.000Z");
    const advanced = advanceRecurringReminder(r, now)!;
    expect(advanced.occurrencesMissed).toBe(2);
    expect(advanced.occurrencesCompleted).toBeUndefined();
  });

  // currentOccurrenceSnoozes is per-occurrence: it must reset to 0 on every
  // advance, regardless of how many times the retiring occurrence was
  // snoozed - `stuck` reads THIS field, not the series-wide snoozeCount,
  // specifically so snoozes spread across separate days don't permanently
  // flag the series as avoided.
  it("resets currentOccurrenceSnoozes to 0 on advance, regardless of its prior value", () => {
    const r: Reminder = {
      ...base,
      datetime: "2026-09-01T10:00:00.000Z",
      recurrence: dailyRule,
      currentOccurrenceSnoozes: 3,
      snoozeCount: 7,
    };
    const now = new Date("2026-09-01T11:00:00.000Z");
    const advanced = advanceRecurringReminder(r, now)!;
    expect(advanced.currentOccurrenceSnoozes).toBe(0);
    // snoozeCount (series-wide, read by M9) is untouched - a different
    // field for a different consumer, not superseded by the one above.
    expect(advanced.snoozeCount).toBe(7);
  });

  // Task 5b: the snooze anchor. The advance must compute from
  // recurrenceAnchor, never from `datetime` (which a snooze overwrites) -
  // otherwise one two-hour snooze of "every day at 8" silently converts the
  // series to a standing 10am reminder forever.
  it("advances from recurrenceAnchor, not from a snoozed datetime", () => {
    const r: Reminder = {
      ...base,
      // The reminder was originally due at 8am, but got snoozed to 10am -
      // datetime now says 10am, recurrenceAnchor still says 8am.
      recurrenceAnchor: "2026-09-01T08:00:00.000Z",
      datetime: "2026-09-01T10:00:00.000Z",
      recurrence: dailyRule,
    };
    const now = new Date("2026-09-02T00:00:00.000Z");
    const advanced = advanceRecurringReminder(r, now)!;
    // Next occurrence should be 8am the next day (anchor + 1 day), NOT
    // 10am the next day (which advancing from `datetime` would produce).
    expect(new Date(advanced.datetime).toISOString()).toBe(
      "2026-09-02T08:00:00.000Z"
    );
  });

  it("falls back to datetime as the anchor when recurrenceAnchor is absent (legacy record)", () => {
    const r: Reminder = {
      ...base,
      datetime: "2026-09-01T08:00:00.000Z",
      recurrence: dailyRule,
    };
    const now = new Date("2026-09-02T00:00:00.000Z");
    const advanced = advanceRecurringReminder(r, now)!;
    expect(new Date(advanced.datetime).toISOString()).toBe(
      "2026-09-02T08:00:00.000Z"
    );
  });

  it("preserves recurrenceAnchor across an advance - it is a series-level field", () => {
    const r: Reminder = {
      ...base,
      recurrenceAnchor: "2026-09-01T08:00:00.000Z",
      datetime: "2026-09-01T08:00:00.000Z",
      recurrence: dailyRule,
    };
    const now = new Date("2026-09-02T00:00:00.000Z");
    const advanced = advanceRecurringReminder(r, now)!;
    expect(advanced.recurrenceAnchor).toBe("2026-09-01T08:00:00.000Z");
  });
});
