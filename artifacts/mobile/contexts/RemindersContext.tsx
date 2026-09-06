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
  deleteReminders as serviceDeleteMany,
  editReminder as serviceEdit,
  getDefaultAlarmEnabled,
  getDefaultExactTimingEnabled,
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
  rescheduleAllFutureReminders,
  setAlarmForPendingReminders as serviceSetAlarmForPendingReminders,
  setDefaultAlarmEnabled as serviceSetDefaultAlarmEnabled,
  setDefaultExactTimingEnabled as serviceSetDefaultExactTimingEnabled,
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
  deleteReminders: (ids: string[]) => Promise<void>;
  toggleComplete: (id: string) => Promise<void>;
  snoozeReminder: (id: string, preset?: SnoozePreset) => Promise<void>;
  snoozePreset: SnoozePreset;
  setSnoozePreset: (preset: SnoozePreset) => Promise<void>;
  loading: boolean;
  defaultAlarmEnabled: boolean;
  setDefaultAlarmEnabled: (enabled: boolean) => Promise<void>;
  /**
   * Whether NEW reminders default to punctual delivery. Existing reminders
   * carry their own `exactTiming`; flipping this never rewrites them.
   */
  defaultExactTimingEnabled: boolean;
  setDefaultExactTimingEnabled: (enabled: boolean) => Promise<void>;
  /**
   * Retroactively bring existing pending reminders in line with `alarm`.
   * Opt-in only — `setDefaultAlarmEnabled` deliberately does NOT call this,
   * since a per-reminder alarm choice is user intent the default must not
   * silently overwrite.
   */
  setAlarmForPending: (alarm: boolean) => Promise<void>;
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
  const [defaultExactTimingEnabled, setDefaultExactTimingEnabledState] = useState(true);
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
      defaultExactTiming,
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
        getDefaultExactTimingEnabled(),
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
    setDefaultExactTimingEnabledState(defaultExactTiming);
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

    // Android wipes every AlarmManager registration on app install/update
    // (and some OEMs do the same on reboot), so a stored notificationId is
    // no proof anything is actually armed. The only other re-arm path is
    // rescheduleTask's ~15-minute BackgroundFetch sweep, which is too slow
    // to save a reminder due sooner than that, and which gives up for good
    // once a reminder's delivery time has passed (it assumes "past" means
    // "already delivered", not "was never armed"). Doing it here closes that
    // window the moment the user opens the app, before that assumption can
    // ever kick in. Fire-and-forget: must not delay first paint, and a
    // failure here is silent by design, same as the sweep it backs up.
    rescheduleAllFutureReminders()
      .then(() => loadReminders())
      .then(setReminders)
      .catch(() => {});
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

  const setDefaultExactTimingEnabled = useCallback(async (enabled: boolean) => {
    await serviceSetDefaultExactTimingEnabled(enabled);
    setDefaultExactTimingEnabledState(enabled);
  }, []);

  const setAlarmForPending = useCallback(async (alarm: boolean) => {
    const updated = await serviceSetAlarmForPendingReminders(reminders, alarm);
    setReminders(updated);
  }, [reminders]);

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
      // The exact-timing default is applied here rather than at each creation
      // site: unlike `alarm` there is no control for it on the add screens,
      // so the only per-reminder choice is the detail-screen override, which
      // sets the field explicitly and is preserved by the `!== undefined`
      // check below.
      const { reminders: updated } = await serviceAdd(reminders, {
        ...data,
        exactTiming:
          data.exactTiming !== undefined ? data.exactTiming : defaultExactTimingEnabled,
      });
      setReminders(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [reminders, defaultExactTimingEnabled]
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

  const deleteReminders = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const updated = await serviceDeleteMany(reminders, ids);
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
        deleteReminders,
        toggleComplete,
        snoozeReminder,
        snoozePreset,
        setSnoozePreset,
        loading,
        defaultAlarmEnabled,
        setDefaultAlarmEnabled,
        defaultExactTimingEnabled,
        setDefaultExactTimingEnabled,
        setAlarmForPending,
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
