import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Platform } from "react-native";

// eslint-disable-next-line
let Notifications: any = null;
try {
  // @ts-ignore
  Notifications = require("expo-notifications");
} catch {
  // expo-notifications may crash on Android Expo Go SDK 53+ at module load
  Notifications = null;
}

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

interface RemindersContextType {
  reminders: Reminder[];
  addReminder: (
    data: Omit<Reminder, "id" | "completed" | "notificationId">
  ) => Promise<void>;
  editReminder: (
    id: string,
    data: Omit<Reminder, "id" | "completed" | "notificationId">
  ) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  toggleComplete: (id: string) => Promise<void>;
  loading: boolean;
}

const RemindersContext = createContext<RemindersContextType | null>(null);

const STORAGE_KEY = "@reminders_v1";

if (Notifications) {
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
  } catch {
    // ignore
  }
}

async function setupNotificationChannel() {
  if (Platform.OS !== "android" || !Notifications) return;
  try {
    await Notifications.setNotificationChannelAsync("reminders", {
      name: "Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6366f1",
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync("reminders-silent", {
      name: "Reminders (Silent)",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: null,
      enableVibrate: false,
      sound: null,
    });
  } catch {
    // ignore
  }
}

async function setupSnoozeCategory() {
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
  } catch {
    // ignore — category API may not be available in all environments
  }
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

export interface SnoozeData {
  title: string;
  body: string;
  alarm: boolean;
  channelId: string;
}

async function scheduleNotification(
  reminder: Omit<Reminder, "id" | "completed" | "notificationId">
): Promise<string | undefined> {
  if (!Notifications) return undefined;
  try {
    const granted = await requestPermissions();
    if (!granted) return undefined;
    const trigger = new Date(reminder.datetime);
    if (trigger <= new Date()) return undefined;
    const alarmOn = reminder.alarm !== false;
    const channelId = alarmOn ? "reminders" : "reminders-silent";
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
  } catch {
    // ignore
  }
}

async function cancelNotification(notificationId?: string) {
  if (!notificationId || Platform.OS === "web" || !Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {}
}

export function RemindersProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setReminders(JSON.parse(raw));
      } catch {}
      setLoading(false);
    })();
  }, []);

  const save = useCallback(async (updated: Reminder[]) => {
    setReminders(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const addReminder = useCallback(
    async (
      data: Omit<Reminder, "id" | "completed" | "notificationId">
    ) => {
      const notificationId = await scheduleNotification(data);
      const newReminder: Reminder = {
        id:
          Date.now().toString() +
          Math.random().toString(36).substring(2, 9),
        ...data,
        completed: false,
        notificationId,
      };
      await save([newReminder, ...reminders]);
      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );
    },
    [reminders, save]
  );

  const editReminder = useCallback(
    async (
      id: string,
      data: Omit<Reminder, "id" | "completed" | "notificationId">
    ) => {
      const old = reminders.find((r) => r.id === id);
      await cancelNotification(old?.notificationId);
      const notificationId = await scheduleNotification(data);
      const updated = reminders.map((r) =>
        r.id === id ? { ...r, ...data, notificationId } : r
      );
      await save(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [reminders, save]
  );

  const deleteReminder = useCallback(
    async (id: string) => {
      const target = reminders.find((r) => r.id === id);
      await cancelNotification(target?.notificationId);
      await save(reminders.filter((r) => r.id !== id));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [reminders, save]
  );

  const toggleComplete = useCallback(
    async (id: string) => {
      const target = reminders.find((r) => r.id === id);
      if (!target) return;
      if (!target.completed) {
        await cancelNotification(target.notificationId);
      }
      const updated = reminders.map((r) =>
        r.id === id
          ? {
              ...r,
              completed: !r.completed,
              notificationId: !r.completed
                ? undefined
                : r.notificationId,
            }
          : r
      );
      await save(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [reminders, save]
  );

  return (
    <RemindersContext.Provider
      value={{
        reminders,
        addReminder,
        editReminder,
        deleteReminder,
        toggleComplete,
        loading,
      }}
    >
      {children}
    </RemindersContext.Provider>
  );
}

export function useReminders() {
  const ctx = useContext(RemindersContext);
  if (!ctx)
    throw new Error(
      "useReminders must be used within RemindersProvider"
    );
  return ctx;
}
