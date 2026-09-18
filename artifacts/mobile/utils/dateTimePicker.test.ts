import { toDateInput, toTimeInput } from "@/utils/dateTimePicker";

describe("toDateInput", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(toDateInput(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("pads single-digit month and day", () => {
    expect(toDateInput(new Date(2026, 8, 1))).toBe("2026-09-01");
  });

  it("does not pad a double-digit month or day", () => {
    expect(toDateInput(new Date(2026, 11, 25))).toBe("2026-12-25");
  });
});

describe("toTimeInput", () => {
  it("formats a time as HH:MM in 24-hour form", () => {
    expect(toTimeInput(new Date(2026, 0, 1, 14, 30))).toBe("14:30");
  });

  it("pads single-digit hour and minute", () => {
    expect(toTimeInput(new Date(2026, 0, 1, 9, 5))).toBe("09:05");
  });

  it("formats midnight as 00:00", () => {
    expect(toTimeInput(new Date(2026, 0, 1, 0, 0))).toBe("00:00");
  });
});
