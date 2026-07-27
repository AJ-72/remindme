import * as chrono from "chrono-node";
import { parseMalayalamDateTime } from "./malayalamDateParser";

const MALAYALAM_RANGE = /[ഀ-ൿ]/;

export function parseNaturalLanguage(text: string): { title: string; date: Date | null } {
  if (!text.trim()) return { title: "", date: null };

  if (MALAYALAM_RANGE.test(text)) {
    return parseMalayalamDateTime(text);
  }

  const now = new Date();
  const results = chrono.parse(text, now, { forwardDate: true });
  if (results.length === 0) return { title: text.trim(), date: null };
  const parsed = results[0];
  const date = parsed.date();
  let title = text;
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i];
    title = title.slice(0, r.index) + title.slice(r.index + r.text.length);
  }
  title = title
    .replace(/\s+/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .trim();
  return { title: title || text.trim(), date };
}
