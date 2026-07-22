import { Platform } from "react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { File, Paths } from "expo-file-system";

export async function getMicPermissionStatus(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  const { granted, canAskAgain } = await ExpoSpeechRecognitionModule.getPermissionsAsync();
  return { granted, canAskAgain };
}

export async function requestMicPermission(): Promise<boolean> {
  const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return granted;
}

export async function ensureOfflineModelReady(
  locale: string
): Promise<"ready" | "preparing"> {
  if (Platform.OS !== "android") return "ready";
  const { status } = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({
    locale,
  });
  return status === "download_success" ? "ready" : "preparing";
}

let activeMode: "live" | "file" | null = null;
let activeSubscriptions: { remove: () => void }[] = [];

function clearActiveSession(): void {
  activeSubscriptions.forEach((sub) => sub.remove());
  activeSubscriptions = [];
  activeMode = null;
}

export function startListening(
  baseline: string,
  onResult: (fullText: string) => void,
  onEnd: () => void,
  onError: (message: string) => void
): { busy: boolean } {
  if (activeMode !== null) return { busy: true };
  activeMode = "live";

  const resultSub = ExpoSpeechRecognitionModule.addListener("result", (event: any) => {
    const transcript = event.results?.[0]?.transcript ?? "";
    const combined = `${baseline} ${transcript}`.trim();
    onResult(combined);
  });
  const endSub = ExpoSpeechRecognitionModule.addListener("end", () => {
    clearActiveSession();
    onEnd();
  });
  const errorSub = ExpoSpeechRecognitionModule.addListener("error", (event: any) => {
    clearActiveSession();
    onError(event?.message ?? "Speech recognition error");
  });
  activeSubscriptions = [resultSub, endSub, errorSub];

  ExpoSpeechRecognitionModule.start({
    continuous: true,
    interimResults: true,
    requiresOnDeviceRecognition: true,
  } as any);

  return { busy: false };
}

export function stopListening(): void {
  if (activeMode === null) return;
  ExpoSpeechRecognitionModule.stop();
  clearActiveSession();
}

export function isFileTranscriptionSupported(): boolean {
  if (Platform.OS === "ios") return true;
  if (Platform.OS !== "android") return false;
  return typeof Platform.Version === "number" && Platform.Version >= 33;
}

export function transcribeAudioFile(
  uri: string,
  fileName: string
): Promise<{ busy: boolean } | { text: string } | { failed: true }> {
  if (activeMode !== null) return Promise.resolve({ busy: true });
  activeMode = "file";

  return new Promise((resolve) => {
    let cachedUri: string;
    try {
      const source = new File(uri);
      const cached = new File(Paths.cache, fileName);
      source.copy(cached);
      cachedUri = cached.uri;
    } catch {
      clearActiveSession();
      resolve({ failed: true });
      return;
    }

    const resultSub = ExpoSpeechRecognitionModule.addListener("result", (event: any) => {
      if (!event.isFinal) return;
      clearActiveSession();
      resolve({ text: event.results?.[0]?.transcript ?? "" });
    });
    const errorSub = ExpoSpeechRecognitionModule.addListener("error", () => {
      clearActiveSession();
      resolve({ failed: true });
    });
    const endSub = ExpoSpeechRecognitionModule.addListener("end", () => {
      // Some inputs (e.g. an undecodable file) can end the recognition session
      // without ever emitting a final result or an error — without this, the
      // promise would never resolve and activeMode would stay "file" forever,
      // wedging both this function and startListening for the rest of the
      // app's life.
      clearActiveSession();
      resolve({ failed: true });
    });
    activeSubscriptions = [resultSub, errorSub, endSub];

    ExpoSpeechRecognitionModule.start({
      audioSource: { uri: cachedUri },
      requiresOnDeviceRecognition: true,
    } as any);
  });
}
