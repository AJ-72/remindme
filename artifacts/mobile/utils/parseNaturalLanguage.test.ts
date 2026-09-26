import { parseNaturalLanguage } from "./parseNaturalLanguage";
import { DEFAULT_QUIET_HOURS } from "./quietHours";

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

describe("parseNaturalLanguage — ordinal day + relative month/year (chrono gap)", () => {
  it("keeps the ordinal day of month when combined with 'next month'", () => {
    const now = new Date(2026, 8, 7, 10, 0, 0); // Sep 7 2026
    const { title, date } = parseNaturalLanguage("remind me on 23rd next month at 8.00 AM", now);
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(9); // October
    expect(date!.getDate()).toBe(23);
    expect(date!.getHours()).toBe(8);
    expect(title).toBe("remind me");
  });

  it("keeps the ordinal day of month when combined with 'this month'", () => {
    const now = new Date(2026, 8, 7, 10, 0, 0);
    const { date } = parseNaturalLanguage("remind me on 5th this month at 8am", now);
    expect(date).not.toBeNull();
    expect(date!.getMonth()).toBe(8); // September
    expect(date!.getDate()).toBe(5);
  });

  it("keeps the ordinal day of month when combined with 'next year'", () => {
    const now = new Date(2026, 8, 7, 10, 0, 0);
    const { date } = parseNaturalLanguage("remind me on 23rd next year at 8am", now);
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2027);
    expect(date!.getMonth()).toBe(8); // September
    expect(date!.getDate()).toBe(23);
  });

  it("clamps an out-of-range day to the last day of the resolved month", () => {
    const now = new Date(2026, 0, 15, 10, 0, 0); // Jan 15 2026
    const { date } = parseNaturalLanguage("remind me on 31st next month at 8am", now);
    expect(date).not.toBeNull();
    expect(date!.getMonth()).toBe(1); // February
    expect(date!.getDate()).toBe(28); // 2026 is not a leap year
  });

  it("removes the ordinal-day-plus-relative-month phrase entirely from the title", () => {
    const now = new Date(2026, 8, 7, 10, 0, 0);
    const { title } = parseNaturalLanguage("pay rent on the 1st of next month", now);
    expect(title).toBe("pay rent");
  });
});

describe("parseNaturalLanguage — recurrence", () => {
  it("strips the recurrence phrase and keeps chrono's time when both are present", () => {
    const { title, date, recurrence } = parseNaturalLanguage("buy milk every day at 8am");
    expect(title).toBe("buy milk");
    expect(recurrence).toEqual({ freq: "daily", interval: 1 });
    expect(date).not.toBeNull();
    expect(date!.getHours()).toBe(8);
  });

  it("anchors a recurrence phrase with no explicit time to 9am on the rule's first occurrence", () => {
    // "pay rent monthly" has no clock time and no date chrono recognizes at
    // all (verified: chrono.parse returns zero results for this string), so
    // this exercises the true anchor-default path — 9:00 AM local, on the
    // rule's first occurrence computed from `now` (see the comment in
    // parseNaturalLanguage.ts for why 9am was chosen).
    const now = new Date(2026, 8, 7, 10, 0, 0); // Sep 7 2026, 10:00
    const { title, date, recurrence } = parseNaturalLanguage("pay rent monthly", now);
    expect(recurrence).toEqual({ freq: "monthly", interval: 1 });
    expect(date).not.toBeNull();
    expect(date!.getMonth()).toBe(9); // October (next month from the 9am-anchored Sep 7)
    expect(date!.getDate()).toBe(7);
    expect(date!.getHours()).toBe(9);
    expect(date!.getMinutes()).toBe(0);
    expect(title).toBe("pay rent");
  });

  it("strips an embedded recurrence phrase even when chrono's own match overlaps it", () => {
    // "every monday" [0,12) overlaps chrono's own "monday" match [6,12) —
    // this exercises the range-merge in stripRanges/mergeRanges so the
    // title doesn't come out mangled ("out trash" instead of "take out
    // trash") from double-stripping the same overlapping span.
    const now = new Date(2026, 8, 7, 10, 0, 0); // Sep 7 2026 is itself a Monday
    const { title, recurrence } = parseNaturalLanguage("every monday take out trash", now);
    expect(recurrence).toEqual({ freq: "weekly", interval: 1, byWeekday: [1] });
    expect(title).toBe("take out trash");
  });

  it("returns no recurrence for plain non-recurring text", () => {
    const { recurrence } = parseNaturalLanguage("Call mom tomorrow at 3pm");
    expect(recurrence).toBeUndefined();
  });

  it("strips a weekly-with-time recurrence phrase from the title", () => {
    const now = new Date(2026, 8, 7, 10, 0, 0);
    const { title, date, recurrence } = parseNaturalLanguage(
      "water the plants every week at 6pm",
      now
    );
    expect(title).toBe("water the plants");
    expect(recurrence).toEqual({ freq: "weekly", interval: 1 });
    expect(date).not.toBeNull();
    expect(date!.getHours()).toBe(18);
  });

  it("does not set recurrence for the Malayalam path", () => {
    const { recurrence } = parseNaturalLanguage("നാളെ വൈകിട്ട് 5 മണിക്ക് മീറ്റിംഗ്");
    expect(recurrence).toBeUndefined();
  });
});

describe("parseNaturalLanguage — 'day after tomorrow' (chrono gap)", () => {
  const now = new Date();
  const inTwoDays = (h: number, m = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    d.setHours(h, m, 0, 0);
    return d;
  };

  it("resolves bare 'day after tomorrow at 5pm' two days out and strips it from the title", () => {
    const { title, date } = parseNaturalLanguage("Call mom day after tomorrow at 5pm", now);
    expect(date!.getTime()).toBe(inTwoDays(17).getTime());
    expect(title).toBe("Call mom");
  });

  it("handles the phrase leading the text", () => {
    const { title, date } = parseNaturalLanguage("day after tomorrow 9am pay rent", now);
    expect(date!.getTime()).toBe(inTwoDays(9).getTime());
    expect(title).toBe("pay rent");
  });

  it("handles it without a time", () => {
    const { title, date } = parseNaturalLanguage("Pay rent day after tomorrow", now);
    expect(date!.getDate()).toBe(inTwoDays(0).getDate());
    expect(title).toBe("Pay rent");
  });

  it("still resolves 'the day after tomorrow' (chrono's own path) to the same day", () => {
    const { title, date } = parseNaturalLanguage("Call mom the day after tomorrow at 5pm", now);
    expect(date!.getTime()).toBe(inTwoDays(17).getTime());
    expect(title).toBe("Call mom");
  });

  it("leaves plain 'tomorrow' at one day out", () => {
    const { date } = parseNaturalLanguage("Call mom tomorrow at 5pm", now);
    const d = inTwoDays(17);
    d.setDate(d.getDate() - 1);
    expect(date!.getTime()).toBe(d.getTime());
  });
});

describe("parseNaturalLanguage — other English phrases chrono misses", () => {
  const now = new Date();
  const at = (dayOffset: number, h: number, m = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };

  it.each(["2moro", "tomorow", "tommorow"])("reads the misspelling '%s' as tomorrow", (word) => {
    const { title, date } = parseNaturalLanguage(`Call mom ${word} at 5pm`, now);
    expect(date!.getTime()).toBe(at(1, 17));
    expect(title).toBe("Call mom");
  });

  it("reads 'tonite' as tonight", () => {
    const { title, date } = parseNaturalLanguage("Call mom tonite", now);
    expect(date).not.toBeNull();
    expect(title).toBe("Call mom");
  });

  it("reads 'in a fortnight' as two weeks out", () => {
    const { title, date } = parseNaturalLanguage("Call mom in a fortnight at 5pm", now);
    expect(date!.getTime()).toBe(at(14, 17));
    expect(title).toBe("Call mom");
  });

  it("reads 'next to next week' as two weeks out, not one", () => {
    const { title, date } = parseNaturalLanguage("Call mom next to next week at 5pm", now);
    expect(date!.getTime()).toBe(at(14, 17));
    expect(title).toBe("Call mom");
  });

  it("reads 'a week from today' as one date, stripping the whole phrase", () => {
    const { title, date } = parseNaturalLanguage("Call mom a week from today at 5pm", now);
    expect(date!.getTime()).toBe(at(7, 17));
    expect(title).toBe("Call mom");
  });

  it("reads 'a week from tomorrow' as eight days out", () => {
    const { title, date } = parseNaturalLanguage("Call mom a week from tomorrow at 5pm", now);
    expect(date!.getTime()).toBe(at(8, 17));
    expect(title).toBe("Call mom");
  });

  it.each([
    ["half past 5 pm", 17, 30],
    ["quarter past 5 pm", 17, 15],
    ["quarter to 6 pm", 17, 45],
  ])("reads '%s' as a clock time", (phrase, h, m) => {
    const { title, date } = parseNaturalLanguage(`Call mom tomorrow at ${phrase}`, now);
    expect(date!.getTime()).toBe(at(1, h, m));
    expect(title).toBe("Call mom");
  });

  it("reads 'end of the month' as the last day of this month", () => {
    const { title, date } = parseNaturalLanguage("Pay rent by end of the month", now);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    expect(date!.getMonth()).toBe(last.getMonth());
    expect(date!.getDate()).toBe(last.getDate());
    expect(title).toBe("Pay rent");
  });

  it("reads 'end of next month' as the last day of next month", () => {
    const { date } = parseNaturalLanguage("Pay rent end of next month", now);
    const last = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    expect(date!.getMonth()).toBe(last.getMonth());
    expect(date!.getDate()).toBe(last.getDate());
  });

  it("combines 'day after tomorrow' with a period of day", () => {
    const { title, date } = parseNaturalLanguage("Call mom day after tomorrow evening", now);
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    expect(date!.getDate()).toBe(d.getDate());
    expect(title).toBe("Call mom");
  });

  it("leaves a title with no date words untouched", () => {
    expect(parseNaturalLanguage("Read the quarterly report", now)).toEqual({
      title: "Read the quarterly report",
      date: null,
    });
  });
});

describe("parseNaturalLanguage — AM/PM left unsaid", () => {
  const now = new Date();

  it.each(["at 5", "at 5:30", "tomorrow at 7"])("asks when '%s' has no AM/PM", (phrase) => {
    const { ambiguity, title } = parseNaturalLanguage(`Call mom ${phrase}`, now);
    expect(ambiguity?.kind).toBe("meridiem");
    expect(title).toBe("Call mom");
    const am = ambiguity!.asTime.date!;
    const pm = ambiguity!.asText.date!;
    expect(pm.getHours() - am.getHours()).toBe(12);
    expect(am.getMinutes()).toBe(pm.getMinutes());
    expect(ambiguity!.asTime.title).toBe("Call mom");
    expect(ambiguity!.asText.title).toBe("Call mom");
  });

  it("puts each reading at its next occurrence when no day was given", () => {
    const { ambiguity } = parseNaturalLanguage("Call mom at 5", now);
    for (const reading of [ambiguity!.asTime, ambiguity!.asText]) {
      const d = reading.date!;
      expect(d.getTime()).toBeGreaterThan(now.getTime());
      expect(d.getTime() - now.getTime()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    }
  });

  it.each([
    "at 5pm",
    "at 5 am",
    "at 17:30",
    "at 08:00",
    "tonight at 8",
    "tomorrow evening at 8",
    "tomorrow morning at 7",
    "in 2 hours",
    "tomorrow",
    "at noon",
  ])("does not ask when '%s' settles it", (phrase) => {
    expect(parseNaturalLanguage(`Call mom ${phrase}`, now).ambiguity).toBeUndefined();
  });
});

describe("parseNaturalLanguage — EOD", () => {
  const now = new Date();

  it.each(["eod", "EOD", "by eod", "end of day", "by end of the day"])(
    "reads '%s' as the start of quiet hours",
    (phrase) => {
      const { title, date, ambiguity } = parseNaturalLanguage(`Send report ${phrase}`, now, {
        eodMinute: 21 * 60 + 30,
      });
      expect(title).toBe("Send report");
      expect(ambiguity).toBeUndefined();
      expect(date!.getHours()).toBe(21);
      expect(date!.getMinutes()).toBe(30);
      expect(date!.getTime()).toBeGreaterThan(now.getTime());
    },
  );

  it("defaults to the default quiet-hours start when none is passed", () => {
    const { date } = parseNaturalLanguage("Send report eod", now);
    expect(date!.getHours()).toBe(Math.floor(DEFAULT_QUIET_HOURS.startMinute / 60));
  });

  it("does not ask AM or PM for a morning quiet-hours start", () => {
    const { date, ambiguity } = parseNaturalLanguage("Send report eod", now, { eodMinute: 9 * 60 });
    expect(ambiguity).toBeUndefined();
    expect(date!.getHours()).toBe(9);
  });
});

describe("parseNaturalLanguage — 'coming <weekday>'", () => {
  const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const now = new Date();
  const daysUntil = (d: Date) => {
    const a = new Date(now);
    a.setHours(0, 0, 0, 0);
    const b = new Date(d);
    b.setHours(0, 0, 0, 0);
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  };

  it("said on that same weekday, means next week's", () => {
    const today = WEEKDAY_NAMES[now.getDay()];
    for (const phrase of [`coming ${today}`, `this coming ${today}`]) {
      const { title, date } = parseNaturalLanguage(`Call mom ${phrase} at 5pm`, now);
      expect(daysUntil(date!)).toBe(7);
      expect(title).toBe("Call mom");
    }
  });

  it("on any other day, means the next one, and drops 'coming' from the title", () => {
    const tomorrow = WEEKDAY_NAMES[(now.getDay() + 1) % 7];
    const { title, date } = parseNaturalLanguage(`Call mom coming ${tomorrow} at 5pm`, now);
    expect(daysUntil(date!)).toBe(1);
    expect(title).toBe("Call mom");
  });
});

// Pinned to the hour that exposed it: typed at 3 PM, chrono rolls its AM
// reading to tomorrow, and the PM reading must not inherit that day.
describe("parseNaturalLanguage — AM/PM readings keep today when it still fits", () => {
  it("reads 'at 5' typed at 3 PM as today 5 PM or tomorrow 5 AM", () => {
    const now = new Date(2026, 8, 26, 15, 0, 0);
    const { ambiguity } = parseNaturalLanguage("Call mom at 5", now);
    const pm = ambiguity!.asText.date!;
    const am = ambiguity!.asTime.date!;
    expect([pm.getDate(), pm.getHours()]).toEqual([26, 17]);
    expect([am.getDate(), am.getHours()]).toEqual([27, 5]);
  });
});
