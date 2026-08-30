import { getLocales } from "expo-localization";
import {
  callingCodeForRegion,
  normalizePhone,
  normalizeForIdentity,
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

describe("normalizeForIdentity", () => {
  it("derives the same identity on two devices in different regions", () => {
    // The sender is an NRI (device region US); the recipient's phone is Indian.
    // Both must arrive at the same string or the phone hashes never match.
    expect(normalizeForIdentity("+91 98765 43210", "US")).toEqual({
      e164: "+919876543210",
      ambiguous: false,
    });
    expect(normalizeForIdentity("+91 98765 43210", "IN")).toEqual({
      e164: "+919876543210",
      ambiguous: false,
    });
  });

  it("flags a bare national number as ambiguous, because the region decided it", () => {
    // The same stored contact string, resolved on two devices. Both answers are
    // defensible; that is exactly why the caller must be told it is a guess.
    expect(normalizeForIdentity("9876543210", "IN")).toEqual({
      e164: "+919876543210",
      ambiguous: true,
    });
    expect(normalizeForIdentity("9876543210", "US")).toEqual({
      e164: "+19876543210",
      ambiguous: true,
    });
  });
  it("treats a 00 prefix as international too, so it stays region-independent", () => {
    expect(normalizeForIdentity("0091 98765 43210", "US")).toEqual({
      e164: "+919876543210",
      ambiguous: false,
    });
  });
  it("resolves a national trunk 0 via the region, and says so", () => {
    expect(normalizeForIdentity("098765 43210", "IN")).toEqual({
      e164: "+919876543210",
      ambiguous: true,
    });
  });
  it("refuses rather than guesses when it cannot resolve the number", () => {
    // Unknown region and no international prefix: there is no answer to give.
    expect(normalizeForIdentity("9876543210", "ZZ").e164).toBeNull();
    expect(normalizeForIdentity("9876543210", null).e164).toBeNull();
    // Lengths that match no known national form.
    expect(normalizeForIdentity("12345", "IN").e164).toBeNull();
    expect(normalizeForIdentity("98765432109", "IN").e164).toBeNull();
    // Nothing at all.
    expect(normalizeForIdentity("", "IN").e164).toBeNull();
    expect(normalizeForIdentity("   ", "IN").e164).toBeNull();
    expect(normalizeForIdentity(null, "IN").e164).toBeNull();
    expect(normalizeForIdentity("not a phone", "IN").e164).toBeNull();
  });

  it("never reports an unresolvable number as ambiguous", () => {
    // ambiguous means "resolved, but a region decided it". A null e164 was not
    // resolved at all, so a caller must not read it as a near-miss worth caching.
    expect(normalizeForIdentity("not a phone", "IN")).toEqual({
      e164: null,
      ambiguous: false,
    });
  });
});
