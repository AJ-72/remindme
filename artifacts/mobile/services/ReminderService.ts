import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Platform } from "react-native";
import { getLocales } from "expo-localization";
import {
  DEFAULT_SNOOZE_PRESET,
  isSnoozePreset,
  resolveSnoozeTarget,
  snoozeActionLabel,
  type SnoozePreset,
} from "@/utils/snoozePresets";

import { buildSnoozeTitle } from "@/utils/greeting";

import {
  mergeReminders,
  parseBackup,
  serializeBackup,
} from "@/utils/reminderBackup";

export type { SnoozePreset };

// eslint-disable-next-line
let Notifications: any = null;
try {
  // @ts-ignore
  Notifications = require("expo-notifications");
} catch {
  Notifications = null;
}

export const STORAGE_KEY = "@reminders_v1";
export const DEFAULT_ALARM_KEY = "@default_alarm_v1";
export const SHOW_DESCRIPTION_KEY = "@show_description_v1";
export const DICTATION_LANGUAGE_KEY = "@dictation_language_v1";
export const VIBRATION_KEY = "@vibration_v1";
export const PERMISSION_ONBOARDING_KEY = "@permission_onboarding_v1";
export const SNOOZE_PRESET_KEY = "@snooze_preset_v1";
export const USER_NAME_KEY = "@user_name_v1";
// Separate from PERMISSION_ONBOARDING_KEY on purpose: one flow completing must
// not mark the other done, or a user who granted permissions before this
// feature existed would never be asked their name.
export const NAME_PROMPT_KEY = "@name_prompt_v1";
export const SNOOZE_CATEGORY_ID = "REMINDER_SNOOZE";
// NOTE: the value must stay "SNOOZE_10" even though snooze is now
// user-configurable. It is written into the categoryIdentifier of every
// scheduled notification, so notifications already sitting in a user's tray
// across an upgrade carry this exact string — changing it makes their Snooze
// button silently do nothing. Renaming needs a dual-registration migration
// (backlog item 17).
export const SNOOZE_ACTION_ID = "SNOOZE_10";
// Opens the app to the snooze sheet instead of snoozing directly. Android
// notification actions can't show a sub-menu, so the full preset list is only
// reachable in-app. Unlike SNOOZE_ACTION_ID this value has no legacy baggage.
export const SNOOZE_MORE_ACTION_ID = "SNOOZE_MORE";
export const MARK_DONE_ACTION_ID = "MARK_DONE";

// Android's setExactAndAllowWhileIdle (used natively by expo-notifications)
// is documented to defer delivery by up to ~1 minute under normal operation,
// and longer under Doze. Scheduling the native trigger this much earlier
// keeps the notification's actual arrival close to the time the user picked.
export const ALARM_EARLY_OFFSET_MS = 60 * 1000;

/**
 * Who a "send" reminder is about. Deliberately an object, not a flat phone
 * string, so Tier 2 can add appUserId/deliveryStatus/acknowledgedAt later as
 * purely additive optional fields.
 */
export interface ReminderRecipient {
  /** Snapshot taken when the contact was picked - never re-resolved. */
  name: string;
  /** Raw, exactly as the OS gave it. Normalized at send time, not on save. */
  phone: string;
  /** Advisory only; contact ids change across devices and contact merges. */
  contactId?: string;
}

export interface Reminder {
  id: string;
  title: string;
  description: string;
  datetime: string;
  completed: boolean;
  notificationId?: string;
  alarm?: boolean;
  recipient?: ReminderRecipient;
}

/**
 * Single definition of "is this a send reminder", used by every consumer.
 * A recipient carrying no usable phone must behave as a normal reminder -
 * otherwise the send screen renders with a dead Send button.
 */
export function isSendReminder(r: Reminder): boolean {
  return !!r.recipient?.phone?.trim();
}

export interface NotificationData {
  reminderId: string;
  title: string;
  body: string;
  alarm: boolean;
  channelId: string;
}

export type DictationLanguage = "en-US" | "ml-IN";

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

/**
 * The user's own name, or "" when unset. Never undefined - the empty string is
 * the single "no name" signal every consumer checks.
 */
export async function getUserName(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(USER_NAME_KEY);
    if (typeof raw === "string") return raw.trim();
  } catch {}
  return "";
}

export async function setUserName(name: string): Promise<void> {
  await AsyncStorage.setItem(USER_NAME_KEY, name.trim());
}

/** Whether the first-launch name prompt has been shown (answered OR skipped). */
export async function hasSeenNamePrompt(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(NAME_PROMPT_KEY)) !== null;
  } catch {
    // Treat a storage failure as "already seen" - re-prompting on every cold
    // start is far worse than never prompting.
    return true;
  }
}

export async function markNamePromptSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(NAME_PROMPT_KEY, "1");
  } catch {}
}

export async function getDefaultAlarmEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(DEFAULT_ALARM_KEY);
    if (raw !== null) return JSON.parse(raw) as boolean;
  } catch {}
  return true;
}

export async function setDefaultAlarmEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(enabled));
}

export async function getShowDescriptionEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SHOW_DESCRIPTION_KEY);
    if (raw !== null) return JSON.parse(raw) as boolean;
  } catch {}
  return false;
}

export async function setShowDescriptionEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(SHOW_DESCRIPTION_KEY, JSON.stringify(enabled));
}

export async function getVibrationEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(VIBRATION_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === "boolean") return parsed;
    }
  } catch {}
  // Defaults on: turning off sound shouldn't also silence the buzz, which is
  // the whole point of the separate setting.
  return true;
}

export async function setVibrationEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(VIBRATION_KEY, JSON.stringify(enabled));
}

export async function getDictationLanguage(): Promise<DictationLanguage> {
  try {
    const raw = await AsyncStorage.getItem(DICTATION_LANGUAGE_KEY);
    if (raw === "en-US" || raw === "ml-IN") return raw;
  } catch {}
  const deviceLocale = getLocales()[0]?.languageTag ?? "en-US";
  return deviceLocale.startsWith("ml") ? "ml-IN" : "en-US";
}

export async function setDictationLanguage(lang: DictationLanguage): Promise<void> {
  await AsyncStorage.setItem(DICTATION_LANGUAGE_KEY, lang);
}

export async function getSnoozePreset(): Promise<SnoozePreset> {
  try {
    const raw = await AsyncStorage.getItem(SNOOZE_PRESET_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // A corrupt or outdated stored value must not be able to wedge snoozing.
      if (isSnoozePreset(parsed)) return parsed;
    }
  } catch {}
  return DEFAULT_SNOOZE_PRESET;
}

export async function setSnoozePreset(preset: SnoozePreset): Promise<void> {
  await AsyncStorage.setItem(SNOOZE_PRESET_KEY, JSON.stringify(preset));
}

export const INVITE_NUDGE_COUNT_KEY = "@invite_nudge_count_v1";
export const INVITE_NUDGE_ENABLED_KEY = "@invite_nudge_enabled_v1";

/**
 * Cap on the per-contact counter map. Keyed by normalized phone digits rather
 * than contactId, which changes across devices and contact merges.
 */
export const INVITE_NUDGE_MAX_ENTRIES = 200;

async function readNudgeCounts(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(INVITE_NUDGE_COUNT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return parsed as Record<string, number>;
  } catch {
    // A corrupt map must not be able to wedge sending.
    return {};
  }
}

export async function getInviteNudgeCount(phoneDigits: string): Promise<number> {
  const counts = await readNudgeCounts();
  const n = counts[phoneDigits];
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Advance the per-contact counter. Call this ONLY on an actual send - calling
 * it on screen render means opening the screen twice burns a nudge stage.
 */
export async function incrementInviteNudgeCount(
  phoneDigits: string
): Promise<void> {
  const counts = await readNudgeCounts();
  const current = typeof counts[phoneDigits] === "number" ? counts[phoneDigits] : 0;
  counts[phoneDigits] = current + 1;

  // FIFO eviction: insertion order is preserved for string keys, and the entry
  // we just wrote is re-added last so it always survives.
  const keys = Object.keys(counts);
  if (keys.length > INVITE_NUDGE_MAX_ENTRIES) {
    const survivor = counts[phoneDigits];
    for (const k of keys.slice(0, keys.length - INVITE_NUDGE_MAX_ENTRIES)) {
      delete counts[k];
    }
    delete counts[phoneDigits];
    counts[phoneDigits] = survivor;
  }

  await AsyncStorage.setItem(INVITE_NUDGE_COUNT_KEY, JSON.stringify(counts));
}

export async function getInviteNudgeEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(INVITE_NUDGE_ENABLED_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

export async function setInviteNudgeEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(INVITE_NUDGE_ENABLED_KEY, String(enabled));
}

export async function resolveNotificationBody(
  description?: string
): Promise<string> {
  const showDescription = await getShowDescriptionEnabled();
  if (showDescription && description) return description;
  return "Reminder!";
}

export async function hasCompletedPermissionOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PERMISSION_ONBOARDING_KEY)) !== null;
  } catch {
    return false;
  }
}

export async function markPermissionOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(PERMISSION_ONBOARDING_KEY, "true");
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
      // Explicit: a vibrationPattern alone does not guarantee vibration is
      // enabled on the channel. Existing installs keep whatever this channel
      // was created with — immutable by ID — but new ones get it right.
      enableVibrate: true,
      lightColor: "#6366f1",
      sound: "alarm.wav",
      bypassDnd: true,
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
    });
    // Sound on, vibration off. Same alarm treatment as above minus the buzz —
    // needed because channel config is immutable by ID, so this combination
    // cannot be expressed by editing "reminders-alarm" at runtime.
    await Notifications.setNotificationChannelAsync("reminders-alarm-novibrate", {
      name: "Reminders (Alarm, no vibration)",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: null,
      enableVibrate: false,
      lightColor: "#6366f1",
      sound: "alarm.wav",
      bypassDnd: true,
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
    });
    // Sound off but vibration on. This needs its OWN channel ID rather than a
    // tweak to "reminders-silent": per the note above, Android caches channel
    // config by ID for the lifetime of the install, so flipping enableVibrate
    // on the existing silent channel would be silently ignored for every user
    // who already has it. Existing channels are left exactly as they are.
    await Notifications.setNotificationChannelAsync("reminders-vibrate", {
      name: "Reminders (Vibrate only)",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 400, 200, 400],
      enableVibrate: true,
      sound: null,
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

export async function setupSnoozeCategory(preset: SnoozePreset): Promise<void> {
  if (Platform.OS === "web" || !Notifications) return;
  try {
    await Notifications.setNotificationCategoryAsync(SNOOZE_CATEGORY_ID, [
      {
        identifier: SNOOZE_ACTION_ID,
        buttonTitle: snoozeActionLabel(preset),
        options: {
          isDestructive: false,
          isAuthenticationRequired: false,
        },
      },
      {
        identifier: SNOOZE_MORE_ACTION_ID,
        buttonTitle: "More…",
        options: {
          isDestructive: false,
          isAuthenticationRequired: false,
          // The only action here that must foreground the app — it exists to
          // show the snooze sheet, which can't be rendered from the tray.
          opensAppToForeground: true,
        },
      },
      {
        identifier: MARK_DONE_ACTION_ID,
        buttonTitle: "Mark Done",
        options: {
          isDestructive: false,
          isAuthenticationRequired: false,
          opensAppToForeground: false,
        },
      },
    ]);
  } catch {}
}

// Concurrent callers (e.g. first-launch onboarding racing a reminder save)
// must share one native permission request. Firing a second
// requestPermissionsAsync() while the first is still awaiting the user's
// response can resolve early with a stale status, causing the caller to
// treat permission as denied and silently skip scheduling.
let permissionRequestInFlight: Promise<boolean> | null = null;

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web" || !Notifications) return false;
  if (permissionRequestInFlight) return permissionRequestInFlight;
  permissionRequestInFlight = (async () => {
    try {
      await setupNotificationChannel();
      await setupSnoozeCategory(await getSnoozePreset());
      const { status } = await Notifications.requestPermissionsAsync();
      return status === "granted";
    } catch {
      return false;
    }
  })();
  try {
    return await permissionRequestInFlight;
  } finally {
    permissionRequestInFlight = null;
  }
}

// Sound and vibration are fully independent, so all four combinations map to
// their own channel. An earlier version returned "reminders-alarm" whenever
// sound was on, which silently made the vibration setting a no-op in its most
// common state — turning vibration off while sound was on did nothing.
//
// Vibration defaults to true so callers written before the setting existed
// keep the buzz rather than landing on a silent channel.
export function channelIdForAlarm(alarm: boolean, vibrate: boolean = true): string {
  if (alarm) return vibrate ? "reminders-alarm" : "reminders-alarm-novibrate";
  return vibrate ? "reminders-vibrate" : "reminders-silent";
}

export async function scheduleNotification(
  reminder: Pick<
    Reminder,
    "title" | "description" | "datetime" | "alarm" | "recipient"
  >,
  reminderId: string
): Promise<string | undefined> {
  if (!Notifications) return undefined;
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return undefined;
    const trigger = new Date(reminder.datetime);
    const now = new Date();
    if (trigger <= now) return undefined;
    const earlyTrigger = new Date(
      Math.max(now.getTime(), trigger.getTime() - ALARM_EARLY_OFFSET_MS)
    );
    const alarmOn = reminder.alarm !== false;
    const channelId = channelIdForAlarm(alarmOn, await getVibrationEnabled());
    // A send reminder says who to message. This wins over the description,
    // which is consent-gated and would otherwise bury the one fact that makes
    // the notification actionable from the lock screen.
    const body = isSendReminder(reminder as Reminder)
      ? `Message ${reminder.recipient!.name}`
      : await resolveNotificationBody(reminder.description);
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: reminder.title,
        body,
        sound: alarmOn,
        categoryIdentifier: SNOOZE_CATEGORY_ID,
        data: {
          reminderId,
          title: reminder.title,
          body,
          alarm: alarmOn,
          channelId,
        } satisfies NotificationData,
        ...(Platform.OS === "ios" && !alarmOn ? { sound: false } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: earlyTrigger,
        ...(Platform.OS === "android" ? { channelId } : {}),
      },
    });
    return id;
  } catch {
    return undefined;
  }
}

/**
 * Cancels every SCHEDULED notification carrying this reminderId, regardless of
 * whether its id matches the one stored on the reminder.
 *
 * Every other cancel path keys off the single notificationId held in
 * AsyncStorage, so if a second notification is ever scheduled for a reminder,
 * its id overwrites the first and that first one becomes an orphan nothing can
 * reach. This sweeps by payload instead, making such duplicates self-healing.
 * Only touches pending triggers — an already-delivered notification can't be
 * un-delivered, which is why the caller must also avoid creating one.
 */
export async function cancelScheduledForReminder(reminderId: string): Promise<void> {
  if (Platform.OS === "web" || !Notifications) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (!Array.isArray(scheduled)) return;
    for (const request of scheduled) {
      const data = request?.content?.data as NotificationData | undefined;
      if (data?.reminderId !== reminderId) continue;
      const identifier = request?.identifier;
      if (!identifier) continue;
      try {
        await Notifications.cancelScheduledNotificationAsync(identifier);
      } catch {}
    }
  } catch {}
}

export async function cancelNotification(
  notificationId?: string
): Promise<void> {
  if (!notificationId || Platform.OS === "web" || !Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {}
  // cancelScheduledNotificationAsync only prevents a pending trigger from
  // firing; a notification that's already been delivered and is sitting in
  // the tray (e.g. the one the user just tapped "Mark Done" on) needs to be
  // dismissed separately, or it lingers after the reminder is completed.
  try {
    await Notifications.dismissNotificationAsync(notificationId);
  } catch {}
}

export async function scheduleSnoozeNotification(
  data: NotificationData,
  target: Date
): Promise<string | undefined> {
  if (Platform.OS === "web" || !Notifications) return undefined;
  try {
    // Clamped like scheduleNotification: a DATE trigger in the past is
    // delivered immediately by expo-notifications, which for a target inside
    // the early-offset window would turn a snooze into an instant re-alert.
    const snoozeDate = new Date(
      Math.max(Date.now(), target.getTime() - ALARM_EARLY_OFFSET_MS)
    );
    // Read the name here rather than threading it through NotificationData:
    // the headless snooze path builds that payload from a notification that
    // may predate this feature, so a payload field would be missing exactly
    // when it is needed.
    const title = buildSnoozeTitle(await getUserName(), data.title);
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: data.body,
        sound: data.alarm,
        categoryIdentifier: SNOOZE_CATEGORY_ID,
        data,
        ...(Platform.OS === "ios" && !data.alarm ? { sound: false } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: snoozeDate,
        ...(Platform.OS === "android" ? { channelId: data.channelId } : {}),
      },
    });
    return id;
  } catch {
    return undefined;
  }
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

/**
 * Opens Android 12+'s "Special app access → Alarms & reminders" screen for
 * this app. sendIntent is the correct API here — openURL with the
 * "android.settings.REQUEST_SCHEDULE_EXACT_ALARM" action has no scheme so it
 * always throws; sendIntent launches the Android Intent by action name
 * directly. Falls back to generic app notification settings if unavailable.
 */
export function openExactAlarmSettings(): void {
  const sendIntent = (Linking as any).sendIntent as
    | ((action: string) => Promise<void>)
    | undefined;
  if (sendIntent) {
    sendIntent("android.settings.REQUEST_SCHEDULE_EXACT_ALARM").catch(() =>
      Linking.openSettings()
    );
  } else {
    Linking.openSettings();
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
  const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
  const notificationId = await scheduleNotification(data, id);
  const added: Reminder = {
    id,
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
  const notificationId = await scheduleNotification(data, id);
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

export async function snoozeReminder(
  current: Reminder[],
  id: string,
  preset: SnoozePreset
): Promise<Reminder[]> {
  const target = current.find((r) => r.id === id);
  if (!target) return current;
  // Sweep by payload as well as by the stored id: the stored id is the only
  // handle on ONE notification, so any orphan this reminder picked up would
  // otherwise stay armed and fire next to the snoozed copy.
  await cancelScheduledForReminder(id);
  await cancelNotification(target.notificationId);
  const alarmOn = target.alarm !== false;
  const body = await resolveNotificationBody(target.description);
  const snoozeTarget = resolveSnoozeTarget(preset, target.datetime, new Date());
  const notificationId = await scheduleSnoozeNotification(
    {
      reminderId: id,
      title: target.title,
      body,
      alarm: alarmOn,
      channelId: channelIdForAlarm(alarmOn, await getVibrationEnabled()),
    },
    snoozeTarget
  );
  const datetime = snoozeTarget.toISOString();
  const reminders = current.map((r) =>
    r.id === id ? { ...r, datetime, notificationId } : r
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
      // Notifications are scheduled ALARM_EARLY_OFFSET_MS before their
      // datetime, so a reminder inside that window has ALREADY been delivered
      // even though its datetime is still in the future. Rescheduling it here
      // cancels nothing — cancelScheduledNotificationAsync only stops a
      // pending trigger, it can't un-deliver a notification sitting in the
      // tray — and shows a second copy, while overwriting notificationId so
      // the first becomes an orphan nothing can cancel later.
      const deliveryTime = new Date(reminder.datetime).getTime() - ALARM_EARLY_OFFSET_MS;
      if (reminder.completed || deliveryTime <= now.getTime()) {
        return reminder;
      }
      // Cancel by payload, not just by the stored id: a reminder that already
      // picked up a duplicate has an orphan the stored id can't reach, and
      // this is the path that would otherwise re-arm it every 15 minutes.
      await cancelScheduledForReminder(reminder.id);
      await cancelNotification(reminder.notificationId);
      const notificationId = await scheduleNotification(reminder, reminder.id);
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

export async function loadReminderById(id: string): Promise<Reminder | undefined> {
  const reminders = await loadReminders();
  return reminders.find((r) => r.id === id);
}

export async function markDoneById(id: string): Promise<void> {
  const reminders = await loadReminders();
  const target = reminders.find((r) => r.id === id);
  if (!target) return;
  await cancelNotification(target.notificationId);
  const updated = reminders.map((r) =>
    r.id === id ? { ...r, completed: true, notificationId: undefined } : r
  );
  await saveReminders(updated);
}

export async function updateSnoozeById(
  id: string,
  datetime: string,
  notificationId: string | undefined
): Promise<void> {
  const reminders = await loadReminders();
  const target = reminders.find((r) => r.id === id);
  if (!target) return;
  const updated = reminders.map((r) =>
    r.id === id ? { ...r, datetime, notificationId } : r
  );
  await saveReminders(updated);
}

// --- Backup / restore -------------------------------------------------------
//
// Reminders live only in AsyncStorage, so a phone change or reinstall loses
// them all. That matters most for exactly the reminders users can least afford
// to lose — annual land tax, a passport expiring in ten years — which is why
// this is a manual export/import rather than waiting on cloud sync.

export async function buildBackupJson(): Promise<string> {
  const [
    reminders,
    defaultAlarmEnabled,
    showDescriptionEnabled,
    vibrationEnabled,
    dictationLanguage,
    snoozePreset,
  ] = await Promise.all([
    loadReminders(),
    getDefaultAlarmEnabled(),
    getShowDescriptionEnabled(),
    getVibrationEnabled(),
    getDictationLanguage(),
    getSnoozePreset(),
  ]);

  return serializeBackup(reminders, {
    defaultAlarmEnabled,
    showDescriptionEnabled,
    vibrationEnabled,
    dictationLanguage,
    snoozePreset,
  });
}

export type ImportResult =
  | { ok: true; added: number; duplicates: number; skipped: number }
  | { ok: false; reason: string };

export async function importRemindersFromJson(raw: string): Promise<ImportResult> {
  const parsed = parseBackup(raw);
  // Storage is not touched at all on a bad file — picking the wrong document
  // from the share sheet must be a no-op, not a partial import.
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const local = await loadReminders();
  const { reminders, added, duplicates } = mergeReminders(local, parsed.backup.reminders);
  await saveReminders(reminders);

  // Imported reminders carry no notificationId (export strips it, and a
  // foreign device's id means nothing here), so nothing is scheduled yet.
  // rescheduleAllFutureReminders arms every future one and correctly skips
  // completed and already-past reminders.
  await rescheduleAllFutureReminders();

  const settings = parsed.backup.settings;
  if (settings.defaultAlarmEnabled !== undefined) {
    await setDefaultAlarmEnabled(settings.defaultAlarmEnabled);
  }
  if (settings.showDescriptionEnabled !== undefined) {
    await setShowDescriptionEnabled(settings.showDescriptionEnabled);
  }
  if (settings.vibrationEnabled !== undefined) {
    await setVibrationEnabled(settings.vibrationEnabled);
  }
  if (settings.dictationLanguage !== undefined) {
    await setDictationLanguage(settings.dictationLanguage);
  }
  if (settings.snoozePreset !== undefined && isSnoozePreset(settings.snoozePreset)) {
    await setSnoozePreset(settings.snoozePreset);
  }

  return { ok: true, added, duplicates, skipped: parsed.skipped };
}
