import { buildGreeting, buildSnoozeTitle, initialsFor } from "./greeting";

function at(hour: number): Date {
  const d = new Date(2026, 7, 23, hour, 0, 0);
  return d;
}

describe("buildGreeting", () => {
  it("greets by name across the three parts of the day", () => {
    expect(buildGreeting("Anand", at(9))).toBe("Good morning, Anand");
    expect(buildGreeting("Anand", at(14))).toBe("Good afternoon, Anand");
    expect(buildGreeting("Anand", at(20))).toBe("Good evening, Anand");
  });

  it("uses boundary hours consistently", () => {
    expect(buildGreeting("Anand", at(0))).toBe("Good morning, Anand");
    expect(buildGreeting("Anand", at(11))).toBe("Good morning, Anand");
    expect(buildGreeting("Anand", at(12))).toBe("Good afternoon, Anand");
    expect(buildGreeting("Anand", at(16))).toBe("Good afternoon, Anand");
    expect(buildGreeting("Anand", at(17))).toBe("Good evening, Anand");
    expect(buildGreeting("Anand", at(23))).toBe("Good evening, Anand");
  });

  // The name is optional by design - onboarding is skippable - so every
  // consumer gets a sentence that reads correctly with no name at all.
  it("drops the name cleanly when there isn't one", () => {
    expect(buildGreeting("", at(9))).toBe("Good morning");
    expect(buildGreeting("   ", at(14))).toBe("Good afternoon");
  });

  it("trims surrounding whitespace from the name", () => {
    expect(buildGreeting("  Anand  ", at(9))).toBe("Good morning, Anand");
  });

  it("greets a Malayalam name unchanged", () => {
    expect(buildGreeting("ആനന്ദ്", at(9))).toBe("Good morning, ആനന്ദ്");
  });
});

describe("initialsFor", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsFor("Anand Jayaram")).toBe("AJ");
    expect(initialsFor("anand jayaram")).toBe("AJ");
  });

  it("takes a single letter from a single-word name", () => {
    expect(initialsFor("Anand")).toBe("A");
  });

  it("ignores words past the second", () => {
    expect(initialsFor("Anand Kumar Jayaram")).toBe("AK");
  });

  it("collapses extra whitespace rather than emitting blanks", () => {
    expect(initialsFor("  Anand   Jayaram ")).toBe("AJ");
  });

  it("returns an empty string when there is no name", () => {
    expect(initialsFor("")).toBe("");
    expect(initialsFor("   ")).toBe("");
  });

  // Malayalam has no case, so toUpperCase must be a no-op rather than
  // mangling the grapheme.
  it("keeps a Malayalam initial intact", () => {
    expect(initialsFor("ആനന്ദ്")).toBe("ആ");
  });
});

describe("buildSnoozeTitle", () => {
  it("names the user on a re-nudge", () => {
    expect(buildSnoozeTitle("Anand", "Call the plumber")).toBe(
      "Still waiting, Anand — Call the plumber"
    );
  });

  // Unnamed users must get the plain reminder title, not a dangling greeting.
  it("falls back to the bare reminder title with no name", () => {
    expect(buildSnoozeTitle("", "Call the plumber")).toBe("Call the plumber");
    expect(buildSnoozeTitle("  ", "Call the plumber")).toBe("Call the plumber");
  });
});
