import type { AdherenceStats, HourAdvice } from "@/utils/adherenceStats";
import {
  MIN_BUCKET_FOR_HOUR_ADVICE,
  MIN_SCORED_FOR_HOUR_ADVICE,
} from "@/utils/adherenceStats";

/**
 * Wording for the adherence numbers, kept out of the screen so the phrasing
 * is unit-testable and so the add screen and the insights screen cannot drift
 * into describing the same statistic two different ways.
 *
 * Every sentence here is written to be readable by someone who is doing
 * badly. Adherence UI that scolds gets the screen closed, and a screen the
 * user avoids cannot help them.
 */

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "8 AM", "12 PM", "11 PM" -- the app's own clock idiom, not 24-hour. */
export function formatHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${period}`;
}

/** An hour range, since a single hour reads as a deadline rather than a slot. */
export function formatHourRange(hour: number): string {
  return `${formatHour(hour)}–${formatHour((hour + 1) % 24)}`;
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/** "2 hours 10 min", "25 min", "3 days" -- for how far a task typically slips. */
export function formatSlip(minutes: number | null): string | null {
  if (minutes === null) return null;
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h} hr` : `${h} hr ${rem} min`;
  }
  const days = Math.round(m / (24 * 60));
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * The headline sentence.
 *
 * Deliberately factual before any sample is large enough to judge: a warm
 * verdict on four reminders is a lie the user can check.
 */
export function headlineFor(stats: AdherenceStats): string {
  if (stats.scored === 0) {
    return "Nothing has come due yet. Your first few reminders start the picture.";
  }
  if (stats.completionRate === null) {
    return `${stats.completed} of ${stats.scored} done so far. A few more and patterns start to show.`;
  }
  const pct = Math.round(stats.completionRate * 100);
  if (pct >= 80) return "You finish most of what you set. Keep the times that work.";
  if (pct >= 50) return "You finish more than half. The timing below is where the rest goes.";
  return "Most of these slipped. The times below show where, and that is fixable.";
}

export interface TimeSuggestion {
  hour: number;
  rate: number;
  scored: number;
  /** One sentence, ready to render. */
  text: string;
}

/**
 * A better hour to put a reminder at, or null.
 *
 * Returns null far more often than not, on purpose. A suggestion that fires
 * on every save is chrome the user stops reading; one that fires when the
 * evidence is real keeps its meaning.
 */
export function suggestBetterHour(
  stats: AdherenceStats,
  chosenHour: number
): TimeSuggestion | null {
  const best = stats.bestHour;
  if (!best) return null;
  if (best.hour === chosenHour) return null;

  const chosen = stats.byHour[chosenHour];
  // No evidence AGAINST the chosen hour is not evidence for moving away from
  // it. Without this the app second-guesses every unfamiliar time.
  if (!chosen || chosen.scored < MIN_BUCKET_FOR_HOUR_ADVICE) return null;
  if (chosen.rate === null) return null;

  // A gap under 25 points is inside the noise of these sample sizes.
  if (best.rate - chosen.rate < 0.25) return null;

  return {
    hour: best.hour,
    rate: best.rate,
    scored: best.scored,
    text: `You finish ${formatRate(best.rate)} of reminders set for ${formatHourRange(
      best.hour
    )}, against ${formatRate(chosen.rate)} at ${formatHourRange(
      chosenHour
    )}. Move this one?`,
  };
}

/** Why no hour advice is being shown, for an honest empty state. */
export function hourAdviceBlocker(stats: AdherenceStats): string | null {
  if (stats.bestHour) return null;
  if (stats.scored < MIN_SCORED_FOR_HOUR_ADVICE) {
    const left = MIN_SCORED_FOR_HOUR_ADVICE - stats.scored;
    return `${left} more finished or missed ${
      left === 1 ? "reminder" : "reminders"
    } and the app can name your strongest time of day.`;
  }
  return "Your reminders sit in too few times of day to compare them yet.";
}

export function stuckHeadline(count: number): string {
  if (count === 1) return "1 task keeps moving";
  return `${count} tasks keep moving`;
}

/** Sorts hours into the order a human reads a day, strongest first. */
export function rankHours(stats: AdherenceStats): HourAdvice[] {
  return stats.byHour
    .filter((b) => b.scored >= MIN_BUCKET_FOR_HOUR_ADVICE && b.rate !== null)
    .map((b) => ({ hour: b.key, rate: b.rate as number, scored: b.scored }))
    .sort((a, b) => b.rate - a.rate || b.scored - a.scored);
}

/**
 * The chosen date moved to the suggested hour.
 *
 * Keeps the day the user picked wherever it can: they chose "Thursday" for a
 * reason, and only the hour is under discussion. The one exception is a time
 * that has already passed today, which would save a reminder that can never
 * fire -- that rolls to the same hour tomorrow.
 */
export function applySuggestedHour(
  chosen: Date,
  hour: number,
  now: Date = new Date()
): Date {
  const next = new Date(chosen);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}
