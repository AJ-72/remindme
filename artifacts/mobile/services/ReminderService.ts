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
import { DEFAULT_QUIET_HOURS, type QuietHours } from "@/utils/quietHours";

import { EVENTS } from "@/constants/analytics";
import { track } from "@/services/AnalyticsService";
import {
  mergeReminders,
  parseBackup,
  serializeBackup,
} from "@/utils/reminderBackup";
import { computeNthOccurrence, type RecurrenceRule } from "@/utils/recurrence";

export type { SnoozePreset };
export type { QuietHours };

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
export const DEFAULT_EXACT_TIMING_KEY = "@default_exact_timing_v1";
export const SHOW_DESCRIPTION_KEY = "@show_description_v1";
export const DICTATION_LANGUAGE_KEY = "@dictation_language_v1";
export const VIBRATION_KEY = "@vibration_v1";
/**
 * How many times this install has put the system notification dialog in front
 * of the user. Capped by MAX_NOTIF_PROMPTS: Android only honours the first
 * two requests anyway, and a third refusal is an answer, not an accident.
 */
export const NOTIF_PROMPT_COUNT_KEY = "@notif_prompt_count_v1";
export const MAX_NOTIF_PROMPTS = 3;
export const REGISTERED_PHONE_KEY = "@registered_phone_v1";
/**
 * How many times this install has offered to register the user's own phone
 * number. The offer only appears where it is earned - after the user sends a
 * reminder to somebody else, which is the first moment being reachable back
 * means anything - and MAX_REGISTER_PROMPTS stops it becoming a fixture.
 */
export const REGISTER_PROMPT_COUNT_KEY = "@register_prompt_count_v1";
export const MAX_REGISTER_PROMPTS = 2;
export const MIC_LANGUAGE_LINE_KEY = "@mic_language_line_seen_v1";
export const INVITE_NAME_ASK_KEY = "@invite_name_ask_v1";
export const SNOOZE_PRESET_KEY = "@snooze_preset_v1";
/**
 * Corrupt reminder payloads are copied here rather than discarded. AsyncStorage
 * holds the ONLY copy of a user's reminders - no backend, manual backup - so a
 * parse failure that returns [] would otherwise be laundered into permanent
 * data loss by the very next write.
 */
export const QUARANTINE_KEY_PREFIX = "@reminders_corrupt_";
export const QUIET_HOURS_KEY = "@quiet_hours_v1";
export const USER_NAME_KEY = "@user_name_v1";
// Its own key on purpose: no other onboarding flow completing may mark the
// name prompt done, or a user who granted permissions before this feature
// existed would never be asked their name.
export const NAME_PROMPT_KEY = "@name_prompt_v1";
// Its own key too, for the same reason as NAME_PROMPT_KEY: a user who
// installed before the feature tour existed should still see it once, not
// have it silently marked seen by some other onboarding flag settling.
export const FEATURE_TOUR_KEY = "@feature_tour_v1";
export const SNOOZE_CATEGORY_ID = "REMINDER_SNOOZE";
export const SNOOZE_ACTION_ID = "SNOOZE_ACTION";
// Pre-B5 value. A notification already posted to the tray before the upgrade
// keeps this id on its Snooze button (Android never rebuilds a posted
// notification), so the handler must still accept it. Drop after one release.
export const LEGACY_SNOOZE_ACTION_ID = "SNOOZE_10";
// Opens the app to the snooze sheet instead of snoozing directly. Android
// notification actions can't show a sub-menu, so the full preset list is only
// reachable in-app.
export const SNOOZE_MORE_ACTION_ID = "SNOOZE_MORE";
export const MARK_DONE_ACTION_ID = "MARK_DONE";

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
  /**
   * Cached reachability (T3.5). Derived, never a durable fact - see
   * isReachabilityStale() in RecipientLookupService.ts. Absent means "never
   * checked", not "no app".
   */
  appUserId?: string | null;
  /** When appUserId was last determined. Paired with appUserId; check
   * isReachabilityStale() before trusting either without re-checking. */
  lookedUpAt?: string;
}

export interface Reminder {
  id: string;
  title: string;
  description: string;
  datetime: string;
  completed: boolean;
  notificationId?: string;
  alarm?: boolean;
  /**
   * Whether this reminder gets a punctual (alarm-clock-backed) native trigger.
   * `undefined` means on -- the same defensive default as `alarm`, so every
   * record predating this field keeps working with no migration.
   */
  exactTiming?: boolean;
  recipient?: ReminderRecipient;
  /** When the reminder was created. Absent on records predating instrumentation. */
  createdAt?: string;
  /** When it was marked done. Cleared when un-completed. */
  completedAt?: string;
  /** Deliberate postponements. Never reset - this is the avoidance signal. */
  snoozeCount?: number;
  /**
   * The FIRST datetime this reminder ever had, set once on first snooze.
   * `datetime` is overwritten by each snooze, so without this the distance a
   * task has slid from its original intent is unrecoverable.
   */
  originalDatetime?: string;
  /**
   * Set only on a reminder created by accepting a Tier 2 invitation
   * (invitation-preview.tsx) - the sender's display name, resolved at
   * accept time via get_sender_display_name() (already falls back to
   * "Someone" there if unset). Presence of this field, not just senderId,
   * is what ReminderCard uses to badge a reminder as "from someone else" -
   * see isReceivedReminder() below.
   */
  senderName?: string;
  /** The sender's app user id, paired with senderName. Local-only context;
   * never sent anywhere - see invitation-preview.tsx for where it's read. */
  senderId?: string;
  /**
   * Set only on the SENDER's own local copy of a send-reminder (never on the
   * recipient's accepted copy, which has no reason to reference the row it
   * came from). Lets an incoming `invitation_time_changed` push find the
   * right local reminder to update - see
   * applyRecipientTimeChangeByInvitationId() below and
   * QuickAddInput.tsx#performSave, which is the only place this gets set.
   */
  invitationId?: string;
  /**
   * Present only when the recipient moved this reminder's time on accept
   * (see respond-invitation's push and notificationResponseHandler.ts).
   * Rendered as a note on the sender's own card/detail screen so the new
   * time doesn't look unexplained - see ReminderCard.tsx/reminder-detail.tsx.
   */
  recipientTimeChange?: {
    from: string;
    to: string;
    by: string;
  };
  /**
   * Each deliberate postponement, in the order it happened: when, and how far
   * it was pushed. `snoozeCount` alone says a task was avoided three times;
   * this says whether that was three 5-minute nudges or three full days,
   * which is a different task. Capped at MAX_SNOOZE_HISTORY_ENTRIES, oldest
   * dropped first - the recent pattern is what matters, and an uncapped
   * array on a reminder someone reschedules for months is unbounded growth
   * for no benefit past a certain point.
   */
  snoozeHistory?: { at: string; minutes: number }[];
  /**
   * When a scheduled notification for this reminder last actually reached
   * the device, stamped by NotificationResponseHandler's received listener.
   * This is NOT the same question as "is it due" (`datetime`) - a delivered
   * notification the user never acted on is what "missed" actually means,
   * versus a reminder that simply has not come due yet.
   *
   * Real limitation, not a bug: `addNotificationReceivedListener` only fires
   * while the app process is alive. A notification delivered to a fully
   * killed app's tray is real but goes unrecorded here - this stamp is
   * evidence the notification fired, not proof it's the only time it did.
   */
  notifiedAt?: string;
  /** When the user last opened this reminder's own detail screen. Distinct
   * from acting on it (`completedAt`/a snooze in `snoozeHistory`) - this
   * alone means "looked at it", which a snooze or completion doesn't need to
   * have happened for. */
  openedAt?: string;
  /**
   * Present only on a recurring reminder. Absent means one-shot - no
   * migration needed, every existing record predating M2 simply has no
   * recurrence and behaves exactly as before. See advanceRecurringReminder()
   * below for how a recurring reminder moves to its next occurrence.
   */
  recurrence?: RecurrenceRule;
  /**
   * The series' standing schedule: what "every day at 8" actually means.
   * Set when a recurrence rule is attached; NEVER moved by a snooze (a
   * snooze defers one occurrence, it does not restate the schedule) - only
   * by a deliberate time edit, which IS the user restating the schedule.
   * advanceRecurringReminder() computes the next occurrence from this, not
   * from `datetime`, which snooze overwrites - otherwise one two-hour
   * snooze of "every day at 8" would silently convert the series to a
   * standing 10am reminder.
   */
  recurrenceAnchor?: string;
  /**
   * Occurrences of a recurring series completed on time, tallied as each one
   * advances. A recurring reminder's CURRENT record is always `pending` by
   * `outcomeOf`'s definition (it always has a next occurrence sitting in the
   * future) - without this, a perfectly-kept daily habit would score zero
   * completions forever. See adherenceStats.ts.
   */
  occurrencesCompleted?: number;
  /** Occurrences of a recurring series that went unactioned, tallied the
   * same way and for the same reason as occurrencesCompleted above. */
  occurrencesMissed?: number;
  /**
   * Snoozes on the CURRENT occurrence only, reset to 0 on each advance.
   * `stuck` (adherenceStats.ts) reads THIS, not the series-wide
   * `snoozeCount` above - three snoozes spread across three separate days of
   * a daily reminder is normal and must not read as one task avoided three
   * times in a row. `snoozeCount` keeps its own meaning unchanged (the
   * series-wide avoidance signal M9 reads); this is a second, narrower
   * counter, not a replacement.
   */
  currentOccurrenceSnoozes?: number;
}

/**
 * Single definition of "is this a reminder someone else sent me", mirroring
 * isSendReminder() below for the opposite direction (B13) - used by the home
 * screen and ReminderCard so both agree on what counts as "received".
 */
export function isReceivedReminder(r: Reminder): boolean {
  return !!r.senderName;
}

/**
 * Single definition of "is this a send reminder", used by every consumer.
 * A recipient carrying no usable phone must behave as a normal reminder -
 * otherwise the send screen renders with a dead Send button.
 */
export function isSendReminder(r: Reminder): boolean {
  return !!r.recipient?.phone?.trim();
}

/**
 * Single definition of "is this reminder recurring", mirroring
 * isSendReminder/isReceivedReminder above so every consumer agrees.
 */
export function isRecurring(r: Reminder): boolean {
  return !!r.recurrence;
}

/** Bounds the catch-up loop in advanceRecurringReminder() below so a
 * pathological rule (e.g. an interval that somehow yields near-zero
 * progress) cannot hang the app trying to catch up to "now". */
const MAX_ADVANCE_ITERATIONS = 10000;

/**
 * The reminder advanced to its next future occurrence, or null if it isn't
 * recurring, has nothing to advance to yet, or the catch-up loop exhausts
 * MAX_ADVANCE_ITERATIONS without reaching a strictly-future occurrence (see
 * the cap-exhaustion comment inline below - not reachable via any real rule
 * today, but a rule could arrive from an external source in a later task).
 *
 * Pure and synchronous - no I/O, no write lock. Callers (Task 5) are
 * responsible for wrapping any actual load/save around this inside
 * withWriteLock(), matching the pattern markNotifiedById() etc. use below.
 *
 * Catches up past MULTIPLE missed occurrences: a phone that was off for
 * three days must land on the next FUTURE occurrence, not three days ago -
 * so this calls computeNthOccurrence() with a growing period count, from the
 * reminder's own recurrenceAnchor, until the result is strictly after `now`,
 * rather than advancing just once.
 *
 * `snoozeCount`/`snoozeHistory` are deliberately preserved across
 * occurrences, not reset - they are the series-level avoidance signal (M9's
 * dread-override reads them), not a per-occurrence counter. It is `stuck`'s
 * use of snoozeCount that conflates the two; Task 5b fixes that by adding a
 * separate `currentOccurrenceSnoozes` rather than changing what this field
 * means here. Do not "fix" this by resetting snoozeCount - both statements
 * (series-level persists; per-occurrence tracking is a distinct, separate
 * field) are correct at once, for different consumers.
 */
export function advanceRecurringReminder(r: Reminder, now: Date): Reminder | null {
  if (!r.recurrence) return null;

  const currentDue = new Date(r.datetime);
  if (Number.isFinite(currentDue.getTime()) && currentDue.getTime() > now.getTime()) {
    // Still in the future - nothing to advance to.
    return null;
  }

  // Compute from the series' standing anchor, NEVER from `datetime` - a
  // snooze overwrites `datetime` for that occurrence only, and computing
  // from it here would silently convert the whole series to the snoozed
  // time forever. `recurrenceAnchor` may be absent on a record from before
  // this field existed; `datetime` is the correct fallback for that legacy
  // case specifically (it has never been snoozed, so it IS the anchor).
  const anchor = new Date(r.recurrenceAnchor ?? r.datetime);

  // Each candidate is computed FRESH from `anchor` via computeNthOccurrence
  // (periods=1, 2, 3, ...), never by chaining computeNextOccurrence from the
  // previous candidate. Chaining would compound a monthly/yearly day-of-month
  // clamp: a Jan-31 monthly reminder catching up after being past-due for
  // several months would clamp Jan 31 -> Feb 28, then compute March from that
  // already-clamped Feb 28 -> Mar 28, permanently losing the 31st instead of
  // correctly landing back on Mar 31/Apr 30. Recomputing from the anchor each
  // time clamps at most once, from the day the user actually set. See
  // computeNthOccurrence's own doc comment.
  let periods = 1;
  let next = computeNthOccurrence(r.recurrence, anchor, periods);
  let iterations = 0;
  while (next.getTime() <= now.getTime() && iterations < MAX_ADVANCE_ITERATIONS) {
    periods += 1;
    next = computeNthOccurrence(r.recurrence, anchor, periods);
    iterations += 1;
  }

  // Not reachable through any real RecurrenceRule today - normalizeInput()
  // in recurrence.ts floors `interval` to >= 1 and every addX() helper
  // advances by at least one day, so computeNextOccurrence always makes
  // strictly-forward progress. This is defense in depth, not dead code:
  // Task 5c will feed rules parsed from an external Tier 2 invitation
  // payload through this same path, so "the rule made no progress" must
  // fail safely rather than silently return a still-past-due occurrence
  // dressed up as a valid result (per-occurrence fields already reset,
  // looking like a fresh future reminder while actually stuck in the past).
  if (next.getTime() <= now.getTime()) {
    return null;
  }

  return {
    ...r,
    datetime: next.toISOString(),
    // Per-occurrence state resets: a new occurrence has not been notified,
    // opened, or completed yet.
    completed: false,
    completedAt: undefined,
    notificationId: undefined,
    notifiedAt: undefined,
    openedAt: undefined,
    // Tally the RETIRING occurrence's outcome onto the record before
    // resetting to a fresh, always-pending-by-construction next occurrence.
    // Without this, `outcomeOf` (adherenceStats.ts) reads every advanced
    // record as `pending` forever, and a perfectly-kept daily habit
    // contributes zero completions to any adherence number - proved by a
    // probe against the real computeAdherenceStats before this existed.
    occurrencesCompleted: r.completed
      ? (r.occurrencesCompleted ?? 0) + 1
      : r.occurrencesCompleted,
    occurrencesMissed: !r.completed
      ? (r.occurrencesMissed ?? 0) + 1
      : r.occurrencesMissed,
    // Per-occurrence snooze count resets to 0 - `stuck` reads THIS field,
    // not the series-wide snoozeCount below, specifically so snoozes spread
    // across separate days of a recurring reminder don't permanently read
    // as one task avoided repeatedly in a row.
    currentOccurrenceSnoozes: 0,
    // Everything else (snoozeCount, snoozeHistory, originalDatetime,
    // createdAt, recurrence, recurrenceAnchor, recipient/senderName, etc.)
    // is preserved via the spread above - series-level state, not
    // per-occurrence state. recurrenceAnchor in particular must NOT move
    // here - only a deliberate time edit moves it (see its own doc comment
    // on Reminder), never an advance.
  };
}

export interface NotificationData {
  reminderId: string;
  title: string;
  body: string;
  alarm: boolean;
  exactTiming: boolean;
  channelId: string;
}

export type DictationLanguage = "en-US" | "ml-IN";

export async function loadReminders(): Promise<Reminder[]> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage itself is unavailable; there is nothing to quarantine.
    return [];
  }
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Reminder[];
  } catch {}

  // Unreadable, or readable but not an array. Preserve it before any caller
  // can overwrite the slot, then present as empty so the app still starts.
  await quarantineCorruptStore(raw);
  return [];
}

async function quarantineCorruptStore(raw: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    // One quarantine per corrupt payload. Re-reading the same bad value on
    // every launch must not spawn a new copy each time and fill storage.
    for (const key of keys) {
      if (!key.startsWith(QUARANTINE_KEY_PREFIX)) continue;
      if ((await AsyncStorage.getItem(key)) === raw) return;
    }
    await AsyncStorage.setItem(`${QUARANTINE_KEY_PREFIX}${Date.now()}`, raw);
  } catch {
    // Best effort. A failed quarantine must not stop the app from loading.
  }
}

export async function saveReminders(reminders: Reminder[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
}

/**
 * Serializes a "load the full array, mutate one reminder, save the full
 * array" cycle against every other one queued through here.
 *
 * Real bug this closes: `rescheduleAllFutureReminders()` (run once at app
 * mount) and a by-id stamp like `markOpenedById` (run when a screen mounts)
 * each do their own independent load-then-save. Nothing stopped them
 * overlapping - both read the same pre-write snapshot, and whichever
 * finished saving LAST won, silently discarding the other's change. This is
 * not theoretical: tapping a reminder notification from a fully killed app
 * cold-starts straight into reminder-detail, mounting alongside the
 * provider's own mount-time reschedule sweep - exactly this race.
 *
 * Not yet applied to every writer in this file (addReminder, editReminder,
 * deleteReminder(s), toggleComplete, snoozeReminder, updateSnoozeById) -
 * those predate this queue and share the same class of risk in theory, but
 * none of them run at the specific moment `rescheduleAllFutureReminders`
 * does, which is what made this one observable. Widening the queue to cover
 * all of them is future work, not assumed to already be covered here.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task);
  // Swallow so one failed task doesn't permanently wedge the queue for
  // everything queued after it.
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
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

/** Whether the first-launch feature tour has been shown (finished OR skipped). */
export async function hasSeenFeatureTour(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FEATURE_TOUR_KEY)) !== null;
  } catch {
    // Same reasoning as hasSeenNamePrompt: treat a storage failure as
    // "already seen" rather than re-showing the tour on every cold start.
    return true;
  }
}

export async function markFeatureTourSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(FEATURE_TOUR_KEY, "1");
  } catch {}
}

function isQuietHours(value: unknown): value is QuietHours {
  if (typeof value !== "object" || value === null) return false;
  const q = value as Partial<QuietHours>;
  return (
    typeof q.startMinute === "number" &&
    typeof q.endMinute === "number" &&
    Number.isInteger(q.startMinute) &&
    Number.isInteger(q.endMinute) &&
    q.startMinute >= 0 &&
    q.startMinute < 1440 &&
    q.endMinute >= 0 &&
    q.endMinute < 1440
  );
}

export async function getQuietHours(): Promise<QuietHours> {
  try {
    const raw = await AsyncStorage.getItem(QUIET_HOURS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // A corrupt or out-of-range value must not be able to wedge scheduling.
      if (isQuietHours(parsed)) return parsed;
    }
  } catch {}
  return DEFAULT_QUIET_HOURS;
}

export async function setQuietHours(window: QuietHours): Promise<void> {
  await AsyncStorage.setItem(QUIET_HOURS_KEY, JSON.stringify(window));
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

/**
 * Whether NEW reminders default to punctual delivery. Defaults ON: an
 * unpunctual reminder is a broken reminder, and the cost of the setting is a
 * status-bar alarm icon the user can turn off if it bothers them.
 */
export async function getDefaultExactTimingEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(DEFAULT_EXACT_TIMING_KEY);
    if (raw !== null) return JSON.parse(raw) as boolean;
  } catch {}
  return true;
}

export async function setDefaultExactTimingEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(DEFAULT_EXACT_TIMING_KEY, JSON.stringify(enabled));
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

/** See Reminder.snoozeHistory. */
export const MAX_SNOOZE_HISTORY_ENTRIES = 20;

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

export async function getNotifPromptCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_PROMPT_COUNT_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function incrementNotifPromptCount(): Promise<number> {
  const next = (await getNotifPromptCount()) + 1;
  try {
    await AsyncStorage.setItem(NOTIF_PROMPT_COUNT_KEY, String(next));
  } catch {}
  return next;
}

export async function getRegisterPromptCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(REGISTER_PROMPT_COUNT_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function incrementRegisterPromptCount(): Promise<number> {
  const next = (await getRegisterPromptCount()) + 1;
  try {
    await AsyncStorage.setItem(REGISTER_PROMPT_COUNT_KEY, String(next));
  } catch {}
  return next;
}

/**
 * The name ask an invited install owes, and who is waiting to read it.
 *
 * An invited install meets the app through somebody else's reminder, so the
 * first-launch name sheet is exactly the wrong thing to put in front of it -
 * the invitation is the reason they opened the app. The ask moves to the
 * home screen behind Accept, where it can name the person who will actually
 * see the answer, which is the only argument for typing a name at all.
 *
 * The value is the sender's display name. It is cleared by answering OR by
 * skipping: this is one ask, not a standing banner.
 */
export async function getPendingInviteNameAsk(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(INVITE_NAME_ASK_KEY);
  } catch {
    return null;
  }
}

export async function setPendingInviteNameAsk(senderName: string): Promise<void> {
  try {
    await AsyncStorage.setItem(INVITE_NAME_ASK_KEY, senderName);
  } catch {
    // The ask is a courtesy. Losing it costs the user nothing.
  }
}

export async function clearPendingInviteNameAsk(): Promise<void> {
  try {
    await AsyncStorage.removeItem(INVITE_NAME_ASK_KEY);
  } catch {}
}

/**
 * Whether to say, on this mic session, which languages the mic takes.
 *
 * The app recognises Malayalam as well as English, and nothing on screen has
 * ever said so - the setting is in Settings, which is the one place a user
 * with a reminder to dictate is not looking. The first open microphone is
 * where that sentence costs nothing and answers a question the user is
 * already holding, so it is said exactly once per install.
 */
export async function shouldShowMicLanguageLine(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(MIC_LANGUAGE_LINE_KEY)) === null;
  } catch {
    // Unreadable storage must not cost the user their dictation. Staying
    // silent repeats nothing; showing it again would.
    return false;
  }
}

export async function markMicLanguageLineSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(MIC_LANGUAGE_LINE_KEY, "1");
  } catch {
    // Worst case the line appears on one more mic tap.
  }
}

/**
 * Whether to offer registration at all.
 *
 * Two reasons not to: the number is already registered, so there is nothing
 * to ask for; or the offer has been made its full number of times and refused,
 * which is an answer.
 */
export async function shouldOfferNumberRegistration(): Promise<boolean> {
  if (registerPromptShownThisSession) return false;
  if (await getRegisteredPhone()) return false;
  return (await getRegisterPromptCount()) < MAX_REGISTER_PROMPTS;
}

/**
 * Two surfaces can reach the same offer in one run of the app - a reminder
 * aimed at somebody else, and the third reminder saved - and two asks in one
 * sitting read as nagging however well each one is placed on its own. This
 * flag is deliberately in memory rather than in AsyncStorage: "this session"
 * ends when the process does, and a persisted flag would silence the offer
 * for good the first time it was set.
 */
let registerPromptShownThisSession = false;

export function markRegisterPromptShown(): void {
  registerPromptShownThisSession = true;
}

/** Test seam. The app itself never needs to un-show an offer. */
export function resetRegisterPromptSession(): void {
  registerPromptShownThisSession = false;
}

/**
 * The phone number this device most recently registered/bound successfully
 * (B10). Persisted locally purely to drive the UI's "already registered,
 * remove first" guard in register-number.tsx — the server row remains the
 * actual source of truth for whether the number is bound.
 */
export async function getRegisteredPhone(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(REGISTERED_PHONE_KEY);
  } catch {
    return null;
  }
}

export async function setRegisteredPhone(phoneE164: string): Promise<void> {
  await AsyncStorage.setItem(REGISTERED_PHONE_KEY, phoneE164);
}

export async function clearRegisteredPhone(): Promise<void> {
  await AsyncStorage.removeItem(REGISTERED_PHONE_KEY);
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
      lightColor: "#E85C3C",
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
      lightColor: "#E85C3C",
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

/**
 * What the OS currently thinks, with no dialog shown.
 *
 * `canAskAgain === false` is the state nothing in this app used to read: the
 * user has refused permanently, every further request resolves instantly as
 * denied, and any button wired to a request silently does nothing. Callers
 * must send that user to system settings instead.
 */
export interface NotificationPermissionState {
  granted: boolean;
  canAskAgain: boolean;
}

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  if (Platform.OS === "web" || !Notifications) {
    return { granted: false, canAskAgain: false };
  }
  try {
    const res = await Notifications.getPermissionsAsync();
    return {
      granted: res?.status === "granted",
      // Older expo-notifications versions omit the field. Treat a missing
      // value as "may ask" - a wrongly suppressed dialog is worse than one
      // extra request the OS will drop on the floor.
      canAskAgain: res?.canAskAgain !== false,
    };
  } catch {
    return { granted: false, canAskAgain: false };
  }
}

/**
 * The notification ladder. This is the only function a save path should call.
 *
 * Rung 1: already granted - nothing to do.
 * Rung 2: may still ask, and this install has asked fewer than
 *         MAX_NOTIF_PROMPTS times - show the system dialog and count it.
 * Rung 3: refused permanently, or the cap is spent - do not ask. The caller
 *         surfaces a repair path (openAppSettings) instead of a dialog the
 *         user will never see.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const state = await getNotificationPermissionState();
  if (state.granted) return true;
  if (!state.canAskAgain) {
    // Not the same as a refusal just now: this user said no permanently, some
    // time ago, and the app is silently useless for them until they go into
    // system settings. Counted separately because the fix is different.
    track(EVENTS.PERMISSION_RESULT, { permission: "notifications", outcome: "blocked" });
    return false;
  }
  if ((await getNotifPromptCount()) >= MAX_NOTIF_PROMPTS) {
    track(EVENTS.PERMISSION_RESULT, { permission: "notifications", outcome: "ask_capped" });
    return false;
  }
  await incrementNotifPromptCount();
  const granted = await requestNotificationPermissions();
  track(EVENTS.PERMISSION_RESULT, {
    permission: "notifications",
    outcome: granted ? "granted" : "denied",
  });
  return granted;
}

/**
 * The app's own page in Android/iOS settings - the only way back for a user
 * who refused permanently.
 */
export function openAppSettings(): void {
  try {
    Linking.openSettings();
  } catch {}
}

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
    "title" | "description" | "datetime" | "alarm" | "exactTiming" | "recipient"
  >,
  reminderId: string
): Promise<string | undefined> {
  if (!Notifications) return undefined;
  try {
    // Order matters. A reminder whose time has already passed schedules
    // nothing, so asking for permission first would spend one of the three
    // prompts on a reminder that cannot ring either way - the same empty ask
    // that was removed from cold launch. The banner on the home screen is the
    // route for that user.
    const trigger = new Date(reminder.datetime);
    const now = new Date();
    if (trigger <= now) return undefined;
    // The ladder, not a raw request: a user who refused permanently must not
    // be handed a dialog the OS will never show.
    const granted = await ensureNotificationPermission();
    if (!granted) return undefined;
    const alarmOn = reminder.alarm !== false;
    const exactOn = reminder.exactTiming !== false;
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
          exactTiming: exactOn,
          channelId,
        } satisfies NotificationData,
        ...(Platform.OS === "ios" && !alarmOn ? { sound: false } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: trigger,
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
    // delivered immediately by expo-notifications, which would turn a snooze
    // into an instant re-alert.
    const snoozeDate = new Date(Math.max(Date.now(), target.getTime()));
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
        // A payload built before exactTiming existed has it undefined; the
        // native side reads it with a default of true, so re-emitting it
        // unchanged keeps such a snooze punctual rather than silently
        // demoting it.
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
    createdAt: new Date().toISOString(),
    // A newly-created recurring reminder's anchor IS its own datetime - the
    // UI never has to know recurrenceAnchor exists, it just sets
    // `recurrence` and the standing schedule is derived from where the
    // reminder was actually set. Absent for a non-recurring reminder.
    recurrenceAnchor: data.recurrence ? data.datetime : undefined,
  };
  const reminders = [added, ...current];
  await saveReminders(reminders);
  return { reminders, added };
}

export async function editReminder(
  current: Reminder[],
  id: string,
  data: Omit<Reminder, "id" | "completed" | "notificationId">,
  options: { moveAnchor?: boolean } = {}
): Promise<Reminder[]> {
  const old = current.find((r) => r.id === id);
  // Sweeps by payload AND cancels by stored id, like rearmReminder - a
  // reminder that picked up an orphan notification (e.g. a snooze whose
  // write hadn't landed in the copy this edit started from) has a pending
  // trigger the stored id alone can't reach, which would otherwise survive
  // this edit and fire alongside - or instead of - the newly scheduled one.
  await cancelScheduledForReminder(id);
  await cancelNotification(old?.notificationId);
  const notificationId = await scheduleNotification(data, id);
  const reminders = current.map((r) => {
    if (r.id !== id) return r;
    // `{ ...r, ...data }` alone can never CLEAR a field: when the caller
    // omits an optional key (the same "absent means unset" convention
    // addReminder documents for `recipient`), spreading `data` on top of `r`
    // leaves r's own old value untouched, since there is nothing in `data`
    // to overwrite it with. editReminder's contract is a full-replacement
    // payload (unlike addReminder's fresh object), so clearing an
    // already-set recipient or recurrence needs an explicit reset here, not
    // just the spread. Found via the recurrence "clear to Doesn't repeat"
    // case, then confirmed to be the identical pre-existing bug for
    // recipient (clearing an existing recipient and saving silently kept
    // the old one) - fixed for both.
    const recipientPatch = "recipient" in data ? { recipient: data.recipient } : { recipient: undefined };
    if (!data.recurrence) {
      // "Doesn't repeat" was chosen (or recurrence was never set) - no
      // anchor to carry, regardless of moveAnchor.
      return {
        ...r,
        ...data,
        ...recipientPatch,
        notificationId,
        recurrence: undefined,
        recurrenceAnchor: undefined,
      };
    }
    // Default is FALSE, deliberately, not "moves whenever datetime
    // changes": editReminder is called from more than one place, and only
    // an explicit, deliberate schedule restatement (the add-reminder Save
    // button) should move the standing anchor. Other callers (e.g. the
    // "move to your strongest hour" nudge on a recurring reminder) change
    // `datetime` for reasons closer to a snooze - one occurrence, not the
    // whole series - and must pass moveAnchor: false (the default) or
    // explicitly ask the user first.
    const recurrenceAnchor = options.moveAnchor
      ? data.datetime
      : r.recurrenceAnchor ?? data.datetime;
    return { ...r, ...data, ...recipientPatch, notificationId, recurrenceAnchor };
  });
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

// Batch delete (e.g. "clear all completed"): cancels every affected
// notification, then writes the result in one saveReminders call rather than
// one per id — a "delete all completed" that instead called deleteReminder in
// a loop would serialize N separate AsyncStorage writes for no benefit, since
// they all resolve to the same final list.
export async function deleteReminders(
  current: Reminder[],
  ids: string[]
): Promise<Reminder[]> {
  const idSet = new Set(ids);
  const targets = current.filter((r) => idSet.has(r.id));
  await Promise.all(targets.map((r) => cancelNotification(r.notificationId)));
  const reminders = current.filter((r) => !idSet.has(r.id));
  await saveReminders(reminders);
  return reminders;
}

/**
 * B22: removes the CURRENTLY SHOWING occurrence of a recurring reminder
 * from the schedule WITHOUT ending the series and WITHOUT tallying an
 * outcome - unlike completeOccurrence (Mark Done), a skipped occurrence
 * was neither completed nor missed, it was deliberately taken off the
 * calendar.
 *
 * Reuses advanceRecurringReminder for the anchor-based catch-up math
 * completeOccurrence relies on, but NOT with the real current time: that
 * function's guard treats a still-future `datetime` as "nothing to
 * advance to yet" (correct for its own caller, the past-due catch-up
 * sweep), whereas "skip" must advance past the current occurrence
 * whether it's overdue or still ahead - the user is looking at it right
 * now, on the detail/list screen, asking to remove exactly this one.
 * Passing the reminder's own `datetime` as `now` satisfies that guard
 * (currentDue > now is then false) while leaving the anchor-based
 * catch-up loop itself untouched, so a reminder that's ALSO several
 * periods stale still lands correctly on the next strictly-future
 * occurrence rather than the one right after the current (already-past)
 * datetime.
 *
 * Falls back to a full deleteReminder when there's nothing to advance to:
 * a non-recurring reminder (advanceRecurringReminder returns null by
 * definition), or a recurring one whose catch-up loop is exhausted
 * (MAX_ADVANCE_ITERATIONS) - in both cases there is no "next occurrence"
 * to leave behind, so skipping degrades to deleting rather than leaving
 * the reminder stuck.
 */
export async function skipOccurrence(
  current: Reminder[],
  id: string
): Promise<Reminder[]> {
  const target = current.find((r) => r.id === id);
  if (!target) return current;

  const asOfCurrentOccurrence = new Date(target.datetime);
  const now = new Date();
  const advanceFrom = asOfCurrentOccurrence.getTime() > now.getTime() ? asOfCurrentOccurrence : now;
  const advanced = advanceRecurringReminder(target, advanceFrom);
  if (!advanced) return deleteReminder(current, id);

  await cancelNotification(target.notificationId);
  const untallied: Reminder = {
    ...advanced,
    occurrencesCompleted: target.occurrencesCompleted,
    occurrencesMissed: target.occurrencesMissed,
  };
  const notificationId = await rearmReminder(untallied, {
    schedule: () => scheduleNotification(untallied, id),
  });
  const reminders = current.map((r) =>
    r.id === id ? { ...untallied, notificationId } : r
  );
  await saveReminders(reminders);
  return reminders;
}

/**
 * The one place that cancels a reminder's existing notification(s) and
 * schedules its replacement. Every caller that needs to re-arm a reminder —
 * un-completing it, snoozing it, a bulk reschedule sweep, a retroactive
 * alarm-default rewrite — goes through this, so the sweep-by-payload
 * discipline and the guard live in one place instead of being re-derived
 * (and drifting) at each call site.
 *
 * Always sweeps by payload AND cancels by stored id before scheduling: a
 * reminder that picked up an orphan notification has a pending trigger the
 * stored id alone can't reach, which would otherwise fire alongside the
 * newly scheduled copy. See cancelScheduledForReminder's own doc comment.
 *
 * `guard` decides whether to schedule at all — the default,
 * `isPendingForAlarmRewrite`-shaped ("not completed, still in the future"),
 * covers every call site including snooze: a reminder snoozed to a time
 * that's already passed by the time this runs should end up unscheduled and
 * overdue, the same as un-completing a past-due reminder, rather than
 * silently registering a notification that will never usefully fire.
 * `schedule` produces the new notificationId; callers differ only in WHAT
 * they schedule (a plain reminder vs. a snooze payload), never in the
 * cancel/guard machinery around it.
 *
 * Returns the new notificationId, or undefined if the guard rejected the
 * re-arm or scheduling itself declined (e.g. a past trigger).
 */
async function rearmReminder(
  reminder: Reminder,
  options: {
    guard?: (reminder: Reminder, now: number) => boolean;
    schedule: () => Promise<string | undefined>;
  }
): Promise<string | undefined> {
  const guard = options.guard ?? isPendingForAlarmRewrite;
  if (!guard(reminder, Date.now())) return undefined;
  await cancelScheduledForReminder(reminder.id);
  await cancelNotification(reminder.notificationId);
  return options.schedule();
}

/**
 * The single decision for "what happens when this reminder is marked
 * done", shared by toggleComplete (list-based, in-app) and markDoneById
 * (by-id, notification-tray action) so a user gets the same result from
 * either path.
 *
 * A recurring reminder does not stay completed - "every day at 8" means
 * tomorrow's occurrence is still expected even though today's was just
 * marked done, so completing it advances the series instead. A
 * non-recurring reminder completes exactly as before.
 *
 * Only called on the COMPLETING transition, never on un-completing - see
 * toggleComplete's own comment on why un-completing a past-due reminder is
 * deliberately left overdue rather than advanced or rescheduled.
 */
async function completeOccurrence(
  target: Reminder,
  id: string
): Promise<Partial<Reminder>> {
  if (isRecurring(target)) {
    const advanced = advanceRecurringReminder(target, new Date());
    if (advanced) {
      const notificationId = await rearmReminder(advanced, {
        schedule: () => scheduleNotification(advanced, id),
      });
      return { ...advanced, notificationId };
    }
    // advanceRecurringReminder returned null (e.g. the iteration cap was
    // exhausted - see its own doc comment): fall through to completing
    // normally rather than leaving the reminder in limbo.
  }
  return {
    completed: true,
    notificationId: undefined,
    completedAt: new Date().toISOString(),
  };
}

export async function toggleComplete(
  current: Reminder[],
  id: string
): Promise<Reminder[]> {
  const target = current.find((r) => r.id === id);
  if (!target) return current;
  const completing = !target.completed;
  if (completing) {
    await cancelNotification(target.notificationId);
  }

  // Un-completing must re-arm the notification. Without this the reminder
  // returns to the pending list looking armed while nothing is scheduled, and
  // only rescheduleAllFutureReminders' ~15-minute BackgroundFetch sweep would
  // ever pick it up — which OEM power management routinely prevents, so a
  // reminder un-completed for a time less than ~15 minutes away simply never
  // fires. Deliberately NOT done for a reminder whose datetime has already
  // passed: it stays overdue and unscheduled (the list already surfaces
  // overdue items), rather than us inventing a new time on the user's behalf.
  // rearmReminder's default guard enforces exactly this.
  const patch: Partial<Reminder> = completing
    ? await completeOccurrence(target, id)
    : {
        completed: false,
        notificationId: await rearmReminder(
          { ...target, completed: false },
          { schedule: () => scheduleNotification(target, id) }
        ),
        // Set on completion, cleared on un-completion: a record must never
        // claim a completion time for a task that is not complete.
        completedAt: undefined,
      };

  const reminders = current.map((r) => (r.id === id ? { ...r, ...patch } : r));
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
  const alarmOn = target.alarm !== false;
  const snoozedAt = new Date();
  const snoozeTarget = resolveSnoozeTarget(preset, target.datetime, snoozedAt);
  const projected: Reminder = { ...target, datetime: snoozeTarget.toISOString() };
  // Guarded by the shared default (still-in-the-future, not completed),
  // evaluated against the PROJECTED snooze time — a snooze target that has
  // already passed by the time this runs should leave the reminder
  // unscheduled and overdue, the same as any other past-due re-arm, rather
  // than registering a notification that can never fire.
  const notificationId = await rearmReminder(projected, {
    schedule: async () => {
      const body = await resolveNotificationBody(target.description);
      return scheduleSnoozeNotification(
        {
          reminderId: id,
          title: target.title,
          body,
          alarm: alarmOn,
          exactTiming: target.exactTiming !== false,
          channelId: channelIdForAlarm(alarmOn, await getVibrationEnabled()),
        },
        snoozeTarget
      );
    },
  });
  const datetime = snoozeTarget.toISOString();
  const reminders = current.map((r) =>
    r.id === id
      ? {
          ...r,
          datetime,
          notificationId,
          snoozeCount: (r.snoozeCount ?? 0) + 1,
          // Per-occurrence sibling of snoozeCount above - resets to 0 on
          // every advance (see advanceRecurringReminder), so `stuck`
          // (adherenceStats.ts) can read "is THIS occurrence stuck"
          // separately from "has this series ever been avoided".
          currentOccurrenceSnoozes: (r.currentOccurrenceSnoozes ?? 0) + 1,
          // `??` not `||`: written once, on the first snooze only. An existing
          // value must survive every later snooze, since it is what makes the
          // distance a task has slid measurable.
          originalDatetime: r.originalDatetime ?? r.datetime,
          // How far THIS snooze pushed it, measured from the moment of
          // snoozing rather than from the reminder's own datetime - that is
          // what "5 minutes" or "tomorrow" actually mean to the user doing
          // it, and it handles both preset kinds uniformly.
          snoozeHistory: [
            ...(r.snoozeHistory ?? []),
            {
              at: snoozedAt.toISOString(),
              minutes: Math.round(
                (snoozeTarget.getTime() - snoozedAt.getTime()) / 60000
              ),
            },
          ].slice(-MAX_SNOOZE_HISTORY_ENTRIES),
        }
      : r
  );
  await saveReminders(reminders);
  return reminders;
}

export async function rescheduleAllFutureReminders(): Promise<void> {
  // See withWriteLock: this runs at app mount and can otherwise race a
  // by-id stamp (markOpenedById/markNotifiedById) landing at the same
  // moment - e.g. a killed app cold-started straight into reminder-detail
  // via a notification tap.
  await withWriteLock(async () => {
    const reminders = await loadReminders();
    let changed = false;
    const now = new Date();
    const updated = await Promise.all(
      reminders.map(async (reminder) => {
        // A past-due RECURRING reminder must be advanced to its next future
        // occurrence BEFORE rearmReminder runs, never after or instead of -
        // isPendingForAlarmRewrite (below) rejects any past-due reminder by
        // design (rescheduling an already-delivered one would show a second
        // copy while orphaning the first), so a fired recurring occurrence
        // is invisible to it until its datetime is moved into the future.
        // This is the ONE path that makes the whole feature correct even if
        // the best-effort received-listener advance never runs (a killed
        // app misses the fire moment entirely) - everything else is
        // latency, this is correctness.
        const advanced =
          isRecurring(reminder) &&
          new Date(reminder.datetime).getTime() <= now.getTime()
            ? advanceRecurringReminder(reminder, now)
            : null;
        const candidate = advanced ?? reminder;
        if (advanced) changed = true;

        // rearmReminder's default guard (not completed, still in the future)
        // is exactly right here too: a reminder whose datetime has passed has
        // ALREADY been delivered, and rescheduling it would show a second copy
        // while orphaning the first — see isPendingForAlarmRewrite's doc.
        const notificationId = await rearmReminder(candidate, {
          schedule: () => scheduleNotification(candidate, candidate.id),
        });
        if (notificationId !== undefined) {
          changed = true;
          return { ...candidate, notificationId };
        }
        return candidate;
      })
    );
    if (changed) {
      await saveReminders(updated);
    }
  });
}

/**
 * True when a reminder is still eligible to have its alarm rewritten: not
 * completed, and not already delivered.
 *
 * Rescheduling an already-delivered reminder cancels nothing —
 * cancelScheduledNotificationAsync only stops a pending trigger — and shows a
 * second copy while overwriting notificationId, orphaning the first. Same
 * guard as rescheduleAllFutureReminders, and for the same reason.
 */
function isPendingForAlarmRewrite(reminder: Reminder, now: number): boolean {
  if (reminder.completed) return false;
  return new Date(reminder.datetime).getTime() > now;
}

/**
 * How many pending reminders would actually change if the alarm default were
 * flipped to `alarm`. Drives the retroactive prompt's copy, and its existence:
 * zero means the Settings toggle stays a single silent tap.
 */
export function countPendingRemindersDisagreeingWithAlarm(
  current: Reminder[],
  alarm: boolean
): number {
  const now = Date.now();
  return current.filter(
    (r) => isPendingForAlarmRewrite(r, now) && (r.alarm !== false) !== alarm
  ).length;
}

/**
 * Rewrites the alarm value of every pending reminder that disagrees with
 * `alarm`, rescheduling each onto the matching channel.
 *
 * The Settings toggle is only a DEFAULT for newly created reminders — nothing
 * in the scheduling path reads it, so reminders created before a flip keep
 * their own alarm value and keep ringing (or keep arriving late) forever. This
 * is the opt-in retroactive half, invoked from the prompt shown when the
 * setting changes; it is never applied automatically, since a per-reminder
 * override is deliberate user intent.
 *
 * This changes SOUND only. Punctuality is carried independently by
 * `exactTiming`, so silencing a reminder no longer makes it arrive late (see
 * D7/D19/D25 in device-tests/).
 */
export async function setAlarmForPendingReminders(
  current: Reminder[],
  alarm: boolean
): Promise<Reminder[]> {
  const now = Date.now();
  let changed = false;
  const updated = await Promise.all(
    current.map(async (reminder) => {
      if (!isPendingForAlarmRewrite(reminder, now)) return reminder;
      if ((reminder.alarm !== false) === alarm) return reminder;
      const next = { ...reminder, alarm };
      // Eligibility already checked above; rearmReminder's default guard
      // would re-derive the same answer, so pass one that always proceeds.
      const notificationId = await rearmReminder(next, {
        guard: () => true,
        schedule: () => scheduleNotification(next, next.id),
      });
      changed = true;
      return { ...next, notificationId };
    })
  );
  if (!changed) return current;
  await saveReminders(updated);
  return updated;
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
  // Shares completeOccurrence with toggleComplete so marking done from the
  // notification tray advances a recurring series exactly the same way
  // marking done in-app does - see that function's own doc comment.
  const completionPatch = await completeOccurrence(target, id);
  const updated = reminders.map((r) =>
    r.id === id ? { ...r, ...completionPatch } : r
  );
  await saveReminders(updated);
}

/**
 * Stamps notifiedAt: a scheduled notification for this reminder actually
 * reached the device just now. Called from the received listener, not the
 * response listener - "arrived" and "the user acted on it" are different
 * facts, and this one only needs the first.
 *
 * A silent no-op for an unknown id (the notification could theoretically
 * outlive a since-deleted reminder) rather than an error - there is nothing
 * useful to do with that case.
 */
export async function markNotifiedById(id: string): Promise<void> {
  // See withWriteLock: this can run at the same moment as the app's
  // mount-time rescheduleAllFutureReminders() (a notification just arrived
  // and got tapped) - without the lock, whichever finished saving second
  // would win and silently drop the other's write.
  await withWriteLock(async () => {
    const reminders = await loadReminders();
    if (!reminders.some((r) => r.id === id)) return;
    const updated = reminders.map((r) =>
      r.id === id ? { ...r, notifiedAt: new Date().toISOString() } : r
    );
    await saveReminders(updated);
  });
}

/** Stamps openedAt: the user just looked at this reminder's own detail
 * screen. See Reminder.openedAt for why this is tracked separately from
 * completing or snoozing it. */
/**
 * Best-effort recurring-series advance: a scheduled notification for this
 * reminder just fired while the app is alive, so advance it to its next
 * future occurrence immediately rather than waiting for the next mount-time
 * sweep. This is latency, not correctness -
 * rescheduleAllFutureReminders' own catch-up pass covers the case where this
 * never runs at all (the app was killed at the exact fire moment), which is
 * why that sweep, not this function, is the one path the feature's
 * correctness actually depends on.
 *
 * A silent no-op for an unknown id or a non-recurring reminder, matching
 * markNotifiedById's convention.
 */
export async function advanceRecurringById(id: string): Promise<void> {
  // Same race as markNotifiedById/markOpenedById - see withWriteLock.
  await withWriteLock(async () => {
    const reminders = await loadReminders();
    const target = reminders.find((r) => r.id === id);
    if (!target) return;
    const advanced = advanceRecurringReminder(target, new Date());
    if (!advanced) return;
    const updated = reminders.map((r) => (r.id === id ? advanced : r));
    await saveReminders(updated);
  });
}

export async function markOpenedById(id: string): Promise<void> {
  // See withWriteLock and markNotifiedById's comment above - same race, this
  // time from a notification tap cold-starting straight into the detail
  // screen while the app's own mount-time reschedule is still in flight.
  await withWriteLock(async () => {
    const reminders = await loadReminders();
    if (!reminders.some((r) => r.id === id)) return;
    const updated = reminders.map((r) =>
      r.id === id ? { ...r, openedAt: new Date().toISOString() } : r
    );
    await saveReminders(updated);
  });
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

/**
 * Tags the sender's just-created local reminder with the server invitation
 * id it corresponds to, once send-invitation confirms it. Deliberately a
 * separate call from addReminder rather than a field passed at creation
 * time - the local Tier 1 save (QuickAddInput.tsx#performSave) must
 * complete and be visible regardless of whether the Tier 2 send even
 * happens, and the invitation id doesn't exist until it does.
 */
export async function attachInvitationId(id: string, invitationId: string): Promise<void> {
  const reminders = await loadReminders();
  const target = reminders.find((r) => r.id === id);
  if (!target) return;
  const updated = reminders.map((r) => (r.id === id ? { ...r, invitationId } : r));
  await saveReminders(updated);
}

/**
 * Applies an `invitation_time_changed` push to the SENDER's own local copy
 * of the send-reminder (see Reminder.invitationId's header). Reschedules
 * the local notification at the new time - the sender's own alert must
 * fire when the receiver actually expects it, not the stale time originally
 * sent - and records the change so ReminderCard/reminder-detail can explain
 * it rather than showing a silently different time. No-ops if the local
 * reminder is gone (deleted, or this device never had one), which is a
 * legitimate outcome, not an error - a push replaying after local cleanup
 * must not resurrect anything.
 */
export async function applyRecipientTimeChangeByInvitationId(
  invitationId: string,
  toDatetime: string,
  fromDatetime: string,
  recipientName: string
): Promise<string | undefined> {
  // See withWriteLock and markNotifiedById's comment above - this push can
  // arrive at the exact moment the app's own mount-time
  // rescheduleAllFutureReminders() is still in flight (a notification
  // tapped cold-start), the same race, just from a third writer.
  return withWriteLock(async () => {
    const reminders = await loadReminders();
    const target = reminders.find((r) => r.invitationId === invitationId);
    if (!target) return undefined;

    await cancelNotification(target.notificationId);
    const updatedData = { ...target, datetime: toDatetime };
    const notificationId = await scheduleNotification(updatedData, target.id);

    const updated = reminders.map((r) =>
      r.id === target.id
        ? {
            ...r,
            datetime: toDatetime,
            notificationId,
            recipientTimeChange: { from: fromDatetime, to: toDatetime, by: recipientName },
          }
        : r
    );
    await saveReminders(updated);
    // Returned so a caller (the notification tap handler) can navigate
    // straight to this reminder's detail screen without a second lookup by
    // invitation id, which no other reminder-loading function supports.
    return target.id;
  });
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
    defaultExactTimingEnabled,
    showDescriptionEnabled,
    vibrationEnabled,
    dictationLanguage,
    snoozePreset,
    quietHours,
  ] = await Promise.all([
    loadReminders(),
    getDefaultAlarmEnabled(),
    getDefaultExactTimingEnabled(),
    getShowDescriptionEnabled(),
    getVibrationEnabled(),
    getDictationLanguage(),
    getSnoozePreset(),
    getQuietHours(),
  ]);

  return serializeBackup(reminders, {
    defaultAlarmEnabled,
    defaultExactTimingEnabled,
    showDescriptionEnabled,
    vibrationEnabled,
    dictationLanguage,
    snoozePreset,
    quietHours,
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
  if (settings.defaultExactTimingEnabled !== undefined) {
    await setDefaultExactTimingEnabled(settings.defaultExactTimingEnabled);
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
  // Validated like snoozePreset: a backup is user-editable text, so a
  // malformed window must not reach storage and wedge scheduling.
  if (settings.quietHours !== undefined && isQuietHours(settings.quietHours)) {
    await setQuietHours(settings.quietHours);
  }
  if (settings.snoozePreset !== undefined && isSnoozePreset(settings.snoozePreset)) {
    await setSnoozePreset(settings.snoozePreset);
  }

  return { ok: true, added, duplicates, skipped: parsed.skipped };
}
