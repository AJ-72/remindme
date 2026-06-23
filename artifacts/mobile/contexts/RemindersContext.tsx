import * as Haptics from "expo-haptics";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  type Reminder,
  type SnoozeData,
  addReminder as serviceAdd,
  deleteReminder as serviceDelete,
  editReminder as serviceEdit,
  initNotifications,
  loadReminders,
  toggleComplete as serviceToggle,
} from "@/services/ReminderService";

export type { Reminder, SnoozeData };
export {
  SNOOZE_ACTION_ID,
  SNOOZE_CATEGORY_ID,
  SNOOZE_MINUTES,
  scheduleSnoozeNotification,
} from "@/services/ReminderService";

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

initNotifications();

export function RemindersProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReminders()
      .then((loaded) => setReminders(loaded))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const addReminder = useCallback(
    async (data: Omit<Reminder, "id" | "completed" | "notificationId">) => {
      const { reminders: updated } = await serviceAdd(reminders, data);
      setReminders(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [reminders]
  );

  const editReminder = useCallback(
    async (
      id: string,
      data: Omit<Reminder, "id" | "completed" | "notificationId">
    ) => {
      const updated = await serviceEdit(reminders, id, data);
      setReminders(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [reminders]
  );

  const deleteReminder = useCallback(
    async (id: string) => {
      const updated = await serviceDelete(reminders, id);
      setReminders(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [reminders]
  );

  const toggleComplete = useCallback(
    async (id: string) => {
      const updated = await serviceToggle(reminders, id);
      setReminders(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [reminders]
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
    throw new Error("useReminders must be used within RemindersProvider");
  return ctx;
}
