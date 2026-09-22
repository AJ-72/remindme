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
  attachInvitationId as serviceAttachInvitationId,
  deleteReminder as serviceDelete,
  deleteReminders as serviceDeleteMany,
  skipOccurrence as serviceSkipOccurrence,
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
  markOpenedById as serviceMarkOpened,
  toggleComplete as serviceToggle,
} from "@/services/ReminderService";
import { syncDisplayName } from "@/services/InvitationService";
import { EVENTS } from "@/constants/analytics";
import {
  applyTelemetryChoice,
  setPersonProperties,
  track,
} from "@/services/AnalyticsService";
import { getTelemetryEnabled } from "@/services/telemetryConsent";
import {
  reminderCountBucket,
  reminderProps,
  snoozePresetKey,
} from "@/utils/analyticsProps";
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
  ) => Promise<Reminder>;
  /**
   * Tags a just-added send-reminder with the server invitation id it maps
   * to, once send-invitation confirms it - see Reminder.invitationId's
   * header. A no-op call this context makes only from QuickAddInput.tsx,
   * after addReminder's own local save has already completed.
   */
  attachInvitationId: (id: string, invitationId: string) => Promise<void>;
  editReminder: (
    id: string,
    data: Omit<Reminder, "id" | "completed" | "notificationId">,
    options?: { moveAnchor?: boolean }
  ) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  deleteReminders: (ids: string[]) => Promise<void>;
  skipOccurrence: (id: string) => Promise<void>;
  toggleComplete: (id: string) => Promise<void>;
  markOpened: (id: string) => Promise<void>;
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
  /**
   * Whether anonymous usage and crash reporting is on. Defaults ON, with the
   * off switch in Settings — see services/telemetryConsent.ts for why that
   * default was chosen and what is never collected either way.
   */
  telemetryEnabled: boolean;
  setTelemetryEnabled: (enabled: boolean) => Promise<void>;
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

/**
 * One event for every setting, rather than one event per setting.
 *
 * `setting` names which switch moved and `value` its new state, so a single
 * series answers "what do people actually configure" without twelve
 * near-identical event names to keep in step with the Settings screen. The
 * value is always a primitive the user could have chosen from a fixed list -
 * never free text, so "Your name" is deliberately absent from every call site
 * below.
 */
function trackSetting(setting: string, value: string | number | boolean): void {
  track(EVENTS.SETTING_CHANGED, { setting, value });
}

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
  const [telemetryEnabled, setTelemetryEnabledState] = useState(true);

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
      telemetry,
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
        getTelemetryEnabled(),
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
    setTelemetryEnabledState(telemetry);
    // A person property, not an event: it describes how this install is
    // configured right now, which is what every "is this only broken for
    // Malayalam users?" question needs to split on.
    setPersonProperties({
      dictation_language: dictLang,
      reminder_count: reminderCountBucket(loadedReminders.length),
      snooze_preset: snoozePresetKey(preset),
    });
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
    trackSetting("default_alarm", enabled);
  }, []);

  const setDefaultExactTimingEnabled = useCallback(async (enabled: boolean) => {
    await serviceSetDefaultExactTimingEnabled(enabled);
    setDefaultExactTimingEnabledState(enabled);
    trackSetting("default_exact_timing", enabled);
  }, []);

  const setAlarmForPending = useCallback(async (alarm: boolean) => {
    const updated = await serviceSetAlarmForPendingReminders(reminders, alarm);
    setReminders(updated);
  }, [reminders]);

  const setInviteNudgeEnabled = useCallback(async (enabled: boolean) => {
    await serviceSetInviteNudgeEnabled(enabled);
    setInviteNudgeEnabledState(enabled);
    trackSetting("invite_nudge", enabled);
  }, []);

  const setShowDescriptionInNotifications = useCallback(
    async (enabled: boolean) => {
      await serviceSetShowDescriptionEnabled(enabled);
      setShowDescriptionInNotificationsState(enabled);
      trackSetting("show_description", enabled);
    },
    []
  );

  const setVibrationEnabled = useCallback(async (enabled: boolean) => {
    await serviceSetVibrationEnabled(enabled);
    setVibrationEnabledState(enabled);
    trackSetting("vibration", enabled);
  }, []);

  const setTelemetry = useCallback(async (enabled: boolean) => {
    // Order matters on the way OUT. The event has to be captured while
    // consent still stands, or the one number worth having — how many people
    // turn this off — is the one number that can never be collected.
    if (!enabled) track(EVENTS.TELEMETRY_OPT_OUT);
    await applyTelemetryChoice(enabled);
    setTelemetryEnabledState(enabled);
  }, []);

  const setQuietHours = useCallback(async (window: QuietHours) => {
    await serviceSetQuietHours(window);
    setQuietHoursState(window);
    // The exact start and end are the user's own routine - close to a sleep
    // schedule - so the window itself is never sent. Only whether they moved
    // it off the default, which is what says the default is wrong.
    trackSetting(
      "quiet_hours",
      window.startMinute !== DEFAULT_QUIET_HOURS.startMinute ||
        window.endMinute !== DEFAULT_QUIET_HOURS.endMinute,
    );
  }, []);

  const setUserName = useCallback(async (name: string) => {
    await serviceSetUserName(name);
    // Store the trimmed form, matching what the service persisted, so the
    // greeting never renders a stray space the next render would drop anyway.
    setUserNameState(name.trim());
    // B11: fire-and-forget, best-effort - a sync failure or a not-yet-bound
    // user (syncDisplayName no-ops with no session) must never block the
    // name itself from saving locally, which is why this isn't awaited.
    syncDisplayName(name);
  }, []);

  const setDictationLanguage = useCallback(async (lang: DictationLanguage) => {
    await serviceSetDictationLanguage(lang);
    setDictationLanguageState(lang);
    trackSetting("dictation_language", lang);
    setPersonProperties({ dictation_language: lang });
  }, []);

  const addReminder = useCallback(
    async (data: Omit<Reminder, "id" | "completed" | "notificationId">) => {
      // The exact-timing default is applied here rather than at each creation
      // site: unlike `alarm` there is no control for it on the add screens,
      // so the only per-reminder choice is the detail-screen override, which
      // sets the field explicitly and is preserved by the `!== undefined`
      // check below.
      const { reminders: updated, added } = await serviceAdd(reminders, {
        ...data,
        exactTiming:
          data.exactTiming !== undefined ? data.exactTiming : defaultExactTimingEnabled,
      });
      setReminders(updated);
      track(EVENTS.REMINDER_CREATED, reminderProps(added));
      setPersonProperties({ reminder_count: reminderCountBucket(updated.length) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return added;
    },
    [reminders, defaultExactTimingEnabled]
  );

  const attachInvitationId = useCallback(async (id: string, invitationId: string) => {
    await serviceAttachInvitationId(id, invitationId);
    setReminders((current) =>
      current.map((r) => (r.id === id ? { ...r, invitationId } : r))
    );
  }, []);

  const editReminder = useCallback(
    async (
      id: string,
      data: Omit<Reminder, "id" | "completed" | "notificationId">,
      options?: { moveAnchor?: boolean }
    ) => {
      const updated = await serviceEdit(reminders, id, data, options);
      setReminders(updated);
      track(EVENTS.REMINDER_EDITED, reminderProps(data));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [reminders]
  );

  const deleteReminder = useCallback(
    async (id: string) => {
      const previous = reminders.find((r) => r.id === id);
      const updated = await serviceDelete(reminders, id);
      setReminders(updated);
      track(EVENTS.REMINDER_DELETED, {
        count: 1,
        // Deleting an unfinished reminder is a different signal from clearing
        // a finished one: the first is abandonment, the second is tidying.
        was_completed: previous?.completed ?? false,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [reminders]
  );

  const deleteReminders = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const updated = await serviceDeleteMany(reminders, ids);
      setReminders(updated);
      track(EVENTS.REMINDER_DELETED, { count: ids.length, was_completed: false });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [reminders]
  );

  const skipOccurrence = useCallback(
    async (id: string) => {
      const updated = await serviceSkipOccurrence(reminders, id);
      setReminders(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [reminders]
  );

  const toggleComplete = useCallback(
    async (id: string) => {
      const before = reminders.find((r) => r.id === id);
      const updated = await serviceToggle(reminders, id);
      setReminders(updated);
      const after = updated.find((r) => r.id === id);
      // Only the completing direction is an event. Un-completing is a
      // correction, and counting it as a negative completion would make the
      // completion rate depend on how often people fix mistakes.
      if (after?.completed && !before?.completed) {
        track(
          EVENTS.REMINDER_COMPLETED,
          reminderProps(after, {
            // Minutes late is the adherence question the derived stats in
            // utils/adherenceStats.ts answer locally; this is the same fact,
            // bucketed, so it can be compared across installs.
            on_time: new Date(after.completedAt ?? Date.now()).getTime() <=
              new Date(after.datetime).getTime(),
          }),
        );
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [reminders]
  );

  /**
   * Stamps that the user looked at this reminder's detail screen - adherence
   * instrumentation, not a user-visible action, so no haptic and no toast.
   * Local-only: mirrors state into `reminders` so a later read (e.g. this
   * same session's insights screen) sees it without a reload, but never
   * throws if `id` no longer exists - a race with a delete in another tab of
   * the UI must not crash the screen that is simply being closed.
   */
  const markOpened = useCallback(
    async (id: string) => {
      await serviceMarkOpened(id);
      setReminders((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, openedAt: new Date().toISOString() } : r
        )
      );
    },
    []
  );

  const snoozeReminder = useCallback(
    async (id: string, preset?: SnoozePreset) => {
      const chosen = preset ?? snoozePreset;
      const updated = await serviceSnooze(reminders, id, chosen);
      setReminders(updated);
      const after = updated.find((r) => r.id === id);
      if (after) {
        track(EVENTS.REMINDER_SNOOZED, reminderProps(after, { preset: snoozePresetKey(chosen) }));
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [reminders, snoozePreset]
  );

  const setSnoozePreset = useCallback(async (preset: SnoozePreset) => {
    await serviceSetSnoozePreset(preset);
    setSnoozePresetState(preset);
    trackSetting("snooze_preset", snoozePresetKey(preset));
    setPersonProperties({ snooze_preset: snoozePresetKey(preset) });
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
        attachInvitationId,
        editReminder,
        deleteReminder,
        deleteReminders,
        skipOccurrence,
        toggleComplete,
        markOpened,
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
        telemetryEnabled,
        setTelemetryEnabled: setTelemetry,
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
