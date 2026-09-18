import { Platform } from "react-native";

/**
 * The shared bits of native-date-picker plumbing that QuickAddInput and
 * add-reminder both need: the type shape @react-native-community/datetimepicker
 * hands back, the platform-gated require (it doesn't exist on web), and the
 * string formats web's native <input type="date"/"time"> elements expect.
 *
 * Deliberately does NOT include handlePickerChange or any date→time
 * sequencing logic — each caller's picker flow is shaped by its own UI (one
 * combined row needing a two-step Android date→time chain in QuickAddInput's
 * "no time found" sheet, vs. two always-visible, independently-tappable rows
 * in add-reminder.tsx needing no chaining at all). That is a real UX
 * difference, not drift, and belongs to each caller.
 */
export type DateTimePickerEvent = { type: string; nativeEvent: object };

export const DateTimePicker: React.ComponentType<any> | null =
  Platform.OS !== "web"
    ? require("@react-native-community/datetimepicker").default
    : null;

export function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
