import { Platform } from "react-native";
import {
  getMicPermissionStatus,
  requestMicPermission,
  ensureOfflineModelReady,
} from "@/services/SpeechService";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

beforeEach(() => {
  jest.clearAllMocks();
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
