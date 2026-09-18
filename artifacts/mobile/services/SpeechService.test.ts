import { Platform } from "react-native";
import {
  getMicPermissionStatus,
  requestMicPermission,
  ensureOfflineModelReady,
  resolveDictationReadiness,
} from "@/services/SpeechService";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

// jest-expo's preset ships its own built-in automock for expo-file-system
// (the legacy copyAsync-style API) via jest.mock() in its setup file, which
// takes priority over a manual __mocks__/expo-file-system.ts. Re-assert our
// manual mock (the class-based File/Paths API this app actually uses) here
// so it wins.
jest.mock("expo-file-system", () => jest.requireActual("../__mocks__/expo-file-system"));

import {
  constructedFiles,
  resetConstructedFiles,
  makeNextCopyThrow,
  seedExistingCacheFile,
  resetExistingCacheFiles,
} from "../__mocks__/expo-file-system";

beforeEach(() => {
  jest.clearAllMocks();
  resetConstructedFiles();
  resetExistingCacheFiles();
  jest.replaceProperty(Platform, "OS", "android");
});

describe("getMicPermissionStatus", () => {
  it("returns granted and canAskAgain from the native module", async () => {
    (ExpoSpeechRecognitionModule.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      granted: false,
      canAskAgain: true,
      status: "denied",
    });
    const result = await getMicPermissionStatus();
    expect(result).toEqual({ granted: false, canAskAgain: true });
  });
});

describe("requestMicPermission", () => {
  it("returns true when the OS grants the request", async () => {
    (ExpoSpeechRecognitionModule.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      granted: true,
      canAskAgain: true,
      status: "granted",
    });
    const result = await requestMicPermission();
    expect(result).toBe(true);
  });

  it("returns false when the OS denies the request", async () => {
    (ExpoSpeechRecognitionModule.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
      status: "denied",
    });
    const result = await requestMicPermission();
    expect(result).toBe(false);
  });
});

describe("ensureOfflineModelReady", () => {
  it("resolves ready when the native module reports download_success", async () => {
    (ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload as jest.Mock).mockResolvedValueOnce({
      status: "download_success",
      message: "ok",
    });
    const result = await ensureOfflineModelReady("en-US");
    expect(result).toBe("ready");
  });

  it("resolves preparing when the native module reports opened_dialog", async () => {
    (ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload as jest.Mock).mockResolvedValueOnce({
      status: "opened_dialog",
      message: "dialog shown",
    });
    const result = await ensureOfflineModelReady("en-US");
    expect(result).toBe("preparing");
  });

  it("resolves preparing when the native module reports download_canceled", async () => {
    (ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload as jest.Mock).mockResolvedValueOnce({
      status: "download_canceled",
      message: "canceled",
    });
    const result = await ensureOfflineModelReady("en-US");
    expect(result).toBe("preparing");
  });

  it("always resolves ready on iOS, without calling the Android-only download API", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const result = await ensureOfflineModelReady("en-US");
    expect(result).toBe("ready");
    expect(ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload).not.toHaveBeenCalled();
  });

  it("resolves ready without triggering a download when the locale is already installed", async () => {
    (ExpoSpeechRecognitionModule.getSupportedLocales as jest.Mock).mockResolvedValueOnce({
      locales: ["en-US", "es-ES"],
      installedLocales: ["en-US"],
    });
    const result = await ensureOfflineModelReady("en-US");
    expect(result).toBe("ready");
    expect(ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload).not.toHaveBeenCalled();
  });

  it("triggers a download when the locale is not among the installed locales", async () => {
    (ExpoSpeechRecognitionModule.getSupportedLocales as jest.Mock).mockResolvedValueOnce({
      locales: ["en-US", "es-ES"],
      installedLocales: ["en-US"],
    });
    const result = await ensureOfflineModelReady("es-ES");
    expect(result).toBe("ready");
    expect(ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload).toHaveBeenCalledWith({
      locale: "es-ES",
    });
  });

  it("falls back to triggering the download when getSupportedLocales rejects", async () => {
    (ExpoSpeechRecognitionModule.getSupportedLocales as jest.Mock).mockRejectedValueOnce(
      new Error("package_not_found")
    );
    const result = await ensureOfflineModelReady("en-US");
    expect(result).toBe("ready");
    expect(ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload).toHaveBeenCalledWith({
      locale: "en-US",
    });
  });
});

describe("resolveDictationReadiness", () => {
  it("resolves onDevice=true, shouldBail=false when the model is ready", async () => {
    (ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload as jest.Mock).mockResolvedValueOnce({
      status: "download_success",
      message: "ok",
    });
    const result = await resolveDictationReadiness("en-US");
    expect(result).toEqual({ status: "ready", onDevice: true, shouldBail: false });
  });

  it("resolves onDevice=false, shouldBail=true while the model is still downloading — the one status a caller must not silently proceed past", async () => {
    (ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload as jest.Mock).mockResolvedValueOnce({
      status: "opened_dialog",
      message: "dialog shown",
    });
    const result = await resolveDictationReadiness("en-US");
    expect(result).toEqual({ status: "preparing", onDevice: false, shouldBail: true });
  });

  it("resolves onDevice=false, shouldBail=false when no offline model exists for the locale at all — callers fall back to online recognition", async () => {
    (ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error("ERROR_LANGUAGE_UNAVAILABLE"), { code: 12 })
    );
    const result = await resolveDictationReadiness("en-US");
    expect(result).toEqual({ status: "unavailable", onDevice: false, shouldBail: false });
  });
});

import {
  VOLUME_EVENT_INTERVAL_MS,
  startListening,
  stopListening,
} from "@/services/SpeechService";

describe("startListening", () => {
  it("starts the native module and returns busy: false when idle", () => {
    const onResult = jest.fn();
    const onEnd = jest.fn();
    const onError = jest.fn();
    const result = startListening("", "en-US", onResult, onEnd, onError);
    expect(result).toEqual({ busy: false });
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({ requiresOnDeviceRecognition: true, lang: "en-US" })
    );
    stopListening();
  });

  it("passes the given locale through to the native module as lang", () => {
    startListening("", "es-ES", jest.fn(), jest.fn(), jest.fn());
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({ lang: "es-ES" })
    );
    stopListening();
  });

  it("combines the baseline with each committed transcript", () => {
    const onResult = jest.fn();
    startListening("call mom", "en-US", onResult, jest.fn(), jest.fn());

    const resultListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "result"
    );
    const resultHandler = resultListenerCall[1];
    resultHandler({ isFinal: true, results: [{ transcript: "tomorrow at 3pm" }] });

    expect(onResult).toHaveBeenCalledWith("call mom tomorrow at 3pm");
    stopListening();
  });

  // The field holds words the recognizer has settled on. A guess still being
  // revised goes to the listening surface instead, where it can be drawn grey
  // - once both are in the same input, neither can be told from the other.
  it("keeps an uncommitted segment out of the field", () => {
    const onResult = jest.fn();
    const onInterim = jest.fn();
    startListening("call mom", "en-US", onResult, jest.fn(), jest.fn(), true, { onInterim });

    const resultHandler = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "result"
    )[1];
    resultHandler({ isFinal: false, results: [{ transcript: "tomorrow at" }] });

    expect(onInterim).toHaveBeenCalledWith("tomorrow at");
    expect(onResult).not.toHaveBeenCalled();
    stopListening();
  });

  // Done arrives mid-segment more often than not: the user stops speaking and
  // taps. stopListening() clears the listeners, so a final emitted on stop has
  // nowhere to land - without the flush those last words are simply lost.
  it("keeps the segment in progress when the session is stopped", () => {
    const onResult = jest.fn();
    const onInterim = jest.fn();
    startListening("", "en-US", onResult, jest.fn(), jest.fn(), true, { onInterim });

    const resultHandler = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "result"
    )[1];
    resultHandler({ isFinal: false, results: [{ transcript: "buy milk" }] });
    stopListening();

    expect(onResult).toHaveBeenCalledWith("buy milk");
    expect(onInterim).toHaveBeenLastCalledWith("");
  });

  it("asks the recognizer for loudness only when something will draw it", () => {
    startListening("", "en-US", jest.fn(), jest.fn(), jest.fn());
    expect(
      (ExpoSpeechRecognitionModule.start as jest.Mock).mock.calls[0][0]
        .volumeChangeEventOptions
    ).toBeUndefined();
    stopListening();

    (ExpoSpeechRecognitionModule.start as jest.Mock).mockClear();
    startListening("", "en-US", jest.fn(), jest.fn(), jest.fn(), true, {
      onVolume: jest.fn(),
    });
    expect(
      (ExpoSpeechRecognitionModule.start as jest.Mock).mock.calls[0][0]
        .volumeChangeEventOptions
    ).toEqual({ enabled: true, intervalMillis: VOLUME_EVENT_INTERVAL_MS });
    stopListening();
  });

  it("hands the waveform a normalised level, not the raw reading", () => {
    const onVolume = jest.fn();
    startListening("", "en-US", jest.fn(), jest.fn(), jest.fn(), true, { onVolume });

    const volumeHandler = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "volumechange"
    )[1];
    volumeHandler({ value: 8 });
    volumeHandler({ value: -2 });

    expect(onVolume).toHaveBeenNthCalledWith(1, 1);
    expect(onVolume).toHaveBeenNthCalledWith(2, 0);
    stopListening();
  });

  // With `continuous: true` the recognizer closes a segment at every pause and
  // restarts the next one from empty. Rebuilding the field as
  // `baseline + transcript` on every event therefore DELETED each finished
  // sentence as soon as the user paused and carried on - the field looked like
  // it was clearing itself at random.
  it("keeps every finished segment as the recognizer starts new ones", () => {
    const onResult = jest.fn();
    startListening("", "en-US", onResult, jest.fn(), jest.fn());
    const resultHandler = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "result"
    )[1];

    resultHandler({ isFinal: false, results: [{ transcript: "buy milk" }] });
    resultHandler({ isFinal: true, results: [{ transcript: "buy milk" }] });
    // A new segment. Its transcript does NOT carry the first one.
    resultHandler({ isFinal: false, results: [{ transcript: "and bread" }] });
    resultHandler({ isFinal: true, results: [{ transcript: "and bread" }] });


    expect(onResult).toHaveBeenLastCalledWith("buy milk and bread");
    stopListening();
  });

  it("replaces only the segment in progress, never the finished ones", () => {
    const onResult = jest.fn();
    startListening("note:", "en-US", onResult, jest.fn(), jest.fn());
    const resultHandler = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "result"
    )[1];

    const onInterim = jest.fn();
    resultHandler({ isFinal: true, results: [{ transcript: "call Amma" }] });
    resultHandler({ isFinal: false, results: [{ transcript: "at" }] });
    resultHandler({ isFinal: true, results: [{ transcript: "at seven" }] });

    expect(onResult).toHaveBeenLastCalledWith("note: call Amma at seven");
    expect(onInterim).not.toHaveBeenCalled();
    stopListening();
  });

  it("returns busy: true and does not call start again when already listening", () => {
    startListening("", "en-US", jest.fn(), jest.fn(), jest.fn());
    (ExpoSpeechRecognitionModule.start as jest.Mock).mockClear();

    const second = startListening("", "en-US", jest.fn(), jest.fn(), jest.fn());

    expect(second).toEqual({ busy: true });
    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
    stopListening();
  });

  it("clears the active session and calls onEnd when the end event fires", () => {
    const onEnd = jest.fn();
    startListening("", "en-US", jest.fn(), onEnd, jest.fn());

    const endListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "end"
    );
    endListenerCall[1]();

    expect(onEnd).toHaveBeenCalled();
    // Session cleared: a fresh startListening should now succeed (busy: false).
    const afterEnd = startListening("", "en-US", jest.fn(), jest.fn(), jest.fn());
    expect(afterEnd).toEqual({ busy: false });
    stopListening();
  });
});

describe("stopListening", () => {
  it("is a no-op when nothing is listening", () => {
    expect(() => stopListening()).not.toThrow();
    expect(ExpoSpeechRecognitionModule.stop).not.toHaveBeenCalled();
  });

  it("stops the native module and allows a fresh startListening afterward", () => {
    startListening("", "en-US", jest.fn(), jest.fn(), jest.fn());
    stopListening();
    expect(ExpoSpeechRecognitionModule.stop).toHaveBeenCalled();

    const result = startListening("", "en-US", jest.fn(), jest.fn(), jest.fn());
    expect(result).toEqual({ busy: false });
    stopListening();
  });
});

import { isFileTranscriptionSupported } from "@/services/SpeechService";

describe("isFileTranscriptionSupported", () => {
  it("is true on iOS regardless of version", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    expect(isFileTranscriptionSupported()).toBe(true);
  });

  it("is true on Android API 33+", () => {
    jest.replaceProperty(Platform, "OS", "android");
    jest.spyOn(Platform, "Version", "get").mockReturnValue(33);
    expect(isFileTranscriptionSupported()).toBe(true);
  });

  it("is false on Android below API 33", () => {
    jest.replaceProperty(Platform, "OS", "android");
    jest.spyOn(Platform, "Version", "get").mockReturnValue(31);
    expect(isFileTranscriptionSupported()).toBe(false);
  });
});

import { transcribeAudioFile } from "@/services/SpeechService";

describe("transcribeAudioFile", () => {
  it("copies the source file into cache, then resolves with the final transcript", async () => {
    const resultPromise = transcribeAudioFile("content://some/audio", "note.opus", "en-US");

    const resultListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "result"
    );
    resultListenerCall[1]({ isFinal: false, results: [{ transcript: "partial" }] });
    resultListenerCall[1]({ isFinal: true, results: [{ transcript: "final transcript" }] });

    const result = await resultPromise;
    expect(result).toEqual({ text: "final transcript" });
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({
        audioSource: expect.objectContaining({ uri: expect.stringContaining("note.opus") }),
        requiresOnDeviceRecognition: true,
      })
    );
    // The source File instance is constructed first, then the cached destination File.
    const [source, cached] = constructedFiles;
    expect(source.copy).toHaveBeenCalledWith(cached);
  });

  it("copies into a distinct cache filename even when the shared uri is already inside the cache dir under the same name (expo-share-intent resolves WhatsApp content:// URIs this way)", async () => {
    // Simulates expo-share-intent having already copied the WhatsApp voice
    // note into our own cache dir under its original filename — the uri and
    // fileName collide with what a naive `new File(Paths.cache, fileName)`
    // destination would produce, which would make source === destination.
    seedExistingCacheFile("file:///mock-cache-dir/PTT-20260724-WA0003.opus");

    const resultPromise = transcribeAudioFile(
      "file:///mock-cache-dir/PTT-20260724-WA0003.opus",
      "PTT-20260724-WA0003.opus",
      "en-US"
    );

    const resultListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "result"
    );
    resultListenerCall[1]({ isFinal: true, results: [{ transcript: "final transcript" }] });

    const result = await resultPromise;
    expect(result).toEqual({ text: "final transcript" });
    const [source, cached] = constructedFiles;
    expect(cached.uri).not.toBe(source.uri);
    expect(source.copy).toHaveBeenCalledWith(cached);
  });

  it("deletes the cached temp copy after a successful transcription, so cache files don't accumulate", async () => {
    const resultPromise = transcribeAudioFile("content://some/audio", "note.opus", "en-US");

    const resultListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "result"
    );
    resultListenerCall[1]({ isFinal: true, results: [{ transcript: "final transcript" }] });
    await resultPromise;

    const [, cached] = constructedFiles;
    expect(cached.exists).toBe(false);
  });

  it("resolves failed: true (never rejects) when an error event fires, with the error's reason attached", async () => {
    const resultPromise = transcribeAudioFile("content://some/audio", "note.opus", "en-US");

    const errorListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "error"
    );
    errorListenerCall[1]({ error: "not-supported", message: "not-supported" });

    const result = await resultPromise;
    expect(result).toEqual({ failed: true, reason: expect.stringContaining("not-supported") });
  });

  it("resolves busy: true and does not call start when live listening is already active", async () => {
    startListening("", "en-US", jest.fn(), jest.fn(), jest.fn());
    (ExpoSpeechRecognitionModule.start as jest.Mock).mockClear();

    const result = await transcribeAudioFile("content://some/audio", "note.opus", "en-US");

    expect(result).toEqual({ busy: true });
    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
    stopListening();
  });

  it("clears the active session after resolving, allowing a fresh call afterward", async () => {
    const first = transcribeAudioFile("content://some/audio", "note.opus", "en-US");
    const errorListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "error"
    );
    errorListenerCall[1]({ message: "fail" });
    await first;

    const secondPromise = transcribeAudioFile("content://some/audio", "note2.opus", "en-US");
    // The session was cleared by the first call, so this second call registers
    // its own fresh set of listeners; trigger the latest "error" listener to
    // resolve it (the brief's original test awaited this promise without ever
    // firing a listener event, which hangs forever — fixed here).
    const secondErrorListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls
      .filter((call) => call[0] === "error")
      .pop();
    secondErrorListenerCall[1]({ message: "fail again" });

    const second = await secondPromise;
    expect(second).not.toEqual({ busy: true });
  });

  it("resolves failed: true (never rejects) when copy() throws, and clears the active session", async () => {
    // Simulate a source copy failure (e.g. revoked content:// read permission).
    makeNextCopyThrow();

    const result = await transcribeAudioFile("content://some/audio", "note.opus", "en-US");

    expect(result).toEqual({ failed: true, reason: expect.stringContaining("permission revoked") });
    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();

    // activeMode must have been cleared by the failure, not left wedged: a fresh call
    // should proceed normally (not report busy: true).
    const second = transcribeAudioFile("content://some/audio", "note2.opus", "en-US");
    const errorListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls
      .filter((call) => call[0] === "error")
      .pop();
    errorListenerCall[1]({ message: "fail" });
    const secondResult = await second;
    expect(secondResult).not.toEqual({ busy: true });
  });

  it("passes the given locale through to the native module as lang", async () => {
    const resultPromise = transcribeAudioFile("content://some/audio", "note.opus", "ml-IN");

    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({ lang: "ml-IN" })
    );

    const errorListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "error"
    );
    errorListenerCall[1]({ message: "cleanup" });
    await resultPromise;
  });

  it("resolves failed: true when the end event fires without a prior result or error, and clears the active session", async () => {
    const resultPromise = transcribeAudioFile("content://some/audio", "note.opus", "en-US");

    const endListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "end"
    );
    endListenerCall[1]();

    const result = await resultPromise;
    expect(result).toEqual({ failed: true, reason: expect.stringContaining("end event") });

    // activeMode must have been cleared by the bare "end" event, not left wedged:
    // a fresh call should proceed normally (not report busy: true).
    const secondPromise = transcribeAudioFile("content://some/audio", "note2.opus", "en-US");
    const secondErrorListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls
      .filter((call) => call[0] === "error")
      .pop();
    secondErrorListenerCall[1]({ message: "fail" });
    const secondResult = await secondPromise;
    expect(secondResult).not.toEqual({ busy: true });
  });
});
