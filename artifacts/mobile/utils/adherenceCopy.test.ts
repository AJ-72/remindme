import type { Reminder } from "@/services/ReminderService";
import { computeAdherenceStats } from "@/utils/adherenceStats";
import {
  applySuggestedHour,
  formatHour,
  formatHourRange,
  formatRate,
  formatSlip,
  headlineFor,
  hourAdviceBlocker,
  rankHours,
  stuckHeadline,
  suggestBetterHour,
} from "@/utils/adherenceCopy";

const NOW = new Date("2026-09-15T12:00:00.000Z");

function at(daysFromNow: number, hour: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

let seq = 0;
function reminder(over: Partial<Reminder> = {}): Reminder {
  seq += 1;
  return {
    id: `r${seq}`,
    title: `Task ${seq}`,
    description: "",
    datetime: at(-1, 9),
    completed: false,
    ...over,
  };
}

function done(hour: number, count: number): Reminder[] {
  return Array.from({ length: count }, () =>
    reminder({ completed: true, datetime: at(-2, hour), completedAt: at(-2, hour) })
  );
}

function missed(hour: number, count: number): Reminder[] {
  return Array.from({ length: count }, () => reminder({ datetime: at(-2, hour) }));
}

describe("formatHour", () => {
  it.each([
    [0, "12 AM"],
    [8, "8 AM"],
    [11, "11 AM"],
    [12, "12 PM"],
    [13, "1 PM"],
    [23, "11 PM"],
  ])("formats %i as %s", (hour, expected) => {
    expect(formatHour(hour)).toBe(expected);
  });

  it("wraps the range across midnight", () => {
    expect(formatHourRange(23)).toBe("11 PM–12 AM");
  });
});

describe("formatRate", () => {
  it("renders a dash rather than a fake zero when there is no rate", () => {
    expect(formatRate(null)).toBe("—");
  });

  it("rounds to whole percent", () => {
    expect(formatRate(0.666)).toBe("67%");
  });
});

describe("formatSlip", () => {
  it.each([
    [null, null],
    [0, "0 min"],
    [25, "25 min"],
    [60, "1 hr"],
    [130, "2 hr 10 min"],
    [1440, "1 day"],
    [4320, "3 days"],
  ])("formats %p as %p", (minutes, expected) => {
    expect(formatSlip(minutes as number | null)).toBe(expected);
  });

  it("never reports negative slip for a task finished early", () => {
    expect(formatSlip(-30)).toBe("0 min");
  });
});

describe("headlineFor", () => {
  it("says nothing has come due when there is no history", () => {
    expect(headlineFor(computeAdherenceStats([], NOW))).toMatch(/Nothing has come due/);
  });

  it("gives counts, not a verdict, below the rate floor", () => {
    const stats = computeAdherenceStats(done(9, 3), NOW);
    expect(headlineFor(stats)).toMatch(/3 of 3 done so far/);
  });

  it("is encouraging at a high rate", () => {
    expect(headlineFor(computeAdherenceStats(done(9, 10), NOW))).toMatch(/finish most/);
  });

  it("stays blameless at a low rate", () => {
    const stats = computeAdherenceStats([...done(9, 1), ...missed(22, 9)], NOW);
    const text = headlineFor(stats);
    expect(text).toMatch(/fixable/);
    expect(text).not.toMatch(/fail|lazy|bad/i);
  });
});

describe("suggestBetterHour", () => {
  /** 8 AM always done, 10 PM never done. */
  const stats = computeAdherenceStats([...done(8, 5), ...missed(22, 5)], NOW);

  it("offers the strong hour when the chosen one is measurably worse", () => {
    const s = suggestBetterHour(stats, 22);
    expect(s?.hour).toBe(8);
    expect(s?.text).toContain("8 AM");
    expect(s?.text).toContain("10 PM");
  });

  it("stays silent when the chosen hour is already the best one", () => {
    expect(suggestBetterHour(stats, 8)).toBeNull();
  });

  it("stays silent about an hour it has no evidence against", () => {
    // 3 PM is unmeasured: absence of data is not a reason to move the user.
    expect(suggestBetterHour(stats, 15)).toBeNull();
  });

  it("stays silent when the gap is inside the noise", () => {
    // 60% vs 80% is a 20-point gap, under the 25-point floor.
    const close = computeAdherenceStats(
      [...done(8, 4), ...missed(8, 1), ...done(20, 3), ...missed(20, 2)],
      NOW
    );
    expect(suggestBetterHour(close, 20)).toBeNull();
  });

  it("stays silent with no history at all", () => {
    expect(suggestBetterHour(computeAdherenceStats([], NOW), 9)).toBeNull();
  });

  // M2 Task 5b, per (A): moving a recurring reminder's hour moves EVERY
  // future occurrence, not one event - materially bigger than the
  // non-recurring case, and the copy must say so rather than reuse the
  // same sentence for two different consequences.
  it("says the change affects all future occurrences when the reminder is recurring", () => {
    const s = suggestBetterHour(stats, 22, { isRecurring: true });
    expect(s?.text).toMatch(/all future|every occurrence|every day|repeat/i);
  });

  it("keeps the plain, non-recurring copy when isRecurring is omitted", () => {
    const s = suggestBetterHour(stats, 22);
    expect(s?.text).not.toMatch(/all future|every occurrence|repeat/i);
  });

  it("keeps the plain, non-recurring copy when isRecurring is explicitly false", () => {
    const s = suggestBetterHour(stats, 22, { isRecurring: false });
    expect(s?.text).not.toMatch(/all future|every occurrence|repeat/i);
  });
});

describe("hourAdviceBlocker", () => {
  it("names how many more reminders are needed", () => {
    const stats = computeAdherenceStats(done(9, 2), NOW);
    expect(hourAdviceBlocker(stats)).toMatch(/6 more/);
  });

  it("uses the singular for one remaining", () => {
    const stats = computeAdherenceStats(done(9, 7), NOW);
    expect(hourAdviceBlocker(stats)).toMatch(/1 more finished or missed reminder\b/);
  });

  it("explains a spread problem once the sample is big enough", () => {
    const stats = computeAdherenceStats(done(9, 12), NOW);
    expect(hourAdviceBlocker(stats)).toMatch(/too few times of day/);
  });

  it("returns null once advice is actually available", () => {
    const stats = computeAdherenceStats([...done(8, 5), ...missed(22, 5)], NOW);
    expect(hourAdviceBlocker(stats)).toBeNull();
  });
});

describe("stuckHeadline", () => {
  it("uses the singular for one", () => {
    expect(stuckHeadline(1)).toBe("1 task keeps moving");
  });

  it("uses the plural otherwise", () => {
    expect(stuckHeadline(3)).toBe("3 tasks keep moving");
  });
});

describe("rankHours", () => {
  it("returns well-sampled hours strongest first", () => {
    const stats = computeAdherenceStats([...done(8, 5), ...missed(22, 5)], NOW);
    expect(rankHours(stats).map((h) => h.hour)).toEqual([8, 22]);
  });

  it("drops hours below the sample floor", () => {
    const stats = computeAdherenceStats([...done(8, 5), ...done(3, 1)], NOW);
    expect(rankHours(stats).map((h) => h.hour)).toEqual([8]);
  });
});

describe("applySuggestedHour", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");

  it("keeps the chosen day and replaces only the hour", () => {
    const chosen = new Date(now);
    chosen.setDate(chosen.getDate() + 3);
    chosen.setHours(22, 45, 0, 0);
    const moved = applySuggestedHour(chosen, 8, now);
    expect(moved.getDate()).toBe(chosen.getDate());
    expect(moved.getHours()).toBe(8);
    expect(moved.getMinutes()).toBe(0);
  });

  it("rolls to tomorrow rather than producing a time already past", () => {
    const chosen = new Date(now);
    chosen.setHours(23, 0, 0, 0);
    // 8 AM today is behind `now`, so it must not be saved as-is.
    const moved = applySuggestedHour(chosen, 8, now);
    expect(moved.getTime()).toBeGreaterThan(now.getTime());
    expect(moved.getDate()).toBe(chosen.getDate() + 1);
    expect(moved.getHours()).toBe(8);
  });

  it("does not mutate the date it was given", () => {
    const chosen = new Date(now);
    chosen.setHours(22, 45, 0, 0);
    const before = chosen.getTime();
    applySuggestedHour(chosen, 8, now);
    expect(chosen.getTime()).toBe(before);
  });
});
