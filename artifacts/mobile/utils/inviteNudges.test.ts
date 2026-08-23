import {
  INVITE_NUDGES,
  MAX_MESSAGE_CHARS,
  MAX_NUDGE_SENDS,
  composeMessage,
  nudgeForSendCount,
  stripNudge,
} from "@/utils/inviteNudges";

describe("INVITE_NUDGES content rules", () => {
  const all = [
    ...INVITE_NUDGES.first,
    ...INVITE_NUDGES.second,
    ...INVITE_NUDGES.third,
  ];

  it("has lines for all three stages", () => {
    expect(INVITE_NUDGES.first.length).toBeGreaterThan(1);
    expect(INVITE_NUDGES.second.length).toBeGreaterThan(1);
    expect(INVITE_NUDGES.third.length).toBeGreaterThan(1);
  });

  it("contains no URL in any line", () => {
    // A bare store link makes the message look like spam and risks WhatsApp's
    // link heuristics. With no backend there is no attribution to gain.
    for (const line of all) {
      expect(line).not.toMatch(/https?:\/\//i);
      expect(line).not.toMatch(/www\./i);
    }
  });

  it("parenthesises every line so it reads as a footnote", () => {
    for (const line of all) {
      expect(line.startsWith("(")).toBe(true);
      expect(line.endsWith(")")).toBe(true);
    }
  });

  it("uses no emoji", () => {
    for (const line of all) {
      expect(line).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("nudgeForSendCount", () => {
  const phone = "919876543210";

  it("returns a first-stage line for the first send", () => {
    expect(INVITE_NUDGES.first).toContain(nudgeForSendCount(0, phone));
  });

  it("returns a second-stage line for the second send", () => {
    expect(INVITE_NUDGES.second).toContain(nudgeForSendCount(1, phone));
  });

  it("returns a third-stage line for the third send", () => {
    expect(INVITE_NUDGES.third).toContain(nudgeForSendCount(2, phone));
  });

  it("returns null from the fourth send onward, forever", () => {
    expect(nudgeForSendCount(3, phone)).toBeNull();
    expect(nudgeForSendCount(4, phone)).toBeNull();
    expect(nudgeForSendCount(99, phone)).toBeNull();
    expect(MAX_NUDGE_SENDS).toBe(3);
  });

  it("is deterministic for the same phone and stage", () => {
    expect(nudgeForSendCount(0, phone)).toBe(nudgeForSendCount(0, phone));
  });

  it("gives different recipients different lines", () => {
    const picks = new Set(
      ["911111111111", "912222222222", "913333333333", "914444444444"].map(
        (p) => nudgeForSendCount(0, p)
      )
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it("never repeats the same line across stages for one recipient", () => {
    const lines = [0, 1, 2].map((n) => nudgeForSendCount(n, phone));
    expect(new Set(lines).size).toBe(3);
  });

  it("treats a negative count as the first send rather than throwing", () => {
    expect(INVITE_NUDGES.first).toContain(nudgeForSendCount(-1, phone));
  });
});

describe("composeMessage", () => {
  it("includes the title", () => {
    const msg = composeMessage({ title: "Pick up milk", description: "" });
    expect(msg).toContain("Pick up milk");
  });

  it("includes the description when present", () => {
    const msg = composeMessage({
      title: "Pick up milk",
      description: "Two litres, full cream",
    });
    expect(msg).toContain("Two litres, full cream");
  });

  it("omits the description block entirely when empty", () => {
    const msg = composeMessage({ title: "Pick up milk", description: "   " });
    expect(msg.trim()).toBe("Pick up milk");
  });

  it("appends the nudge as the last line", () => {
    const nudge = INVITE_NUDGES.first[0];
    const msg = composeMessage({ title: "Milk", description: "", nudge });
    expect(msg.endsWith(nudge)).toBe(true);
  });

  it("omits the nudge when null", () => {
    const msg = composeMessage({ title: "Milk", description: "", nudge: null });
    expect(msg).toBe("Milk");
  });

  it("caps the composed message length", () => {
    const msg = composeMessage({
      title: "T".repeat(300),
      description: "D".repeat(1000),
      nudge: INVITE_NUDGES.first[0],
    });
    expect(msg.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
  });

  it("keeps the nudge intact when truncating, since it is the shortest part", () => {
    const nudge = INVITE_NUDGES.first[0];
    const msg = composeMessage({
      title: "T".repeat(300),
      description: "D".repeat(1000),
      nudge,
    });
    expect(msg.endsWith(nudge)).toBe(true);
  });
});

describe("stripNudge", () => {
  const nudge = INVITE_NUDGES.first[0];

  it("removes an exact nudge line from edited text", () => {
    const text = `Milk\n\n${nudge}`;
    expect(stripNudge(text, nudge)).toBe("Milk");
  });

  it("returns null when the nudge is not found verbatim", () => {
    // If the user edited the text and the match fails we must disable the
    // toggle rather than mangle what they wrote.
    expect(stripNudge("Milk\n\n(something they retyped)", nudge)).toBeNull();
  });

  it("returns null for an empty nudge rather than matching everything", () => {
    expect(stripNudge("Milk", "")).toBeNull();
  });
});


// The signature is the user's own name, appended so the recipient knows who
// the reminder came from. It shares composeMessage's budget with the nudge -
// a signature that escaped truncation could push the message past Android's
// intent-URI limit and fail the send outright.
/** The blank line composeMessage puts between message parts. */
const SEP = "\n\n";

describe("composeMessage — sender signature", () => {
  it("appends the signature after the body", () => {
    expect(
      composeMessage({ title: "Call the plumber", description: "", signature: "Anand" })
    ).toBe(["Call the plumber", "— Anand"].join(SEP));
  });

  it("places the signature after the body but before the nudge", () => {
    expect(
      composeMessage({
        title: "Call the plumber",
        description: "",
        signature: "Anand",
        nudge: "(Sent via Reminders.)",
      })
    ).toBe(["Call the plumber", "— Anand", "(Sent via Reminders.)"].join(SEP));
  });

  it("omits the signature line entirely when there is no name", () => {
    expect(
      composeMessage({ title: "Call the plumber", description: "", signature: "" })
    ).toBe("Call the plumber");
    expect(
      composeMessage({ title: "Call the plumber", description: "", signature: "   " })
    ).toBe("Call the plumber");
  });

  it("truncates the body, never the signature", () => {
    const result = composeMessage({
      title: "x".repeat(2000),
      description: "",
      signature: "Anand",
    });
    expect(result.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    expect(result.endsWith("— Anand")).toBe(true);
  });

  it("keeps body, signature and nudge all within the cap together", () => {
    const nudge = "(Sent via Reminders.)";
    const result = composeMessage({
      title: "x".repeat(2000),
      description: "",
      signature: "Anand",
      nudge,
    });
    expect(result.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    expect(result.endsWith(nudge)).toBe(true);
    expect(result).toContain("— Anand");
  });
});
