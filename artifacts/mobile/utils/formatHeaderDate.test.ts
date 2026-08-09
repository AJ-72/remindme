import { formatHeaderDate } from "@/utils/formatHeaderDate";

describe("formatHeaderDate", () => {
  it("formats as DD, Month YYYY", () => {
    expect(formatHeaderDate(new Date(2026, 7, 8))).toBe("08, August 2026");
  });

  // Zero-padded: an unpadded day makes the header jitter as the month turns.
  it("zero-pads single-digit days", () => {
    expect(formatHeaderDate(new Date(2026, 0, 1))).toBe("01, January 2026");
  });

  it("leaves two-digit days unpadded", () => {
    expect(formatHeaderDate(new Date(2026, 11, 25))).toBe("25, December 2026");
  });

  it("uses the full month name, not an abbreviation", () => {
    expect(formatHeaderDate(new Date(2026, 8, 30))).toBe("30, September 2026");
  });

  it("handles a leap day", () => {
    expect(formatHeaderDate(new Date(2028, 1, 29))).toBe("29, February 2028");
  });
});
