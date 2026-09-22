// Synthetic "coming up" cards for a recurring reminder's next few
// occurrences, derived on the fly from its single underlying Reminder record
// -- there is no per-occurrence row to read (see recurrence.ts). These are
// read-only: nothing about completing/snoozing/editing one exists, since
// they don't correspond to independent data.

import { describeRecurrence, upcomingOccurrences, type RecurrenceRule } from "./recurrence";

export interface RecurrencePreview {
  kind: "recurrence-preview";
  /** Synthetic id, unique per preview slot -- never a real Reminder id. */
  id: string;
  parentId: string;
  title: string;
  datetime: string;
  /** True for the last preview in the batch, where a continuation label is shown. */
  isLast: boolean;
  /** Set only on the last preview: e.g. "Daily", "Weekly on Mon" -- signals the series continues beyond it. */
  continuesLabel?: string;
}

interface RecurringReminderLike {
  id: string;
  title: string;
  datetime: string;
  recurrence?: RecurrenceRule;
  recurrenceAnchor?: string;
}

/**
 * Builds up to `count` read-only preview cards for the occurrences after a
 * recurring reminder's current `datetime`. Independent of `completed` --
 * previews reflect the series continuing, whether or not today's occurrence
 * has been marked done.
 */
export function buildRecurrencePreviews(
  reminder: RecurringReminderLike,
  count: number
): RecurrencePreview[] {
  if (!reminder.recurrence || !reminder.recurrenceAnchor) return [];

  const anchor = new Date(reminder.recurrenceAnchor);
  const after = new Date(reminder.datetime);
  const dates = upcomingOccurrences(reminder.recurrence, anchor, after, count);
  const continuesLabel = describeRecurrence(reminder.recurrence, anchor);

  return dates.map((date, index) => ({
    kind: "recurrence-preview",
    id: `${reminder.id}-preview-${index}`,
    parentId: reminder.id,
    title: reminder.title,
    datetime: date.toISOString(),
    isLast: index === dates.length - 1,
    ...(index === dates.length - 1 ? { continuesLabel } : {}),
  }));
}
