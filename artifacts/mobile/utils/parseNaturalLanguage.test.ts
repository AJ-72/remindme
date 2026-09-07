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
