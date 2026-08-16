import { Platform } from "react-native";
import { getLocales } from "expo-localization";
import { buildSendOptions, smsUrl, whatsAppUrl } from "@/services/messageLinks";

beforeEach(() => {
  jest.clearAllMocks();
  (getLocales as jest.Mock).mockReturnValue([
    { languageTag: "en-IN", languageCode: "en", regionCode: "IN" },
  ]);
  jest.replaceProperty(Platform, "OS", "android");
});

describe("whatsAppUrl", () => {
  it("uses the wa.me universal link, not the whatsapp:// scheme", () => {
    // whatsapp:// needs an iOS LSApplicationQueriesSchemes entry and hard-fails
    // when absent; wa.me resolves via App/Universal Links and degrades to a
    // browser install page.
    const url = whatsAppUrl("+919876543210", "hello");
    expect(url).toContain("https://wa.me/");
    expect(url).not.toContain("whatsapp://");
  });

  it("puts digits only in the path, with no + or spaces", () => {
    expect(whatsAppUrl("+919876543210", "hi")).toContain("wa.me/919876543210");
  });

  it("percent-encodes the message body", () => {
    const url = whatsAppUrl("+919876543210", "milk & bread?");
    expect(url).toContain("text=milk%20%26%20bread%3F");
  });

  it("returns null when the number could not be normalized", () => {
    expect(whatsAppUrl(null, "hi")).toBeNull();
  });

  it("encodes newlines in a multi-line message", () => {
    const url = whatsAppUrl("+919876543210", "line1\nline2");
    expect(url).toContain("line1%0Aline2");
  });
});

describe("smsUrl", () => {
  it("uses ? as the body separator on Android", () => {
    jest.replaceProperty(Platform, "OS", "android");
    expect(smsUrl("9876543210", "hi")).toBe("sms:9876543210?body=hi");
  });

  it("uses & as the body separator on iOS", () => {
    // The separator genuinely differs between the platforms.
    jest.replaceProperty(Platform, "OS", "ios");
    expect(smsUrl("9876543210", "hi")).toBe("sms:9876543210&body=hi");
  });

  it("percent-encodes the body", () => {
    jest.replaceProperty(Platform, "OS", "android");
    expect(smsUrl("9876543210", "a b&c")).toBe("sms:9876543210?body=a%20b%26c");
  });

  it("uses the raw number, since SMS works with whatever the OS gave us", () => {
    expect(smsUrl("098765 43210", "hi")).toContain("sms:098765 43210");
  });

  it("returns null for an empty number", () => {
    expect(smsUrl("", "hi")).toBeNull();
  });
});

describe("buildSendOptions", () => {
  it("offers WhatsApp primary and SMS secondary for a normalizable number", () => {
    const o = buildSendOptions("+91 98765 43210", "hi");
    expect(o.whatsApp).toContain("wa.me/919876543210");
    expect(o.sms).toContain("sms:");
    expect(o.primary).toBe("whatsapp");
    expect(o.normalizationFailed).toBe(false);
    expect(o.notice).toBeNull();
  });

  it("skips WhatsApp and explains why when normalization fails", () => {
    // A broken wa.me link is worse than a working SMS.
    const o = buildSendOptions("12345", "hi");
    expect(o.whatsApp).toBeNull();
    expect(o.sms).toContain("sms:12345");
    expect(o.primary).toBe("sms");
    expect(o.normalizationFailed).toBe(true);
    expect(o.notice).toMatch(/SMS will be used/i);
  });

  it("never chains automatically from WhatsApp to SMS", () => {
    // Linking.openURL resolving means an app opened, not that a message was
    // composed - an automatic fallback would fire for cases that worked.
    const o = buildSendOptions("+919876543210", "hi");
    expect(o.whatsApp).not.toBeNull();
    expect(o.sms).not.toBeNull();
    expect(Object.keys(o)).not.toContain("fallbackChain");
  });

  it("returns no options at all for an empty phone", () => {
    const o = buildSendOptions("", "hi");
    expect(o.whatsApp).toBeNull();
    expect(o.sms).toBeNull();
  });
});
