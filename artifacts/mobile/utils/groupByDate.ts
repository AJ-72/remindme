// Buckets reminders into Today / Tomorrow / named weekdays for the rest of
// the current week / Later — so the Upcoming list on the home screen reads as
// a calendar instead of one flat, ever-growing list. "This week" is capped at
// 7 days out (today + the next 6) rather than the calendar week, since a
// reminder for e.g. next Monday from a Saturday is calendar-week-adjacent but
// still 9 days away — "Later" is the right bucket for it, not a weekday name.

// Compares calendar days by their date parts only, mirroring
// formatDatetime.ts's isSameDay — duplicated rather than imported since that
// helper isn't exported and grouping needs its own day-difference math below.
function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY);
}

export type DateGroupKey = "today" | "tomorrow" | "this-week" | "later";

export interface DateGroup<T> {
  key: DateGroupKey;
  label: string;
  items: T[];
}

/**
 * Groups items (already sorted by the caller) into date buckets relative to
 * `now`. Items further in the past than "today" (overdue reminders) fall
 * into "today" as well, so nothing silently disappears from the list — this
 * mirrors how the ungrouped list already showed overdue items inline at the
 * top rather than hiding them.
 */
export function groupByDate<T>(
  items: T[],
  getDate: (item: T) => Date,
  now: Date = new Date()
): DateGroup<T>[] {
  const buckets: Record<DateGroupKey, T[]> = {
    today: [],
    tomorrow: [],
    "this-week": [],
    later: [],
  };
  // "This week" items are further split by calendar day (weekday label),
  // since that bucket spans up to 6 distinct days that each need their own
  // header — insertion order of first appearance decides label order, since
  // items already arrive sorted by date from the caller.
  const weekdayGroups = new Map<string, { label: string; items: T[] }>();

  for (const item of items) {
    const date = getDate(item);
    const diff = daysBetween(now, date);
    if (diff <= 0) {
      buckets.today.push(item);
    } else if (diff === 1) {
      buckets.tomorrow.push(item);
    } else if (diff <= 6) {
      buckets["this-week"].push(item);
      const dayKey = startOfDay(date).toISOString();
      if (!weekdayGroups.has(dayKey)) {
        weekdayGroups.set(dayKey, {
          label: date.toLocaleDateString([], { weekday: "long" }),
          items: [],
        });
      }
      weekdayGroups.get(dayKey)!.items.push(item);
    } else {
      buckets.later.push(item);
    }
  }

  const groups: DateGroup<T>[] = [];
  if (buckets.today.length) groups.push({ key: "today", label: "Today", items: buckets.today });
  if (buckets.tomorrow.length) groups.push({ key: "tomorrow", label: "Tomorrow", items: buckets.tomorrow });
  // "This week" items each carry their own weekday name, so they're emitted
  // as one group per calendar day (in the caller's existing sort order)
  // rather than one group with a generic label — "Thursday" is more useful
  // to scan than a repeated "This week" header over several different days.
  // Items sharing a day are merged into that day's single group instead of
  // each getting their own header.
  for (const { label, items: dayItems } of weekdayGroups.values()) {
    groups.push({ key: "this-week", label, items: dayItems });
  }
  if (buckets.later.length) groups.push({ key: "later", label: "Later", items: buckets.later });

  return groups;
}
