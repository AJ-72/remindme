import { parseNaturalLanguage } from "./parseNaturalLanguage";

describe("parseNaturalLanguage — routing", () => {
  it("routes English text through chrono (unchanged behavior)", () => {
    const { title, date } = parseNaturalLanguage("Call mom tomorrow at 3pm");
    expect(date).not.toBeNull();
    expect(title).toBe("Call mom");
  });

  it("routes Malayalam text to the Malayalam parser", () => {
    const { title, date } = parseNaturalLanguage("നാളെ വൈകിട്ട് 5 മണിക്ക് മീറ്റിംഗ്");
    expect(date).not.toBeNull();
    expect(date!.getHours()).toBe(17);
    expect(title).toBe("മീറ്റിംഗ്");
  });

  it("returns a null match for empty input", () => {
    expect(parseNaturalLanguage("")).toEqual({ title: "", date: null });
    expect(parseNaturalLanguage("   ")).toEqual({ title: "", date: null });
  });

  it("returns the full trimmed text as title when no date is found in either language", () => {
    const { title, date } = parseNaturalLanguage("just a note");
    expect(date).toBeNull();
    expect(title).toBe("just a note");
  });
});
