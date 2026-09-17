import {
  MIC_LEVEL_CEILING_DB,
  WAVEFORM_BARS,
  WAVEFORM_MIN_HEIGHT,
  formatElapsed,
  normaliseMicLevel,
  waveformHeights,
} from "@/utils/micLevel";

describe("normaliseMicLevel", () => {
  it("reads silence as nothing at all", () => {
    expect(normaliseMicLevel(0)).toBe(0);
  });

  // The module documents values down to -2, and calls anything under 0
  // inaudible. A negative reading is quiet, not an error.
  it("clamps a reading below the floor rather than going negative", () => {
    expect(normaliseMicLevel(-2)).toBe(0);
  });

  it("reads a shout as full, never past it", () => {
    expect(normaliseMicLevel(MIC_LEVEL_CEILING_DB)).toBe(1);
    expect(normaliseMicLevel(10)).toBe(1);
  });

  it("puts ordinary speech in the middle of the range", () => {
    expect(normaliseMicLevel(4)).toBeCloseTo(0.5, 5);
  });

  it("rises with the reading", () => {
    expect(normaliseMicLevel(2)).toBeLessThan(normaliseMicLevel(6));
  });

  // A recognizer that emits no volume at all must leave the bars flat. A
  // throw here would take down the whole dictation session.
  it.each([undefined, null, NaN, "loud", {}])("reads %p as silence", (value) => {
    expect(normaliseMicLevel(value)).toBe(0);
  });
});

describe("waveformHeights", () => {
  it("draws one height per bar", () => {
    expect(waveformHeights(0.5)).toHaveLength(WAVEFORM_BARS);
  });

  it("leaves a visible flat line at silence, not an empty row", () => {
    expect(waveformHeights(0)).toEqual(
      Array(WAVEFORM_BARS).fill(WAVEFORM_MIN_HEIGHT)
    );
  });

  it("never draws past the full height", () => {
    waveformHeights(1).forEach((h) => expect(h).toBeLessThanOrEqual(1));
  });

  it("reaches highest in the middle", () => {
    const heights = waveformHeights(1);
    const middle = heights[(WAVEFORM_BARS - 1) / 2];
    expect(middle).toBe(Math.max(...heights));
    expect(heights[0]).toBeLessThan(middle);
  });

  it("is symmetric, so the shape does not lean", () => {
    const heights = waveformHeights(0.8);
    expect(heights).toEqual([...heights].reverse());
  });

  // The whole point of driving this from the recognizer: a louder voice has
  // to make a visibly bigger wave, or the animation is decoration.
  it("grows with the level", () => {
    const quiet = waveformHeights(0.2);
    const loud = waveformHeights(0.9);
    quiet.forEach((h, i) => expect(h).toBeLessThan(loud[i]));
  });

  it("clamps a level outside 0..1 instead of drawing nonsense", () => {
    expect(waveformHeights(5)).toEqual(waveformHeights(1));
    expect(waveformHeights(-1)).toEqual(waveformHeights(0));
  });
});

describe("formatElapsed", () => {
  it.each([
    [0, "0:00"],
    [900, "0:00"],
    [4200, "0:04"],
    [59_000, "0:59"],
    [60_000, "1:00"],
    [125_000, "2:05"],
  ])("renders %pms as %p", (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected);
  });

  it("never shows a negative clock", () => {
    expect(formatElapsed(-5000)).toBe("0:00");
  });
});
