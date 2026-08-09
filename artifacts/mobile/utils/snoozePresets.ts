/**
 * Snooze durations the user can pick. A discriminated union rather than a
 * plain minute count because "tomorrow same time" is not a fixed delay: every
 * minutes preset is measured from *now*, while "tomorrow" is +24h from the
 * reminder's own scheduled time, and those differ (the user snoozes at an
 * arbitrary moment, not exactly at fire time).
 */
export type SnoozePreset =
  | { kind: "minutes"; minutes: 5 | 15 | 30 | 60 }
  | { kind: "tomorrow" };

export const SNOOZE_PRESETS: readonly SnoozePreset[] = [
  { kind: "minutes", minutes: 5 },
  { kind: "minutes", minutes: 15 },
  { kind: "minutes", minutes: 30 },
  { kind: "minutes", minutes: 60 },
  { kind: "tomorrow" },
];

export const DEFAULT_SNOOZE_PRESET: SnoozePreset = { kind: "minutes", minutes: 15 };

const DAY_MS = 24 * 60 * 60 * 1000;

export function isSnoozePreset(value: unknown): value is SnoozePreset {
  if (!value || typeof value !== "object") return false;
  const v = value as { kind?: unknown; minutes?: unknown };
  if (v.kind === "tomorrow") return true;
  if (v.kind !== "minutes") return false;
  return v.minutes === 5 || v.minutes === 15 || v.minutes === 30 || v.minutes === 60;
}

/**
 * The single place a snooze target is computed. Both the in-app sheet and the
 * notification-tray action route through this, which is what keeps them from
 * drifting apart.
 */
export function resolveSnoozeTarget(
  preset: SnoozePreset,
  reminderDatetime: string,
  now: Date
): Date {
  if (preset.kind === "minutes") {
    return new Date(now.getTime() + preset.minutes * 60 * 1000);
  }

  const scheduled = new Date(reminderDatetime).getTime();
  if (Number.isNaN(scheduled)) {
    return new Date(now.getTime() + DAY_MS);
  }

  // Roll forward in whole days so a stale reminder still lands at the same
  // clock time rather than firing immediately (a target <= now would be
  // delivered by expo-notifications straight away).
  let target = scheduled + DAY_MS;
  while (target <= now.getTime()) {
    target += DAY_MS;
  }
  return new Date(target);
}

export function snoozePresetLabel(preset: SnoozePreset): string {
  if (preset.kind === "tomorrow") return "Tomorrow, same time";
  if (preset.minutes === 60) return "1 hour";
  return `${preset.minutes} minutes`;
}

/** Label for the notification-tray action button, which has less room. */
export function snoozeActionLabel(preset: SnoozePreset): string {
  if (preset.kind === "tomorrow") return "Snooze to tomorrow";
  if (preset.minutes === 60) return "Snooze 1 hr";
  return `Snooze ${preset.minutes} min`;
}
