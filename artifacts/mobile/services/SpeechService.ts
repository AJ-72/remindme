import { Platform } from "react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { File, Paths } from "expo-file-system";
import { logDebug } from "@/services/DebugLogService";

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

  try {
    const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
    if (installedLocales.includes(locale)) return "ready";
  } catch {
    // getSupportedLocales() can reject (e.g. "package_not_found") on some
    // devices/OS versions — fall through to requesting the download
    // directly, same as before this check existed.
  }

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
  locale: string,
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
    lang: locale,
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
): Promise<{ busy: boolean } | { text: string } | { failed: true; reason: string }> {
  if (activeMode !== null) return Promise.resolve({ busy: true });
  activeMode = "file";

  return new Promise((resolve) => {
    let cached: File;
    try {
      const source = new File(uri);
      // `uri` is frequently already inside our own cache directory — the
      // expo-share-intent native module resolves WhatsApp's content:// URIs
      // by copying them into `context.cacheDir` (the same directory as
      // `Paths.cache`) under the original fileName. Reusing that fileName
      // here would make `cached` alias `source`: copy() then either throws
      // "destination already exists", or — if the destination is deleted
      // first to work around that — deletes the only copy of the file
      // before it can be copied, throwing "source doesn't exist" instead.
      // A random prefix guarantees `cached` is always a distinct file.
      const cacheName = `transcribe-${Math.random().toString(36).slice(2)}-${fileName}`;
      cached = new File(Paths.cache, cacheName);
      logDebug(`transcribeAudioFile: copying ${uri} -> ${cached.uri}`);
      source.copy(cached);
      logDebug(`transcribeAudioFile: copy succeeded, starting recognizer on ${cached.uri}`);
    } catch (e) {
      logDebug(`transcribeAudioFile: copy() failed: ${String(e)}`);
      clearActiveSession();
      resolve({ failed: true, reason: `copy() failed: ${String(e)}` });
      return;
    }

    const cleanupCachedFile = () => {
      try {
        if (cached.exists) cached.delete();
      } catch {
        // best-effort cleanup — each attempt uses a fresh random filename,
        // so a leftover file here can't collide with any future attempt.
      }
    };

    const resultSub = ExpoSpeechRecognitionModule.addListener("result", (event: any) => {
      if (!event.isFinal) return;
      clearActiveSession();
      cleanupCachedFile();
      resolve({ text: event.results?.[0]?.transcript ?? "" });
    });
    const errorSub = ExpoSpeechRecognitionModule.addListener("error", (event: any) => {
      clearActiveSession();
      cleanupCachedFile();
      resolve({
        failed: true,
        reason: `error event: ${event?.error ?? "unknown"} — ${event?.message ?? "no message"}`,
      });
    });
    const endSub = ExpoSpeechRecognitionModule.addListener("end", () => {
      // Some inputs (e.g. an undecodable file) can end the recognition session
      // without ever emitting a final result or an error — without this, the
      // promise would never resolve and activeMode would stay "file" forever,
      // wedging both this function and startListening for the rest of the
      // app's life.
      clearActiveSession();
      cleanupCachedFile();
      resolve({ failed: true, reason: "end event fired with no prior result or error" });
    });
    activeSubscriptions = [resultSub, errorSub, endSub];

    ExpoSpeechRecognitionModule.start({
      audioSource: { uri: cached.uri },
      requiresOnDeviceRecognition: true,
    } as any);
  });
}
