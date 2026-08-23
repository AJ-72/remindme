/**
 * Greeting and initials for the user's own name.
 *
 * Pure module: no React, no storage. The name itself is a persisted setting
 * (ReminderService) and is passed in.
 *
 * The name is always optional - onboarding is skippable and the Settings field
 * can be cleared - so every function here has to read correctly with an empty
 * string. Callers pass the stored value straight through rather than guarding
 * first, which is what keeps the "no name yet" path from being forgotten at
 * one call site out of five.
 */

/** Hour at which "morning" gives way to "afternoon". */
const AFTERNOON_START_HOUR = 12;
/** Hour at which "afternoon" gives way to "evening". */
const EVENING_START_HOUR = 17;

function timeOfDayGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < AFTERNOON_START_HOUR) return "Good morning";
  if (hour < EVENING_START_HOUR) return "Good afternoon";
  return "Good evening";
}

/**
 * "Good morning, Anand" - or plain "Good morning" when no name is stored.
 */
export function buildGreeting(name: string, date: Date): string {
  const trimmed = name.trim();
  const greeting = timeOfDayGreeting(date);
  return trimmed ? `${greeting}, ${trimmed}` : greeting;
}

/**
 * Up to two initials for the avatar, or "" when there is no name.
 *
 * Uses Array.from rather than charAt so a Malayalam initial survives: its
 * graphemes are multi-code-unit, and slicing by UTF-16 index would split one
 * in half and render a replacement box.
 */
export function initialsFor(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
}

/**
 * Title for a snooze re-nudge notification.
 *
 * The one notification surface that carries the name. A normal reminder fires
 * many times a day and stays plain; a snooze is a re-alert the user explicitly
 * postponed, which is rare enough for the name to land as warmth rather than
 * noise.
 */
export function buildSnoozeTitle(name: string, reminderTitle: string): string {
  const trimmed = name.trim();
  return trimmed ? `Still waiting, ${trimmed} — ${reminderTitle}` : reminderTitle;
}
