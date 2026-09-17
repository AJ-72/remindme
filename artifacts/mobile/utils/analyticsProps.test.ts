import {
  contentScript,
  leadTimeBucket,
  reminderCountBucket,
  reminderProps,
  snoozePresetKey,
} from "@/utils/analyticsProps";

const HOUR = 3_600_000;

describe("leadTimeBucket", () => {
  const base = "2026-09-17T09:00:00.000Z";
  const at = (ms: number) => new Date(Date.parse(base) + ms).toISOString();

  it.each([
    [-HOUR, "overdue"],
    [HOUR / 2, "under_1h"],
    [5 * HOUR, "same_day"],
    [30 * HOUR, "tomorrow"],
    [4 * 24 * HOUR, "this_week"],
    [30 * 24 * HOUR, "beyond_week"],
  ])("buckets %i ms ahead as %s", (offset, expected) => {
    expect(leadTimeBucket(at(offset as number), base)).toBe(expected);
  });

  it("does not throw on an unparseable date", () => {
    expect(leadTimeBucket("not a date", base)).toBe("same_day");
  });
});

describe("contentScript", () => {
  it("reports the script, never the text", () => {
    expect(contentScript("ആപ്പിൾ വാങ്ങണം")).toBe("ml");
    expect(contentScript("buy apples")).toBe("en");
  });
});

describe("reminderCountBucket", () => {
  it.each([
    [0, "0"],
    [3, "1-5"],
    [12, "6-20"],
    [44, "21-50"],
    [900, "50+"],
  ])("buckets %i as %s", (n, expected) => {
    expect(reminderCountBucket(n as number)).toBe(expected);
  });
});

describe("snoozePresetKey", () => {
  it("uses a machine key, not the display label", () => {
    expect(snoozePresetKey({ kind: "minutes", minutes: 60 })).toBe("min_60");
    expect(snoozePresetKey({ kind: "tomorrow" })).toBe("tomorrow");
  });
});

describe("reminderProps", () => {
  const reminder = {
    title: "Call the dentist",
    description: "ask about the crown",
    datetime: "2026-09-17T15:00:00.000Z",
    createdAt: "2026-09-17T09:00:00.000Z",
    recipient: { name: "Asha", phone: "+919876543210" },
  };

  it("describes the reminder without quoting any of it", () => {
    const props = reminderProps(reminder);
    const serialized = JSON.stringify(props);

    expect(serialized).not.toContain("dentist");
    expect(serialized).not.toContain("crown");
    expect(serialized).not.toContain("Asha");
    expect(serialized).not.toContain("9876543210");
  });

  it("reports the shape the product questions actually need", () => {
    const props = reminderProps(reminder);

    expect(props.lead_time).toBe("same_day");
    expect(props.has_description).toBe(true);
    expect(props.for_someone_else).toBe(true);
    expect(props.script).toBe("en");
    expect(props.snooze_count).toBe(0);
  });

  it("defaults alarm and exact timing to on, matching the reminder record", () => {
    const props = reminderProps({ title: "x", datetime: reminder.datetime });

    expect(props.alarm).toBe(true);
    expect(props.exact_timing).toBe(true);
    expect(props.for_someone_else).toBe(false);
  });
});
