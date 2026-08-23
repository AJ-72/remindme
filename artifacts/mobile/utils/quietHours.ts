/**
 * Quiet hours: the window in which the app sends no notifications of its own.
 *
 * Pure module - no React, no storage. The window is a persisted setting and is
 * passed in, and every function takes the reference time explicitly so the
 * tests are not timing-dependent.
 *
 * Stored as minutes since local midnight rather than as a Date, because only
 * the time-of-day is meaningful: a window is a daily recurrence, not an
 * instant, and storing an instant would drift across dates and DST.
 */
export interface QuietHours {
  /** Minutes since local midnight, 0-1439. Inclusive start of the window. */
  startMinute: number;
  /** Minutes since local midnight, 0-1439. Exclusive end of the window. */
  endMinute: number;
}

const MINUTES_PER_DAY = 24 * 60;

/** 22:00-08:00. A suggestion the user can change, never an imposition. */
export const DEFAULT_QUIET_HOURS: QuietHours = {
  startMinute: 22 * 60,
  endMinute: 8 * 60,
};

export function minutesFromDate(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** "22:05" - a zero-padded 24-hour clock reading. */
export function formatQuietTime(minute: number): string {
  const wrapped = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isQuietAt(date: Date, window: QuietHours): boolean {
  const { startMinute, endMinute } = window;
  // An empty window means the user has no quiet hours. Reading this as
  // "always quiet" would silently mute every notification the app sends.
  if (startMinute === endMinute) return false;

  const now = minutesFromDate(date);
  if (startMinute < endMinute) return now >= startMinute && now < endMinute;
  // Wraps midnight: after the start OR before the end, one continuous span.
  return now >= startMinute || now < endMinute;
}

/**
 * The next instant at which the window ends, strictly after `date`.
 *
 * Used to defer a notification the app scheduled into quiet hours. Strictness
 * matters: returning `date` itself when it lands exactly on the boundary would
 * schedule a trigger in the past, which expo-notifications delivers instantly.
 */
export function quietHoursEndAfter(date: Date, window: QuietHours): Date {
  const end = new Date(date);
  end.setHours(Math.floor(window.endMinute / 60), window.endMinute % 60, 0, 0);
  if (end.getTime() <= date.getTime()) {
    end.setDate(end.getDate() + 1);
  }
  return end;
}
