import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Platform } from "react-native";

export interface Reminder {
  id: string;
  title: string;
  description: string;
  datetime: string;
  completed: boolean;
  notificationId?: string;
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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function requestPermissions() {
  if (Platform.OS === "web") return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

async function scheduleNotification(
  reminder: Omit<Reminder, "id" | "completed" | "notificationId">
): Promise<string | undefined> {
  try {
    const granted = await requestPermissions();
    if (!granted) return undefined;
    const trigger = new Date(reminder.datetime);
    if (trigger <= new Date()) return undefined;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: reminder.title,
        body: reminder.description || "Reminder!",
        sound: true,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
    });
    return id;
  } catch {
    return undefined;
  }
}

async function cancelNotification(notificationId?: string) {
  if (!notificationId || Platform.OS === "web") return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {}
}

export function RemindersProvider({ children }: { children: React.ReactNode }) {
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
    async (data: Omit<Reminder, "id" | "completed" | "notificationId">) => {
      const notificationId = await scheduleNotification(data);
      const newReminder: Reminder = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        ...data,
        completed: false,
        notificationId,
      };
      await save([newReminder, ...reminders]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
          ? { ...r, completed: !r.completed, notificationId: !r.completed ? undefined : r.notificationId }
          : r
      );
      await save(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [reminders, save]
  );

  return (
    <RemindersContext.Provider
      value={{ reminders, addReminder, editReminder, deleteReminder, toggleComplete, loading }}
    >
      {children}
    </RemindersContext.Provider>
  );
}

export function useReminders() {
  const ctx = useContext(RemindersContext);
  if (!ctx) throw new Error("useReminders must be used within RemindersProvider");
  return ctx;
}
