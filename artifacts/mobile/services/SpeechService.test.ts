import { Platform } from "react-native";
import {
  getMicPermissionStatus,
  requestMicPermission,
  ensureOfflineModelReady,
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
} from "../__mocks__/expo-file-system";

beforeEach(() => {
  jest.clearAllMocks();
  resetConstructedFiles();
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
});

import { startListening, stopListening } from "@/services/SpeechService";

describe("startListening", () => {
  it("starts the native module and returns busy: false when idle", () => {
    const onResult = jest.fn();
    const onEnd = jest.fn();
    const onError = jest.fn();
    const result = startListening("", onResult, onEnd, onError);
    expect(result).toEqual({ busy: false });
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({ requiresOnDeviceRecognition: true })
    );
    stopListening();
  });

  it("combines the baseline with each result event's transcript", () => {
    const onResult = jest.fn();
    startListening("call mom", onResult, jest.fn(), jest.fn());

    const resultListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "result"
    );
    const resultHandler = resultListenerCall[1];
    resultHandler({ isFinal: false, results: [{ transcript: "tomorrow at 3pm" }] });

    expect(onResult).toHaveBeenCalledWith("call mom tomorrow at 3pm");
    stopListening();
  });

  it("returns busy: true and does not call start again when already listening", () => {
    startListening("", jest.fn(), jest.fn(), jest.fn());
    (ExpoSpeechRecognitionModule.start as jest.Mock).mockClear();

    const second = startListening("", jest.fn(), jest.fn(), jest.fn());

    expect(second).toEqual({ busy: true });
    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
    stopListening();
  });

  it("clears the active session and calls onEnd when the end event fires", () => {
    const onEnd = jest.fn();
    startListening("", jest.fn(), onEnd, jest.fn());

    const endListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "end"
    );
    endListenerCall[1]();

    expect(onEnd).toHaveBeenCalled();
    // Session cleared: a fresh startListening should now succeed (busy: false).
    const afterEnd = startListening("", jest.fn(), jest.fn(), jest.fn());
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
    startListening("", jest.fn(), jest.fn(), jest.fn());
    stopListening();
    expect(ExpoSpeechRecognitionModule.stop).toHaveBeenCalled();

    const result = startListening("", jest.fn(), jest.fn(), jest.fn());
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
    const resultPromise = transcribeAudioFile("content://some/audio", "note.opus");

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

  it("resolves failed: true (never rejects) when an error event fires", async () => {
    const resultPromise = transcribeAudioFile("content://some/audio", "note.opus");

    const errorListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "error"
    );
    errorListenerCall[1]({ message: "not-supported" });

    const result = await resultPromise;
    expect(result).toEqual({ failed: true });
  });

  it("resolves busy: true and does not call start when live listening is already active", async () => {
    startListening("", jest.fn(), jest.fn(), jest.fn());
    (ExpoSpeechRecognitionModule.start as jest.Mock).mockClear();

    const result = await transcribeAudioFile("content://some/audio", "note.opus");

    expect(result).toEqual({ busy: true });
    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
    stopListening();
  });

  it("clears the active session after resolving, allowing a fresh call afterward", async () => {
    const first = transcribeAudioFile("content://some/audio", "note.opus");
    const errorListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "error"
    );
    errorListenerCall[1]({ message: "fail" });
    await first;

    const secondPromise = transcribeAudioFile("content://some/audio", "note2.opus");
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

    const result = await transcribeAudioFile("content://some/audio", "note.opus");

    expect(result).toEqual({ failed: true });
    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();

    // activeMode must have been cleared by the failure, not left wedged: a fresh call
    // should proceed normally (not report busy: true).
    const second = transcribeAudioFile("content://some/audio", "note2.opus");
    const errorListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls
      .filter((call) => call[0] === "error")
      .pop();
    errorListenerCall[1]({ message: "fail" });
    const secondResult = await second;
    expect(secondResult).not.toEqual({ busy: true });
  });

  it("resolves failed: true when the end event fires without a prior result or error, and clears the active session", async () => {
    const resultPromise = transcribeAudioFile("content://some/audio", "note.opus");

    const endListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "end"
    );
    endListenerCall[1]();

    const result = await resultPromise;
    expect(result).toEqual({ failed: true });

    // activeMode must have been cleared by the bare "end" event, not left wedged:
    // a fresh call should proceed normally (not report busy: true).
    const secondPromise = transcribeAudioFile("content://some/audio", "note2.opus");
    const secondErrorListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls
      .filter((call) => call[0] === "error")
      .pop();
    secondErrorListenerCall[1]({ message: "fail" });
    const secondResult = await secondPromise;
    expect(secondResult).not.toEqual({ busy: true });
  });
});
