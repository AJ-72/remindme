const MALAYALAM_DIGIT_MAP: Record<string, string> = {
  "൦": "0", "൧": "1", "൨": "2", "൩": "3", "൪": "4",
  "൫": "5", "൬": "6", "൭": "7", "൮": "8", "൯": "9",
};

const MALAYALAM_NUMBER_WORDS: Record<string, number> = {
  "ഒന്ന്": 1,
  "രണ്ട്": 2,
  "മൂന്ന്": 3,
  "നാല്": 4,
  "അഞ്ച്": 5,
  "ആറ്": 6,
  "ഏഴ്": 7,
  "എട്ട്": 8,
  "ഒൻപത്": 9,
  "ഒമ്പത്": 9,
  "പത്ത്": 10,
  "പതിനൊന്ന്": 11,
  "പന്ത്രണ്ട്": 12,
};

// Sorted longest-first so "പതിനൊന്ന്" (11) isn't cut short by a naive
// substring match against a shorter word.
const NUMBER_WORD_KEYS = Object.keys(MALAYALAM_NUMBER_WORDS).sort(
  (a, b) => b.length - a.length
);

export function parseMalayalamNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (MALAYALAM_NUMBER_WORDS[trimmed] !== undefined) {
    return MALAYALAM_NUMBER_WORDS[trimmed];
  }

  const converted = trimmed
    .split("")
    .map((ch) => MALAYALAM_DIGIT_MAP[ch] ?? ch)
    .join("");
  if (/^\d+$/.test(converted)) {
    return parseInt(converted, 10);
  }

  return null;
}

// Matches a numeral token: an Arabic/Malayalam digit run, or one of the
// known spelled-out number words. Used inside larger patterns below.
const NUMBER_PATTERN = `(?:\\d+|[൦-൯]+|${NUMBER_WORD_KEYS.join("|")})`;

const WEEKDAYS: { word: string; index: number }[] = [
  { word: "ഞായർ", index: 0 },
  { word: "തിങ്കൾ", index: 1 },
  { word: "ചൊവ്വ", index: 2 },
  { word: "ബുധൻ", index: 3 },
  { word: "വ്യാഴം", index: 4 },
  { word: "വെള്ളി", index: 5 },
  { word: "ശനി", index: 6 },
];

function startOfDay(d: Date): Date {
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

interface DayMatch {
  matchedText: string;
  targetDay: Date; // start-of-day Date; time-of-day is composed later
}

function resolveRelativeDay(text: string, now: Date): DayMatch | null {
  if (text.includes("മറ്റന്നാൾ")) {
    return { matchedText: "മറ്റന്നാൾ", targetDay: addDays(startOfDay(now), 2) };
  }
  if (text.includes("നാളെ")) {
    return { matchedText: "നാളെ", targetDay: addDays(startOfDay(now), 1) };
  }
  if (text.includes("ഇന്ന്")) {
    return { matchedText: "ഇന്ന്", targetDay: startOfDay(now) };
  }
  return null;
}

function resolveWeekday(text: string, now: Date): DayMatch | null {
  for (const { word, index } of WEEKDAYS) {
    const nextPos = text.indexOf(`അടുത്ത ${word}`);
    if (nextPos !== -1) {
      const daysAhead = ((index - now.getDay() + 7) % 7) || 7;
      return {
        matchedText: `അടുത്ത ${word}`,
        targetDay: addDays(startOfDay(now), daysAhead),
      };
    }
    const pos = text.indexOf(word);
    if (pos !== -1) {
      const daysAhead = (index - now.getDay() + 7) % 7;
      return { matchedText: word, targetDay: addDays(startOfDay(now), daysAhead) };
    }
  }
  return null;
}

function stripMatch(text: string, matchedText: string): string {
  return text.replace(matchedText, "").replace(/\s+/g, " ").trim();
}

function cleanTitle(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .trim();
}

interface ClockMatch {
  matchedText: string;
  hour: number;
  minute: number;
}

const PERIOD_WORDS: { word: string; bias: "AM" | "PM"; defaultHour: number }[] = [
  { word: "രാവിലെ", bias: "AM", defaultHour: 9 },
  { word: "ഉച്ചയ്ക്ക്", bias: "PM", defaultHour: 12 },
  { word: "വൈകിട്ട്", bias: "PM", defaultHour: 18 },
  { word: "രാത്രി", bias: "PM", defaultHour: 21 },
];

function applyBias(hour: number, bias: "AM" | "PM"): number {
  if (hour === 12) return 12;
  if (bias === "PM") return hour + 12;
  return hour;
}

function applyBareHourBias(rawHour: number): number {
  if (rawHour >= 1 && rawHour <= 7) return applyBias(rawHour, "PM");
  if (rawHour === 12) return 12;
  return rawHour; // 8-11 stay as AM
}

interface DurationMatch {
  matchedText: string;
  offsetMs: number;
}

function resolveDuration(text: string): DurationMatch | null {
  const hoursMatch = text.match(new RegExp(`(${NUMBER_PATTERN})\\s*മണിക്കൂർ\\s*കഴിഞ്ഞ്`));
  if (hoursMatch) {
    const count = parseMalayalamNumber(hoursMatch[1]);
    if (count !== null) {
      return { matchedText: hoursMatch[0], offsetMs: count * 60 * 60 * 1000 };
    }
  }

  const minutesMatch = text.match(new RegExp(`(${NUMBER_PATTERN})\\s*മിനിറ്റ്\\s*കഴിഞ്ഞ്`));
  if (minutesMatch) {
    const count = parseMalayalamNumber(minutesMatch[1]);
    if (count !== null) {
      return { matchedText: minutesMatch[0], offsetMs: count * 60 * 1000 };
    }
  }

  return null;
}

function resolveClockTime(text: string): ClockMatch | null {
  const halfPastAfter = text.match(
    new RegExp(`(${NUMBER_PATTERN})\\s*മണി\\s*കഴിഞ്ഞ്\\s*അര`)
  );
  if (halfPastAfter) {
    const rawHour = parseMalayalamNumber(halfPastAfter[1]);
    if (rawHour !== null) {
      const hour = applyBareHourBias(rawHour);
      return { matchedText: halfPastAfter[0], hour, minute: 30 };
    }
  }

  const halfPastBefore = text.match(new RegExp(`അര\\s*(${NUMBER_PATTERN})\\s*മണിക്ക്`));
  if (halfPastBefore) {
    const rawHour = parseMalayalamNumber(halfPastBefore[1]);
    if (rawHour !== null) {
      const hour = applyBareHourBias(rawHour);
      return { matchedText: halfPastBefore[0], hour, minute: 30 };
    }
  }

  for (const period of PERIOD_WORDS) {
    const withHourRegex = new RegExp(`${period.word}\\s*(${NUMBER_PATTERN})\\s*മണിക്ക്`);
    const withHour = text.match(withHourRegex);
    if (withHour) {
      const rawHour = parseMalayalamNumber(withHour[1]);
      if (rawHour !== null) {
        return {
          matchedText: withHour[0],
          hour: applyBias(rawHour, period.bias),
          minute: 0,
        };
      }
    }
  }

  for (const period of PERIOD_WORDS) {
    if (text.includes(period.word)) {
      // Scope the "used alone" check to a window right after the period
      // word, rather than the whole string, so an unrelated bare-hour
      // phrase elsewhere in the sentence (e.g. a second clause mentioning
      // a different time) doesn't suppress this period word's own default.
      const periodIndex = text.indexOf(period.word);
      const windowAfter = text.slice(periodIndex + period.word.length, periodIndex + period.word.length + 20);
      if (!windowAfter.match(/മണിക്ക്/)) {
        return { matchedText: period.word, hour: period.defaultHour, minute: 0 };
      }
    }
  }

  const bareRegex = new RegExp(`(${NUMBER_PATTERN})\\s*മണിക്ക്`);
  const bare = text.match(bareRegex);
  if (bare) {
    const rawHour = parseMalayalamNumber(bare[1]);
    if (rawHour !== null) {
      const hour = applyBareHourBias(rawHour);
      return { matchedText: bare[0], hour, minute: 0 };
    }
  }

  return null;
}

export function parseMalayalamDateTime(
  text: string,
  now: Date = new Date()
): { title: string; date: Date | null } {
  if (!text.trim()) return { title: "", date: null };

  // Normalize whitespace early (collapsing runs of whitespace to single space)
  // so both resolvers and stripMatch operate on consistent text
  const normalizedText = text.replace(/\s+/g, " ").trim();

  // Check for relative durations first; they short-circuit and never reach day/clock resolvers
  const durationMatch = resolveDuration(normalizedText);
  if (durationMatch) {
    const title = cleanTitle(stripMatch(normalizedText, durationMatch.matchedText)) || cleanTitle(normalizedText);
    return { title, date: new Date(now.getTime() + durationMatch.offsetMs) };
  }

  const dayMatch = resolveWeekday(normalizedText, now) ?? resolveRelativeDay(normalizedText, now);
  const remainingAfterDay = dayMatch ? stripMatch(normalizedText, dayMatch.matchedText) : normalizedText;

  const clockMatch = resolveClockTime(remainingAfterDay);

  if (!dayMatch && !clockMatch) {
    return { title: cleanTitle(normalizedText), date: null };
  }

  const composed = new Date(dayMatch ? dayMatch.targetDay : startOfDay(now));
  if (clockMatch) {
    composed.setHours(clockMatch.hour, clockMatch.minute, 0, 0);
  } else {
    composed.setHours(9, 0, 0, 0);
  }

  const remainingAfterClock = clockMatch
    ? stripMatch(remainingAfterDay, clockMatch.matchedText)
    : remainingAfterDay;

  return { title: cleanTitle(remainingAfterClock) || cleanTitle(normalizedText), date: composed };
}
