import { buildRecurrencePreviews } from "./recurrencePreviews";
import type { RecurrenceRule } from "./recurrence";

const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };
const weeklyMonRule: RecurrenceRule = { freq: "weekly", interval: 1, byWeekday: [1] };

function makeReminder(overrides: Partial<{
  id: string;
  title: string;
  datetime: string;
  completed: boolean;
  recurrence?: RecurrenceRule;
  recurrenceAnchor?: string;
}> = {}) {
  return {
    id: "r1",
    title: "Take medicine",
    datetime: "2026-09-19T09:00:00.000Z",
    completed: false,
    recurrence: dailyRule,
    recurrenceAnchor: "2026-09-19T09:00:00.000Z",
    ...overrides,
  };
}

describe("buildRecurrencePreviews", () => {
  it("returns two preview entries for an incomplete daily recurring reminder", () => {
    const reminder = makeReminder();
    const previews = buildRecurrencePreviews(reminder, 2);
    expect(previews).toHaveLength(2);
    expect(previews[0]).toMatchObject({
      kind: "recurrence-preview",
      parentId: "r1",
      title: "Take medicine",
      isLast: false,
    });
    expect(previews[1]).toMatchObject({ isLast: true });
    expect(new Date(previews[0].datetime).toISOString()).toBe("2026-09-20T09:00:00.000Z");
    expect(new Date(previews[1].datetime).toISOString()).toBe("2026-09-21T09:00:00.000Z");
  });

  it("sets the last preview's continuation label from describeRecurrence", () => {
    const previews = buildRecurrencePreviews(makeReminder({ recurrence: weeklyMonRule }), 2);
    expect(previews[1].continuesLabel).toBe("Weekly on Mon");
  });

  it("returns no continuation label on non-last previews", () => {
    const previews = buildRecurrencePreviews(makeReminder(), 2);
    expect(previews[0].continuesLabel).toBeUndefined();
  });

  it("returns an empty array for a non-recurring reminder", () => {
    const previews = buildRecurrencePreviews(makeReminder({ recurrence: undefined, recurrenceAnchor: undefined }), 2);
    expect(previews).toEqual([]);
  });

  it("still returns previews when the reminder itself was just completed", () => {
    const previews = buildRecurrencePreviews(makeReminder({ completed: true }), 2);
    expect(previews).toHaveLength(2);
  });

  it("computes previews after the reminder's own datetime even without recurrenceAnchor drift", () => {
    // anchor equals datetime here (fresh series) -- previews must still be
    // strictly after `datetime`, never duplicating the current occurrence.
    const previews = buildRecurrencePreviews(makeReminder(), 2);
    for (const p of previews) {
      expect(new Date(p.datetime).getTime()).toBeGreaterThan(
        new Date("2026-09-19T09:00:00.000Z").getTime()
      );
    }
  });
});
