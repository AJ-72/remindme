/**
 * When dictation should end itself.
 *
 * The recognizer runs with `continuous: true`, which is right for a sentence
 * that has pauses in it and wrong for a user who has finished speaking and is
 * waiting for the app to notice. Native engines disagree about when - and
 * whether - they close a session on their own, so the decision lives here, in
 * JS, where it is the same on every device.
 *
 * This module holds no React and no react-native import on purpose: the rules
 * are then testable against a plain fake clock.
 */

/** A pause this long AFTER something was heard ends the session. */
export const SILENCE_STOP_MS = 2500;

/** Nothing heard at all for this long ends the session as a failure. */
export const NO_SPEECH_STOP_MS = 6000;

export interface DictationTimer {
  /** The session just opened. Starts the no-speech clock. */
  begin(): void;
  /** A partial result arrived. Restarts the pause clock. */
  heard(): void;
  /** The session ended for any reason. Always safe to call. */
  clear(): void;
}

export interface DictationTimerOptions {
  /** A real pause after real speech: keep what was heard. */
  onSilence: () => void;
  /** The mic was open and heard nothing: keep nothing, and say so. */
  onNoSpeech: () => void;
  silenceMs?: number;
  noSpeechMs?: number;
}

export function createDictationTimer(opts: DictationTimerOptions): DictationTimer {
  const silenceMs = opts.silenceMs ?? SILENCE_STOP_MS;
  const noSpeechMs = opts.noSpeechMs ?? NO_SPEECH_STOP_MS;

  let handle: ReturnType<typeof setTimeout> | null = null;
  let heardAny = false;
  // Once a timer has fired, the session is over. A later heard() - a result
  // that was already in flight when the clock ran out - must not open it again.
  let done = false;

  const cancel = () => {
    if (handle !== null) {
      clearTimeout(handle);
      handle = null;
    }
  };

  const arm = (ms: number, fire: () => void) => {
    cancel();
    handle = setTimeout(() => {
      handle = null;
      done = true;
      fire();
    }, ms);
  };

  return {
    begin() {
      heardAny = false;
      done = false;
      arm(noSpeechMs, () => opts.onNoSpeech());
    },
    heard() {
      if (done) return;
      heardAny = true;
      arm(silenceMs, () => opts.onSilence());
    },
    clear() {
      done = true;
      heardAny = false;
      cancel();
    },
  };
}
