import * as chrono from "chrono-node";
import { parseMalayalamDateTime, type ParsedDateTime } from "./malayalamDateParser";

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

// Ambiguity is reported only by the Malayalam parser today; chrono resolves
// the equivalent English shape ("buy 5 apples in the morning") without ever
// reading the count as an hour, so there is nothing to ask about there.
export function parseNaturalLanguage(text: string, now: Date = new Date()): ParsedDateTime {
  if (!text.trim()) return { title: "", date: null };

  if (MALAYALAM_RANGE.test(text)) {
    return parseMalayalamDateTime(text);
  }

  const ordinalMatch = text.match(ORDINAL_DAY_RELATIVE_MONTH);
  const results = chrono.parse(text, now, { forwardDate: true });
  if (results.length === 0) return { title: text.trim(), date: null };
  const parsed = results[0];
  let date = parsed.date();

  if (ordinalMatch) {
    const requestedDay = parseInt(ordinalMatch[1], 10);
    const clampedDay = Math.min(requestedDay, daysInMonth(date.getFullYear(), date.getMonth()));
    date = new Date(date);
    date.setDate(clampedDay);
  }

  // Collect removal ranges (chrono's own matches, plus the ordinal-day
  // prefix chrono ignored) and strip them out highest-index-first so
  // earlier ranges' indices stay valid into the original string.
  const ranges = results.map((r) => ({ start: r.index, end: r.index + r.text.length }));
  if (ordinalMatch && ordinalMatch.index !== undefined) {
    ranges.push({ start: ordinalMatch.index, end: ordinalMatch.index + ordinalMatch[0].length });
  }
  ranges.sort((a, b) => b.start - a.start);
  let title = text;
  for (const { start, end } of ranges) {
    title = title.slice(0, start) + title.slice(end);
  }
  title = title
    .replace(/\s+/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .trim();
  return { title: title || text.trim(), date };
}
