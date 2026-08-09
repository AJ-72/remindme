import {
  DEFAULT_SNOOZE_PRESET,
  SNOOZE_PRESETS,
  isSnoozePreset,
  resolveSnoozeTarget,
  snoozeActionLabel,
  snoozePresetLabel,
} from "@/utils/snoozePresets";

const NOW = new Date("2026-08-07T10:00:00");

describe("SNOOZE_PRESETS", () => {
  it("offers the five agreed presets in order", () => {
    expect(SNOOZE_PRESETS).toEqual([
      { kind: "minutes", minutes: 5 },
      { kind: "minutes", minutes: 15 },
      { kind: "minutes", minutes: 30 },
      { kind: "minutes", minutes: 60 },
      { kind: "tomorrow" },
    ]);
  });

  it("defaults to 15 minutes", () => {
    expect(DEFAULT_SNOOZE_PRESET).toEqual({ kind: "minutes", minutes: 15 });
  });
});

describe("resolveSnoozeTarget — minutes presets", () => {
  it("adds the minutes to now, ignoring the reminder's own datetime", () => {
    // The reminder fired an hour ago; a minutes-snooze is always from NOW.
    const past = new Date("2026-08-07T09:00:00").toISOString();
    const target = resolveSnoozeTarget({ kind: "minutes", minutes: 15 }, past, NOW);
    expect(target.getTime()).toBe(NOW.getTime() + 15 * 60 * 1000);
  });

  it("handles the 60-minute preset", () => {
    const target = resolveSnoozeTarget(
      { kind: "minutes", minutes: 60 },
      NOW.toISOString(),
      NOW
    );
    expect(target.getTime()).toBe(NOW.getTime() + 60 * 60 * 1000);
  });
});

describe("resolveSnoozeTarget — tomorrow preset", () => {
  it("adds 24h to the reminder's datetime, not to now", () => {
    // Reminder was set for 08:30; snoozing at 10:00 must land on 08:30 tomorrow.
    const scheduled = new Date("2026-08-07T08:30:00").toISOString();
    const target = resolveSnoozeTarget({ kind: "tomorrow" }, scheduled, NOW);
    expect(target.toISOString()).toBe(new Date("2026-08-08T08:30:00").toISOString());
  });

  it("rolls forward past a stale reminder so the target is always in the future", () => {
    // Reminder is 3 days stale: +24h would still be in the past and would
    // fire immediately. Roll forward in whole days to preserve "same time".
    const stale = new Date("2026-08-04T08:30:00").toISOString();
    const target = resolveSnoozeTarget({ kind: "tomorrow" }, stale, NOW);
    expect(target.getTime()).toBeGreaterThan(NOW.getTime());
    expect(target.toISOString()).toBe(new Date("2026-08-08T08:30:00").toISOString());
  });

  it("rolls forward when the target lands exactly on now", () => {
    const exactly24hAgo = new Date("2026-08-06T10:00:00").toISOString();
    const target = resolveSnoozeTarget({ kind: "tomorrow" }, exactly24hAgo, NOW);
    expect(target.getTime()).toBeGreaterThan(NOW.getTime());
    expect(target.toISOString()).toBe(new Date("2026-08-08T10:00:00").toISOString());
  });

  it("handles a future reminder datetime without rolling forward", () => {
    const future = new Date("2026-08-07T18:00:00").toISOString();
    const target = resolveSnoozeTarget({ kind: "tomorrow" }, future, NOW);
    expect(target.toISOString()).toBe(new Date("2026-08-08T18:00:00").toISOString());
  });

  it("falls back to a 24h-from-now target for an unparseable datetime", () => {
    const target = resolveSnoozeTarget({ kind: "tomorrow" }, "not-a-date", NOW);
    expect(target.getTime()).toBe(NOW.getTime() + 24 * 60 * 60 * 1000);
  });
});

describe("labels", () => {
  it("labels minutes presets for the sheet", () => {
    expect(snoozePresetLabel({ kind: "minutes", minutes: 5 })).toBe("5 minutes");
    expect(snoozePresetLabel({ kind: "minutes", minutes: 60 })).toBe("1 hour");
  });

  it("labels the tomorrow preset for the sheet", () => {
    expect(snoozePresetLabel({ kind: "tomorrow" })).toBe("Tomorrow, same time");
  });

  it("labels presets for the notification action button", () => {
    expect(snoozeActionLabel({ kind: "minutes", minutes: 15 })).toBe("Snooze 15 min");
    expect(snoozeActionLabel({ kind: "minutes", minutes: 60 })).toBe("Snooze 1 hr");
    expect(snoozeActionLabel({ kind: "tomorrow" })).toBe("Snooze to tomorrow");
  });
});

describe("isSnoozePreset", () => {
  it("accepts valid presets", () => {
    expect(isSnoozePreset({ kind: "minutes", minutes: 30 })).toBe(true);
    expect(isSnoozePreset({ kind: "tomorrow" })).toBe(true);
  });

  it("rejects malformed or unknown values", () => {
    expect(isSnoozePreset(null)).toBe(false);
    expect(isSnoozePreset({ kind: "minutes" })).toBe(false);
    expect(isSnoozePreset({ kind: "minutes", minutes: 7 })).toBe(false);
    expect(isSnoozePreset({ kind: "weekly" })).toBe(false);
    expect(isSnoozePreset("10")).toBe(false);
  });
});
