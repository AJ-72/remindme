import * as chrono from "chrono-node";
import { parseMalayalamDateTime, type ParsedDateTime } from "./malayalamDateParser";
import { computeNextOccurrence, parseRecurrencePhrase } from "./recurrence";
import { DEFAULT_QUIET_HOURS } from "./quietHours";

// Any of these fixes AM/PM on its own ("tonight at 8", "7 in the morning").
const PERIOD_OF_DAY = /\b(?:am|pm|a\.m\.|p\.m\.|morning|afternoon|evening|night|tonight|noon|midnight)\b/i;

export const MALAYALAM_RANGE = /[ഀ-ൿ]/;

// chrono-node's "next/this/last month|year" refiner doesn't compose with a
// preceding ordinal day-of-month: "23rd next month" resolves to "today's
// day-of-month, next month" and silently drops the "23rd" from its matched
// text span entirely (confirmed against chrono-node@2.9.1). We detect that
// shape ourselves, let chrono resolve the month/year and time as usual, then
// override the day-of-month afterward. Matches "on the 23rd (of) next month"
// / "23rd next month" / "the 1st of next month", etc.
const ORDINAL_DAY_RELATIVE_MONTH =
  /\b(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b(\s+of)?\s+((?:next|this|last)\s+(?:month|year))\b/i;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

interface Range {
  start: number;
  end: number;
}

// Merges overlapping/adjacent ranges before stripping. Needed because a
// recurrence phrase's span can overlap a chrono match embedded inside it
// (e.g. "every monday" [0,12) vs chrono's own "monday" [6,12) match) —
// stripping both independently against the same original-string indices
// double-counts the overlap and corrupts the result. Sorted descending by
// start, matching the existing highest-index-first stripping loop.
function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  return merged.sort((a, b) => b.start - a.start);
}

function stripRanges(text: string, ranges: Range[]): string {
  let title = text;
  for (const { start, end } of mergeRanges(ranges)) {
    title = title.slice(0, start) + title.slice(end);
  }
  return title
    .replace(/\s+/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .trim();
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SMALL_NUMBERS: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4 };
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// 22:00 -> "10:00pm". Explicit meridiem so the rewrite never reads as ambiguous.
function formatClock(minuteOfDay: number): string {
  const h24 = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")}${h24 < 12 ? "am" : "pm"}`;
}

export interface EnglishParseOptions {
  // What "EOD"/"end of day" means: the start of the user's quiet hours.
  eodMinute?: number;
}

// Rewrites English date phrases chrono-node@2.9.1 misses or misreads into
// equivalents it parses correctly (each rewrite target was checked against
// chrono directly). Runs before chrono; the title is then stripped from the
// rewritten text, so a rewrite only ever touches words that get stripped.
export function normalizeEnglishDatePhrases(
  text: string,
  now: Date,
  { eodMinute = DEFAULT_QUIET_HOURS.startMinute }: EnglishParseOptions = {},
): string {
  return (
    text
      // Unrecognized. End of the user's day is when their quiet hours begin.
      .replace(/\b(?:by\s+)?(?:eod|end\s+of\s+(?:the\s+)?day)\b/gi, `at ${formatClock(eodMinute)}`)
      // chrono matches only the weekday, leaving "coming" in the title. Said
      // on that same weekday it means next week's, not today.
      .replace(
        /\b(?:this\s+)?coming\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
        (_, day: string) => (WEEKDAYS.indexOf(day.toLowerCase()) === now.getDay() ? `next ${day}` : day),
      )
      // Common misspellings/shorthand chrono returns nothing for.
      .replace(/\b(?:2moro|2morrow|tomorow|tommorow|tommorrow|tomorrrow)\b/gi, "tomorrow")
      .replace(/\btonite\b/gi, "tonight")
      // Unrecognized entirely.
      .replace(/\bin\s+a\s+fortnight\b/gi, "in 2 weeks")
      // Parsed as plain "next week" — a week early.
      .replace(/\bnext\s+to\s+next\s+(week|month|year)\b/gi, "in 2 $1s")
      // Split into two separate matches ("a week" + "tomorrow").
      .replace(
        /\b(a|one|two|three|four|\d+)\s+weeks?\s+from\s+(today|now|tomorrow)\b/gi,
        (_, n: string, from: string) => {
          const count = SMALL_NUMBERS[n.toLowerCase()] ?? parseInt(n, 10);
          return `in ${count} weeks${from.toLowerCase() === "tomorrow" ? " 1 day" : ""}`;
        },
      )
      // Clock phrases chrono doesn't know.
      .replace(/\bhalf\s+past\s+(\d{1,2})\b/gi, "$1:30")
      .replace(/\bquarter\s+past\s+(\d{1,2})\b/gi, "$1:15")
      .replace(/\bquarter\s+to\s+(\d{1,2})\b/gi, (_, h: string) => {
        const hour = parseInt(h, 10);
        return `${hour === 1 ? 12 : hour - 1}:45`;
      })
      // chrono matches only "the month" and resolves it to a wrong date.
      .replace(
        /\b(?:by\s+)?(?:the\s+)?end\s+of\s+(?:the\s+)?(this\s+|next\s+)?month\b/gi,
        (_, which: string | undefined) => {
          const offset = which?.trim().toLowerCase() === "next" ? 1 : 0;
          const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
          return `${MONTH_NAMES[last.getMonth()]} ${last.getDate()}`;
        },
      )
  );
}

// English ambiguity is AM/PM only (see the end of this function). The
// Malayalam numeral-vs-hour question doesn't arise: chrono resolves "buy 5
// apples in the morning" without ever reading the count as an hour.
export function parseNaturalLanguage(
  rawText: string,
  now: Date = new Date(),
  options: EnglishParseOptions = {},
): ParsedDateTime {
  if (!rawText.trim()) return { title: "", date: null };

  if (MALAYALAM_RANGE.test(rawText)) {
    return parseMalayalamDateTime(rawText);
  }

  const text = normalizeEnglishDatePhrases(rawText, now, options);

  const ordinalMatch = text.match(ORDINAL_DAY_RELATIVE_MONTH);
  const recurrenceMatch = parseRecurrencePhrase(text);
  const results = chrono.parse(text, now, { forwardDate: true });

  if (results.length === 0) {
    if (!recurrenceMatch) return { title: rawText.trim(), date: null };

    // A recurrence phrase matched but chrono found no explicit clock time
    // anywhere in the text (e.g. "every Monday" with nothing else
    // date-like). Anchor default, deliberately chosen: 9:00 AM local time,
    // on the first occurrence the rule produces strictly after "now" (e.g.
    // the next Monday). 9:00 AM matches the existing default this codebase
    // already uses elsewhere for a day-only match with no time component
    // (see PERIOD_WORDS/composed.setHours(9, 0, 0, 0) in
    // malayalamDateParser.ts), so a recurring reminder with no stated time
    // behaves the same as a one-off reminder with no stated time.
    const anchor = new Date(now);
    anchor.setHours(9, 0, 0, 0);
    const date = computeNextOccurrence(recurrenceMatch.rule, anchor);

    const title = stripRanges(text, [recurrenceMatch.match]);
    return { title: title || text.trim(), date, recurrence: recurrenceMatch.rule };
  }

  const parsed = results[0];
  let date = parsed.date();

  // chrono only recognizes "day after tomorrow" with a leading "the"; bare
  // "day after tomorrow at 5pm" matches just "tomorrow at 5pm" (confirmed
  // against chrono-node@2.9.1), landing a day early and leaving "day after"
  // in the title. Detect the unmatched prefix, shift a day, widen the span.
  const dayAfterPrefix = /\bday\s+after\s+$/i.exec(text.slice(0, parsed.index));
  const extendsToDayAfter = dayAfterPrefix !== null && /^tomorrow\b/i.test(parsed.text);
  if (extendsToDayAfter) {
    date = new Date(date);
    date.setDate(date.getDate() + 1);
  }

  if (ordinalMatch) {
    const requestedDay = parseInt(ordinalMatch[1], 10);
    const clampedDay = Math.min(requestedDay, daysInMonth(date.getFullYear(), date.getMonth()));
    date = new Date(date);
    date.setDate(clampedDay);
  }

  // Collect removal ranges (chrono's own matches, the ordinal-day prefix
  // chrono ignored, and any recurrence phrase) and strip them out
  // highest-index-first so earlier ranges' indices stay valid into the
  // original string.
  const ranges: Range[] = results.map((r) => ({ start: r.index, end: r.index + r.text.length }));
  if (extendsToDayAfter && dayAfterPrefix) {
    ranges.push({ start: dayAfterPrefix.index, end: parsed.index });
  }
  if (ordinalMatch && ordinalMatch.index !== undefined) {
    ranges.push({ start: ordinalMatch.index, end: ordinalMatch.index + ordinalMatch[0].length });
  }
  if (recurrenceMatch) {
    ranges.push(recurrenceMatch.match);
  }
  const title = stripRanges(text, ranges);
  const result: ParsedDateTime = {
    title: title || text.trim(),
    date,
    ...(recurrenceMatch ? { recurrence: recurrenceMatch.rule } : {}),
  };

  // "at 5" with no AM/PM and nothing else in the sentence to settle it:
  // chrono silently picks AM. Hand both readings up so the UI asks instead.
  // A leading zero ("08:00") or an hour past 12 is read as 24-hour, not asked.
  const hourText = /\b(\d{1,2})(?::(\d{2}))?\b/.exec(parsed.text);
  const start = parsed.start;
  const hour = start.get("hour") ?? 0;
  if (
    hourText &&
    !hourText[1].startsWith("0") &&
    start.isCertain("hour") &&
    !start.isCertain("meridiem") &&
    hour >= 1 &&
    hour <= 12 &&
    !PERIOD_OF_DAY.test(text)
  ) {
    const reading = (h24: number) => {
      const d = new Date(date);
      d.setHours(h24, d.getMinutes(), 0, 0);
      // An unstated day means the next time it comes round, per reading.
      if (!start.isCertain("day") && d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
      return { ...result, date: d };
    };
    return {
      ...result,
      ambiguity: {
        kind: "meridiem",
        numberText: hourText[0],
        asTime: reading(hour % 12),
        asText: reading((hour % 12) + 12),
      },
    };
  }
  return result;
}
