import { getLocales } from "expo-localization";
import {
  callingCodeForRegion,
  normalizePhone,
  toWhatsAppDigits,
} from "@/utils/phoneNumber";

beforeEach(() => {
  jest.clearAllMocks();
  (getLocales as jest.Mock).mockReturnValue([
    { languageTag: "en-IN", languageCode: "en", regionCode: "IN" },
  ]);
});

describe("callingCodeForRegion", () => {
  it("maps known regions", () => {
    expect(callingCodeForRegion("IN")).toBe("91");
    expect(callingCodeForRegion("US")).toBe("1");
    expect(callingCodeForRegion("GB")).toBe("44");
    expect(callingCodeForRegion("AE")).toBe("971");
  });

  it("is case-insensitive", () => {
    expect(callingCodeForRegion("in")).toBe("91");
  });

  it("returns null for an unknown region rather than guessing", () => {
    expect(callingCodeForRegion("ZZ")).toBeNull();
    expect(callingCodeForRegion(undefined)).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("uses an explicit + prefix as-is", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizePhone("+1 (415) 555-0123")).toBe("+14155550123");
  });

  it("does not apply the device region when a + prefix is present", () => {
    // An NRI's phone may be region US while the contact is a +91 number.
    (getLocales as jest.Mock).mockReturnValue([{ regionCode: "US" }]);
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
  });

  it("strips a leading 00 international prefix", () => {
    expect(normalizePhone("0091 98765 43210")).toBe("+919876543210");
  });

  it("strips a national trunk 0 and prepends the device calling code", () => {
    expect(normalizePhone("098765 43210")).toBe("+919876543210");
  });

  it("prepends the device calling code to a bare 10-digit number", () => {
    expect(normalizePhone("9876543210")).toBe("+919876543210");
  });

  it("follows the device region rather than hardcoding India", () => {
    (getLocales as jest.Mock).mockReturnValue([{ regionCode: "US" }]);
    expect(normalizePhone("4155550123")).toBe("+14155550123");
  });

  it("returns null instead of guessing when the number is too short", () => {
    expect(normalizePhone("12345")).toBeNull();
  });

  it("returns null for empty, whitespace and junk input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
  });

  it("returns null when the region is unknown and no + is given", () => {
    (getLocales as jest.Mock).mockReturnValue([{ regionCode: "ZZ" }]);
    expect(normalizePhone("9876543210")).toBeNull();
  });

  it("ignores formatting characters entirely", () => {
    expect(normalizePhone("+91-98765.43210")).toBe("+919876543210");
    expect(normalizePhone("(+91) 98765 43210")).toBe("+919876543210");
  });

  it("does not treat an 11+ digit national number as a 10-digit one", () => {
    // 11 digits with no leading 0 and no +: we cannot know the country.
    (getLocales as jest.Mock).mockReturnValue([{ regionCode: "IN" }]);
    expect(normalizePhone("98765432109")).toBeNull();
  });
});

describe("toWhatsAppDigits", () => {
  it("strips the + because wa.me takes digits only", () => {
    expect(toWhatsAppDigits("+919876543210")).toBe("919876543210");
  });

  it("returns null when normalization failed", () => {
    expect(toWhatsAppDigits(null)).toBeNull();
  });
});
