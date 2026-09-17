import type { AnalyticsProps } from "@/constants/analytics";
import { MALAYALAM_RANGE } from "@/utils/parseNaturalLanguage";

/**
 * Turns a reminder into event properties that describe it without quoting it.
 *
 * This module exists so that no call site ever has to remember the rule. A
 * screen that wants to report "a reminder was created" calls this and gets
 * shape, timing and language — never the title, the description, the
 * recipient's name or their number.
 *
 * The buckets are coarse on purpose. An exact lead time in minutes is a
 * near-unique value per reminder, which both re-identifies an install across
 * events and makes every chart a scatter of singletons; "same day" versus
 * "next week" is what an actual product decision turns on.
 */

export type LeadTimeBucket =
  | "overdue"
  | "under_1h"
  | "same_day"
  | "tomorrow"
  | "this_week"
  | "beyond_week";

export function leadTimeBucket(
  dueIso: string,
  fromIso?: string,
): LeadTimeBucket {
  const due = new Date(dueIso).getTime();
  const from = fromIso ? new Date(fromIso).getTime() : Date.now();
  if (!Number.isFinite(due) || !Number.isFinite(from)) return "same_day";

  const hours = (due - from) / 3_600_000;
  if (hours < 0) return "overdue";
  if (hours < 1) return "under_1h";
  if (hours < 24) return "same_day";
  if (hours < 48) return "tomorrow";
  if (hours < 24 * 7) return "this_week";
  return "beyond_week";
}

/** "ml" when the user typed Malayalam, "en" otherwise. Never the text. */
export function contentScript(text: string): "ml" | "en" {
  return MALAYALAM_RANGE.test(text) ? "ml" : "en";
}

/**
 * Coarse bucket for how many reminders an install holds.
 *
 * Reported as a person property, to split every other metric by whether the
 * app is someone's scratchpad or their actual system of record — the two
 * behave nothing alike and averaging them hides both.
 */
export function reminderCountBucket(count: number): string {
  if (count === 0) return "0";
  if (count <= 5) return "1-5";
  if (count <= 20) return "6-20";
  if (count <= 50) return "21-50";
  return "50+";
}

export interface ReminderShape {
  title: string;
  description?: string;
  datetime: string;
  createdAt?: string;
  alarm?: boolean;
  exactTiming?: boolean;
  recipient?: unknown;
  snoozeCount?: number;
  senderName?: string;
}

/** Content-free properties for any reminder-shaped event. */
export function reminderProps(
  reminder: ReminderShape,
  extra?: AnalyticsProps,
): AnalyticsProps {
  const due = new Date(reminder.datetime);
  return {
    lead_time: leadTimeBucket(reminder.datetime, reminder.createdAt),
    due_hour: Number.isFinite(due.getTime()) ? due.getHours() : -1,
    due_weekday: Number.isFinite(due.getTime()) ? due.getDay() : -1,
    script: contentScript(reminder.title),
    has_description: Boolean(reminder.description?.trim()),
    alarm: reminder.alarm !== false,
    exact_timing: reminder.exactTiming !== false,
    // "Is this a reminder for somebody else" — the Tier 2 adoption question —
    // without the recipient's name or number going anywhere.
    for_someone_else: Boolean(reminder.recipient),
    received_from_someone: Boolean(reminder.senderName),
    snooze_count: reminder.snoozeCount ?? 0,
    ...extra,
  };
}

/**
 * Stable machine key for a snooze preset.
 *
 * Deliberately NOT snoozePresetLabel() from utils/snoozePresets.ts. That
 * string is user-facing copy; the day somebody rewrites "1 hour" as "An hour",
 * every chart built on it splits in two with no warning.
 */
export function snoozePresetKey(preset: {
  kind: "minutes" | "tomorrow";
  minutes?: number;
}): string {
  return preset.kind === "tomorrow" ? "tomorrow" : `min_${preset.minutes}`;
}
