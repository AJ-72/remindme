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

// Number words are agglutinative like മണി: the citation form ends in the
// vowel-killer ്, but speakers and recognizers freely emit the -ു form
// (അഞ്ച് / അഞ്ചു). Registering both spellings keeps every downstream pattern
// suffix-agnostic without each one needing its own alternation.
for (const [word, value] of Object.entries({ ...MALAYALAM_NUMBER_WORDS })) {
  if (word.endsWith("്")) {
    MALAYALAM_NUMBER_WORDS[`${word.slice(0, -1)}ു`] = value;
  }
}

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

// The Malayalam hour word മണി is agglutinative: it appears bare, or with a
// dative case suffix that speech recognizers spell inconsistently —
// മണിക്ക് / മണിയ്ക്ക് / മണിക്ക. All are the same word.
//
// The (?!ക്കൂ) guard must stay immediately after മണി, BEFORE the optional
// groups: മണിക്ക is a strict prefix of the duration word മണിക്കൂർ, and a
// trailing guard backtracks into a bare മണി match and lets മണിക്കൂർ through.
const HOUR_UNIT = `മണി(?!ക്കൂ)(?:യ്)?(?:ക്ക്?)?`;

// A colon clock time, e.g. "7:30", optionally followed by the temporal
// particle ന് ("at"). 12-hour clock only — see the 1..12 validation below.
const COLON_TIME = `(\\d{1,2}):(\\d{2})(?:\\s*ന്)?`;

// Fused fraction-of-hour words. Malayalam fuses the hour and the fraction
// into one token — അഞ്ച് + അര becomes അഞ്ചര — so the two-token "അര മണി"
// patterns never see them.
//
// Two shapes, distinguished by how the hour stem is written:
//   -ര   half, fused directly onto the stem   അഞ്ചര = 5:30
//   -ഏ   quarter words, hour takes the -ഏ linking form, fraction stands alone
//        നാലേ മുക്കാല് = 4:45, അഞ്ചേ കാൽ = 5:15
// Both ADD to the stated hour; there is no "quarter to" countdown form here.
const HOUR_FRACTIONS: { suffix: string; minute: number }[] = [
  { suffix: `ര`, minute: 30 },
  { suffix: `േ\\s*മുക്കാല്?`, minute: 45 },
  { suffix: `േ\\s*കാ(?:ൽ|ല്)`, minute: 15 },
];

// Hour stems in the fused form drop the citation vowel-killer: അഞ്ച് -> അഞ്ച,
// പത്ത് -> പത്ത. Built from the number-word table so the two never drift.
const FRACTION_HOUR_STEMS = Object.entries(MALAYALAM_NUMBER_WORDS)
  .filter(([word]) => word.endsWith("്"))
  .map(([word, value]) => ({ stem: word.slice(0, -1), value }))
  .sort((a, b) => b.stem.length - a.stem.length);

// Optional dative suffix on a fused fraction: അഞ്ചരയ്ക്ക്.
const FRACTION_DATIVE = `(?:യ്?ക്ക്?)?`;

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

// Removes a matched phrase from the text. Accepts several parts because some
// branches match words that are semantically one time expression but not
// physically adjacent ("രാവിലെ ഓഫീസിൽ അഞ്ചര" — a period word and a fused
// fraction with an unrelated word between them). Joining those into one string
// and replacing it would silently no-op, leaving the whole phrase in the title.
function stripMatch(text: string, matchedText: string | string[]): string {
  const parts = Array.isArray(matchedText) ? matchedText : [matchedText];
  return parts
    .reduce((acc, part) => (part ? acc.replace(part, "") : acc), text)
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .trim();
}

interface ClockMatch {
  // May be several parts when the expression isn't contiguous — see stripMatch.
  matchedText: string | string[];
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

// Duration units, each written to swallow its own case suffix. Minutes have
// two spellings in practice: the native മിനിറ്റ് and the English loanword
// മിനുട്ട്, which speech recognizers emit at least as often.
//
// Ordered hours-first: മണിക്കൂർ must be tried before any minute pattern so a
// sentence containing both resolves to the larger unit, matching the previous
// hardcoded order.
const DURATION_UNITS: { unit: string; ms: number }[] = [
  // The chillu ർ is its own character, not റ + a sign: the base form ends
  // മണിക്കൂ + ർ, while the locative swaps that chillu for റിൽ. Alternate the
  // two whole endings — making the റ optional strands a bare ർ in the title.
  { unit: `മണിക്കൂ(?:ർ|റിൽ)`, ms: 60 * 60 * 1000 },
  { unit: `മിനിറ്റ(?:ിൽ|്)?`, ms: 60 * 1000 },
  { unit: `മിനുട്ട(?:ിൽ|്)?`, ms: 60 * 1000 },
];

// What marks the phrase as a duration rather than a clock time. Either the
// explicit particle കഴിഞ്ഞ് ("having passed"), or nothing at all — because the
// locative -ഇൽ ("in five minutes") is already absorbed into the unit patterns
// above. Binding the suffix to the unit is deliberate: -ഇൽ is an ordinary
// Malayalam locative that appears on unrelated title words (ഓഫീസിൽ, "at the
// office"), so it must never be treated as a duration marker on its own.
const DURATION_MARKER = `(?:കഴിഞ്ഞ്)?`;

function resolveDuration(text: string): DurationMatch | null {
  for (const { unit, ms } of DURATION_UNITS) {
    const match = text.match(
      new RegExp(`(${NUMBER_PATTERN})\\s*${unit}\\s*${DURATION_MARKER}`)
    );
    if (match) {
      const count = parseMalayalamNumber(match[1]);
      if (count !== null) {
        return { matchedText: match[0], offsetMs: count * ms };
      }
    }
  }

  return null;
}

// Finds a fused fraction hour (അഞ്ചര, നാലേ മുക്കാല്) anywhere in the text.
// Returns the raw 1-12 hour and the minute; the caller applies AM/PM bias.
function matchFusedFraction(
  text: string
): { matchedText: string; rawHour: number; minute: number } | null {
  for (const { stem, value } of FRACTION_HOUR_STEMS) {
    for (const { suffix, minute } of HOUR_FRACTIONS) {
      const match = text.match(new RegExp(`${stem}${suffix}${FRACTION_DATIVE}`));
      if (match) {
        return { matchedText: match[0], rawHour: value, minute };
      }
    }
  }
  return null;
}

function resolveClockTime(text: string): ClockMatch | null {
  const halfPastAfter = text.match(
    new RegExp(`(${NUMBER_PATTERN})\\s*${HOUR_UNIT}\\s*കഴിഞ്ഞ്\\s*അര`)
  );
  if (halfPastAfter) {
    const rawHour = parseMalayalamNumber(halfPastAfter[1]);
    if (rawHour !== null) {
      const hour = applyBareHourBias(rawHour);
      return { matchedText: halfPastAfter[0], hour, minute: 30 };
    }
  }

  const halfPastBefore = text.match(new RegExp(`അര\\s*(${NUMBER_PATTERN})\\s*${HOUR_UNIT}`));
  if (halfPastBefore) {
    const rawHour = parseMalayalamNumber(halfPastBefore[1]);
    if (rawHour !== null) {
      const hour = applyBareHourBias(rawHour);
      return { matchedText: halfPastBefore[0], hour, minute: 30 };
    }
  }

  // Fused fractions must resolve before any bare-hour branch: അഞ്ചര would
  // otherwise be partially eaten as അഞ്ച് (5:00), silently dropping the ര and
  // losing the :30. Period-biased form first, matching the structure below.
  for (const period of PERIOD_WORDS) {
    const periodIndex = text.indexOf(period.word);
    if (periodIndex === -1) continue;
    const fraction = matchFusedFraction(text);
    if (fraction) {
      return {
        // Two parts, not one joined string: the period word and the fraction
        // need not be adjacent, and a fabricated span would strip nothing.
        matchedText: [period.word, fraction.matchedText],
        hour: applyBias(fraction.rawHour, period.bias),
        minute: fraction.minute,
      };
    }
  }

  for (const period of PERIOD_WORDS) {
    const colonOrderedRegexes = [
      new RegExp(`${period.word}\\s*${COLON_TIME}`),
      new RegExp(`${COLON_TIME}\\s*${period.word}`),
    ];
    for (const regex of colonOrderedRegexes) {
      const match = text.match(regex);
      if (match) {
        const rawHour = parseInt(match[1], 10);
        const minute = parseInt(match[2], 10);
        if (rawHour >= 1 && rawHour <= 12 && minute <= 59) {
          return {
            matchedText: match[0],
            hour: applyBias(rawHour, period.bias),
            minute,
          };
        }
      }
    }
  }

  for (const period of PERIOD_WORDS) {
    const orderedRegexes = [
      new RegExp(`${period.word}\\s*(${NUMBER_PATTERN})\\s*${HOUR_UNIT}`),
      new RegExp(`(${NUMBER_PATTERN})\\s*${HOUR_UNIT}\\s*${period.word}`),
    ];
    for (const regex of orderedRegexes) {
      const withHour = text.match(regex);
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
  }

  for (const period of PERIOD_WORDS) {
    if (text.includes(period.word)) {
      // Only fall back to the period's default hour when no explicit hour is
      // attached to it. The window keeps an unrelated bare-hour phrase
      // elsewhere in the sentence from suppressing this period's default.
      const periodIndex = text.indexOf(period.word);
      const afterStart = periodIndex + period.word.length;
      const windowAfter = text.slice(afterStart, afterStart + 20);
      const windowBefore = text.slice(Math.max(0, periodIndex - 20), periodIndex);
      const hourNearby =
        new RegExp(HOUR_UNIT).test(windowAfter) ||
        new RegExp(HOUR_UNIT).test(windowBefore) ||
        new RegExp(COLON_TIME).test(windowAfter) ||
        new RegExp(COLON_TIME).test(windowBefore);
      if (!hourNearby) {
        return { matchedText: period.word, hour: period.defaultHour, minute: 0 };
      }
    }
  }

  const colonMatch = text.match(new RegExp(COLON_TIME));
  if (colonMatch) {
    const rawHour = parseInt(colonMatch[1], 10);
    const minute = parseInt(colonMatch[2], 10);
    if (rawHour >= 1 && rawHour <= 12 && minute <= 59) {
      return {
        matchedText: colonMatch[0],
        hour: applyBareHourBias(rawHour),
        minute,
      };
    }
  }

  const bareFraction = matchFusedFraction(text);
  if (bareFraction) {
    return {
      matchedText: bareFraction.matchedText,
      hour: applyBareHourBias(bareFraction.rawHour),
      minute: bareFraction.minute,
    };
  }

  const bareRegex = new RegExp(`(${NUMBER_PATTERN})\\s*${HOUR_UNIT}`);
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
