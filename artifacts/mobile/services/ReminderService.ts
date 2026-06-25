import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// eslint-disable-next-line
let Notifications: any = null;
try {
  // @ts-ignore
  Notifications = require("expo-notifications");
} catch {
  Notifications = null;
}

export const STORAGE_KEY = "@reminders_v1";
export const SNOOZE_CATEGORY_ID = "REMINDER_SNOOZE";
export const SNOOZE_ACTION_ID = "SNOOZE_10";
export const SNOOZE_MINUTES = 10;

export interface Reminder {
  id: string;
  title: string;
  description: string;
  datetime: string;
  completed: boolean;
  notificationId?: string;
  alarm?: boolean;
}

export interface SnoozeData {
  title: string;
  body: string;
  alarm: boolean;
  channelId: string;
}

export async function loadReminders(): Promise<Reminder[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Reminder[];
  } catch {}
  return [];
}

export async function saveReminders(reminders: Reminder[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
}

async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android" || !Notifications) return;
  // Remove the legacy "reminders" channel left behind when the channel ID
  // was renamed to "reminders-alarm". Android keeps stale channels visible
  // in Settings → App notifications indefinitely, so we delete it on every
  // startup to prevent users from seeing two channels. The call is a no-op
  // on devices that never had the old channel. Isolated in its own try/catch
  // so that a deletion failure cannot prevent the active channels from being
  // created or updated below.
  try {
    await Notifications.deleteNotificationChannelAsync("reminders");
  } catch {}
  try {
    // MAX importance + custom alarm sound + DND bypass gives a true alarm
    // experience. The sound file "alarm.wav" is copied to res/raw by the
    // expo-notifications plugin at EAS build time (configured in app.json).
    // On Expo Go it falls back to the system default sound gracefully.
    // Channel ID changed from "reminders" to "reminders-alarm" so Android
    // creates a fresh channel with these settings. Android permanently caches
    // channel config (importance, sound, vibration) keyed by ID — updating
    // the settings on an existing ID is silently ignored.
    await Notifications.setNotificationChannelAsync("reminders-alarm", {
      name: "Reminders (Alarm)",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      lightColor: "#6366f1",
      sound: "alarm.wav",
      bypassDnd: true,
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
    });
    await Notifications.setNotificationChannelAsync("reminders-silent", {
      name: "Reminders (Silent)",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: null,
      enableVibrate: false,
      sound: null,
    });
  } catch {}
}

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
    ]);
  } catch {}
}

async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === "web" || !Notifications) return false;
  try {
    await setupNotificationChannel();
    await setupSnoozeCategory();
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

export async function scheduleNotification(
  reminder: Pick<Reminder, "title" | "description" | "datetime" | "alarm">
): Promise<string | undefined> {
  if (!Notifications) return undefined;
  try {
    const granted = await requestPermissions();
    if (!granted) return undefined;
    const trigger = new Date(reminder.datetime);
    if (trigger <= new Date()) return undefined;
    const alarmOn = reminder.alarm !== false;
    const channelId = alarmOn ? "reminders-alarm" : "reminders-silent";
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: reminder.title,
        body: reminder.description || "Reminder!",
        sound: alarmOn,
        categoryIdentifier: SNOOZE_CATEGORY_ID,
        data: {
          title: reminder.title,
          body: reminder.description || "Reminder!",
          alarm: alarmOn,
          channelId,
        } satisfies SnoozeData,
        ...(Platform.OS === "android" ? { channelId } : {}),
        ...(Platform.OS === "ios" && !alarmOn ? { sound: false } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: trigger,
      },
    });
    return id;
  } catch {
    return undefined;
  }
}

export async function cancelNotification(
  notificationId?: string
): Promise<void> {
  if (!notificationId || Platform.OS === "web" || !Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {}
}

export async function scheduleSnoozeNotification(
  data: SnoozeData
): Promise<void> {
  if (Platform.OS === "web" || !Notifications) return;
  try {
    const snoozeDate = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: data.title,
        body: data.body,
        sound: data.alarm,
        categoryIdentifier: SNOOZE_CATEGORY_ID,
        data,
        ...(Platform.OS === "android" ? { channelId: data.channelId } : {}),
        ...(Platform.OS === "ios" && !data.alarm ? { sound: false } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: snoozeDate,
      },
    });
  } catch {}
}

/**
 * Checks whether exact alarm scheduling is available on Android 12+
 * (API level 31+). Returns null on non-Android platforms or Android < 12.
 *
 * Uses Notifications.getPermissionsAsync() whose android.alarm field
 * reflects AlarmManager.canScheduleExactAlarms() — the correct native API.
 * PermissionsAndroid.check() is wrong for this permission because
 * SCHEDULE_EXACT_ALARM is a special app-access permission, not a runtime
 * permission, and PermissionsAndroid always returns false for it regardless
 * of actual grant state.
 */
export async function checkExactAlarmPermission(): Promise<boolean | null> {
  if (Platform.OS !== "android") return null;
  if (typeof Platform.Version === "number" && Platform.Version < 31) return null;
  if (!Notifications) return null;
  try {
    const permissions = await Notifications.getPermissionsAsync();
    const alarm = permissions?.android?.alarm;
    if (typeof alarm !== "boolean") return null;
    return alarm;
  } catch {
    return null;
  }
}

export async function initNotifications(): Promise<void> {
  if (!Notifications) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        ...(Platform.OS === "ios"
          ? { shouldShowBanner: true, shouldShowList: true }
          : {}),
      }),
    });
  } catch {}
  // Set up (and clean up stale) notification channels on every app start so
  // the legacy "reminders" channel is removed as soon as the user upgrades,
  // without waiting for a scheduling flow to trigger requestPermissions().
  await setupNotificationChannel();
}

export async function addReminder(
  current: Reminder[],
  data: Omit<Reminder, "id" | "completed" | "notificationId">
): Promise<{ reminders: Reminder[]; added: Reminder }> {
  const notificationId = await scheduleNotification(data);
  const added: Reminder = {
    id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
    ...data,
    completed: false,
    notificationId,
  };
  const reminders = [added, ...current];
  await saveReminders(reminders);
  return { reminders, added };
}

export async function editReminder(
  current: Reminder[],
  id: string,
  data: Omit<Reminder, "id" | "completed" | "notificationId">
): Promise<Reminder[]> {
  const old = current.find((r) => r.id === id);
  await cancelNotification(old?.notificationId);
  const notificationId = await scheduleNotification(data);
  const reminders = current.map((r) =>
    r.id === id ? { ...r, ...data, notificationId } : r
  );
  await saveReminders(reminders);
  return reminders;
}

export async function deleteReminder(
  current: Reminder[],
  id: string
): Promise<Reminder[]> {
  const target = current.find((r) => r.id === id);
  await cancelNotification(target?.notificationId);
  const reminders = current.filter((r) => r.id !== id);
  await saveReminders(reminders);
  return reminders;
}

export async function toggleComplete(
  current: Reminder[],
  id: string
): Promise<Reminder[]> {
  const target = current.find((r) => r.id === id);
  if (!target) return current;
  if (!target.completed) {
    await cancelNotification(target.notificationId);
  }
  const reminders = current.map((r) =>
    r.id === id
      ? {
          ...r,
          completed: !r.completed,
          notificationId: !r.completed ? undefined : r.notificationId,
        }
      : r
  );
  await saveReminders(reminders);
  return reminders;
}

export async function rescheduleAllFutureReminders(): Promise<void> {
  const reminders = await loadReminders();
  const now = new Date();
  let changed = false;
  const updated = await Promise.all(
    reminders.map(async (reminder) => {
      if (reminder.completed || new Date(reminder.datetime) <= now) {
        return reminder;
      }
      // Cancel any previously scheduled notification to prevent duplicates,
      // then schedule a fresh one with the updated ID.
      await cancelNotification(reminder.notificationId);
      const notificationId = await scheduleNotification(reminder);
      if (notificationId !== undefined) {
        changed = true;
        return { ...reminder, notificationId };
      }
      return reminder;
    })
  );
  if (changed) {
    await saveReminders(updated);
  }
}
