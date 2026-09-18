/**
 * Recurrence rule type and next-occurrence math for M2 (recurring reminders).
 *
 * Pure module: no I/O, no React, no dependency on any other M2 task. This is
 * the foundation everything else (scheduling, screens, the reminder card)
 * builds on, so its behaviour — especially the edge cases below — is the
 * contract the rest of the feature relies on.
 *
 * Deliberately an RFC5545-*shaped* subset, not an iCal implementation: no
 * `until`/`count`/`bysetpos`. Just enough to describe "every N days/weeks/
 * months/years, optionally on specific weekdays."
 */

export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  /** Every N periods. 1 = every period. Must be >= 1. */
  interval: number;
  /** Weekly only: which weekdays, 0=Sun..6=Sat. Absent = same weekday as the anchor. */
  byWeekday?: number[];
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Matches the existing helper in parseNaturalLanguage.ts — duplicated rather
 * than imported to keep this module dependency-free (it must stay a pure
 * leaf every other M2 task, and parseNaturalLanguage itself, can depend on).
 */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** "1st" / "2nd" / "3rd" / "4th" etc, for the monthly description. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Builds a Date from local-time components (never by adding raw
 * milliseconds) so wall-clock time is preserved across a DST boundary.
 * Adding e.g. 86400000ms for "one day" drifts by an hour whenever the
 * addition crosses a spring-forward/fall-back transition — this is the bug
 * every date-math helper below exists to avoid.
 */
function atLocal(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds: number,
  ms: number
): Date {
  return new Date(year, month, day, hours, minutes, seconds, ms);
}

/**
 * Defensive fallback, single documented rule: whenever the rule or `from` is
 * malformed in a way that could throw or loop forever — `interval < 1`, a
 * non-finite `from`, or an unrecognized `freq` — we degrade to "remind again
 * tomorrow" (i.e. treat the rule as `{ freq: "daily", interval: 1 }`),
 * anchored at `from` if `from` itself is valid, or at "now" if it is not.
 * This keeps every caller simple: computeNextOccurrence always returns some
 * valid Date strictly after "now" (or after `from`, when `from` is valid)
 * rather than throwing or hanging, and a malformed rule silently degrades
 * instead of losing the reminder entirely.
 */
function normalizeInput(
  rule: RecurrenceRule,
  from: Date
): { rule: RecurrenceRule; from: Date } {
  const validFrom = Number.isFinite(from.getTime()) ? from : new Date();
  const knownFreqs: RecurrenceFreq[] = ["daily", "weekly", "monthly", "yearly"];
  const freq = knownFreqs.includes(rule.freq) ? rule.freq : "daily";
  const interval = Number.isFinite(rule.interval) && rule.interval >= 1 ? Math.floor(rule.interval) : 1;
  return { rule: { ...rule, freq, interval }, from: validFrom };
}

function addDaily(from: Date, interval: number): Date {
  return atLocal(
    from.getFullYear(),
    from.getMonth(),
    from.getDate() + interval,
    from.getHours(),
    from.getMinutes(),
    from.getSeconds(),
    from.getMilliseconds()
  );
}

function addWeeklyNoByWeekday(from: Date, interval: number): Date {
  return atLocal(
    from.getFullYear(),
    from.getMonth(),
    from.getDate() + 7 * interval,
    from.getHours(),
    from.getMinutes(),
    from.getSeconds(),
    from.getMilliseconds()
  );
}

function addWeeklyWithByWeekday(from: Date, interval: number, byWeekday: number[]): Date {
  const sorted = Array.from(new Set(byWeekday)).sort((a, b) => a - b);
  const fromWeekday = from.getDay();

  // Next listed weekday strictly after `from`'s weekday, within the same week.
  const nextInWeek = sorted.find((d) => d > fromWeekday);
  if (nextInWeek !== undefined) {
    return atLocal(
      from.getFullYear(),
      from.getMonth(),
      from.getDate() + (nextInWeek - fromWeekday),
      from.getHours(),
      from.getMinutes(),
      from.getSeconds(),
      from.getMilliseconds()
    );
  }

  // Wrapped past the last listed weekday this week: land on the first listed
  // weekday, (interval) weeks after the week containing `from`.
  const first = sorted[0];
  const daysToFirstNextWeek = 7 - fromWeekday + first;
  const extraWeeks = (interval - 1) * 7;
  return atLocal(
    from.getFullYear(),
    from.getMonth(),
    from.getDate() + daysToFirstNextWeek + extraWeeks,
    from.getHours(),
    from.getMinutes(),
    from.getSeconds(),
    from.getMilliseconds()
  );
}

function addMonthly(from: Date, interval: number): Date {
  const targetMonthIndex = from.getMonth() + interval;
  const targetYear = from.getFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const clampedDay = Math.min(from.getDate(), daysInMonth(targetYear, targetMonth));
  return atLocal(
    targetYear,
    targetMonth,
    clampedDay,
    from.getHours(),
    from.getMinutes(),
    from.getSeconds(),
    from.getMilliseconds()
  );
}

function addYearly(from: Date, interval: number): Date {
  const targetYear = from.getFullYear() + interval;
  const clampedDay = Math.min(from.getDate(), daysInMonth(targetYear, from.getMonth()));
  return atLocal(
    targetYear,
    from.getMonth(),
    clampedDay,
    from.getHours(),
    from.getMinutes(),
    from.getSeconds(),
    from.getMilliseconds()
  );
}

/**
 * Returns the next occurrence strictly after `from`, per `rule`.
 *
 * See `normalizeInput` for the documented fallback behaviour on malformed
 * input (interval < 1, non-finite `from`, unknown `freq`) — this function
 * never throws and never loops.
 */
export function computeNextOccurrence(rule: RecurrenceRule, from: Date): Date {
  const { rule: safeRule, from: safeFrom } = normalizeInput(rule, from);
  const { freq, interval, byWeekday } = safeRule;

  switch (freq) {
    case "daily":
      return addDaily(safeFrom, interval);
    case "weekly":
      return byWeekday && byWeekday.length > 0
        ? addWeeklyWithByWeekday(safeFrom, interval, byWeekday)
        : addWeeklyNoByWeekday(safeFrom, interval);
    case "monthly":
      return addMonthly(safeFrom, interval);
    case "yearly":
      return addYearly(safeFrom, interval);
    default:
      // Unreachable: normalizeInput already maps any unknown freq to "daily".
      return addDaily(safeFrom, interval);
  }
}

/**
 * Human label used by the UI ("Daily", "Every 2 days", "Weekly on Mon, Wed",
 * "Monthly on the 15th", "Yearly on 18 Sep"). Lives here (not duplicated in
 * a screen or the reminder card) so all consumers agree and it is
 * unit-testable without rendering anything.
 *
 * `anchor` supplies the day-of-month / month-and-day used by the monthly and
 * yearly descriptions; it is not part of RecurrenceRule itself, since the
 * rule alone doesn't carry a specific date. Callers pass the reminder's own
 * datetime. If omitted, monthly/yearly fall back to describing just the
 * frequency/interval without a specific day.
 */
export function describeRecurrence(rule: RecurrenceRule, anchor?: Date): string {
  const { rule: safeRule } = normalizeInput(rule, anchor ?? new Date());
  const { freq, interval, byWeekday } = safeRule;

  switch (freq) {
    case "daily":
      return interval === 1 ? "Daily" : `Every ${interval} days`;
    case "weekly": {
      if (byWeekday && byWeekday.length > 0) {
        const label = Array.from(new Set(byWeekday))
          .sort((a, b) => a - b)
          .map((d) => WEEKDAY_LABELS[d])
          .join(", ");
        return interval === 1 ? `Weekly on ${label}` : `Every ${interval} weeks on ${label}`;
      }
      return interval === 1 ? "Weekly" : `Every ${interval} weeks`;
    }
    case "monthly": {
      if (!anchor || !Number.isFinite(anchor.getTime())) {
        return interval === 1 ? "Monthly" : `Every ${interval} months`;
      }
      const day = ordinal(anchor.getDate());
      return interval === 1 ? `Monthly on the ${day}` : `Every ${interval} months on the ${day}`;
    }
    case "yearly": {
      if (!anchor || !Number.isFinite(anchor.getTime())) {
        return interval === 1 ? "Yearly" : `Every ${interval} years`;
      }
      const label = `${anchor.getDate()} ${MONTH_LABELS[anchor.getMonth()]}`;
      return interval === 1 ? `Yearly on ${label}` : `Every ${interval} years on ${label}`;
    }
  }
}
