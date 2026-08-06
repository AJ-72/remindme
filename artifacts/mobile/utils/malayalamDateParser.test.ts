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

  it("resolves a period word's own default hour, not a bare-hour phrase belonging to an unrelated clause later in the sentence", () => {
    // രാത്രി (night) has no explicit hour attached to it here; the "10 മണിക്ക്"
    // later in the sentence belongs to a separate clause about a bus arrival,
    // and must not suppress രാത്രി's own default hour (21 / 9 PM).
    const { date } = parseMalayalamDateTime(
      "രാത്രി ഓർമ്മിപ്പിക്കണം, 10 മണിക്ക് ബസ് വരും",
      now
    );
    expect(date!.getHours()).toBe(21);
  });

  it("still resolves രാത്രി alone (no other time mentioned) to its default hour", () => {
    expect(parseMalayalamDateTime("രാത്രി ഉറക്കം", now).date!.getHours()).toBe(21);
  });
});

describe("parseMalayalamDateTime — half past", () => {
  const now = new Date("2026-07-29T10:00:00");

  it("parses 'X മണി കഴിഞ്ഞ് അര' as :30", () => {
    const { date } = parseMalayalamDateTime("5 മണി കഴിഞ്ഞ് അര മീറ്റിംഗ്", now);
    expect(date!.getHours()).toBe(17);
    expect(date!.getMinutes()).toBe(30);
  });

  it("parses 'അര X മണിക്ക്' as :30", () => {
    const { date } = parseMalayalamDateTime("അര 5 മണിക്ക് മീറ്റിംഗ്", now);
    expect(date!.getHours()).toBe(17);
    expect(date!.getMinutes()).toBe(30);
  });

  it("strips the half-past phrase cleanly from the title", () => {
    const { title } = parseMalayalamDateTime("നാളെ അര 5 മണിക്ക് മീറ്റിംഗ്", now);
    expect(title).toBe("മീറ്റിംഗ്");
  });
});

describe("parseMalayalamDateTime — relative durations", () => {
  const now = new Date("2026-07-29T10:00:00");

  it("parses 'X മണിക്കൂർ കഴിഞ്ഞ്' as X hours from now", () => {
    const { date, title } = parseMalayalamDateTime("2 മണിക്കൂർ കഴിഞ്ഞ് കോൾ ചെയ്യാൻ", now);
    expect(date!.getTime()).toBe(now.getTime() + 2 * 60 * 60 * 1000);
    expect(title).toBe("കോൾ ചെയ്യാൻ");
  });

  it("parses 'X മിനിറ്റ് കഴിഞ്ഞ്' as X minutes from now", () => {
    const { date } = parseMalayalamDateTime("30 മിനിറ്റ് കഴിഞ്ഞ് ഓർമ്മിപ്പിക്കുക", now);
    expect(date!.getTime()).toBe(now.getTime() + 30 * 60 * 1000);
  });

  it("takes precedence over day/clock resolvers per spec's pattern precedence", () => {
    // Duration patterns short-circuit before day/clock resolvers run at all.
    const { date } = parseMalayalamDateTime("5 മണിക്കൂർ കഴിഞ്ഞ്", now);
    expect(date!.getTime()).toBe(now.getTime() + 5 * 60 * 60 * 1000);
  });

  it("parses a spelled-out duration count", () => {
    const { date } = parseMalayalamDateTime("അഞ്ച് മണിക്കൂർ കഴിഞ്ഞ്", now);
    expect(date!.getTime()).toBe(now.getTime() + 5 * 60 * 60 * 1000);
  });
});

describe("parseMalayalamDateTime — code-mixed input (v1 limitation)", () => {
  const now = new Date("2026-07-29T10:00:00");

  it("extracts the Malayalam day word and leaves embedded Latin time text untouched in the title", () => {
    const { title, date } = parseMalayalamDateTime("call John നാളെ 5pm", now);
    expect(date!.getDate()).toBe(30); // നാളെ recognized
    expect(title).toBe("call John 5pm"); // "5pm" not parsed as a time
  });

  it("does not recognize an English relative-date word even next to Malayalam text", () => {
    const { date } = parseMalayalamDateTime("Meeting tomorrow നാളെ", now);
    // നാളെ is still recognized (it's Malayalam vocabulary); "tomorrow" is not touched.
    expect(date!.getDate()).toBe(30);
  });
});

describe("parseMalayalamDateTime — hour-word case-suffix variants", () => {
  const now = new Date("2026-07-29T10:00:00"); // Wednesday

  it("recognizes the bare hour word മണി (no dative suffix)", () => {
    const { title, date } = parseMalayalamDateTime("9 മണി മീറ്റിംഗ്", now);
    expect(date).not.toBeNull();
    expect(date!.getHours()).toBe(9);
    expect(title).toBe("മീറ്റിംഗ്");
  });

  it("recognizes the orthographic variant മണിയ്ക്ക്", () => {
    const { title, date } = parseMalayalamDateTime("9 മണിയ്ക്ക് മീറ്റിംഗ്", now);
    expect(date).not.toBeNull();
    expect(date!.getHours()).toBe(9);
    expect(title).toBe("മീറ്റിംഗ്");
  });

  it("does NOT treat the duration word മണിക്കൂർ as an hour-of-day", () => {
    // മണിക്ക is a strict prefix of മണിക്കൂർ; the hour pattern must not
    // match inside it. See the guard comment on HOUR_UNIT.
    const { date, title } = parseMalayalamDateTime("2 മണിക്കൂർ കഴിഞ്ഞ് കോൾ ചെയ്യാൻ", now);
    expect(date!.getTime()).toBe(now.getTime() + 2 * 60 * 60 * 1000);
    expect(title).toBe("കോൾ ചെയ്യാൻ");
  });
});

describe("parseMalayalamDateTime — period word + hour without dative suffix", () => {
  const now = new Date("2026-07-29T10:00:00");

  it("uses the stated hour, not the period default, for വൈകിട്ട് X മണി", () => {
    // വൈകിട്ട് defaults to 18:00, so a wrong fallback is visible here.
    const { title, date } = parseMalayalamDateTime("വൈകിട്ട് 5 മണി മീറ്റിംഗ്", now);
    expect(date!.getHours()).toBe(17);
    expect(title).toBe("മീറ്റിംഗ്");
  });

  it("uses the stated hour for ഉച്ചയ്ക്ക് X മണി", () => {
    const { date } = parseMalayalamDateTime("ഉച്ചയ്ക്ക് 2 മണി ഭക്ഷണം", now);
    expect(date!.getHours()).toBe(14);
  });

  it("uses the stated hour for രാവിലെ X മണി and strips both from the title", () => {
    const { title, date } = parseMalayalamDateTime("രാവിലെ 9 മണി മീറ്റിംഗ്", now);
    expect(date!.getHours()).toBe(9);
    expect(title).toBe("മീറ്റിംഗ്"); // was "9 മണി മീറ്റിംഗ്"
  });

  it("still falls back to the period default when no hour is attached", () => {
    expect(parseMalayalamDateTime("രാവിലെ ജോലി", now).date!.getHours()).toBe(9);
    expect(parseMalayalamDateTime("വൈകിട്ട് നടത്തം", now).date!.getHours()).toBe(18);
  });
});
