import { calculatePersonaFromChoices } from "./personaScoring";

describe("personaScoring", () => {
  it("returns default persona when empty or invalid input is provided", () => {
    expect(calculatePersonaFromChoices([])).toBe("step_by_step_doer");
    expect(calculatePersonaFromChoices([null as any, undefined as any])).toBe(
      "step_by_step_doer"
    );
  });

  it("identifies a unanimous winner", () => {
    expect(
      calculatePersonaFromChoices(["busy_juggler", "busy_juggler", "busy_juggler"])
    ).toBe("busy_juggler");
    expect(
      calculatePersonaFromChoices([
        "deep_focuser",
        "deep_focuser",
        "deep_focuser",
      ])
    ).toBe("deep_focuser");
  });

  it("identifies a majority winner (2 out of 3)", () => {
    expect(
      calculatePersonaFromChoices([
        "quick_finisher",
        "busy_juggler",
        "quick_finisher",
      ])
    ).toBe("quick_finisher");

    expect(
      calculatePersonaFromChoices([
        "deep_focuser",
        "busy_juggler",
        "deep_focuser",
      ])
    ).toBe("deep_focuser");
  });

  it("resolves 3-way ties using prioritized tie-breaker", () => {
    expect(
      calculatePersonaFromChoices([
        "quick_finisher",
        "busy_juggler",
        "step_by_step_doer",
      ])
    ).toBe("step_by_step_doer");

    expect(
      calculatePersonaFromChoices([
        "quick_finisher",
        "busy_juggler",
        "deep_focuser",
      ])
    ).toBe("busy_juggler");
  });
});
