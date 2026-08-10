import { formatDatetime } from "@/utils/formatDatetime";

// Fixed clock so "today"/"tomorrow" are deterministic. Mid-month and
// mid-morning so no test is accidentally near a month or day boundary.
const NOW = new Date(2026, 7, 10, 9, 0, 0); // 10 Aug 2026, 09:00 local

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

function at(year: number, month: number, day: number, hour = 14, minute = 30) {
  return new Date(year, month, day, hour, minute, 0).toISOString();
}

describe("formatDatetime", () => {
  it("labels a datetime later today as Today", () => {
    expect(formatDatetime(at(2026, 7, 10))).toMatch(/^Today · /);
  });

  it("labels a datetime earlier today as Today", () => {
    expect(formatDatetime(at(2026, 7, 10, 6, 0))).toMatch(/^Today · /);
  });

  it("labels the next day as Tomorrow", () => {
    expect(formatDatetime(at(2026, 7, 11))).toMatch(/^Tomorrow · /);
  });

  it("labels a later date with a short month and day", () => {
    const result = formatDatetime(at(2026, 7, 20));
    expect(result).not.toMatch(/Today|Tomorrow/);
    expect(result).toMatch(/Aug/);
    expect(result).toMatch(/20/);
  });

  it("labels a past date with a short month and day, not Today", () => {
    const result = formatDatetime(at(2026, 7, 1));
    expect(result).not.toMatch(/Today|Tomorrow/);
    expect(result).toMatch(/Aug/);
  });

  it("includes a time after the separator", () => {
    expect(formatDatetime(at(2026, 7, 10, 14, 30))).toMatch(/ · .*\d/);
  });

  it("does not treat the same day of an adjacent month as Today", () => {
    expect(formatDatetime(at(2026, 8, 10))).not.toMatch(/Today/);
  });

  it("does not treat the same date next year as Today", () => {
    expect(formatDatetime(at(2027, 7, 10))).not.toMatch(/Today/);
  });

  describe("across a month boundary", () => {
    // 31 Aug 2026: "tomorrow" is 1 Sep, whose getDate() is 1 — not 32.
    // A naive `now.getDate() + 1` check misses this on the last day of
    // every month, which is when the label matters most.
    const LAST_DAY = new Date(2026, 7, 31, 9, 0, 0);

    beforeEach(() => {
      jest.setSystemTime(LAST_DAY);
    });

    it("still labels the same day as Today", () => {
      expect(formatDatetime(at(2026, 7, 31, 18, 0))).toMatch(/^Today · /);
    });

    it("labels the 1st of the next month as Tomorrow", () => {
      expect(formatDatetime(at(2026, 8, 1, 9, 0))).toMatch(/^Tomorrow · /);
    });
  });

  describe("across a year boundary", () => {
    const NEW_YEARS_EVE = new Date(2026, 11, 31, 9, 0, 0);

    beforeEach(() => {
      jest.setSystemTime(NEW_YEARS_EVE);
    });

    it("labels 1 Jan as Tomorrow", () => {
      expect(formatDatetime(at(2027, 0, 1, 9, 0))).toMatch(/^Tomorrow · /);
    });
  });
});
