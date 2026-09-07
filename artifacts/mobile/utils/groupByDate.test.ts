import { groupByDate } from "./groupByDate";

// Fixed reference point: Wednesday. Chosen mid-week so "this week" (today+1..
// today+6) and "later" (today+7+) both have unambiguous test cases without
// crossing a month boundary.
const NOW = new Date("2026-09-09T12:00:00.000Z"); // Wednesday

function at(daysFromNow: number, hour = 9): { id: string; datetime: string } {
  const d = new Date(NOW);
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return { id: `d${daysFromNow}`, datetime: d.toISOString() };
}

const getDate = (item: { datetime: string }) => new Date(item.datetime);

describe("groupByDate", () => {
  it("puts a same-day item in Today", () => {
    const groups = groupByDate([at(0)], getDate, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: "today", label: "Today" });
  });

  it("puts an overdue (past) item in Today rather than dropping it", () => {
    const groups = groupByDate([at(-3)], getDate, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("today");
  });

  it("puts a next-day item in Tomorrow", () => {
    const groups = groupByDate([at(1)], getDate, NOW);
    expect(groups[0]).toMatchObject({ key: "tomorrow", label: "Tomorrow" });
  });

  it("labels days 2-6 out with their weekday name, one group per item", () => {
    const items = [at(2), at(3)];
    const groups = groupByDate(items, getDate, NOW);
    expect(groups.every((g) => g.key === "this-week")).toBe(true);
    expect(groups.map((g) => g.label)).toEqual(["Friday", "Saturday"]);
    expect(groups.every((g) => g.items.length === 1)).toBe(true);
  });

  it("puts a 7-or-more-days-out item in Later", () => {
    const groups = groupByDate([at(7)], getDate, NOW);
    expect(groups[0]).toMatchObject({ key: "later", label: "Later" });
  });

  it("groups a mixed list into ordered, correctly labeled buckets", () => {
    const items = [at(10), at(0), at(2), at(1)];
    const groups = groupByDate(items, getDate, NOW);
    expect(groups.map((g) => g.key)).toEqual(["today", "tomorrow", "this-week", "later"]);
  });

  it("collects multiple same-day items into one Today group", () => {
    const items = [at(0, 8), at(0, 20)];
    const groups = groupByDate(items, getDate, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
  });

  it("returns no groups for an empty list", () => {
    expect(groupByDate([], getDate, NOW)).toEqual([]);
  });
});
