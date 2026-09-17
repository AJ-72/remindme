import { Platform } from "react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { File, Paths } from "expo-file-system";
import { logDebug } from "@/services/DebugLogService";
import { normaliseMicLevel } from "@/utils/micLevel";
import { EVENTS } from "@/constants/analytics";
import { track } from "@/services/AnalyticsService";

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

// "unavailable" means this device has no offline model for the locale at
// all (e.g. many devices' Speech Services app has no Malayalam offline
// pack, even though Gboard's separate voice-typing engine supports it) —
// callers should fall back to online (requiresOnDeviceRecognition: false)
// rather than treating this the same as "preparing" (still downloading).
export async function ensureOfflineModelReady(
  locale: string
): Promise<"ready" | "preparing" | "unavailable"> {
  if (Platform.OS !== "android") return "ready";

  try {
    const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
    if (installedLocales.includes(locale)) return "ready";
  } catch {
    // getSupportedLocales() can reject (e.g. "package_not_found") on some
    // devices/OS versions — fall through to requesting the download
    // directly, same as before this check existed.
  }

  try {
    const { status } = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({
      locale,
    });
    return status === "download_success" ? "ready" : "preparing";
  } catch {
    // Rejects with ERROR_LANGUAGE_UNAVAILABLE (code 12) when this device's
    // Speech Services app has no offline model for the locale at all.
    return "unavailable";
  }
}

/**
 * Resolves whether a locale's speech recognition is ready to use right now,
 * and if not, what to do about it — the single place that turns
 * ensureOfflineModelReady's three-way status into a caller-facing decision.
 *
 * Both dictation call sites (live mic in QuickAddInput, shared-audio
 * transcription in SharedTextContext) need the same three-step resolution —
 * check the model status, decide onDevice, decide what "still downloading"
 * means for this attempt — and previously did it independently, which let
 * them silently disagree: one bailed out on "preparing" with a notice, the
 * other proceeded anyway. This is the shared seam so they can't drift again.
 *
 * `"preparing"` always means "do not attempt on-device recognition THIS
 * time" (onDevice: false) — the caller then decides whether to fall back to
 * online recognition (live mic — this is the correct choice, since a live
 * user is waiting) or bail out and let the user retry (shared-audio
 * transcription — a stale in-flight download for a locale someone dictated
 * before is not worth guessing at with online recognition on their behalf).
 * The `shouldBail` field encodes ONLY the "still downloading" case; ready and
 * unavailable are both meant to proceed (with, respectively, on-device and
 * online recognition).
 */
export async function resolveDictationReadiness(locale: string): Promise<{
  status: "ready" | "preparing" | "unavailable";
  onDevice: boolean;
  shouldBail: boolean;
}> {
  const status = await ensureOfflineModelReady(locale);
  return {
    status,
    onDevice: status === "ready",
    shouldBail: status === "preparing",
  };
}

let activeMode: "live" | "file" | null = null;
let activeSubscriptions: { remove: () => void }[] = [];
/**
 * Hands the segment still in progress to the field before the session closes.
 * stopListening() clears the listeners synchronously, so a final result the
 * recognizer emits on stop has nobody left to receive it - without this, the
 * last words spoken before Done would be dropped.
 */
let flushPending: (() => void) | null = null;

function clearActiveSession(): void {
  activeSubscriptions.forEach((sub) => sub.remove());
  activeSubscriptions = [];
  activeMode = null;
  flushPending = null;
}

/** How often the recognizer reports loudness. Fast enough to read as a voice. */
export const VOLUME_EVENT_INTERVAL_MS = 100;

export interface LiveSessionHooks {
  /**
   * The segment the recognizer has not committed yet, or "" when there is
   * none. Kept out of the text field on purpose: a guess and a committed
   * word look identical once they are in the same input, and the field
   * cannot render two colours.
   */
  onInterim?: (segment: string) => void;
  /** Input loudness, already normalised to 0..1 by normaliseMicLevel(). */
  onVolume?: (level: number) => void;
}

/**
 * Dictation telemetry. Reported here rather than at the call sites because
 * both of them (QuickAddInput's mic, and a shared audio payload) route
 * through this module, and the question - does voice entry actually work for
 * people, or do they give up on it - is meaningless split in two.
 *
 * Only the locale and whether a transcript came back are ever sent. The words
 * themselves never leave the device through this path.
 */
export function startListening(
  baseline: string,
  locale: string,
  onResult: (fullText: string) => void,
  onEnd: () => void,
  onError: (message: string) => void,
  onDevice: boolean = true,
  hooks?: LiveSessionHooks
): { busy: boolean } {
  if (activeMode !== null) return { busy: true };
  activeMode = "live";
  track(EVENTS.DICTATION_STARTED, { locale, on_device: onDevice });
  let heardAnything = false;

  // With `continuous: true` the recognizer does not hand back one growing
  // transcript. It closes a segment at each pause, emits it with
  // isFinal: true, and starts the NEXT segment from empty - so a handler that
  // rebuilds the field as `baseline + transcript` every time wipes out every
  // earlier sentence the moment the user pauses and speaks again. Finished
  // segments are kept here instead, and only the segment still in progress is
  // replaced on each interim event.
  let committed = "";
  let pending = "";
  const join = (...parts: string[]) => parts.filter((p) => p !== "").join(" ").trim();
  const commit = (segment: string) => {
    if (segment.trim() !== "") heardAnything = true;
    committed = join(committed, segment);
    pending = "";
    hooks?.onInterim?.("");
    onResult(join(baseline, committed));
  };
  flushPending = () => {
    if (pending === "") return;
    commit(pending);
  };
  const resultSub = ExpoSpeechRecognitionModule.addListener("result", (event: any) => {
    const transcript = event.results?.[0]?.transcript ?? "";
    if (event.isFinal) {
      commit(transcript);
      return;
    }
    // The field keeps only committed words. The segment in progress goes to
    // the listening surface, where it can be drawn grey and read as a guess.
    pending = transcript;
    hooks?.onInterim?.(transcript);
  });
  const endSub = ExpoSpeechRecognitionModule.addListener("end", () => {
    clearActiveSession();
    // A session that ends having heard nothing is the failure users actually
    // hit - no error is raised, the mic just closes and the field is empty -
    // and it is invisible without being counted separately here.
    track(EVENTS.DICTATION_COMPLETED, { locale, got_text: heardAnything });
    onEnd();
  });
  const errorSub = ExpoSpeechRecognitionModule.addListener("error", (event: any) => {
    clearActiveSession();
    // event.code is the recognizer's own enum, not user speech.
    track(EVENTS.DICTATION_FAILED, {
      locale,
      code: String(event?.error ?? event?.code ?? "unknown"),
    });
    onError(event?.message ?? "Speech recognition error");
  });
  activeSubscriptions = [resultSub, endSub, errorSub];
  if (hooks?.onVolume) {
    activeSubscriptions.push(
      ExpoSpeechRecognitionModule.addListener("volumechange", (event: any) => {
        hooks.onVolume?.(normaliseMicLevel(event?.value));
      })
    );
  }

  ExpoSpeechRecognitionModule.start({
    lang: locale,
    interimResults: true,
    requiresOnDeviceRecognition: onDevice,
    // Off by default in the module, and silent rather than an error when it
    // is left off - so the waveform would simply never move.
    ...(hooks?.onVolume
      ? {
          volumeChangeEventOptions: {
            enabled: true,
            intervalMillis: VOLUME_EVENT_INTERVAL_MS,
          },
        }
      : {}),
    // Without this, recognition ends at the first pause in speech (iOS
    // 17-: after 3s of silence; iOS 18+/Android: as soon as any isFinal
    // result comes in) — the mic then reads as "stopped" mid-sentence.
    // continuous keeps the session open until the user (or an error)
    // ends it via stopListening()/.stop().
    continuous: true,
  } as any);

  return { busy: false };
}

export function stopListening(): void {
  if (activeMode === null) return;
  // Before the listeners go, not after: Done must keep the half-spoken
  // segment the user had just finished saying.
  flushPending?.();
  ExpoSpeechRecognitionModule.stop();
  clearActiveSession();
}

/**
 * Throw the session away instead of ending it.
 *
 * stopListening() asks the recognizer to finish, so a last partial phrase can
 * still arrive and land in the input. Cancel means the user wants nothing of
 * what was said, so the listeners are removed BEFORE the native call - a late
 * result then has nowhere to go. Falls back to stop() on an older module
 * build that has no abort().
 */
export function abortListening(): void {
  if (activeMode === null) return;
  clearActiveSession();
  try {
    const mod = ExpoSpeechRecognitionModule as unknown as {
      abort?: () => void;
      stop: () => void;
    };
    if (typeof mod.abort === "function") mod.abort();
    else mod.stop();
  } catch {
    // The session is already forgotten on this side; a native failure here
    // must not leave the caller believing the mic is still live.
  }
}

export function isFileTranscriptionSupported(): boolean {
  if (Platform.OS === "ios") return true;
  if (Platform.OS !== "android") return false;
  return typeof Platform.Version === "number" && Platform.Version >= 33;
}

export function transcribeAudioFile(
  uri: string,
  fileName: string,
  locale: string,
  onDevice: boolean = true
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
      lang: locale,
      requiresOnDeviceRecognition: onDevice,
    } as any);
  });
}
