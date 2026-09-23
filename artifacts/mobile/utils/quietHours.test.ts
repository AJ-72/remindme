import fc from "fast-check";
import {
  DEFAULT_QUIET_HOURS,
  formatQuietTime,
  isQuietAt,
  minutesFromDate,
  quietHoursEndAfter,
  type QuietHours,
} from "./quietHours";

function at(hour: number, minute = 0): Date {
  return new Date(2026, 7, 23, hour, minute, 0, 0);
}

describe("isQuietAt", () => {
  // The default window wraps midnight, which is the classic off-by-one in
  // every quiet-hours implementation ever written: times AFTER start and
  // times BEFORE end are both inside it.
  it("treats a midnight-wrapping window as one continuous span", () => {
    expect(isQuietAt(at(23), DEFAULT_QUIET_HOURS)).toBe(true);
    expect(isQuietAt(at(2), DEFAULT_QUIET_HOURS)).toBe(true);
    expect(isQuietAt(at(7, 59), DEFAULT_QUIET_HOURS)).toBe(true);
    expect(isQuietAt(at(8), DEFAULT_QUIET_HOURS)).toBe(false);
    expect(isQuietAt(at(12), DEFAULT_QUIET_HOURS)).toBe(false);
    expect(isQuietAt(at(21, 59), DEFAULT_QUIET_HOURS)).toBe(false);
    expect(isQuietAt(at(22), DEFAULT_QUIET_HOURS)).toBe(true);
  });

  it("handles a same-day window that does not wrap", () => {
    const dayShift: QuietHours = { startMinute: 9 * 60, endMinute: 17 * 60 };
    expect(isQuietAt(at(8, 59), dayShift)).toBe(false);
    expect(isQuietAt(at(9), dayShift)).toBe(true);
    expect(isQuietAt(at(16, 59), dayShift)).toBe(true);
    expect(isQuietAt(at(17), dayShift)).toBe(false);
  });

  // The degenerate case. Reading it as "always quiet" would silently disable
  // every notification the app sends, with no error anywhere.
  it("treats start === end as NO quiet hours, never as always-quiet", () => {
    const none: QuietHours = { startMinute: 0, endMinute: 0 };
    expect(isQuietAt(at(0), none)).toBe(false);
    expect(isQuietAt(at(3), none)).toBe(false);
    expect(isQuietAt(at(23, 59), none)).toBe(false);

    const alsoNone: QuietHours = { startMinute: 22 * 60, endMinute: 22 * 60 };
    expect(isQuietAt(at(22), alsoNone)).toBe(false);
  });
});

describe("quietHoursEndAfter", () => {
  it("returns this morning's end when already inside the window after midnight", () => {
    const end = quietHoursEndAfter(at(2), DEFAULT_QUIET_HOURS);
    expect(end.getDate()).toBe(23);
    expect(end.getHours()).toBe(8);
    expect(end.getMinutes()).toBe(0);
  });

  it("returns tomorrow's end when inside the window before midnight", () => {
    const end = quietHoursEndAfter(at(23), DEFAULT_QUIET_HOURS);
    expect(end.getDate()).toBe(24);
    expect(end.getHours()).toBe(8);
  });

  it("returns the next end even when not currently quiet", () => {
    const end = quietHoursEndAfter(at(12), DEFAULT_QUIET_HOURS);
    expect(end.getDate()).toBe(24);
    expect(end.getHours()).toBe(8);
  });

  // A trigger date in the past is delivered immediately by
  // expo-notifications, so landing exactly on the boundary must roll forward.
  it("is always strictly in the future", () => {
    const exactlyEnd = quietHoursEndAfter(at(8), DEFAULT_QUIET_HOURS);
    expect(exactlyEnd.getTime()).toBeGreaterThan(at(8).getTime());
    expect(exactlyEnd.getDate()).toBe(24);
  });

  it("zeroes seconds and milliseconds so the boundary is exact", () => {
    const end = quietHoursEndAfter(new Date(2026, 7, 23, 2, 0, 37, 500), DEFAULT_QUIET_HOURS);
    expect(end.getSeconds()).toBe(0);
    expect(end.getMilliseconds()).toBe(0);
  });
});

describe("formatQuietTime", () => {
  it("zero-pads to a 24-hour clock", () => {
    expect(formatQuietTime(0)).toBe("00:00");
    expect(formatQuietTime(8 * 60)).toBe("08:00");
    expect(formatQuietTime(22 * 60 + 5)).toBe("22:05");
    expect(formatQuietTime(23 * 60 + 59)).toBe("23:59");
  });
});

describe("minutesFromDate", () => {
  it("converts a date to minutes since local midnight", () => {
    expect(minutesFromDate(at(0))).toBe(0);
    expect(minutesFromDate(at(22, 30))).toBe(22 * 60 + 30);
  });
});

// Property-based tests (fast-check): instead of picking individual example
// times, these check a rule against many random inputs, including boundary
// values fast-check biases toward (0, 1, 1439, etc.). See the mutation
// testing / formal verification report for why these two properties were
// chosen: they are the exact boundary-operator invariants a wrong `>=`/`<`
// mutant in isQuietAt/quietHoursEndAfter would break.
describe("quietHoursEndAfter (property-based)", () => {
  const minuteOfDay = fc.integer({ min: 0, max: 1439 }); // minutes in a day, MINUTES_PER_DAY - 1
  // A fixed local-time range keeps this independent of the runner's epoch
  // and matches the fixture style used above (local `new Date(...)`, not UTC).
  const anyDate = fc.integer({ min: 2020, max: 2035 }).chain((year) =>
    fc
      .tuple(
        fc.integer({ min: 0, max: 11 }),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 })
      )
      .map(([month, day, hour, minute]) => new Date(year, month, day, hour, minute, 0, 0))
  );

  it("is always strictly later than the input date", () => {
    fc.assert(
      fc.property(anyDate, minuteOfDay, minuteOfDay, (date, startMinute, endMinute) => {
        fc.pre(startMinute !== endMinute); // an empty window means "no quiet hours"
        const end = quietHoursEndAfter(date, { startMinute, endMinute });
        expect(end.getTime()).toBeGreaterThan(date.getTime());
      })
    );
  });

  it("never lands back inside the quiet window it just ended", () => {
    fc.assert(
      fc.property(anyDate, minuteOfDay, minuteOfDay, (date, startMinute, endMinute) => {
        fc.pre(startMinute !== endMinute);
        const window = { startMinute, endMinute };
        const end = quietHoursEndAfter(date, window);
        expect(isQuietAt(end, window)).toBe(false);
      })
    );
  });
});
