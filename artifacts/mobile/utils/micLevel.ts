/**
 * Turning the recognizer's loudness readings into a waveform.
 *
 * `expo-speech-recognition` emits a `volumechange` event carrying a single
 * float. The module's own types describe it as roughly -2 to 10, with
 * anything below 0 inaudible; on Android it is Android's `onRmsChanged`
 * rmsdB passed straight through. That is a decibel-ish reading, not a
 * fraction, so it cannot drive a bar height on its own.
 *
 * This module holds no React and no react-native import on purpose: the
 * mapping is then testable as plain arithmetic, which matters because the
 * one thing a waveform must never do is lie about whether the mic is hearing
 * anything.
 */

/** At or below this, treat the input as silence. The module's own floor. */
export const MIC_LEVEL_FLOOR_DB = 0;

/**
 * The top of the useful range. The documented ceiling is 10, but ordinary
 * speech at arm's length sits well under it, so normalising against 10 would
 * keep the waveform flat for every real user. 8 spends the full height on
 * the range a person actually speaks in and clamps the shouts.
 */
export const MIC_LEVEL_CEILING_DB = 8;

/** How many bars the waveform draws. Odd, so it has a centre. */
export const WAVEFORM_BARS = 7;

/** Bar height when the mic hears nothing, as a fraction of the full height. */
export const WAVEFORM_MIN_HEIGHT = 0.18;

/**
 * Maps one `volumechange` value to 0..1.
 *
 * Anything unusable - undefined, a string, NaN, a reading from a recognizer
 * that emits nothing - returns 0 rather than throwing. A waveform that flat-
 * lines is honest about a mic that is not being heard; a crash is not.
 */
export function normaliseMicLevel(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const span = MIC_LEVEL_CEILING_DB - MIC_LEVEL_FLOOR_DB;
  const fraction = (value - MIC_LEVEL_FLOOR_DB) / span;
  if (fraction <= 0) return 0;
  if (fraction >= 1) return 1;
  return fraction;
}

/**
 * The bar heights for one level, as fractions of the full height.
 *
 * The envelope is fixed and symmetric - the centre bars reach highest - so
 * the shape reads as a voice rather than as a row of equal blocks, while the
 * only thing that moves is the level itself. Deterministic on purpose: a
 * random envelope would animate convincingly with the microphone switched
 * off, which is exactly the lie this surface exists to avoid.
 */
export function waveformHeights(level: number, bars: number = WAVEFORM_BARS): number[] {
  const safe = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  const centre = (bars - 1) / 2;
  return Array.from({ length: bars }, (_, i) => {
    // 1 at the centre bar, falling away towards both ends.
    const envelope = centre === 0 ? 1 : 1 - (Math.abs(i - centre) / (centre + 1)) * 0.7;
    const reach = WAVEFORM_MIN_HEIGHT + (1 - WAVEFORM_MIN_HEIGHT) * safe * envelope;
    return Math.min(1, reach);
  });
}

/** Seconds as m:ss. The elapsed clock on the listening surface. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
