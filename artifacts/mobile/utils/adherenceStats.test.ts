import type { Reminder } from "@/services/ReminderService";
import {
  computeAdherenceStats,
  computeStreak,
  MIN_SCORED_FOR_RATE,
  outcomeOf,
  plannedTime,
  STUCK_SNOOZE_THRESHOLD,
} from "@/utils/adherenceStats";

const NOW = new Date("2026-09-15T12:00:00.000Z");

/** Local-time ISO builder: the buckets are local-hour based, so the tests
 *  must construct local times or they drift with the runner's timezone. */
function at(daysFromNow: number, hour: number, minute = 0): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
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

describe("outcomeOf", () => {
  it("calls a completed reminder completed whatever its time", () => {
    expect(outcomeOf(reminder({ completed: true, datetime: at(5, 9) }), NOW)).toBe(
      "completed"
    );
  });

  it("calls a past-due incomplete reminder missed", () => {
    expect(outcomeOf(reminder({ datetime: at(-1, 9) }), NOW)).toBe("missed");
  });

  it("calls a future incomplete reminder pending, not missed", () => {
    expect(outcomeOf(reminder({ datetime: at(3, 9) }), NOW)).toBe("pending");
  });
});

describe("plannedTime", () => {
  it("prefers originalDatetime, which snoozing does not overwrite", () => {
    const r = reminder({ datetime: at(0, 17), originalDatetime: at(-2, 8) });
    expect(plannedTime(r).toISOString()).toBe(at(-2, 8));
  });

  it("falls back to datetime for a reminder never snoozed", () => {
    const r = reminder({ datetime: at(-2, 8) });
    expect(plannedTime(r).toISOString()).toBe(at(-2, 8));
  });
});

describe("computeAdherenceStats counting", () => {
  it("scores only decided reminders and leaves pending out of the rate", () => {
    const stats = computeAdherenceStats(
      [
        reminder({ completed: true, completedAt: at(-1, 9) }),
        reminder({ completed: true, completedAt: at(-1, 9) }),
        reminder({ completed: true, completedAt: at(-1, 9) }),
        reminder({ datetime: at(-1, 9) }),
        reminder({ datetime: at(-1, 9) }),
        reminder({ datetime: at(4, 9) }),
        reminder({ datetime: at(5, 9) }),
      ],
      NOW
    );
    expect(stats.scored).toBe(5);
    expect(stats.completed).toBe(3);
    expect(stats.missed).toBe(2);
    expect(stats.pending).toBe(2);
    expect(stats.completionRate).toBeCloseTo(0.6);
  });

  it("withholds the rate below the minimum sample", () => {
    const few = Array.from({ length: MIN_SCORED_FOR_RATE - 1 }, () =>
      reminder({ completed: true, completedAt: at(-1, 9) })
    );
    expect(computeAdherenceStats(few, NOW).completionRate).toBeNull();
  });

  it("splits on-time from late by the one-hour window", () => {
    const stats = computeAdherenceStats(
      [
        reminder({
          completed: true,
          datetime: at(-1, 9),
          completedAt: at(-1, 9, 30),
        }),
        reminder({
          completed: true,
          datetime: at(-1, 9),
          completedAt: at(-1, 14),
        }),
      ],
      NOW
    );
    expect(stats.onTime).toBe(1);
    expect(stats.late).toBe(1);
  });

  it("measures slip from the original time, not the snoozed one", () => {
    const stats = computeAdherenceStats(
      [
        reminder({
          completed: true,
          originalDatetime: at(-1, 9),
          datetime: at(-1, 11),
          completedAt: at(-1, 11),
        }),
      ],
      NOW
    );
    // 09:00 -> 11:00 is 120 minutes, not the 0 the snoozed datetime implies.
    expect(stats.medianSlipMinutes).toBe(120);
  });

  it("counts snoozes in total and counts postponed reminders once each", () => {
    const stats = computeAdherenceStats(
      [
        reminder({ snoozeCount: 4, datetime: at(-1, 9) }),
        reminder({ snoozeCount: 1, datetime: at(-1, 9) }),
        reminder({ datetime: at(-1, 9) }),
      ],
      NOW
    );
    expect(stats.totalSnoozes).toBe(5);
    expect(stats.postponed).toBe(2);
  });
});

describe("stuck reminders", () => {
  it("collects open reminders at or past the postponement threshold", () => {
    const stuck = reminder({ snoozeCount: STUCK_SNOOZE_THRESHOLD });
    const stats = computeAdherenceStats(
      [stuck, reminder({ snoozeCount: STUCK_SNOOZE_THRESHOLD - 1 })],
      NOW
    );
    expect(stats.stuck.map((r) => r.id)).toEqual([stuck.id]);
  });

  it("never calls a completed reminder stuck, however often it was postponed", () => {
    const stats = computeAdherenceStats(
      [reminder({ completed: true, snoozeCount: 9, completedAt: at(-1, 9) })],
      NOW
    );
    expect(stats.stuck).toEqual([]);
  });
});

describe("hour advice", () => {
  /** 08:00 always done, 22:00 never done, both well sampled. */
  function morningVsNight(): Reminder[] {
    const good = Array.from({ length: 5 }, () =>
      reminder({ completed: true, datetime: at(-2, 8), completedAt: at(-2, 8) })
    );
    const bad = Array.from({ length: 5 }, () =>
      reminder({ datetime: at(-2, 22) })
    );
    return [...good, ...bad];
  }

  it("names the strongest and weakest hour once there is enough evidence", () => {
    const stats = computeAdherenceStats(morningVsNight(), NOW);
    expect(stats.bestHour?.hour).toBe(8);
    expect(stats.bestHour?.rate).toBe(1);
    expect(stats.worstHour?.hour).toBe(22);
    expect(stats.worstHour?.rate).toBe(0);
  });

  it("gives no hour advice from a single hour of data", () => {
    const oneHour = Array.from({ length: 10 }, () =>
      reminder({ completed: true, datetime: at(-2, 8), completedAt: at(-2, 8) })
    );
    const stats = computeAdherenceStats(oneHour, NOW);
    expect(stats.bestHour).toBeNull();
    expect(stats.worstHour).toBeNull();
  });

  it("ignores hours below the per-bucket sample floor", () => {
    const stats = computeAdherenceStats(
      [
        ...morningVsNight(),
        // One lone 03:00 success must not be crowned the best hour.
        reminder({ completed: true, datetime: at(-2, 3), completedAt: at(-2, 3) }),
      ],
      NOW
    );
    expect(stats.bestHour?.hour).toBe(8);
  });

  it("buckets by the original hour, so snoozing cannot rewrite history", () => {
    const stats = computeAdherenceStats(
      Array.from({ length: 4 }, () =>
        reminder({ datetime: at(-2, 23), originalDatetime: at(-2, 7) })
      ),
      NOW
    );
    expect(stats.byHour[7].scored).toBe(4);
    expect(stats.byHour[23].scored).toBe(0);
  });
});

describe("computeStreak", () => {
  it("counts back over consecutive clean days", () => {
    const streak = computeStreak(
      [
        reminder({ completed: true, datetime: at(0, 9), completedAt: at(0, 9) }),
        reminder({ completed: true, datetime: at(-1, 9), completedAt: at(-1, 9) }),
        reminder({ completed: true, datetime: at(-2, 9), completedAt: at(-2, 9) }),
      ],
      NOW
    );
    expect(streak).toBe(3);
  });

  it("stops at the first day carrying a miss", () => {
    const streak = computeStreak(
      [
        reminder({ completed: true, datetime: at(0, 9), completedAt: at(0, 9) }),
        reminder({ datetime: at(-1, 9) }),
        reminder({ completed: true, datetime: at(-2, 9), completedAt: at(-2, 9) }),
      ],
      NOW
    );
    expect(streak).toBe(1);
  });

  it("steps over a day with no reminders instead of breaking on it", () => {
    const streak = computeStreak(
      [
        reminder({ completed: true, datetime: at(0, 9), completedAt: at(0, 9) }),
        // nothing due on day -1
        reminder({ completed: true, datetime: at(-2, 9), completedAt: at(-2, 9) }),
      ],
      NOW
    );
    expect(streak).toBe(2);
  });

  it("credits the day a task was due, not the day it was ticked", () => {
    // Done today, but it was owed yesterday: yesterday is the clean day.
    const streak = computeStreak(
      [reminder({ completed: true, datetime: at(-1, 9), completedAt: at(0, 9) })],
      NOW
    );
    expect(streak).toBe(1);
  });

  it("is zero with no history at all", () => {
    expect(computeStreak([], NOW)).toBe(0);
  });

  it("ignores pending future reminders", () => {
    expect(computeStreak([reminder({ datetime: at(3, 9) })], NOW)).toBe(0);
  });
});

describe("robustness", () => {
  it("returns a usable empty result for no reminders", () => {
    const stats = computeAdherenceStats([], NOW);
    expect(stats.scored).toBe(0);
    expect(stats.completionRate).toBeNull();
    expect(stats.medianSlipMinutes).toBeNull();
    expect(stats.byHour).toHaveLength(24);
    expect(stats.byWeekday).toHaveLength(7);
  });

  it("survives an unparseable datetime without throwing", () => {
    expect(() =>
      computeAdherenceStats([reminder({ datetime: "not-a-date" })], NOW)
    ).not.toThrow();
  });
});
