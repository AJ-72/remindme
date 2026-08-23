import { detectVagueOpener } from "./vagueTask";

describe("detectVagueOpener", () => {
  it("matches a vague opener regardless of case", () => {
    expect(detectVagueOpener("Sort out the insurance")).toBe("sort out");
    expect(detectVagueOpener("sort out the insurance")).toBe("sort out");
    expect(detectVagueOpener("Deal with the landlord")).toBe("deal with");
    expect(detectVagueOpener("Look into pension options")).toBe("look into");
    expect(detectVagueOpener("Figure out the visa thing")).toBe("figure out");
  });

  // Concrete tasks are the common case. A hint that fires on them is noise,
  // and noise is how an advisory hint gets dismissed unread forever.
  it("leaves a concrete task alone", () => {
    expect(detectVagueOpener("Call the dentist")).toBeNull();
    expect(detectVagueOpener("Pay the electricity bill")).toBeNull();
    expect(detectVagueOpener("Send Priya the photos")).toBeNull();
    expect(detectVagueOpener("Buy milk")).toBeNull();
  });

  // Only the OPENER counts. "Call the bank to sort out the fee" already names
  // a first action, so flagging it would be wrong.
  it("only matches at the start of the title", () => {
    expect(detectVagueOpener("Call the bank to sort out the fee")).toBeNull();
  });

  it("requires a word boundary, not a prefix match", () => {
    expect(detectVagueOpener("Planning permission paperwork")).toBeNull();
    expect(detectVagueOpener("Reviewer feedback")).toBeNull();
  });

  it("ignores leading whitespace", () => {
    expect(detectVagueOpener("   sort out the insurance")).toBe("sort out");
  });

  // The heuristic is verb-position-dependent. Malayalam verbs are final and
  // inflected, so it does not transfer - deferred exactly as INVITE_NUDGES_ML is.
  it("never fires on Malayalam text", () => {
    expect(detectVagueOpener("ഇൻഷുറൻസ് ശരിയാക്കുക")).toBeNull();
  });

  // MALAYALAM_RANGE currently carries no `g` flag, so `.test()` is stateless.
  // Adding one later would make this alternate between null and a match, which
  // is exactly the kind of bug that looks like flakiness rather than a cause.
  it("gives the same answer on repeated calls", () => {
    const malayalam = "ഇൻഷുറൻസ് ശരിയാക്കുക";
    expect(detectVagueOpener(malayalam)).toBeNull();
    expect(detectVagueOpener(malayalam)).toBeNull();
    expect(detectVagueOpener("Sort out the insurance")).toBe("sort out");
    expect(detectVagueOpener("Sort out the insurance")).toBe("sort out");
  });

  it("returns null for empty input", () => {
    expect(detectVagueOpener("")).toBeNull();
    expect(detectVagueOpener("   ")).toBeNull();
  });
});
