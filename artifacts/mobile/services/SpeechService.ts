import { Platform } from "react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

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
