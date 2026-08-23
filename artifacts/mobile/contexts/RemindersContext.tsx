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
  getInviteNudgeEnabled,
  getSnoozePreset,
  getQuietHours,
  setQuietHours as serviceSetQuietHours,
  getUserName,
  setUserName as serviceSetUserName,
  getVibrationEnabled,
  initNotifications,
  loadReminders,
  setDefaultAlarmEnabled as serviceSetDefaultAlarmEnabled,
  setDictationLanguage as serviceSetDictationLanguage,
  setShowDescriptionEnabled as serviceSetShowDescriptionEnabled,
  setInviteNudgeEnabled as serviceSetInviteNudgeEnabled,
  setSnoozePreset as serviceSetSnoozePreset,
  setVibrationEnabled as serviceSetVibrationEnabled,
  setupSnoozeCategory,
  snoozeReminder as serviceSnooze,
  toggleComplete as serviceToggle,
} from "@/services/ReminderService";
import { DEFAULT_QUIET_HOURS, type QuietHours } from "@/utils/quietHours";
import {
  DEFAULT_SNOOZE_PRESET,
  type SnoozePreset,
} from "@/utils/snoozePresets";

export type { Reminder, NotificationData, DictationLanguage, SnoozePreset };
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
  snoozeReminder: (id: string, preset?: SnoozePreset) => Promise<void>;
  snoozePreset: SnoozePreset;
  setSnoozePreset: (preset: SnoozePreset) => Promise<void>;
  loading: boolean;
  defaultAlarmEnabled: boolean;
  setDefaultAlarmEnabled: (enabled: boolean) => Promise<void>;
  showDescriptionInNotifications: boolean;
  setShowDescriptionInNotifications: (enabled: boolean) => Promise<void>;
  inviteNudgeEnabled: boolean;
  setInviteNudgeEnabled: (enabled: boolean) => Promise<void>;
  vibrationEnabled: boolean;
  setVibrationEnabled: (enabled: boolean) => Promise<void>;
  /** When the app stays silent. Applies to alerts it schedules itself. */
  quietHours: QuietHours;
  setQuietHours: (window: QuietHours) => Promise<void>;
  /** The user's own name, or "" when unset. Never undefined. */
  userName: string;
  setUserName: (name: string) => Promise<void>;
  dictationLanguage: DictationLanguage;
  setDictationLanguage: (lang: DictationLanguage) => Promise<void>;
  /**
   * Re-read reminders and settings from storage. Needed when something other
   * than this context writes to the store — currently only a backup restore,
   * which replaces the whole list behind the provider's back.
   */
  refreshFromStorage: () => Promise<void>;
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
  const [snoozePreset, setSnoozePresetState] =
    useState<SnoozePreset>(DEFAULT_SNOOZE_PRESET);
  const [vibrationEnabled, setVibrationEnabledState] = useState(true);
  const [userName, setUserNameState] = useState("");
  const [quietHours, setQuietHoursState] = useState<QuietHours>(DEFAULT_QUIET_HOURS);
  const [inviteNudgeEnabled, setInviteNudgeEnabledState] = useState(true);

  // Shared by the initial mount and by refreshFromStorage, so a restore can
  // never drift out of sync with what the provider loads at startup.
  const loadFromStorage = useCallback(async () => {
    const [
      loadedReminders,
      defaultAlarm,
      showDescription,
      dictLang,
      preset,
      vibration,
      nudge,
      name,
      quiet,
    ] =
      await Promise.all([
        loadReminders(),
        getDefaultAlarmEnabled(),
        getShowDescriptionEnabled(),
        getDictationLanguage(),
        getSnoozePreset(),
        getVibrationEnabled(),
        getInviteNudgeEnabled(),
        getUserName(),
        getQuietHours(),
      ]);
    setReminders(loadedReminders);
    setDefaultAlarmEnabledState(defaultAlarm);
    setShowDescriptionInNotificationsState(showDescription);
    setDictationLanguageState(dictLang);
    setSnoozePresetState(preset);
    setVibrationEnabledState(vibration);
    setInviteNudgeEnabledState(nudge);
    setUserNameState(name);
    setQuietHoursState(quiet);
  }, []);

  const refreshFromStorage = useCallback(async () => {
    try {
      await loadFromStorage();
    } catch {}
  }, [loadFromStorage]);

  useEffect(() => {
    loadFromStorage()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loadFromStorage]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        loadReminders().then(setReminders);
      }
    });
    // Guard the unsubscribe: addEventListener isn't guaranteed to hand back a
    // subscription in every environment, and an unmount that throws here takes
    // down the whole teardown path.
    return () => sub?.remove?.();
  }, []);

  const setDefaultAlarmEnabled = useCallback(async (enabled: boolean) => {
    await serviceSetDefaultAlarmEnabled(enabled);
    setDefaultAlarmEnabledState(enabled);
  }, []);

  const setInviteNudgeEnabled = useCallback(async (enabled: boolean) => {
    await serviceSetInviteNudgeEnabled(enabled);
    setInviteNudgeEnabledState(enabled);
  }, []);

  const setShowDescriptionInNotifications = useCallback(
    async (enabled: boolean) => {
      await serviceSetShowDescriptionEnabled(enabled);
      setShowDescriptionInNotificationsState(enabled);
    },
    []
  );

  const setVibrationEnabled = useCallback(async (enabled: boolean) => {
    await serviceSetVibrationEnabled(enabled);
    setVibrationEnabledState(enabled);
  }, []);

  const setQuietHours = useCallback(async (window: QuietHours) => {
    await serviceSetQuietHours(window);
    setQuietHoursState(window);
  }, []);

  const setUserName = useCallback(async (name: string) => {
    await serviceSetUserName(name);
    // Store the trimmed form, matching what the service persisted, so the
    // greeting never renders a stray space the next render would drop anyway.
    setUserNameState(name.trim());
  }, []);

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
    async (id: string, preset?: SnoozePreset) => {
      const updated = await serviceSnooze(reminders, id, preset ?? snoozePreset);
      setReminders(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [reminders, snoozePreset]
  );

  const setSnoozePreset = useCallback(async (preset: SnoozePreset) => {
    await serviceSetSnoozePreset(preset);
    setSnoozePresetState(preset);
    // Re-register so the notification-tray button label matches. Fire-and-
    // forget by design: setupSnoozeCategory swallows its own errors, and a
    // stale label is cosmetic — the action ID and handler still work.
    setupSnoozeCategory(preset);
  }, []);

  return (
    <RemindersContext.Provider
      value={{
        reminders,
        addReminder,
        editReminder,
        deleteReminder,
        toggleComplete,
        snoozeReminder,
        snoozePreset,
        setSnoozePreset,
        loading,
        defaultAlarmEnabled,
        setDefaultAlarmEnabled,
        showDescriptionInNotifications,
        setShowDescriptionInNotifications,
        inviteNudgeEnabled,
        setInviteNudgeEnabled,
        vibrationEnabled,
        setVibrationEnabled,
        quietHours,
        setQuietHours,
        userName,
        setUserName,
        dictationLanguage,
        setDictationLanguage,
        refreshFromStorage,
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
