import { parseMalayalamDateTime, parseMalayalamNumber } from "./malayalamDateParser";

describe("parseMalayalamNumber", () => {
  it("parses Arabic digits", () => {
    expect(parseMalayalamNumber("5")).toBe(5);
    expect(parseMalayalamNumber("12")).toBe(12);
  });

  it("parses Malayalam digits", () => {
    expect(parseMalayalamNumber("൫")).toBe(5);
    expect(parseMalayalamNumber("൧൨")).toBe(12);
  });

  it("parses spelled-out Malayalam number words 1-12", () => {
    expect(parseMalayalamNumber("അഞ്ച്")).toBe(5);
    expect(parseMalayalamNumber("പന്ത്രണ്ട്")).toBe(12);
    expect(parseMalayalamNumber("ഒന്ന്")).toBe(1);
    expect(parseMalayalamNumber("പതിനൊന്ന്")).toBe(11);
  });

  it("returns null for unrecognized text", () => {
    expect(parseMalayalamNumber("xyz")).toBeNull();
  });
});

describe("parseMalayalamDateTime — relative days", () => {
  const now = new Date("2026-07-29T10:00:00"); // Wednesday

  it("parses ഇന്ന് (today)", () => {
    const { title, date } = parseMalayalamDateTime("ഇന്ന് മീറ്റിംഗ്", now);
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(6); // July = 6
    expect(date!.getDate()).toBe(29);
    expect(title).toBe("മീറ്റിംഗ്");
  });

  it("parses നാളെ (tomorrow)", () => {
    const { date } = parseMalayalamDateTime("നാളെ മീറ്റിംഗ്", now);
    expect(date!.getDate()).toBe(30);
  });

  it("parses മറ്റന്നാൾ (day after tomorrow)", () => {
    const { date } = parseMalayalamDateTime("മറ്റന്നാൾ മീറ്റിംഗ്", now);
    expect(date!.getDate()).toBe(31);
  });
});

describe("parseMalayalamDateTime — weekday names", () => {
  const wednesday = new Date("2026-07-29T10:00:00"); // Wednesday

  it("resolves a weekday matching today to today (no അടുത്ത prefix)", () => {
    const { date } = parseMalayalamDateTime("ബുധൻ മീറ്റിംഗ്", wednesday);
    expect(date!.getDate()).toBe(29);
  });

  it("resolves a future weekday to its next occurrence", () => {
    const { date } = parseMalayalamDateTime("വെള്ളി മീറ്റിംഗ്", wednesday);
    expect(date!.getDate()).toBe(31); // next Friday
  });

  it("forces +7 days when അടുത്ത prefixes a weekday matching today", () => {
    const { date } = parseMalayalamDateTime("അടുത്ത ബുധൻ മീറ്റിംഗ്", wednesday);
    expect(date!.getDate()).toBe(5); // Aug 5, next Wednesday
    expect(date!.getMonth()).toBe(7); // August = 7
  });

  it("returns a null match for text with no day/weekday word", () => {
    const { title, date } = parseMalayalamDateTime("വീട്ടിൽ എന്തെങ്കിലും ചെയ്യണം", wednesday);
    expect(date).toBeNull();
    expect(title).toBe("വീട്ടിൽ എന്തെങ്കിലും ചെയ്യണം");
  });
});
