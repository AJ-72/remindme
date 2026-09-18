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
