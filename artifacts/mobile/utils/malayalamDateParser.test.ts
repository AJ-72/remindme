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

  it("forces +7 days even with irregular spacing (double space)", () => {
    const { date } = parseMalayalamDateTime("അടുത്ത  ബുധൻ മീറ്റിംഗ്", wednesday);
    expect(date!.getDate()).toBe(5); // Aug 5, next Wednesday
    expect(date!.getMonth()).toBe(7); // August = 7
  });

  it("returns a null match for text with no day/weekday word", () => {
    const { title, date } = parseMalayalamDateTime("വീട്ടിൽ എന്തെങ്കിലും ചെയ്യണം", wednesday);
    expect(date).toBeNull();
    expect(title).toBe("വീട്ടിൽ എന്തെങ്കിലും ചെയ്യണം");
  });
});

describe("parseMalayalamDateTime — clock time with period words", () => {
  const now = new Date("2026-07-29T10:00:00"); // Wednesday

  it("parses രാവിലെ (morning) + hour as AM", () => {
    const { date } = parseMalayalamDateTime("രാവിലെ 8 മണിക്ക് മരുന്ന്", now);
    expect(date!.getHours()).toBe(8);
  });

  it("parses ഉച്ചയ്ക്ക് (noon) + hour as PM, not AM", () => {
    const { date } = parseMalayalamDateTime("ഉച്ചയ്ക്ക് 2 മണിക്ക് ഭക്ഷണം", now);
    expect(date!.getHours()).toBe(14);
  });

  it("parses വൈകിട്ട് (evening) + hour as PM", () => {
    const { date } = parseMalayalamDateTime("വൈകിട്ട് 5 മണിക്ക്", now);
    expect(date!.getHours()).toBe(17);
  });

  it("parses രാത്രി (night) + hour as PM", () => {
    const { date } = parseMalayalamDateTime("രാത്രി 9 മണിക്ക്", now);
    expect(date!.getHours()).toBe(21);
  });

  it("defaults to a fixed hour when a period word has no explicit hour", () => {
    expect(parseMalayalamDateTime("രാവിലെ ജോലി", now).date!.getHours()).toBe(9);
    expect(parseMalayalamDateTime("ഉച്ചയ്ക്ക് ഭക്ഷണം", now).date!.getHours()).toBe(12);
    expect(parseMalayalamDateTime("വൈകിട്ട് നടത്തം", now).date!.getHours()).toBe(18);
    expect(parseMalayalamDateTime("രാത്രി ഉറക്കം", now).date!.getHours()).toBe(21);
  });

  it("defaults bare clock times (no period word) 1-7 to PM and 8-11 to AM", () => {
    expect(parseMalayalamDateTime("5 മണിക്ക് കോൾ", now).date!.getHours()).toBe(17);
    expect(parseMalayalamDateTime("9 മണിക്ക് കോൾ", now).date!.getHours()).toBe(9);
    expect(parseMalayalamDateTime("12 മണിക്ക് കോൾ", now).date!.getHours()).toBe(12);
  });

  it("parses a spelled-out hour word", () => {
    const { date } = parseMalayalamDateTime("വൈകിട്ട് അഞ്ച് മണിക്ക് മീറ്റിംഗ്", now);
    expect(date!.getHours()).toBe(17);
  });

  it("parses a Malayalam-digit hour", () => {
    const { date } = parseMalayalamDateTime("വൈകിട്ട് ൫ മണിക്ക് മീറ്റിംഗ്", now);
    expect(date!.getHours()).toBe(17);
  });

  it("composes day + period + hour and strips both matched substrings from the title", () => {
    const { title, date } = parseMalayalamDateTime("നാളെ വൈകിട്ട് 5 മണിക്ക് മീറ്റിംഗ്", now);
    expect(date!.getDate()).toBe(30);
    expect(date!.getHours()).toBe(17);
    expect(date!.getMinutes()).toBe(0);
    expect(title).toBe("മീറ്റിംഗ്");
  });
});
