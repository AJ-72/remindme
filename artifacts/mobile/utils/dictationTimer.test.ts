import {
  createDictationTimer,
  NO_SPEECH_STOP_MS,
  SILENCE_STOP_MS,
} from "@/utils/dictationTimer";

describe("createDictationTimer", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function make() {
    const onSilence = jest.fn();
    const onNoSpeech = jest.fn();
    const timer = createDictationTimer({ onSilence, onNoSpeech });
    return { timer, onSilence, onNoSpeech };
  }

  it("ends the session as a failure when nothing is ever heard", () => {
    const { timer, onSilence, onNoSpeech } = make();
    timer.begin();

    jest.advanceTimersByTime(NO_SPEECH_STOP_MS - 1);
    expect(onNoSpeech).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onNoSpeech).toHaveBeenCalledTimes(1);
    expect(onSilence).not.toHaveBeenCalled();
  });

  it("waits for a pause, not the no-speech timeout, once speech arrives", () => {
    const { timer, onSilence, onNoSpeech } = make();
    timer.begin();
    timer.heard();

    jest.advanceTimersByTime(SILENCE_STOP_MS - 1);
    expect(onSilence).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onSilence).toHaveBeenCalledTimes(1);
    expect(onNoSpeech).not.toHaveBeenCalled();
  });

  it("restarts the pause clock on every result, so a sentence with gaps survives", () => {
    const { timer, onSilence } = make();
    timer.begin();

    for (let i = 0; i < 5; i++) {
      timer.heard();
      jest.advanceTimersByTime(SILENCE_STOP_MS - 100);
    }
    expect(onSilence).not.toHaveBeenCalled();

    jest.advanceTimersByTime(SILENCE_STOP_MS);
    expect(onSilence).toHaveBeenCalledTimes(1);
  });

  it("stops the no-speech clock the moment speech arrives", () => {
    const { timer, onNoSpeech } = make();
    timer.begin();

    jest.advanceTimersByTime(NO_SPEECH_STOP_MS - 100);
    timer.heard();
    jest.advanceTimersByTime(NO_SPEECH_STOP_MS);

    expect(onNoSpeech).not.toHaveBeenCalled();
  });

  it("fires nothing after clear()", () => {
    const { timer, onSilence, onNoSpeech } = make();
    timer.begin();
    timer.heard();
    timer.clear();

    jest.advanceTimersByTime(NO_SPEECH_STOP_MS * 10);
    expect(onSilence).not.toHaveBeenCalled();
    expect(onNoSpeech).not.toHaveBeenCalled();
  });

  it("ignores a result that arrives after the clock already ran out", () => {
    const { timer, onSilence, onNoSpeech } = make();
    timer.begin();

    jest.advanceTimersByTime(NO_SPEECH_STOP_MS);
    expect(onNoSpeech).toHaveBeenCalledTimes(1);

    timer.heard();
    jest.advanceTimersByTime(SILENCE_STOP_MS * 4);
    expect(onSilence).not.toHaveBeenCalled();
  });

  it("honours overridden delays", () => {
    const onSilence = jest.fn();
    const onNoSpeech = jest.fn();
    const timer = createDictationTimer({
      onSilence,
      onNoSpeech,
      silenceMs: 50,
      noSpeechMs: 100,
    });
    timer.begin();
    timer.heard();

    jest.advanceTimersByTime(50);
    expect(onSilence).toHaveBeenCalledTimes(1);
  });
});
