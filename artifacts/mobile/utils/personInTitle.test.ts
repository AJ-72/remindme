import { detectPersonInTitle } from "./personInTitle";

describe("detectPersonInTitle — English", () => {
  it("reads a kinship word after an addressing verb", () => {
    expect(detectPersonInTitle("Call Amma at 7 pm")).toBe("Amma");
  });

  it("capitalises a kinship word the user typed in lower case", () => {
    expect(detectPersonInTitle("call amma tonight")).toBe("Amma");
  });

  it("reads a capitalised name after the verb", () => {
    expect(detectPersonInTitle("Tell Priya about the rent")).toBe("Priya");
  });

  it("steps over the filler between the verb and the name", () => {
    expect(detectPersonInTitle("Message to Priya about the keys")).toBe("Priya");
  });

  it("names nobody when the object is a thing, not a person", () => {
    expect(detectPersonInTitle("Call dentist tomorrow at 3pm")).toBeNull();
  });

  // The chip carries the name in the app's own voice, so an acronym on it
  // would read as the app claiming a bank is a person.
  it("never takes an acronym for a name", () => {
    expect(detectPersonInTitle("Call HDFC about the renewal")).toBeNull();
  });

  it("never takes a date word for a name", () => {
    expect(detectPersonInTitle("Call Monday about the delivery")).toBeNull();
  });

  it("stays silent when the verb addresses nobody", () => {
    expect(detectPersonInTitle("Take medicine 9 am daily")).toBeNull();
  });

  it("stays silent on a bare verb", () => {
    expect(detectPersonInTitle("Call")).toBeNull();
  });

  it("stays silent on empty text", () => {
    expect(detectPersonInTitle("   ")).toBeNull();
  });
});

describe("detectPersonInTitle — Malayalam", () => {
  it("reads the name in front of the addressing suffix", () => {
    expect(detectPersonInTitle("പ്രിയയോട് പറയണം"))
      .toBe("പ്രിയ");
  });

  it("reads a kinship word carrying the same suffix", () => {
    expect(detectPersonInTitle("അമ്മയോട് പറയണം"))
      .toBe("അമ്മ");
  });

  // The starter example on the home screen. It addresses no one, and a chip
  // there would be the first thing a new user sees the app get wrong.
  it("stays silent on a task with no person in it", () => {
    expect(
      detectPersonInTitle(
        "നാളെ രാവിലെ പാൽ വാങ്ങണം"
      )
    ).toBeNull();
  });
});
