import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { logDebug } from "@/services/DebugLogService";
import {
  isFileTranscriptionSupported,
  transcribeAudioFile,
} from "@/services/SpeechService";

interface SharedTextContextType {
  sharedText: string;
  clearSharedText: () => void;
  sharedAudioTranscribing: boolean;
  sharedAudioNotice: string | null;
  sharedAudioDebugInfo: string | null;
}

const SharedTextContext = createContext<SharedTextContextType>({
  sharedText: "",
  clearSharedText: () => {},
  sharedAudioTranscribing: false,
  sharedAudioNotice: null,
  sharedAudioDebugInfo: null,
});

interface ShareIntentFile {
  fileName: string;
  mimeType: string | null;
  path: string;
}

let ShareIntent: {
  useShareIntent: () => {
    shareIntent: {
      text?: string | null;
      webUrl?: string | null;
      files?: ShareIntentFile[] | null;
    } | null;
    resetShareIntent: () => void;
    error: string | null;
  };
} | null = null;
try {
  // Available in native builds. No-op in Expo Go and web.
  // @ts-ignore
  ShareIntent = require("expo-share-intent");
} catch {
  ShareIntent = null;
}

const AUDIO_TRANSCRIPTION_FALLBACK_NOTICE =
  "Couldn't transcribe this audio — added the file name instead.";
const AUDIO_DETECTION_FAILURE_NOTICE = "Couldn't read the shared audio.";

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (e) {
    return `<unserializable: ${String(e)}>`;
  }
}

function describeShareFailure(shareIntent: unknown, error: unknown): string {
  return [`error: ${String(error)}`, `shareIntent: ${safeStringify(shareIntent)}`].join("\n\n");
}

function NativeShareIntentCapture({
  onText,
  onTranscribingChange,
  onNotice,
  onDebugInfo,
}: {
  onText: (text: string) => void;
  onTranscribingChange: (transcribing: boolean) => void;
  onNotice: (notice: string | null) => void;
  onDebugInfo: (info: string | null) => void;
}) {
  const { shareIntent, resetShareIntent, error } = ShareIntent!.useShareIntent();
  const handledRef = useRef(false);

  useEffect(() => {
    logDebug("NativeShareIntentCapture mounted");
  }, []);

  useEffect(() => {
    logDebug(
      `NativeShareIntentCapture effect ran — handled=${handledRef.current}, error=${String(error)}, shareIntent=${safeStringify(shareIntent)}`
    );

    if (error && !handledRef.current) {
      handledRef.current = true;
      logDebug(`share-intent native error: ${error}`);
      onNotice(AUDIO_DETECTION_FAILURE_NOTICE);
      onDebugInfo(describeShareFailure(shareIntent, error));
      resetShareIntent();
      return;
    }

    const files = shareIntent?.files ?? null;
    const audioFile = files?.find((f) => f.mimeType?.startsWith("audio/"));
    const text = shareIntent?.text ?? shareIntent?.webUrl ?? null;

    if (audioFile && !handledRef.current) {
      handledRef.current = true;
      logDebug(`audio file detected: ${safeStringify(audioFile)}`);
      onTranscribingChange(true);
      (async () => {
        onNotice(null);
        onDebugInfo(null);
        try {
          if (!isFileTranscriptionSupported()) {
            logDebug("isFileTranscriptionSupported() = false — falling back to filename");
            onText(audioFile.fileName);
            onNotice(AUDIO_TRANSCRIPTION_FALLBACK_NOTICE);
            return;
          }
          logDebug(`calling transcribeAudioFile(${audioFile.path}, ${audioFile.fileName})`);
          const result = await transcribeAudioFile(audioFile.path, audioFile.fileName);
          logDebug(`transcribeAudioFile result: ${safeStringify(result)}`);
          if ("text" in result) {
            onText(result.text);
          } else if ("failed" in result) {
            onText(audioFile.fileName);
            onNotice(AUDIO_TRANSCRIPTION_FALLBACK_NOTICE);
            onDebugInfo(describeShareFailure(shareIntent, result.reason));
          }
          // else: { busy: true } — a live mic session currently owns the input
          // field. Deliberately call neither onText nor onNotice here: touching
          // either would clobber in-progress speech the user is dictating right
          // now (Finding 2a).
        } catch (e) {
          logDebug(`transcribeAudioFile threw: ${String(e)}`);
          onText(audioFile.fileName);
          onNotice(AUDIO_TRANSCRIPTION_FALLBACK_NOTICE);
          onDebugInfo(describeShareFailure(shareIntent, e));
        } finally {
          onTranscribingChange(false);
          resetShareIntent();
        }
      })();
      return;
    }

    if (text && !handledRef.current) {
      handledRef.current = true;
      logDebug(`text/webUrl share detected: ${text}`);
      onText(text.trim());
      resetShareIntent();
      return;
    }

    if (files?.length && !audioFile && !handledRef.current) {
      // Shared file(s) arrived but none had a recognizable audio mimeType
      // (e.g. the OS reported something unexpected) — surface this instead
      // of silently dropping the share, which previously looked identical
      // to "nothing was shared at all".
      handledRef.current = true;
      logDebug(`files present but none matched audio/* mimeType: ${safeStringify(files)}`);
      onNotice(AUDIO_DETECTION_FAILURE_NOTICE);
      onDebugInfo(describeShareFailure(shareIntent, "no file matched mimeType audio/*"));
      resetShareIntent();
      return;
    }

    if (!audioFile && !text) {
      handledRef.current = false;
    }
  }, [shareIntent, error, resetShareIntent, onText, onTranscribingChange, onNotice, onDebugInfo]);

  return null;
}

export function SharedTextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sharedText, setSharedText] = useState("");
  const [sharedAudioTranscribing, setSharedAudioTranscribing] = useState(false);
  const [sharedAudioNotice, setSharedAudioNotice] = useState<string | null>(null);
  const [sharedAudioDebugInfo, setSharedAudioDebugInfo] = useState<string | null>(null);

  const clearSharedText = useCallback(() => setSharedText(""), []);
  const handleText = useCallback((text: string) => setSharedText(text), []);
  const handleTranscribingChange = useCallback(
    (transcribing: boolean) => setSharedAudioTranscribing(transcribing),
    []
  );
  const handleNotice = useCallback(
    (notice: string | null) => setSharedAudioNotice(notice),
    []
  );
  const handleDebugInfo = useCallback(
    (info: string | null) => setSharedAudioDebugInfo(info),
    []
  );

  useEffect(() => {
    logDebug(
      `SharedTextProvider mounted — Platform.OS=${Platform.OS}, expo-share-intent require ${ShareIntent ? "succeeded" : "FAILED"}`
    );
  }, []);

  return (
    <SharedTextContext.Provider
      value={{
        sharedText,
        clearSharedText,
        sharedAudioTranscribing,
        sharedAudioNotice,
        sharedAudioDebugInfo,
      }}
    >
      {Platform.OS !== "web" && ShareIntent?.useShareIntent ? (
        <NativeShareIntentCapture
          onText={handleText}
          onTranscribingChange={handleTranscribingChange}
          onNotice={handleNotice}
          onDebugInfo={handleDebugInfo}
        />
      ) : null}
      {children}
    </SharedTextContext.Provider>
  );
}

export function useSharedText() {
  return useContext(SharedTextContext);
}
