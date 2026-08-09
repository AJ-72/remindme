import * as Haptics from "expo-haptics";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState } from "react-native";

import {
  type Reminder,
  type NotificationData,
  type DictationLanguage,
  addReminder as serviceAdd,
  deleteReminder as serviceDelete,
  editReminder as serviceEdit,
  getDefaultAlarmEnabled,
  getDictationLanguage,
  getShowDescriptionEnabled,
  initNotifications,
  loadReminders,
  setDefaultAlarmEnabled as serviceSetDefaultAlarmEnabled,
  setDictationLanguage as serviceSetDictationLanguage,
  setShowDescriptionEnabled as serviceSetShowDescriptionEnabled,
  snoozeReminder as serviceSnooze,
  toggleComplete as serviceToggle,
} from "@/services/ReminderService";

export type { Reminder, NotificationData, DictationLanguage };
export {
  SNOOZE_ACTION_ID,
  SNOOZE_CATEGORY_ID,
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
  snoozeReminder: (id: string) => Promise<void>;
  loading: boolean;
  defaultAlarmEnabled: boolean;
  setDefaultAlarmEnabled: (enabled: boolean) => Promise<void>;
  showDescriptionInNotifications: boolean;
  setShowDescriptionInNotifications: (enabled: boolean) => Promise<void>;
  dictationLanguage: DictationLanguage;
  setDictationLanguage: (lang: DictationLanguage) => Promise<void>;
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
  const [defaultAlarmEnabled, setDefaultAlarmEnabledState] = useState(true);
  const [showDescriptionInNotifications, setShowDescriptionInNotificationsState] =
    useState(false);
  const [dictationLanguage, setDictationLanguageState] = useState<DictationLanguage>("en-US");

  useEffect(() => {
    Promise.all([
      loadReminders(),
      getDefaultAlarmEnabled(),
      getShowDescriptionEnabled(),
      getDictationLanguage(),
    ])
      .then(([loadedReminders, defaultAlarm, showDescription, dictLang]) => {
        setReminders(loadedReminders);
        setDefaultAlarmEnabledState(defaultAlarm);
        setShowDescriptionInNotificationsState(showDescription);
        setDictationLanguageState(dictLang);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        loadReminders().then(setReminders);
      }
    });
    return () => sub.remove();
  }, []);

  const setDefaultAlarmEnabled = useCallback(async (enabled: boolean) => {
    await serviceSetDefaultAlarmEnabled(enabled);
    setDefaultAlarmEnabledState(enabled);
  }, []);

  const setShowDescriptionInNotifications = useCallback(
    async (enabled: boolean) => {
      await serviceSetShowDescriptionEnabled(enabled);
      setShowDescriptionInNotificationsState(enabled);
    },
    []
  );

  const setDictationLanguage = useCallback(async (lang: DictationLanguage) => {
    await serviceSetDictationLanguage(lang);
    setDictationLanguageState(lang);
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

  const snoozeReminder = useCallback(
    async (id: string) => {
      const updated = await serviceSnooze(reminders, id);
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
        snoozeReminder,
        loading,
        defaultAlarmEnabled,
        setDefaultAlarmEnabled,
        showDescriptionInNotifications,
        setShowDescriptionInNotifications,
        dictationLanguage,
        setDictationLanguage,
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
