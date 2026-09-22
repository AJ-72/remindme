import type { Reminder } from "@/services/ReminderService";

/**
 * Derived adherence statistics.
 *
 * Everything here is computed from the reminder records the app already
 * keeps -- `createdAt`, `completedAt`, `snoozeCount`, `originalDatetime`.
 * There is deliberately NO separate event log: a second store of the same
 * facts can disagree with the first, and the disagreement is unfixable after
 * the fact. The cost is that events the reminder record cannot witness (a
 * notification that fired and was swiped away) are invisible here, and a
 * deleted reminder takes its history with it. Both are accepted.
 */

/** A reminder completed within this window of its planned time counts as on time. */
export const ON_TIME_WINDOW_MS = 60 * 60 * 1000;

/**
 * Below this many decided reminders, no rate is reported at all.
 *
 * A rate over three reminders is noise that reads as a verdict, and a wrong
 * verdict about the user's own behaviour is worse than an honest "not yet".
 */
export const MIN_SCORED_FOR_RATE = 5;

/** Overall sample needed before any hour-of-day claim is made. */
export const MIN_SCORED_FOR_HOUR_ADVICE = 8;

/** Per-bucket sample needed before that hour can be named best or worst. */
export const MIN_BUCKET_FOR_HOUR_ADVICE = 3;

/**
 * Postponements after which a reminder is treated as avoided rather than
 * mis-timed. Three is the point where the pattern is a decision, not a clash.
 */
export const STUCK_SNOOZE_THRESHOLD = 3;

export type Outcome = "completed" | "missed" | "pending";

export interface Bucket {
  /** Hour 0-23, or weekday 0-6 with 0 = Sunday. */
  key: number;
  scored: number;
  completed: number;
  /** null until the bucket has any scored reminder. */
  rate: number | null;
}

export interface HourAdvice {
  hour: number;
  rate: number;
  scored: number;
}

export interface AdherenceStats {
  /** Reminders with a decided outcome: completed, or past due and not done. */
  scored: number;
  completed: number;
  missed: number;
  /** Not yet due and not done. Carries no verdict, so it is never scored. */
  pending: number;
  /** Fraction 0-1, or null below MIN_SCORED_FOR_RATE. */
  completionRate: number | null;
  onTime: number;
  late: number;
  totalSnoozes: number;
  /** How many reminders were postponed at least once. */
  postponed: number;
  /** Median minutes from first planned time to completion. null when none. */
  medianSlipMinutes: number | null;
  byHour: Bucket[];
  byWeekday: Bucket[];
  bestHour: HourAdvice | null;
  worstHour: HourAdvice | null;
  /** Consecutive days, ending today, with no missed reminder. */
  streakDays: number;
  /** Open reminders postponed at or past STUCK_SNOOZE_THRESHOLD. */
  stuck: Reminder[];
}

/**
 * The time the user first meant to do this.
 *
 * `datetime` is overwritten by every snooze, so it answers "when is it now",
 * not "when was it meant to be" -- and the second question is the one that
 * predicts completion.
 */
export function plannedTime(r: Reminder): Date {
  return new Date(r.originalDatetime ?? r.datetime);
}

export function outcomeOf(r: Reminder, now: Date): Outcome {
  if (r.completed) return "completed";
  return new Date(r.datetime).getTime() <= now.getTime() ? "missed" : "pending";
}

function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

function emptyBuckets(count: number): Bucket[] {
  return Array.from({ length: count }, (_, key) => ({
    key,
    scored: 0,
    completed: 0,
    rate: null,
  }));
}

function finishBuckets(buckets: Bucket[]): Bucket[] {
  return buckets.map((b) => ({
    ...b,
    rate: b.scored > 0 ? b.completed / b.scored : null,
  }));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Consecutive days back from today with at least one decided reminder and no
 * miss among them.
 *
 * A day with no reminders at all does not break the streak and does not
 * extend it. Breaking on an empty day would punish a quiet weekend, and
 * extending on one would reward doing nothing.
 */
export function computeStreak(reminders: Reminder[], now: Date): number {
  const perDay = new Map<string, { scored: number; missed: number }>();
  for (const r of reminders) {
    const outcome = outcomeOf(r, now);
    if (outcome === "pending") continue;
    // Credit the day the task was DUE, not the day it was ticked: a task done
    // three days late did not save the day it was owed.
    const due = new Date(r.datetime);
    if (!isValidDate(due)) continue;
    const key = dayKey(due);
    const entry = perDay.get(key) ?? { scored: 0, missed: 0 };
    entry.scored += 1;
    if (outcome === "missed") entry.missed += 1;
    perDay.set(key, entry);
  }

  let streak = 0;
  // Start from today and walk back. Cap the walk so a corrupt far-past record
  // cannot turn this into an unbounded loop.
  for (let i = 0; i < 366; i += 1) {
    const day = new Date(now.getTime() - i * DAY_MS);
    const entry = perDay.get(dayKey(day));
    if (!entry) continue;
    if (entry.missed > 0) break;
    streak += 1;
  }
  return streak;
}

/**
 * The single entry point for every adherence number the UI shows.
 *
 * Pure and `now`-injected so the whole thing is testable without fake timers.
 */
export function computeAdherenceStats(
  reminders: Reminder[],
  now: Date = new Date()
): AdherenceStats {
  const byHour = emptyBuckets(24);
  const byWeekday = emptyBuckets(7);

  let scored = 0;
  let completed = 0;
  let missed = 0;
  let pending = 0;
  let onTime = 0;
  let late = 0;
  let totalSnoozes = 0;
  let postponed = 0;
  const slips: number[] = [];
  const stuck: Reminder[] = [];

  for (const r of reminders) {
    const snoozes = r.snoozeCount ?? 0;
    totalSnoozes += snoozes;
    if (snoozes > 0) postponed += 1;
    // `stuck` reads the CURRENT occurrence's snooze count when present
    // (currentOccurrenceSnoozes, reset on every advance), not the
    // series-wide snoozeCount - three snoozes spread across three separate
    // days of a recurring reminder is normal and must not read as one task
    // avoided three times in a row. Falls back to snoozeCount for a
    // non-recurring reminder or one from before this field existed.
    const occurrenceSnoozes = r.currentOccurrenceSnoozes ?? snoozes;
    if (!r.completed && occurrenceSnoozes >= STUCK_SNOOZE_THRESHOLD) {
      stuck.push(r);
    }

    // A recurring reminder's own CURRENT record is always pending by
    // construction (advanceRecurringReminder always leaves it with a next
    // future occurrence) - the retiring occurrences it already lived
    // through are tallied on occurrencesCompleted/occurrencesMissed instead
    // of being visible as separate records. Fold those in here so a
    // perfectly-kept daily habit contributes N decided outcomes, not one
    // permanent `pending` that scores nothing. Bucketed by this record's
    // OWN planned hour/weekday (the anchor is stable across a series, see
    // Reminder.recurrenceAnchor) rather than per-occurrence timestamps,
    // which are not stored - exact for a stable series, an accepted
    // approximation if the user later edits the time mid-series.
    const tallyCompleted = r.occurrencesCompleted ?? 0;
    const tallyMissed = r.occurrencesMissed ?? 0;
    if (tallyCompleted > 0 || tallyMissed > 0) {
      scored += tallyCompleted + tallyMissed;
      completed += tallyCompleted;
      missed += tallyMissed;
      const planned = plannedTime(r);
      if (isValidDate(planned)) {
        const hourBucket = byHour[planned.getHours()];
        const dayBucket = byWeekday[planned.getDay()];
        hourBucket.scored += tallyCompleted + tallyMissed;
        dayBucket.scored += tallyCompleted + tallyMissed;
        hourBucket.completed += tallyCompleted;
        dayBucket.completed += tallyCompleted;
      }
    }

    const outcome = outcomeOf(r, now);
    if (outcome === "pending") {
      pending += 1;
      continue;
    }

    scored += 1;
    const planned = plannedTime(r);
    if (isValidDate(planned)) {
      const hourBucket = byHour[planned.getHours()];
      const dayBucket = byWeekday[planned.getDay()];
      hourBucket.scored += 1;
      dayBucket.scored += 1;
      if (outcome === "completed") {
        hourBucket.completed += 1;
        dayBucket.completed += 1;
      }
    }

    if (outcome === "missed") {
      missed += 1;
      continue;
    }

    completed += 1;
    const doneAt = r.completedAt ? new Date(r.completedAt) : null;
    if (doneAt && isValidDate(doneAt) && isValidDate(planned)) {
      const slipMs = doneAt.getTime() - planned.getTime();
      slips.push(Math.round(slipMs / 60000));
      if (slipMs <= ON_TIME_WINDOW_MS) onTime += 1;
      else late += 1;
    }
  }

  // Sort descending by rate, then by sample size, so a well-evidenced hour
  // wins a tie against a barely-sampled one.
  const eligible = byHour
    .filter((b) => b.scored >= MIN_BUCKET_FOR_HOUR_ADVICE)
    .map((b) => ({ hour: b.key, rate: b.completed / b.scored, scored: b.scored }));

  const enoughData = scored >= MIN_SCORED_FOR_HOUR_ADVICE && eligible.length >= 2;
  const ranked = [...eligible].sort(
    (a, b) => b.rate - a.rate || b.scored - a.scored
  );
  const best = enoughData ? ranked[0] : null;
  const worst = enoughData ? ranked[ranked.length - 1] : null;

  return {
    scored,
    completed,
    missed,
    pending,
    completionRate: scored >= MIN_SCORED_FOR_RATE ? completed / scored : null,
    onTime,
    late,
    totalSnoozes,
    postponed,
    medianSlipMinutes: median(slips),
    byHour: finishBuckets(byHour),
    byWeekday: finishBuckets(byWeekday),
    // A best and worst that are the same hour say nothing; report neither.
    bestHour: best && worst && best.hour !== worst.hour ? best : null,
    worstHour: best && worst && best.hour !== worst.hour ? worst : null,
    streakDays: computeStreak(reminders, now),
    stuck,
  };
}
