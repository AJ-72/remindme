import { computeNextOccurrence, describeRecurrence, type RecurrenceRule } from "./recurrence";

describe("computeNextOccurrence", () => {
  describe("daily", () => {
    it("adds 1 day, preserving clock time, for interval 1", () => {
      const from = new Date(2026, 0, 15, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "daily", interval: 1 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 0, 16, 9, 30, 0));
    });

    it("adds N days for interval N", () => {
      const from = new Date(2026, 0, 15, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "daily", interval: 3 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 0, 18, 9, 30, 0));
    });
  });

  describe("weekly", () => {
    it("adds 7xN days when no byWeekday given", () => {
      const from = new Date(2026, 0, 15, 9, 30, 0); // Thursday
      const rule: RecurrenceRule = { freq: "weekly", interval: 2 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 0, 29, 9, 30, 0));
    });

    it("advances to the next listed weekday within the same week", () => {
      // 2026-01-15 is a Thursday (4). byWeekday includes Sat (6).
      const from = new Date(2026, 0, 15, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "weekly", interval: 1, byWeekday: [1, 6] };
      const next = computeNextOccurrence(rule, from);
      // Next Saturday is 2026-01-17
      expect(next).toEqual(new Date(2026, 0, 17, 9, 30, 0));
    });

    it("wraps to the following week (xN) after the last listed weekday", () => {
      // Thursday 2026-01-15, byWeekday = [1] (Monday only) => next Monday is 2026-01-19
      const from = new Date(2026, 0, 15, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "weekly", interval: 1, byWeekday: [1] };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 0, 19, 9, 30, 0));
    });

    it("wraps by N weeks (not just 1) once past the last listed weekday", () => {
      // Thursday 2026-01-15, byWeekday = [1] (Monday only), interval 2
      // Next Monday within cycle skipped since interval 2 means wrap adds 2 weeks from that Monday's base week.
      const from = new Date(2026, 0, 15, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "weekly", interval: 2, byWeekday: [1] };
      const next = computeNextOccurrence(rule, from);
      // Immediate next Monday (2026-01-19) is in the "current" week boundary from `from`;
      // since interval is 2, wrapping should land 2 weeks after the week containing `from`.
      expect(next).toEqual(new Date(2026, 0, 26, 9, 30, 0));
    });

    it("handles unsorted and duplicate-containing byWeekday without misbehaving", () => {
      const from = new Date(2026, 0, 15, 9, 30, 0); // Thursday
      const rule: RecurrenceRule = { freq: "weekly", interval: 1, byWeekday: [6, 1, 1, 6] };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 0, 17, 9, 30, 0));
    });
  });

  describe("monthly", () => {
    it("keeps same day-of-month, N months on", () => {
      const from = new Date(2026, 0, 10, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "monthly", interval: 1 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 1, 10, 9, 30, 0));
    });

    it("clamps Jan 31 + 1 month to Feb 28 in a non-leap year", () => {
      const from = new Date(2026, 0, 31, 9, 30, 0); // 2026 is not a leap year
      const rule: RecurrenceRule = { freq: "monthly", interval: 1 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 1, 28, 9, 30, 0));
    });

    it("clamps Jan 31 + 1 month to Feb 29 in a leap year", () => {
      const from = new Date(2028, 0, 31, 9, 30, 0); // 2028 is a leap year
      const rule: RecurrenceRule = { freq: "monthly", interval: 1 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2028, 1, 29, 9, 30, 0));
    });
  });

  describe("yearly", () => {
    it("keeps same month/day, N years on", () => {
      const from = new Date(2026, 8, 18, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "yearly", interval: 1 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2027, 8, 18, 9, 30, 0));
    });

    it("clamps Feb 29 to Feb 28 in a non-leap target year", () => {
      const from = new Date(2028, 1, 29, 9, 30, 0); // 2028 leap year
      const rule: RecurrenceRule = { freq: "yearly", interval: 1 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2029, 1, 28, 9, 30, 0));
    });
  });

  describe("DST", () => {
    it("preserves wall-clock time across a DST boundary rather than drifting by an hour", () => {
      // US DST spring-forward 2026: clocks jump forward on 2026-03-08.
      // A daily reminder starting 2026-03-07 09:30 local should land on
      // 2026-03-08 09:30 local, not 08:30 or 10:30, even though the
      // system's local timezone may or may not itself observe DST in test
      // environments. Constructing via local-time components (year, month,
      // day, hour, minute) rather than adding raw milliseconds is what makes
      // this hold regardless of the runner's TZ.
      const from = new Date(2026, 2, 7, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "daily", interval: 1 };
      const next = computeNextOccurrence(rule, from);
      expect(next.getHours()).toBe(9);
      expect(next.getMinutes()).toBe(30);
      expect(next.getDate()).toBe(8);
      expect(next.getMonth()).toBe(2);
    });
  });

  describe("defensive fallback", () => {
    // Documented fallback: interval < 1, a non-finite `from`, or an unknown
    // `freq` never throws and never loops. In each case we fall back to
    // treating the rule as if it were { freq: "daily", interval: 1 }
    // anchored at `from` (or at "now" if `from` itself is invalid), so the
    // function always returns *some* valid, strictly-later Date rather than
    // throwing or hanging. This keeps every caller (scheduling code) simple:
    // it never has to guard against an exception or an infinite computation
    // from a malformed rule, and a malformed rule degrades to "remind me
    // again tomorrow" instead of silently vanishing.
    it("treats interval < 1 as interval 1", () => {
      const from = new Date(2026, 0, 15, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "daily", interval: 0 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 0, 16, 9, 30, 0));
    });

    it("treats a negative interval as interval 1", () => {
      const from = new Date(2026, 0, 15, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "weekly", interval: -5 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 0, 22, 9, 30, 0));
    });

    it("does not throw or loop for a non-finite `from`, returning a valid Date strictly after now", () => {
      const rule: RecurrenceRule = { freq: "daily", interval: 1 };
      const before = Date.now();
      const next = computeNextOccurrence(rule, new Date(NaN));
      expect(Number.isFinite(next.getTime())).toBe(true);
      expect(next.getTime()).toBeGreaterThan(before);
    });

    it("treats an unknown freq as daily interval 1", () => {
      const from = new Date(2026, 0, 15, 9, 30, 0);
      const rule = { freq: "fortnightly", interval: 1 } as unknown as RecurrenceRule;
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 0, 16, 9, 30, 0));
    });
  });
});

describe("describeRecurrence", () => {
  it("describes daily interval 1 as 'Daily'", () => {
    expect(describeRecurrence({ freq: "daily", interval: 1 })).toBe("Daily");
  });

  it("describes daily interval N as 'Every N days'", () => {
    expect(describeRecurrence({ freq: "daily", interval: 2 })).toBe("Every 2 days");
  });

  it("describes weekly interval 1 with no byWeekday as 'Weekly'", () => {
    expect(describeRecurrence({ freq: "weekly", interval: 1 })).toBe("Weekly");
  });

  it("describes weekly interval N with no byWeekday as 'Every N weeks'", () => {
    expect(describeRecurrence({ freq: "weekly", interval: 3 })).toBe("Every 3 weeks");
  });

  it("describes weekly with byWeekday as 'Weekly on Mon, Wed'", () => {
    expect(describeRecurrence({ freq: "weekly", interval: 1, byWeekday: [1, 3] })).toBe(
      "Weekly on Mon, Wed"
    );
  });

  it("sorts and dedupes byWeekday in the description regardless of input order", () => {
    expect(describeRecurrence({ freq: "weekly", interval: 1, byWeekday: [3, 1, 1] })).toBe(
      "Weekly on Mon, Wed"
    );
  });

  it("describes monthly interval 1 as 'Monthly on the Nth'", () => {
    const rule: RecurrenceRule = { freq: "monthly", interval: 1 };
    // Anchor day is not part of the rule itself; description uses the rule
    // alone plus an optional anchor date. Test via describeRecurrence(rule, anchor).
    expect(describeRecurrence(rule, new Date(2026, 0, 15))).toBe("Monthly on the 15th");
  });

  it("describes monthly interval N as 'Every N months on the Nth'", () => {
    const rule: RecurrenceRule = { freq: "monthly", interval: 2 };
    expect(describeRecurrence(rule, new Date(2026, 0, 1))).toBe("Every 2 months on the 1st");
  });

  it("describes yearly as 'Yearly on 18 Sep'", () => {
    const rule: RecurrenceRule = { freq: "yearly", interval: 1 };
    expect(describeRecurrence(rule, new Date(2026, 8, 18))).toBe("Yearly on 18 Sep");
  });

  it("describes yearly interval N as 'Every N years on 18 Sep'", () => {
    const rule: RecurrenceRule = { freq: "yearly", interval: 3 };
    expect(describeRecurrence(rule, new Date(2026, 8, 18))).toBe("Every 3 years on 18 Sep");
  });
});
