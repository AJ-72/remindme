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

describe("parseMalayalamDateTime — loanword duration units and the -ഇൽ suffix", () => {
  const now = new Date("2026-07-29T10:00:00");

  // Speech recognizers emit the English loanword മിനുട്ട് at least as often as
  // the native മിനിറ്റ്, and speakers say "in five minutes" (-ഇൽ, locative)
  // rather than "five minutes having passed" (കഴിഞ്ഞ്). Neither was matched.
  it("parses 'അഞ്ച് മിനുട്ടിൽ' as five minutes from now", () => {
    const { date } = parseMalayalamDateTime("അഞ്ച് മിനുട്ടിൽ", now);
    expect(date).not.toBeNull();
    expect(date!.getTime()).toBe(now.getTime() + 5 * 60 * 1000);
  });

  it("parses the loanword with the കഴിഞ്ഞ് marker too", () => {
    const { date } = parseMalayalamDateTime("പത്ത് മിനുട്ട് കഴിഞ്ഞ്", now);
    expect(date!.getTime()).toBe(now.getTime() + 10 * 60 * 1000);
  });

  it("parses the native മിനിറ്റ് with the -ഇൽ suffix", () => {
    const { date } = parseMalayalamDateTime("20 മിനിറ്റിൽ വിളിക്കണം", now);
    expect(date!.getTime()).toBe(now.getTime() + 20 * 60 * 1000);
  });

  it("parses an hour duration with the -ഇൽ suffix", () => {
    const { date } = parseMalayalamDateTime("2 മണിക്കൂറിൽ കോൾ", now);
    expect(date!.getTime()).toBe(now.getTime() + 2 * 60 * 60 * 1000);
  });

  // The reported bug: ഇന്ന് matched as a day, the duration did not match, so
  // the 9 AM day-default fired and the user saw "today 9:00 AM".
  it("does not fall back to the 9 AM day default when a duration is present", () => {
    const { date } = parseMalayalamDateTime("ഇന്ന് അഞ്ചു മിനുട്ടിൽ", now);
    expect(date!.getTime()).toBe(now.getTime() + 5 * 60 * 1000);
    expect(date!.getHours()).not.toBe(9);
  });

  it("accepts the -ു suffixed form of a number word", () => {
    const { date } = parseMalayalamDateTime("അഞ്ചു മിനുട്ടിൽ", now);
    expect(date!.getTime()).toBe(now.getTime() + 5 * 60 * 1000);
  });

  // -ഇൽ is an ordinary Malayalam locative ("in/at"). It must only count as a
  // duration marker when bound to a time unit, never on unrelated title words.
  it("does not treat an unrelated -ഇൽ word as a duration", () => {
    const { date, title } = parseMalayalamDateTime("ഓഫീസിൽ പോകണം", now);
    expect(date).toBeNull();
    expect(title).toBe("ഓഫീസിൽ പോകണം");
  });

  it("strips the duration phrase from the title", () => {
    const { title } = parseMalayalamDateTime("അഞ്ച് മിനുട്ടിൽ മരുന്ന് കഴിക്കണം", now);
    expect(title).toBe("മരുന്ന് കഴിക്കണം");
  });
});

describe("parseMalayalamDateTime — fused fraction hour words", () => {
  const now = new Date("2026-07-29T10:00:00"); // Wednesday

  // അഞ്ചര is a single fused word (അഞ്ച് + അര), not two tokens, so the
  // existing "അര + മണി" half-past patterns never see it.
  it("parses അഞ്ചര as 5:30", () => {
    const { title, date } = parseMalayalamDateTime("അഞ്ചര മീറ്റിംഗ്", now);
    expect(date).not.toBeNull();
    expect(date!.getHours()).toBe(17); // bare-hour heuristic: 5 -> PM
    expect(date!.getMinutes()).toBe(30);
    expect(title).toBe("മീറ്റിംഗ്");
  });

  it("parses പത്തര as 10:30", () => {
    const { date } = parseMalayalamDateTime("പത്തര മീറ്റിംഗ്", now);
    expect(date!.getHours()).toBe(10); // 8-11 stay AM
    expect(date!.getMinutes()).toBe(30);
  });

  it("honors a period word's bias on a fused half-hour", () => {
    const { date } = parseMalayalamDateTime("രാവിലെ പത്തര ക്ലാസ്", now);
    expect(date!.getHours()).toBe(10);
    expect(date!.getMinutes()).toBe(30);
  });

  it("applies PM bias from a period word to a fused half-hour", () => {
    const { date } = parseMalayalamDateTime("വൈകിട്ട് അഞ്ചര നടത്തം", now);
    expect(date!.getHours()).toBe(17);
    expect(date!.getMinutes()).toBe(30);
  });

  it("accepts the dative form അഞ്ചരയ്ക്ക്", () => {
    const { title, date } = parseMalayalamDateTime("അഞ്ചരയ്ക്ക് മീറ്റിംഗ്", now);
    expect(date!.getHours()).toBe(17);
    expect(date!.getMinutes()).toBe(30);
    expect(title).toBe("മീറ്റിംഗ്");
  });

  // മുക്കാല് is three-quarters, so നാലേ മുക്കാല് is 4:45 — the fraction adds
  // to the stated hour rather than counting down to the next one.
  it("parses നാലേ മുക്കാല് as 4:45", () => {
    const { title, date } = parseMalayalamDateTime("നാലേ മുക്കാല് മീറ്റിംഗ്", now);
    expect(date).not.toBeNull();
    expect(date!.getHours()).toBe(16);
    expect(date!.getMinutes()).toBe(45);
    expect(title).toBe("മീറ്റിംഗ്");
  });

  it("parses അഞ്ചേ കാൽ as 5:15", () => {
    const { date } = parseMalayalamDateTime("അഞ്ചേ കാൽ മീറ്റിംഗ്", now);
    expect(date!.getHours()).toBe(17);
    expect(date!.getMinutes()).toBe(15);
  });

  it("composes a day word with a fused fraction", () => {
    const { title, date } = parseMalayalamDateTime("നാളെ അഞ്ചര മീറ്റിംഗ്", now);
    expect(date!.getDate()).toBe(30);
    expect(date!.getHours()).toBe(17);
    expect(date!.getMinutes()).toBe(30);
    expect(title).toBe("മീറ്റിംഗ്");
  });

  // The period word and the fraction need not be adjacent. Joining them into
  // one string to strip would find no such span and silently leave the entire
  // phrase in the title, even though the time resolved correctly.
  it("strips a period word and fraction separated by another word", () => {
    const { title, date } = parseMalayalamDateTime(
      "രാവിലെ ഓഫീസിൽ അഞ്ചര മീറ്റിംഗ്",
      now
    );
    expect(date!.getHours()).toBe(5);
    expect(date!.getMinutes()).toBe(30);
    expect(title).toBe("ഓഫീസിൽ മീറ്റിംഗ്");
  });

  // Regression: the fraction branches must not shadow the plain hour path.
  it("still parses a plain hour with no fraction", () => {
    const { date } = parseMalayalamDateTime("അഞ്ച് മണിക്ക് മീറ്റിംഗ്", now);
    expect(date!.getHours()).toBe(17);
    expect(date!.getMinutes()).toBe(0);
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

describe("parseMalayalamDateTime — period word after the hour", () => {
  const now = new Date("2026-07-29T10:00:00");

  it("binds a trailing period word to the hour and strips both from the title", () => {
    const { title, date } = parseMalayalamDateTime("9 മണിക്ക് രാവിലെ മീറ്റിംഗ്", now);
    expect(date!.getHours()).toBe(9);
    expect(title).toBe("മീറ്റിംഗ്"); // was "9 മണിക്ക് മീറ്റിംഗ്"
  });

  it("applies a trailing period word's PM bias", () => {
    const { title, date } = parseMalayalamDateTime("5 മണി വൈകിട്ട് നടത്തം", now);
    expect(date!.getHours()).toBe(17);
    expect(title).toBe("നടത്തം");
  });
});

describe("parseMalayalamDateTime — colon clock times", () => {
  const now = new Date("2026-07-29T10:00:00");

  it("parses HH:MM with a period word's AM bias", () => {
    const { title, date } = parseMalayalamDateTime("രാവിലെ 7:30 ന് മരുന്ന്", now);
    expect(date!.getHours()).toBe(7);
    expect(date!.getMinutes()).toBe(30);
    expect(title).toBe("മരുന്ന്"); // was 9:00 / "7:30 ന് മരുന്ന്"
  });

  it("parses HH:MM with a period word's PM bias", () => {
    const { date } = parseMalayalamDateTime("വൈകിട്ട് 6:45 ന് മീറ്റിംഗ്", now);
    expect(date!.getHours()).toBe(18);
    expect(date!.getMinutes()).toBe(45);
  });

  it("parses a bare HH:MM with the bare-hour AM/PM heuristic", () => {
    const { title, date } = parseMalayalamDateTime("7:30 ന് മരുന്ന്", now);
    expect(date!.getHours()).toBe(19); // 7 -> PM per applyBareHourBias
    expect(date!.getMinutes()).toBe(30);
    expect(title).toBe("മരുന്ന്");
  });

  it("parses HH:MM without the ന് particle", () => {
    const { title, date } = parseMalayalamDateTime("രാവിലെ 10:15 ക്ലാസ്", now);
    expect(date!.getHours()).toBe(10);
    expect(date!.getMinutes()).toBe(15);
    expect(title).toBe("ക്ലാസ്");
  });

  it("composes a day word with a colon time", () => {
    const { title, date } = parseMalayalamDateTime("നാളെ രാവിലെ 7:30 ന് മരുന്ന്", now);
    expect(date!.getDate()).toBe(30);
    expect(date!.getHours()).toBe(7);
    expect(date!.getMinutes()).toBe(30);
    expect(title).toBe("മരുന്ന്");
  });

  it("ignores out-of-range clock values rather than inventing a time", () => {
    // 12-hour clock only, per product decision.
    expect(parseMalayalamDateTime("25:99 ന് മീറ്റിംഗ്", now).date).toBeNull();
  });
});
