import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

export interface ProcessTextEvent {
  text: string;
}

type ProcessTextNativeModule = {
  getInitialProcessText: () => string | null;
  addListener: (
    event: "onProcessText",
    listener: (payload: ProcessTextEvent) => void
  ) => { remove: () => void };
};

// Absent on iOS, on the web, and in Expo Go (the module is only linked into a
// native Android build), so every call site must tolerate `null`.
const nativeModule =
  Platform.OS === "android"
    ? requireOptionalNativeModule<ProcessTextNativeModule>("ProcessText")
    : null;

export function isProcessTextSupported(): boolean {
  return nativeModule != null;
}

/**
 * Text the app was launched with from another app's text-selection menu, or
 * null. Reading it consumes it: a second call returns null.
 */
export function getInitialProcessText(): string | null {
  try {
    return nativeModule?.getInitialProcessText() ?? null;
  } catch {
    return null;
  }
}

/** Fires when a selection arrives while the app is already running. */
export function addProcessTextListener(
  listener: (text: string) => void
): { remove: () => void } {
  if (!nativeModule) {
    return { remove: () => {} };
  }
  return nativeModule.addListener("onProcessText", (payload: ProcessTextEvent) =>
    listener(payload.text)
  );
}
