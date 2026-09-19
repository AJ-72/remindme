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

const VALID_FREQS: readonly RecurrenceFreq[] = ["daily", "weekly", "monthly", "yearly"];

/**
 * The single "is this a rule this app will schedule" check, used wherever a
 * RecurrenceRule crosses a trust boundary rather than coming from this
 * app's own UI or parser - currently only a Tier 2 invitation payload
 * (another user's client -> this device -> its own notification schedule).
 *
 * Deliberately a REJECT, not the defensive-fallback DEGRADE that
 * `computeNextOccurrence` applies internally (see normalizeInput) - a
 * malformed rule reaching THIS check must never be scheduled at all, not
 * quietly coerced into "remind me again tomorrow".
 *
 * `send_invitation.sql` defines the same shape independently (SQL cannot
 * import this module) - the two must be kept in agreement by hand.
 */
export function isValidRecurrenceRule(value: unknown): value is RecurrenceRule {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;

  if (typeof v.freq !== "string" || !VALID_FREQS.includes(v.freq as RecurrenceFreq)) {
    return false;
  }
  if (typeof v.interval !== "number" || !Number.isInteger(v.interval) || v.interval < 1) {
    return false;
  }
  if (v.byWeekday !== undefined) {
    if (!Array.isArray(v.byWeekday)) return false;
    if (!v.byWeekday.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return false;
  }
  return true;
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

// ---------------------------------------------------------------------------
// parseRecurrencePhrase: detects an English recurrence phrase inside free text.
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES: { name: string; abbrev: string; index: number }[] = [
  { name: "sunday", abbrev: "sun", index: 0 },
  { name: "monday", abbrev: "mon", index: 1 },
  { name: "tuesday", abbrev: "tue", index: 2 },
  { name: "wednesday", abbrev: "wed", index: 3 },
  { name: "thursday", abbrev: "thu", index: 4 },
  { name: "friday", abbrev: "fri", index: 5 },
  { name: "saturday", abbrev: "sat", index: 6 },
];

/** One alternation term per weekday, longest form first so the regex engine
 * prefers "wednesday" over a would-be "wed" prefix match, plus the plural
 * ("mondays") which stands in for "every monday" on its own. */
function weekdayAlternation(): string {
  const terms: string[] = [];
  for (const w of WEEKDAY_NAMES) {
    terms.push(w.name, w.abbrev);
  }
  return terms.join("|");
}

const WEEKDAY_TERM = weekdayAlternation();

function weekdayIndexFromTerm(term: string): number | undefined {
  const lower = term.toLowerCase();
  const found = WEEKDAY_NAMES.find((w) => w.name === lower || w.abbrev === lower);
  return found?.index;
}

interface PhraseMatcher {
  regex: RegExp;
  build: (m: RegExpMatchArray) => RecurrenceRule | null;
}

// Order matters: more specific patterns (multi-weekday lists, "every N
// units", "every other unit", "monthly on the Nth") must be tried before the
// generic single-word ones, since `parseRecurrencePhrase` returns the first
// match found scanning matchers top-to-bottom for the earliest/longest hit.
const MATCHERS: PhraseMatcher[] = [
  // every weekday / every weekend (must precede the single-weekday matcher,
  // since "weekday"/"weekend" would otherwise fall through unmatched anyway,
  // but keeping them first documents the priority explicitly).
  {
    regex: /\bevery\s+weekday\b/i,
    build: () => ({ freq: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5] }),
  },
  {
    regex: /\bevery\s+weekend\b/i,
    build: () => ({ freq: "weekly", interval: 1, byWeekday: [0, 6] }),
  },

  // every other day|week|month|year -> interval 2
  {
    regex: /\bevery\s+other\s+(day|week|month|year)\b/i,
    build: (m) => {
      const unit = m[1].toLowerCase();
      const freq =
        unit === "day" ? "daily" : unit === "week" ? "weekly" : unit === "month" ? "monthly" : "yearly";
      return { freq, interval: 2 };
    },
  },

  // every N days|weeks|months|years (N must be followed by a unit; a bare
  // number like "3 times" is NOT consumed here since "times" isn't a unit).
  {
    regex: /\bevery\s+(\d+)\s+(days|weeks|months|years)\b/i,
    build: (m) => {
      const interval = parseInt(m[1], 10);
      if (!Number.isFinite(interval) || interval < 1) return null;
      const unit = m[2].toLowerCase();
      const freq =
        unit === "days" ? "daily" : unit === "weeks" ? "weekly" : unit === "months" ? "monthly" : "yearly";
      return { freq, interval };
    },
  },

  // multi-weekday lists: "every Monday and Thursday", "every Mon, Wed, Fri"
  {
    regex: new RegExp(
      `\\bevery\\s+(?:${WEEKDAY_TERM})(?:\\s*(?:,|and)\\s*(?:${WEEKDAY_TERM}))+\\b`,
      "i"
    ),
    build: (m) => {
      const found = m[0].match(new RegExp(WEEKDAY_TERM, "gi")) ?? [];
      const days = Array.from(
        new Set(found.map((t) => weekdayIndexFromTerm(t)).filter((d): d is number => d !== undefined))
      ).sort((a, b) => a - b);
      if (days.length === 0) return null;
      return { freq: "weekly", interval: 1, byWeekday: days };
    },
  },

  // single weekday: "every Monday" or plural "Mondays"
  {
    regex: new RegExp(`\\bevery\\s+(${WEEKDAY_TERM})\\b`, "i"),
    build: (m) => {
      const day = weekdayIndexFromTerm(m[1]);
      if (day === undefined) return null;
      return { freq: "weekly", interval: 1, byWeekday: [day] };
    },
  },
  {
    regex: new RegExp(`\\b(${WEEKDAY_TERM})s\\b`, "i"),
    build: (m) => {
      const day = weekdayIndexFromTerm(m[1]);
      if (day === undefined) return null;
      return { freq: "weekly", interval: 1, byWeekday: [day] };
    },
  },

  // monthly on the Nth
  {
    regex: /\bmonthly\s+on\s+the\s+\d+(?:st|nd|rd|th)\b/i,
    build: () => ({ freq: "monthly", interval: 1 }),
  },

  // every day / daily / each day
  { regex: /\bevery\s+day\b/i, build: () => ({ freq: "daily", interval: 1 }) },
  { regex: /\beach\s+day\b/i, build: () => ({ freq: "daily", interval: 1 }) },
  { regex: /\bdaily\b/i, build: () => ({ freq: "daily", interval: 1 }) },

  // every week / weekly
  { regex: /\bevery\s+week\b/i, build: () => ({ freq: "weekly", interval: 1 }) },
  { regex: /\bweekly\b/i, build: () => ({ freq: "weekly", interval: 1 }) },

  // every month / monthly
  { regex: /\bevery\s+month\b/i, build: () => ({ freq: "monthly", interval: 1 }) },
  { regex: /\bmonthly\b/i, build: () => ({ freq: "monthly", interval: 1 }) },

  // every year / yearly / annually
  { regex: /\bevery\s+year\b/i, build: () => ({ freq: "yearly", interval: 1 }) },
  { regex: /\byearly\b/i, build: () => ({ freq: "yearly", interval: 1 }) },
  { regex: /\bannually\b/i, build: () => ({ freq: "yearly", interval: 1 }) },
];

/**
 * Scans free text for a single English recurrence phrase and returns both
 * the parsed `RecurrenceRule` and the `[start, end)` span it matched, so the
 * caller can strip that span from a reminder title (the existing `ranges`
 * mechanism used elsewhere for date/time phrases).
 *
 * Matching strategy: try each matcher in `MATCHERS` (ordered most-specific
 * first — see comment above the array) against the whole string, and among
 * all matchers that hit, return the one whose match starts earliest, with
 * matcher order breaking ties. This is a deliberately simple "first/longest
 * specific phrase wins" scan rather than a grammar — good enough for the
 * fixed phrase list in the brief, not a general NLP recurrence parser.
 *
 * All matchers use `\b` word boundaries, so "everyday" (no space) never
 * matches "every day" — this is what keeps "everyday carry" phrase-free.
 * The interval-N matcher requires a unit word (days/weeks/months/years)
 * immediately after the number, so "3 times every day" does not get read as
 * interval 3 — "3 times" simply isn't consumed by any matcher, and the
 * separate literal "every day" later in the string still matches on its own
 * as plain daily. This is a deliberate, minimal decision: counts ("N times")
 * are out of scope for this phrase list and are left as ordinary text.
 */
export function parseRecurrencePhrase(
  text: string
): { rule: RecurrenceRule; match: { start: number; end: number } } | null {
  if (!text) return null;

  let best: { start: number; end: number; rule: RecurrenceRule } | null = null;

  for (const matcher of MATCHERS) {
    const m = text.match(matcher.regex);
    if (!m || m.index === undefined) continue;
    const rule = matcher.build(m);
    if (!rule) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (!best || start < best.start || (start === best.start && end - start > best.end - best.start)) {
      best = { start, end, rule };
    }
  }

  if (!best) return null;
  return { rule: best.rule, match: { start: best.start, end: best.end } };
}
