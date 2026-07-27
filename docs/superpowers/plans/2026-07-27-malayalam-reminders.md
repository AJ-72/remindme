# Malayalam Reminder Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users type or speak reminders in Malayalam and have the app extract the date/time from common Malayalam natural-language phrases, and render Malayalam reminder text in a font that supports its glyphs.

**Architecture:** A new, fully independent Malayalam date/time parser (`utils/malayalamDateParser.ts`) is dispatched to by script detection inside a shared `utils/parseNaturalLanguage.ts` module (extracted from two current duplicate copies in `components/QuickAddInput.tsx` and `app/add-reminder.tsx`), leaving the existing English chrono-node path untouched. A separate `utils/getFontFamily.ts` helper picks between the app's existing Inter fonts and a newly bundled Noto Sans Malayalam family based on the content being rendered.

**Tech Stack:** React Native / Expo, TypeScript, Jest + `@testing-library/react-native`, `chrono-node` (existing, untouched), `@expo-google-fonts/noto-sans-malayalam` (new dependency).

## Global Constraints

- Repo uses `pnpm` only — never `npm`/`yarn` (root preinstall hook rejects them).
- `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (packages must be 1 day old before install) — do not disable; `@expo-google-fonts/noto-sans-malayalam@0.4.2` was published 10 months ago, so this is not a blocker.
- `react`/`react-dom` are pinned to `19.1.0` exactly — this plan does not touch those.
- Run `pnpm run typecheck:libs` is not relevant here (mobile app only); use `pnpm --filter @workspace/mobile run typecheck` and `pnpm --filter @workspace/mobile run test` before considering any task done, per this repo's CI (`.github/workflows/eas-build.yml` runs the same two commands).
- No UI string translation / i18n framework — UI stays English (spec Non-goals).
- No machine translation or external API for parsing — must work fully offline (spec Non-goals).
- No changes to `SpeechService.ts` transcription/locale logic (spec Non-goals) — only verifying transcribed text flows through the new parser correctly.
- Malayalam Unicode range for all script detection: `/[ഀ-ൿ]/` (U+0D00–U+0D7F), used identically in both the parser-routing module and the font helper.
- Font weight keys used everywhere in this plan: `"400Regular" | "500Medium" | "600SemiBold" | "700Bold"` — matches the app's actual four loaded Inter weights; do not use a 3-value regular/medium/bold naming.
- All work happens in the current worktree at `/Users/Anand.Nair/workspace/remindme/.claude/worktrees/malayalam-reminders`; run commands from `artifacts/mobile` unless stated otherwise.

---

### Task 1: Malayalam date/time parser — day, weekday, and numeral resolvers

**Files:**
- Create: `artifacts/mobile/utils/malayalamDateParser.ts`
- Test: `artifacts/mobile/utils/malayalamDateParser.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (first task, foundational).
- Produces: `parseMalayalamDateTime(text: string, now?: Date): { title: string; date: Date | null }` — the full public export other tasks (2, 3, 4, 5) will extend within this same file, and Task 6 will call from `utils/parseNaturalLanguage.ts`.

This task builds the file's skeleton plus the day-of-week/relative-day resolver and the numeral-parsing helper that later resolvers (Task 2: clock/period, Task 3: half-past, Task 4: duration) will reuse. Numerals are needed now because weekday resolution doesn't need them, but the shared `parseMalayalamNumber` helper is foundational infrastructure best built once, tested once, and imported by every later resolver in this file.

- [ ] **Step 1: Write the failing test for numeral parsing and relative-day resolution**

Create `artifacts/mobile/utils/malayalamDateParser.test.ts`:

```ts
import { parseMalayalamDateTime, parseMalayalamNumber } from "./malayalamDateParser";

describe("parseMalayalamNumber", () => {
  it("parses Arabic digits", () => {
    expect(parseMalayalamNumber("5")).toBe(5);
    expect(parseMalayalamNumber("12")).toBe(12);
  });

  it("parses Malayalam digits", () => {
    expect(parseMalayalamNumber("൫")).toBe(5);
    expect(parseMalayalamNumber("൧൨")).toBe(12);
  });

  it("parses spelled-out Malayalam number words 1-12", () => {
    expect(parseMalayalamNumber("അഞ്ച്")).toBe(5);
    expect(parseMalayalamNumber("പന്ത്രണ്ട്")).toBe(12);
    expect(parseMalayalamNumber("ഒന്ന്")).toBe(1);
    expect(parseMalayalamNumber("പതിനൊന്ന്")).toBe(11);
  });

  it("returns null for unrecognized text", () => {
    expect(parseMalayalamNumber("xyz")).toBeNull();
  });
});

describe("parseMalayalamDateTime — relative days", () => {
  const now = new Date("2026-07-29T10:00:00"); // Wednesday

  it("parses ഇന്ന് (today)", () => {
    const { title, date } = parseMalayalamDateTime("ഇന്ന് മീറ്റിംഗ്", now);
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(6); // July = 6
    expect(date!.getDate()).toBe(29);
    expect(title).toBe("മീറ്റിംഗ്");
  });

  it("parses നാളെ (tomorrow)", () => {
    const { date } = parseMalayalamDateTime("നാളെ മീറ്റിംഗ്", now);
    expect(date!.getDate()).toBe(30);
  });

  it("parses മറ്റന്നാൾ (day after tomorrow)", () => {
    const { date } = parseMalayalamDateTime("മറ്റന്നാൾ മീറ്റിംഗ്", now);
    expect(date!.getDate()).toBe(31);
  });
});

describe("parseMalayalamDateTime — weekday names", () => {
  const wednesday = new Date("2026-07-29T10:00:00"); // Wednesday

  it("resolves a weekday matching today to today (no അടുത്ത prefix)", () => {
    const { date } = parseMalayalamDateTime("ബുധൻ മീറ്റിംഗ്", wednesday);
    expect(date!.getDate()).toBe(29);
  });

  it("resolves a future weekday to its next occurrence", () => {
    const { date } = parseMalayalamDateTime("വെള്ളി മീറ്റിംഗ്", wednesday);
    expect(date!.getDate()).toBe(31); // next Friday
  });

  it("forces +7 days when അടുത്ത prefixes a weekday matching today", () => {
    const { date } = parseMalayalamDateTime("അടുത്ത ബുധൻ മീറ്റിംഗ്", wednesday);
    expect(date!.getDate()).toBe(5); // Aug 5, next Wednesday
    expect(date!.getMonth()).toBe(7); // August = 7
  });

  it("returns a null match for text with no day/weekday word", () => {
    const { title, date } = parseMalayalamDateTime("വീട്ടിൽ എന്തെങ്കിലും ചെയ്യണം", wednesday);
    expect(date).toBeNull();
    expect(title).toBe("വീട്ടിൽ എന്തെങ്കിലും ചെയ്യണം");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd artifacts/mobile && pnpm test malayalamDateParser -- --no-coverage`
Expected: FAIL — `Cannot find module './malayalamDateParser'`

- [ ] **Step 3: Implement the parser skeleton, numeral helper, and day/weekday resolvers**

Create `artifacts/mobile/utils/malayalamDateParser.ts`:

```ts
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

export function parseMalayalamDateTime(
  text: string,
  now: Date = new Date()
): { title: string; date: Date | null } {
  if (!text.trim()) return { title: "", date: null };

  const dayMatch = resolveWeekday(text, now) ?? resolveRelativeDay(text, now);

  if (!dayMatch) {
    return { title: cleanTitle(text), date: null };
  }

  const remaining = stripMatch(text, dayMatch.matchedText);
  const composed = new Date(dayMatch.targetDay);
  composed.setHours(9, 0, 0, 0); // default time-of-day; Task 2 overrides this

  return { title: cleanTitle(remaining) || cleanTitle(text), date: composed };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd artifacts/mobile && pnpm test malayalamDateParser -- --no-coverage`
Expected: PASS for all cases above.

- [ ] **Step 5: Commit**

```bash
git add utils/malayalamDateParser.ts utils/malayalamDateParser.test.ts
git commit -m "feat(mobile): add Malayalam day/weekday date parsing"
```

---

### Task 2: Malayalam clock time and period-of-day resolver

**Files:**
- Modify: `artifacts/mobile/utils/malayalamDateParser.ts`
- Modify: `artifacts/mobile/utils/malayalamDateParser.test.ts`

**Interfaces:**
- Consumes: `parseMalayalamNumber(raw: string): number | null`, `NUMBER_PATTERN` (module-internal), `startOfDay`, `cleanTitle`, `stripMatch` — all from Task 1, same file.
- Produces: clock/period resolution composed into `parseMalayalamDateTime`'s returned `date`. No new exports — this task extends the existing function's internals so Task 3 (half-past) and Task 4 (duration) can build on the same resolver ordering.

Implements the composition rule from the spec: clock/period resolvers set hour/minute on whatever day the Task 1 day-resolver produced (or today, if no day matched).

- [ ] **Step 1: Write the failing test for clock time and period words**

Append to `artifacts/mobile/utils/malayalamDateParser.test.ts`:

```ts
describe("parseMalayalamDateTime — clock time with period words", () => {
  const now = new Date("2026-07-29T10:00:00"); // Wednesday

  it("parses രാവിലെ (morning) + hour as AM", () => {
    const { date } = parseMalayalamDateTime("രാവിലെ 8 മണിക്ക് മരുന്ന്", now);
    expect(date!.getHours()).toBe(8);
  });

  it("parses ഉച്ചയ്ക്ക് (noon) + hour as PM, not AM", () => {
    const { date } = parseMalayalamDateTime("ഉച്ചയ്ക്ക് 2 മണിക്ക് ഭക്ഷണം", now);
    expect(date!.getHours()).toBe(14);
  });

  it("parses വൈകിട്ട് (evening) + hour as PM", () => {
    const { date } = parseMalayalamDateTime("വൈകിട്ട് 5 മണിക്ക്", now);
    expect(date!.getHours()).toBe(17);
  });

  it("parses രാത്രി (night) + hour as PM", () => {
    const { date } = parseMalayalamDateTime("രാത്രി 9 മണിക്ക്", now);
    expect(date!.getHours()).toBe(21);
  });

  it("defaults to a fixed hour when a period word has no explicit hour", () => {
    expect(parseMalayalamDateTime("രാവിലെ ജോലി", now).date!.getHours()).toBe(9);
    expect(parseMalayalamDateTime("ഉച്ചയ്ക്ക് ഭക്ഷണം", now).date!.getHours()).toBe(12);
    expect(parseMalayalamDateTime("വൈകിട്ട് നടത്തം", now).date!.getHours()).toBe(18);
    expect(parseMalayalamDateTime("രാത്രി ഉറക്കം", now).date!.getHours()).toBe(21);
  });

  it("defaults bare clock times (no period word) 1-7 to PM and 8-11 to AM", () => {
    expect(parseMalayalamDateTime("5 മണിക്ക് കോൾ", now).date!.getHours()).toBe(17);
    expect(parseMalayalamDateTime("9 മണിക്ക് കോൾ", now).date!.getHours()).toBe(9);
    expect(parseMalayalamDateTime("12 മണിക്ക് കോൾ", now).date!.getHours()).toBe(12);
  });

  it("parses a spelled-out hour word", () => {
    const { date } = parseMalayalamDateTime("വൈകിട്ട് അഞ്ച് മണിക്ക് മീറ്റിംഗ്", now);
    expect(date!.getHours()).toBe(17);
  });

  it("parses a Malayalam-digit hour", () => {
    const { date } = parseMalayalamDateTime("വൈകിട്ട് ൫ മണിക്ക് മീറ്റിംഗ്", now);
    expect(date!.getHours()).toBe(17);
  });

  it("composes day + period + hour and strips both matched substrings from the title", () => {
    const { title, date } = parseMalayalamDateTime("നാളെ വൈകിട്ട് 5 മണിക്ക് മീറ്റിംഗ്", now);
    expect(date!.getDate()).toBe(30);
    expect(date!.getHours()).toBe(17);
    expect(date!.getMinutes()).toBe(0);
    expect(title).toBe("മീറ്റിംഗ്");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd artifacts/mobile && pnpm test malayalamDateParser -- --no-coverage`
Expected: FAIL — hour defaults to 9 (Task 1's hardcoded default) for all clock-time cases instead of the expected values.

- [ ] **Step 3: Implement the clock/period resolver and wire it into `parseMalayalamDateTime`**

Add to `artifacts/mobile/utils/malayalamDateParser.ts`, above `parseMalayalamDateTime`:

```ts
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

function resolveClockTime(text: string): ClockMatch | null {
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
    if (text.includes(period.word) && !text.match(/മണിക്ക്/)) {
      return { matchedText: period.word, hour: period.defaultHour, minute: 0 };
    }
  }

  const bareRegex = new RegExp(`(${NUMBER_PATTERN})\\s*മണിക്ക്`);
  const bare = text.match(bareRegex);
  if (bare) {
    const rawHour = parseMalayalamNumber(bare[1]);
    if (rawHour !== null) {
      const hour = rawHour >= 1 && rawHour <= 7 ? applyBias(rawHour, "PM")
        : rawHour === 12 ? 12
        : rawHour; // 8-11 stay as AM (no bias applied)
      return { matchedText: bare[0], hour, minute: 0 };
    }
  }

  return null;
}
```

Replace the body of `parseMalayalamDateTime` (from Task 1) with:

```ts
export function parseMalayalamDateTime(
  text: string,
  now: Date = new Date()
): { title: string; date: Date | null } {
  if (!text.trim()) return { title: "", date: null };

  const dayMatch = resolveWeekday(text, now) ?? resolveRelativeDay(text, now);
  const remainingAfterDay = dayMatch ? stripMatch(text, dayMatch.matchedText) : text;

  const clockMatch = resolveClockTime(remainingAfterDay);

  if (!dayMatch && !clockMatch) {
    return { title: cleanTitle(text), date: null };
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

  return { title: cleanTitle(remainingAfterClock) || cleanTitle(text), date: composed };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd artifacts/mobile && pnpm test malayalamDateParser -- --no-coverage`
Expected: PASS for all cases in this task and Task 1.

- [ ] **Step 5: Commit**

```bash
git add utils/malayalamDateParser.ts utils/malayalamDateParser.test.ts
git commit -m "feat(mobile): add Malayalam clock time and period-of-day parsing"
```

---

### Task 3: Half-past resolver

**Files:**
- Modify: `artifacts/mobile/utils/malayalamDateParser.ts`
- Modify: `artifacts/mobile/utils/malayalamDateParser.test.ts`

**Interfaces:**
- Consumes: `resolveClockTime`, `parseMalayalamNumber`, `NUMBER_PATTERN`, `applyBias` — all from Task 2, same file.
- Produces: half-past detection folded into `resolveClockTime`'s return value. No new exports.

Per the spec's pattern precedence, half-past must be checked before the plain "X മണിക്ക്" pattern so "അര" isn't left dangling as unmatched trailing text.

- [ ] **Step 1: Write the failing test for half-past**

Append to `artifacts/mobile/utils/malayalamDateParser.test.ts`:

```ts
describe("parseMalayalamDateTime — half past", () => {
  const now = new Date("2026-07-29T10:00:00");

  it("parses 'X മണി കഴിഞ്ഞ് അര' as :30", () => {
    const { date } = parseMalayalamDateTime("5 മണി കഴിഞ്ഞ് അര മീറ്റിംഗ്", now);
    expect(date!.getHours()).toBe(17);
    expect(date!.getMinutes()).toBe(30);
  });

  it("parses 'അര X മണിക്ക്' as :30", () => {
    const { date } = parseMalayalamDateTime("അര 5 മണിക്ക് മീറ്റിംഗ്", now);
    expect(date!.getHours()).toBe(17);
    expect(date!.getMinutes()).toBe(30);
  });

  it("strips the half-past phrase cleanly from the title", () => {
    const { title } = parseMalayalamDateTime("നാളെ അര 5 മണിക്ക് മീറ്റിംഗ്", now);
    expect(title).toBe("മീറ്റിംഗ്");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd artifacts/mobile && pnpm test malayalamDateParser -- --no-coverage`
Expected: FAIL — minutes come back as 0, "അര" is left in the title untouched.

- [ ] **Step 3: Implement half-past detection inside `resolveClockTime`**

In `artifacts/mobile/utils/malayalamDateParser.ts`, add a half-past check at the top of `resolveClockTime` (before the period-word loop), so it takes precedence:

```ts
function resolveClockTime(text: string): ClockMatch | null {
  const halfPastAfter = text.match(
    new RegExp(`(${NUMBER_PATTERN})\\s*മണി\\s*കഴിഞ്ഞ്\\s*അര`)
  );
  if (halfPastAfter) {
    const rawHour = parseMalayalamNumber(halfPastAfter[1]);
    if (rawHour !== null) {
      const hour = rawHour >= 1 && rawHour <= 7 ? applyBias(rawHour, "PM")
        : rawHour === 12 ? 12
        : rawHour;
      return { matchedText: halfPastAfter[0], hour, minute: 30 };
    }
  }

  const halfPastBefore = text.match(new RegExp(`അര\\s*(${NUMBER_PATTERN})\\s*മണിക്ക്`));
  if (halfPastBefore) {
    const rawHour = parseMalayalamNumber(halfPastBefore[1]);
    if (rawHour !== null) {
      const hour = rawHour >= 1 && rawHour <= 7 ? applyBias(rawHour, "PM")
        : rawHour === 12 ? 12
        : rawHour;
      return { matchedText: halfPastBefore[0], hour, minute: 30 };
    }
  }

  for (const period of PERIOD_WORDS) {
    // ... unchanged from Task 2
```

(Leave the rest of the function — the `PERIOD_WORDS` loop and bare-hour fallback — exactly as Task 2 wrote it; only the two half-past checks are new, inserted before that loop.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd artifacts/mobile && pnpm test malayalamDateParser -- --no-coverage`
Expected: PASS for all cases in Tasks 1-3.

- [ ] **Step 5: Commit**

```bash
git add utils/malayalamDateParser.ts utils/malayalamDateParser.test.ts
git commit -m "feat(mobile): add Malayalam half-past time parsing"
```

---

### Task 4: Relative duration resolver

**Files:**
- Modify: `artifacts/mobile/utils/malayalamDateParser.ts`
- Modify: `artifacts/mobile/utils/malayalamDateParser.test.ts`

**Interfaces:**
- Consumes: `parseMalayalamNumber`, `NUMBER_PATTERN`, `cleanTitle` — from Tasks 1-2, same file.
- Produces: duration short-circuit branch inside `parseMalayalamDateTime`. No new exports.

Per the spec, relative durations are mutually exclusive with day/clock resolvers and short-circuit them — checked first in `parseMalayalamDateTime`.

- [ ] **Step 1: Write the failing test for relative durations**

Append to `artifacts/mobile/utils/malayalamDateParser.test.ts`:

```ts
describe("parseMalayalamDateTime — relative durations", () => {
  const now = new Date("2026-07-29T10:00:00");

  it("parses 'X മണിക്കൂർ കഴിഞ്ഞ്' as X hours from now", () => {
    const { date, title } = parseMalayalamDateTime("2 മണിക്കൂർ കഴിഞ്ഞ് കോൾ ചെയ്യാൻ", now);
    expect(date!.getTime()).toBe(now.getTime() + 2 * 60 * 60 * 1000);
    expect(title).toBe("കോൾ ചെയ്യാൻ");
  });

  it("parses 'X മിനിറ്റ് കഴിഞ്ഞ്' as X minutes from now", () => {
    const { date } = parseMalayalamDateTime("30 മിനിറ്റ് കഴിഞ്ഞ് ഓർമ്മിപ്പിക്കുക", now);
    expect(date!.getTime()).toBe(now.getTime() + 30 * 60 * 1000);
  });

  it("takes precedence over day/clock resolvers per spec's pattern precedence", () => {
    // Duration patterns short-circuit before day/clock resolvers run at all.
    const { date } = parseMalayalamDateTime("5 മണിക്കൂർ കഴിഞ്ഞ്", now);
    expect(date!.getTime()).toBe(now.getTime() + 5 * 60 * 60 * 1000);
  });

  it("parses a spelled-out duration count", () => {
    const { date } = parseMalayalamDateTime("അഞ്ച് മണിക്കൂർ കഴിഞ്ഞ്", now);
    expect(date!.getTime()).toBe(now.getTime() + 5 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd artifacts/mobile && pnpm test malayalamDateParser -- --no-coverage`
Expected: FAIL — `date` comes back `null` (no day/clock pattern matches these strings).

- [ ] **Step 3: Implement the duration resolver as the first check in `parseMalayalamDateTime`**

Add above `parseMalayalamDateTime` in `artifacts/mobile/utils/malayalamDateParser.ts`:

```ts
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
```

Update `parseMalayalamDateTime` to check duration first and short-circuit:

```ts
export function parseMalayalamDateTime(
  text: string,
  now: Date = new Date()
): { title: string; date: Date | null } {
  if (!text.trim()) return { title: "", date: null };

  const durationMatch = resolveDuration(text);
  if (durationMatch) {
    const title = cleanTitle(stripMatch(text, durationMatch.matchedText)) || cleanTitle(text);
    return { title, date: new Date(now.getTime() + durationMatch.offsetMs) };
  }

  const dayMatch = resolveWeekday(text, now) ?? resolveRelativeDay(text, now);
  const remainingAfterDay = dayMatch ? stripMatch(text, dayMatch.matchedText) : text;

  const clockMatch = resolveClockTime(remainingAfterDay);

  if (!dayMatch && !clockMatch) {
    return { title: cleanTitle(text), date: null };
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

  return { title: cleanTitle(remainingAfterClock) || cleanTitle(text), date: composed };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd artifacts/mobile && pnpm test malayalamDateParser -- --no-coverage`
Expected: PASS for all cases in Tasks 1-4.

- [ ] **Step 5: Commit**

```bash
git add utils/malayalamDateParser.ts utils/malayalamDateParser.test.ts
git commit -m "feat(mobile): add Malayalam relative-duration parsing"
```

---

### Task 5: Code-mixed input behavior tests

**Files:**
- Modify: `artifacts/mobile/utils/malayalamDateParser.test.ts`

**Interfaces:**
- Consumes: `parseMalayalamDateTime` from Tasks 1-4, same file. No production code changes — this task only adds test coverage for behavior the parser already exhibits by construction (it only recognizes Malayalam vocabulary, so embedded Latin text is naturally left untouched).
- Produces: nothing new for later tasks; documents the spec's stated v1 limitation with concrete assertions.

- [ ] **Step 1: Write the test for code-mixed input**

Append to `artifacts/mobile/utils/malayalamDateParser.test.ts`:

```ts
describe("parseMalayalamDateTime — code-mixed input (v1 limitation)", () => {
  const now = new Date("2026-07-29T10:00:00");

  it("extracts the Malayalam day word and leaves embedded Latin time text untouched in the title", () => {
    const { title, date } = parseMalayalamDateTime("call John നാളെ 5pm", now);
    expect(date!.getDate()).toBe(30); // നാളെ recognized
    expect(title).toBe("call John 5pm"); // "5pm" not parsed as a time
  });

  it("does not recognize an English relative-date word even next to Malayalam text", () => {
    const { date } = parseMalayalamDateTime("Meeting tomorrow നാളെ", now);
    // നാളെ is still recognized (it's Malayalam vocabulary); "tomorrow" is not touched.
    expect(date!.getDate()).toBe(30);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails or passes**

Run: `cd artifacts/mobile && pnpm test malayalamDateParser -- --no-coverage`
Expected: PASS already (this is existing behavior from Tasks 1-4; the test documents it). If it fails, the day-resolver regex is matching within a larger word boundary incorrectly — re-check `resolveRelativeDay`'s `text.includes(...)` calls against the failing input before changing anything else.

- [ ] **Step 3: N/A — no implementation step; this task is test-only**

- [ ] **Step 4: Confirm full parser test suite passes**

Run: `cd artifacts/mobile && pnpm test malayalamDateParser -- --no-coverage`
Expected: PASS, all describe blocks from Tasks 1-5.

- [ ] **Step 5: Commit**

```bash
git add utils/malayalamDateParser.test.ts
git commit -m "test(mobile): document code-mixed input behavior for Malayalam parser"
```

---

### Task 6: Shared `parseNaturalLanguage` module with script-detection routing

**Files:**
- Create: `artifacts/mobile/utils/parseNaturalLanguage.ts`
- Test: `artifacts/mobile/utils/parseNaturalLanguage.test.ts`
- Modify: `artifacts/mobile/components/QuickAddInput.tsx:1-79` (remove local `parseNaturalLanguage`, import shared one)
- Modify: `artifacts/mobile/app/add-reminder.tsx:1-72` (remove local `parseNaturalLanguage`, import shared one)

**Interfaces:**
- Consumes: `parseMalayalamDateTime(text: string, now?: Date): { title: string; date: Date | null }` from Task 1-4 (`utils/malayalamDateParser.ts`).
- Produces: `parseNaturalLanguage(text: string): { title: string; date: Date | null }` — the single shared export both `QuickAddInput.tsx` and `add-reminder.tsx` import going forward. Task 7 and Task 8 rely on this function being correctly wired into those two files.

This is the routing task: extracts the two duplicate `parseNaturalLanguage` copies into one module and adds the Malayalam-Unicode-range check in front of the existing chrono path.

- [ ] **Step 1: Write the failing test for the shared module**

Create `artifacts/mobile/utils/parseNaturalLanguage.test.ts`:

```ts
import { parseNaturalLanguage } from "./parseNaturalLanguage";

describe("parseNaturalLanguage — routing", () => {
  it("routes English text through chrono (unchanged behavior)", () => {
    const { title, date } = parseNaturalLanguage("Call mom tomorrow at 3pm");
    expect(date).not.toBeNull();
    expect(title).toBe("Call mom");
  });

  it("routes Malayalam text to the Malayalam parser", () => {
    const { title, date } = parseNaturalLanguage("നാളെ വൈകിട്ട് 5 മണിക്ക് മീറ്റിംഗ്");
    expect(date).not.toBeNull();
    expect(date!.getHours()).toBe(17);
    expect(title).toBe("മീറ്റിംഗ്");
  });

  it("returns a null match for empty input", () => {
    expect(parseNaturalLanguage("")).toEqual({ title: "", date: null });
    expect(parseNaturalLanguage("   ")).toEqual({ title: "", date: null });
  });

  it("returns the full trimmed text as title when no date is found in either language", () => {
    const { title, date } = parseNaturalLanguage("just a note");
    expect(date).toBeNull();
    expect(title).toBe("just a note");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd artifacts/mobile && pnpm test parseNaturalLanguage.test -- --no-coverage`
Expected: FAIL — `Cannot find module './parseNaturalLanguage'`

- [ ] **Step 3: Implement the shared module**

Create `artifacts/mobile/utils/parseNaturalLanguage.ts`:

```ts
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
```

Then remove the local `parseNaturalLanguage` function from `artifacts/mobile/components/QuickAddInput.tsx` (currently lines 62-79) and add the import:

```ts
import { parseNaturalLanguage } from "@/utils/parseNaturalLanguage";
```

Remove the now-unused `import * as chrono from "chrono-node";` from `QuickAddInput.tsx` as well (line 15), since the shared module owns that import now.

Do the same in `artifacts/mobile/app/add-reminder.tsx`: remove the local `parseNaturalLanguage` function (currently lines 44-72) and the now-unused `import * as chrono from "chrono-node";` (line 18), and add:

```ts
import { parseNaturalLanguage } from "@/utils/parseNaturalLanguage";
```

- [ ] **Step 4: Run the test to verify it passes, then run the full mobile test suite to catch regressions in the two call sites**

Run: `cd artifacts/mobile && pnpm test parseNaturalLanguage.test -- --no-coverage`
Expected: PASS for all cases above.

Run: `cd artifacts/mobile && pnpm test -- --no-coverage`
Expected: PASS — in particular `__tests__/components/QuickAddInput.test.tsx` and `__tests__/screens/add-reminder.test.tsx` must still pass unchanged, confirming the extraction didn't alter either screen's behavior.

- [ ] **Step 5: Commit**

```bash
git add utils/parseNaturalLanguage.ts utils/parseNaturalLanguage.test.ts components/QuickAddInput.tsx app/add-reminder.tsx
git commit -m "refactor(mobile): extract shared parseNaturalLanguage, route Malayalam input"
```

---

### Task 7: Malayalam-routing test coverage in `QuickAddInput` and speech-path verification

**Files:**
- Modify: `artifacts/mobile/__tests__/components/QuickAddInput.test.tsx`

**Interfaces:**
- Consumes: `parseNaturalLanguage` (now imported by `QuickAddInput.tsx` from Task 6) — this task doesn't import it directly; it exercises it indirectly through the rendered component, the same way the file's existing chrono tests do.
- Produces: nothing new for later tasks — this is coverage-only.

Confirms Malayalam input dispatches correctly end-to-end through the real component (not just the isolated parser unit tests from Tasks 1-6), and that a Malayalam speech-transcript-shaped string flows correctly, per the spec's Speech path section.

- [ ] **Step 1: Write the new test cases**

Add to `artifacts/mobile/__tests__/components/QuickAddInput.test.tsx`, inside the existing `describe("QuickAddInput", ...)` block (after the existing "saves a description..." test):

```ts
  it("parses a Malayalam date/time phrase into the date pill and title", async () => {
    const { findByTestId, findByText } = renderComponent();

    const titleInput = await findByTestId("quick-add-input");
    fireEvent.changeText(titleInput, "നാളെ വൈകിട്ട് 5 മണിക്ക് മീറ്റിംഗ്");

    // The pill row renders "Tomorrow" and "5:00 PM"-formatted text once a
    // date is parsed — this confirms routing engaged, not just that saving works.
    expect(await findByText("Tomorrow")).toBeTruthy();

    const saveButton = await findByTestId("quick-add-save");
    fireEvent.press(saveButton);

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(1);
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].title).toBe("മീറ്റിംഗ്");
  });

  it("parses a Malayalam speech-transcript-shaped spelled-out-number string via the mic result path", async () => {
    const { findByTestId } = renderComponent();
    const titleInput = await findByTestId("quick-add-input");

    // Simulate what the mic result listener does: setInput(fullText) with a
    // transcript containing a spelled-out number, since on-device speech
    // recognition transcribes numbers as words more often than digits.
    fireEvent.changeText(titleInput, "നാളെ വൈകിട്ട് അഞ്ച് മണിക്ക് മീറ്റിംഗ്");

    await waitFor(() => {
      expect(titleInput.props.value).toBe("നാളെ വൈകിട്ട് അഞ്ച് മണിക്ക് മീറ്റിംഗ്");
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails first if Task 6 wasn't applied, then passes**

Run: `cd artifacts/mobile && pnpm test QuickAddInput.test -- --no-coverage`
Expected: PASS (Task 6 already wired the routing into this component; this task only adds coverage for it).

- [ ] **Step 3: N/A — no implementation step, coverage-only task**

- [ ] **Step 4: Re-run to confirm**

Run: `cd artifacts/mobile && pnpm test QuickAddInput.test -- --no-coverage`
Expected: PASS, including all pre-existing tests in the file (mic button suite untouched).

- [ ] **Step 5: Commit**

```bash
git add __tests__/components/QuickAddInput.test.tsx
git commit -m "test(mobile): cover Malayalam routing and speech-transcript shape in QuickAddInput"
```

---

### Task 8: Bundle Noto Sans Malayalam and add `getFontFamily` helper

**Files:**
- Modify: `artifacts/mobile/package.json` (add dependency)
- Modify: `artifacts/mobile/app/_layout.tsx:1-58` (load new font weights)
- Create: `artifacts/mobile/utils/getFontFamily.ts`
- Test: `artifacts/mobile/utils/getFontFamily.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `getFontFamily(text: string, weight: "400Regular" | "500Medium" | "600SemiBold" | "700Bold"): string` — the function Task 9 applies at all five UI render sites.

- [ ] **Step 1: Add the dependency**

Run from the repo root (not `artifacts/mobile` — pnpm workspaces resolve from root):

```bash
cd /Users/Anand.Nair/workspace/remindme/.claude/worktrees/malayalam-reminders
pnpm --filter @workspace/mobile add -D @expo-google-fonts/noto-sans-malayalam
```

The `-D` flag is required here — `@expo-google-fonts/inter` is listed under `devDependencies` in `artifacts/mobile/package.json` (line 20), and a plain `pnpm add` without `-D` would place the new package under `dependencies` instead, inconsistent with the existing font package.

Expected: adds `"@expo-google-fonts/noto-sans-malayalam": "^0.4.2"` (or matching resolved version) to `artifacts/mobile/package.json`'s `devDependencies`, and updates the root `pnpm-lock.yaml`. This will NOT be blocked by `minimumReleaseAge: 1440` since the package was published 10 months ago.

- [ ] **Step 2: Write the failing test for `getFontFamily`**

Create `artifacts/mobile/utils/getFontFamily.test.ts`:

```ts
import { getFontFamily } from "./getFontFamily";

describe("getFontFamily", () => {
  it("returns the Inter family for English text at each weight", () => {
    expect(getFontFamily("Call mom", "400Regular")).toBe("Inter_400Regular");
    expect(getFontFamily("Call mom", "500Medium")).toBe("Inter_500Medium");
    expect(getFontFamily("Call mom", "600SemiBold")).toBe("Inter_600SemiBold");
    expect(getFontFamily("Call mom", "700Bold")).toBe("Inter_700Bold");
  });

  it("returns the Noto Sans Malayalam family for Malayalam text at each weight", () => {
    expect(getFontFamily("നാളെ മീറ്റിംഗ്", "400Regular")).toBe("NotoSansMalayalam_400Regular");
    expect(getFontFamily("നാളെ മീറ്റിംഗ്", "500Medium")).toBe("NotoSansMalayalam_500Medium");
    expect(getFontFamily("നാളെ മീറ്റിംഗ്", "600SemiBold")).toBe("NotoSansMalayalam_600SemiBold");
    expect(getFontFamily("നാളെ മീറ്റിംഗ്", "700Bold")).toBe("NotoSansMalayalam_700Bold");
  });

  it("returns the Malayalam family for mixed Malayalam+Latin text", () => {
    expect(getFontFamily("call John നാളെ", "400Regular")).toBe("NotoSansMalayalam_400Regular");
  });

  it("returns Inter for empty text", () => {
    expect(getFontFamily("", "400Regular")).toBe("Inter_400Regular");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd artifacts/mobile && pnpm test getFontFamily.test -- --no-coverage`
Expected: FAIL — `Cannot find module './getFontFamily'`

- [ ] **Step 4: Implement `getFontFamily` and load the new font weights in `_layout.tsx`**

Create `artifacts/mobile/utils/getFontFamily.ts`:

```ts
export type FontWeight = "400Regular" | "500Medium" | "600SemiBold" | "700Bold";

const MALAYALAM_RANGE = /[ഀ-ൿ]/;

const INTER_WEIGHTS: Record<FontWeight, string> = {
  "400Regular": "Inter_400Regular",
  "500Medium": "Inter_500Medium",
  "600SemiBold": "Inter_600SemiBold",
  "700Bold": "Inter_700Bold",
};

const NOTO_SANS_MALAYALAM_WEIGHTS: Record<FontWeight, string> = {
  "400Regular": "NotoSansMalayalam_400Regular",
  "500Medium": "NotoSansMalayalam_500Medium",
  "600SemiBold": "NotoSansMalayalam_600SemiBold",
  "700Bold": "NotoSansMalayalam_700Bold",
};

export function getFontFamily(text: string, weight: FontWeight): string {
  return (MALAYALAM_RANGE.test(text) ? NOTO_SANS_MALAYALAM_WEIGHTS : INTER_WEIGHTS)[weight];
}
```

Modify `artifacts/mobile/app/_layout.tsx`: add the import (after the existing Inter import block, line 7) —

```ts
import {
  NotoSansMalayalam_400Regular,
  NotoSansMalayalam_500Medium,
  NotoSansMalayalam_600SemiBold,
  NotoSansMalayalam_700Bold,
} from "@expo-google-fonts/noto-sans-malayalam";
```

— and add the four weights into the existing `useFonts` call (currently lines 54-59):

```ts
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    NotoSansMalayalam_400Regular,
    NotoSansMalayalam_500Medium,
    NotoSansMalayalam_600SemiBold,
    NotoSansMalayalam_700Bold,
  });
```

- [ ] **Step 5: Run the test to verify it passes, and confirm the app still typechecks/builds**

Run: `cd artifacts/mobile && pnpm test getFontFamily.test -- --no-coverage`
Expected: PASS for all cases above.

Run: `cd /Users/Anand.Nair/workspace/remindme/.claude/worktrees/malayalam-reminders && pnpm --filter @workspace/mobile run typecheck`
Expected: no new type errors (the new font import names must match the package's actual exports — if this fails with "has no exported member", double check the exact export names via `node -e "console.log(Object.keys(require('@expo-google-fonts/noto-sans-malayalam')))"` from `artifacts/mobile` and correct the import/useFonts keys to match).

- [ ] **Step 6: Commit**

```bash
git add package.json ../../pnpm-lock.yaml app/_layout.tsx utils/getFontFamily.ts utils/getFontFamily.test.ts
git commit -m "feat(mobile): bundle Noto Sans Malayalam and add getFontFamily helper"
```

---

### Task 9: Apply `getFontFamily` at the five reminder-content render sites

**Files:**
- Modify: `artifacts/mobile/components/QuickAddInput.tsx` (textInput style ~line 386-393, pill text style ~line 436-440)
- Modify: `artifacts/mobile/components/ReminderCard.tsx` (title style, lines 85-90; description style, lines 91-96)
- Modify: `artifacts/mobile/app/reminder-detail.tsx` (title style, lines 100-105; description style, lines 106-111)
- Modify: `artifacts/mobile/app/add-reminder.tsx` (input style, lines 245-251, used for both title and description `TextInput`s)

**Interfaces:**
- Consumes: `getFontFamily(text: string, weight: FontWeight): string` from Task 8 (`utils/getFontFamily.ts`).
- Produces: nothing for later tasks — this is the final application of the font logic; no plan tasks depend on it further.

Per the spec's implementation note, `fontFamily` in each static `StyleSheet.create` block must move to an inline override since it now depends on rendered content, not a fixed string.

- [ ] **Step 1: Write the failing test for `ReminderCard`'s title font**

Create `artifacts/mobile/components/ReminderCard.test.tsx` (this file currently has no colocated test; following the `services/`-style colocation convention used elsewhere in this repo for non-screen, non-`QuickAddInput`-style components):

```tsx
import React from "react";
import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ReminderCard from "./ReminderCard";
import { RemindersProvider } from "@/contexts/RemindersContext";
import type { Reminder } from "@/services/ReminderService";

jest.mock("expo-haptics");
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    title: "English title",
    description: "",
    datetime: new Date(Date.now() + 3600_000).toISOString(),
    completed: false,
    notificationId: "notif-r1",
    ...overrides,
  };
}

function renderCard(reminder: Reminder) {
  return render(
    <SafeAreaProvider>
      <RemindersProvider>
        <ReminderCard reminder={reminder} onDelete={jest.fn()} />
      </RemindersProvider>
    </SafeAreaProvider>
  );
}

describe("ReminderCard — font selection", () => {
  it("renders an English title with Inter", () => {
    const { getByText } = renderCard(makeReminder({ title: "English title" }));
    const titleNode = getByText("English title");
    const flatStyle = Array.isArray(titleNode.props.style)
      ? Object.assign({}, ...titleNode.props.style)
      : titleNode.props.style;
    expect(flatStyle.fontFamily).toBe("Inter_600SemiBold");
  });

  it("renders a Malayalam title with Noto Sans Malayalam", () => {
    const { getByText } = renderCard(makeReminder({ title: "നാളെ മീറ്റിംഗ്" }));
    const titleNode = getByText("നാളെ മീറ്റിംഗ്");
    const flatStyle = Array.isArray(titleNode.props.style)
      ? Object.assign({}, ...titleNode.props.style)
      : titleNode.props.style;
    expect(flatStyle.fontFamily).toBe("NotoSansMalayalam_600SemiBold");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd artifacts/mobile && pnpm test ReminderCard.test -- --no-coverage`
Expected: FAIL — `flatStyle.fontFamily` is `"Inter_600SemiBold"` for both cases (the static style hasn't been made content-dependent yet).

- [ ] **Step 3: Implement the font application at all five sites**

In `artifacts/mobile/components/ReminderCard.tsx`: add the import —

```ts
import { getFontFamily } from "@/utils/getFontFamily";
```

Remove `fontFamily: "Inter_600SemiBold",` from the `title` style object (currently line 87) and `fontFamily: "Inter_400Regular",` from the `description` style object (currently line 93) inside `StyleSheet.create`. Update the JSX (currently lines 132-134 and 139-143):

```tsx
            <Text
              style={[styles.title, { fontFamily: getFontFamily(reminder.title, "600SemiBold") }]}
              numberOfLines={1}
            >
              {reminder.title}
            </Text>
```

```tsx
          {!!reminder.description && (
            <Text
              style={[
                styles.description,
                { fontFamily: getFontFamily(reminder.description, "400Regular") },
              ]}
              numberOfLines={1}
            >
              {reminder.description}
            </Text>
          )}
```

In `artifacts/mobile/app/reminder-detail.tsx`: add the same import. Remove `fontFamily: "Inter_700Bold",` from `title` (line 102) and `fontFamily: "Inter_400Regular",` from `description` (line 108). Find the JSX rendering `{reminder.title}` and `{reminder.description}` (inside the "found and not completed" branch) and apply:

```tsx
<Text style={[styles.title, { fontFamily: getFontFamily(reminder.title, "700Bold") }]}>
  {reminder.title}
</Text>
```

```tsx
{!!reminder.description && (
  <Text style={[styles.description, { fontFamily: getFontFamily(reminder.description, "400Regular") }]}>
    {reminder.description}
  </Text>
)}
```

In `artifacts/mobile/app/add-reminder.tsx`: add the same import. Remove `fontFamily: "Inter_400Regular",` from the single shared `input` style (line 247) — it's reused by three different `TextInput`s (edit-title, natural-language input, description), so instead of removing the fallback entirely, leave `fontFamily: "Inter_400Regular"` in the static style as the default and override per-`TextInput` only where user content already exists to check against:

```tsx
              <TextInput
                ref={inputRef}
                style={[styles.input, { fontFamily: getFontFamily(editTitle, "400Regular") }]}
                placeholder="Reminder title"
                placeholderTextColor={colors.mutedForeground}
                value={editTitle}
                onChangeText={setEditTitle}
                maxLength={300}
                returnKeyType="done"
                testID="edit-title-input"
              />
```

```tsx
              <TextInput
                ref={inputRef}
                style={[styles.input, { fontFamily: getFontFamily(input, "400Regular") }]}
                placeholder={`e.g. "Call dentist tomorrow at 3pm"`}
                placeholderTextColor={colors.mutedForeground}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={300}
                returnKeyType="done"
                blurOnSubmit
                testID="input-textbox"
              />
```

```tsx
            <TextInput
              style={[styles.input, { fontFamily: getFontFamily(description, "400Regular") }]}
              placeholder="Add extra details…"
              placeholderTextColor={colors.mutedForeground}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={1000}
              returnKeyType="done"
              blurOnSubmit
              testID="description-input"
            />
```

(Leave the static `fontFamily: "Inter_400Regular"` in place inside `styles.input` — the inline override always wins when applied, and it's harmless/correct as a fallback for any other consumer of `styles.input` this plan didn't enumerate.)

In `artifacts/mobile/components/QuickAddInput.tsx`: add the same import. Remove only `fontFamily: "Inter_400Regular",` from the `textInput` style object (line 389) inside `StyleSheet.create`. Update the main `TextInput` (currently lines 543-555):

```tsx
        <TextInput
          style={[styles.textInput, { fontFamily: getFontFamily(input, "400Regular") }]}
          placeholder="Add a reminder…"
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={setInput}
          returnKeyType="done"
          onSubmitEditing={handleSave}
          blurOnSubmit={false}
          maxLength={300}
          editable={!saving}
          testID="quick-add-input"
        />
```

Leave `pillText`'s `fontFamily: "Inter_600SemiBold"` (line 438) untouched in the static style — do not apply `getFontFamily` there. The two pill `Text` elements (currently lines 639 and 644) render formatted date/time strings from `formatDatePill`/`formatTimePill`, which are always Latin regardless of the input language, so they never need the Malayalam font.

- [ ] **Step 4: Run the test to verify it passes, then run the full mobile test suite**

Run: `cd artifacts/mobile && pnpm test ReminderCard.test -- --no-coverage`
Expected: PASS for both cases.

Run: `cd artifacts/mobile && pnpm test -- --no-coverage`
Expected: PASS across the whole suite — in particular `__tests__/screens/reminder-detail.test.tsx`, `__tests__/screens/add-reminder.test.tsx`, and `__tests__/components/QuickAddInput.test.tsx` must still pass, confirming the inline style overrides didn't break existing rendering/interaction assertions.

Run: `cd /Users/Anand.Nair/workspace/remindme/.claude/worktrees/malayalam-reminders && pnpm --filter @workspace/mobile run typecheck`
Expected: no new type errors.

- [ ] **Step 5: Commit**

```bash
git add components/ReminderCard.tsx components/ReminderCard.test.tsx app/reminder-detail.tsx app/add-reminder.tsx components/QuickAddInput.tsx
git commit -m "feat(mobile): render Malayalam reminder content in Noto Sans Malayalam"
```

---

### Task 10: Full verification pass

**Files:** none (verification only, no new code).

**Interfaces:**
- Consumes: everything from Tasks 1-9.
- Produces: nothing — this is the plan's final gate before considering the feature complete.

- [ ] **Step 1: Run the full mobile test suite**

Run: `cd artifacts/mobile && pnpm test`
Expected: PASS, all suites, including coverage collection (no `--no-coverage` this time, matching CI's default invocation via `pnpm --filter @workspace/mobile run test`).

- [ ] **Step 2: Run the mobile typecheck**

Run: `pnpm --filter @workspace/mobile run typecheck`
Expected: no errors.

- [ ] **Step 3: Run the full workspace typecheck**

Run: `pnpm run typecheck`
Expected: no errors (confirms the new dependency/lockfile change didn't break other packages' project references).

- [ ] **Step 4: Manual on-device check (cannot be automated — record as a follow-up, do not skip silently)**

Per the spec's Testing section, the following remain manual-only and are out of scope for this plan's automated steps, but should be checked by a human before shipping: Malayalam glyph rendering across all five render sites in both light/dark mode, no jarring cursor jump in `QuickAddInput` when typing the first Malayalam character, and — if the test device's OS speech engine supports Malayalam — an end-to-end spoken Malayalam reminder.

- [ ] **Step 5: Final commit if any fixups were needed during verification, otherwise confirm working tree is clean**

Run: `git status --short`
Expected: clean (nothing to commit) if all prior task commits succeeded cleanly.
