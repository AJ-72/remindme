import * as chrono from "chrono-node";
import { parseMalayalamDateTime, type ParsedDateTime } from "./malayalamDateParser";
import { computeNextOccurrence, parseRecurrencePhrase } from "./recurrence";

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

// Ambiguity is reported only by the Malayalam parser today; chrono resolves
// the equivalent English shape ("buy 5 apples in the morning") without ever
// reading the count as an hour, so there is nothing to ask about there.
export function parseNaturalLanguage(text: string, now: Date = new Date()): ParsedDateTime {
  if (!text.trim()) return { title: "", date: null };

  if (MALAYALAM_RANGE.test(text)) {
    return parseMalayalamDateTime(text);
  }

  const ordinalMatch = text.match(ORDINAL_DAY_RELATIVE_MONTH);
  const recurrenceMatch = parseRecurrencePhrase(text);
  const results = chrono.parse(text, now, { forwardDate: true });

  if (results.length === 0) {
    if (!recurrenceMatch) return { title: text.trim(), date: null };

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
  if (ordinalMatch && ordinalMatch.index !== undefined) {
    ranges.push({ start: ordinalMatch.index, end: ordinalMatch.index + ordinalMatch[0].length });
  }
  if (recurrenceMatch) {
    ranges.push(recurrenceMatch.match);
  }
  const title = stripRanges(text, ranges);
  return {
    title: title || text.trim(),
    date,
    ...(recurrenceMatch ? { recurrence: recurrenceMatch.rule } : {}),
  };
}
