import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import {
  isFileTranscriptionSupported,
  transcribeAudioFile,
} from "@/services/SpeechService";

interface SharedTextContextType {
  sharedText: string;
  clearSharedText: () => void;
  sharedAudioTranscribing: boolean;
  sharedAudioNotice: string | null;
}

const SharedTextContext = createContext<SharedTextContextType>({
  sharedText: "",
  clearSharedText: () => {},
  sharedAudioTranscribing: false,
  sharedAudioNotice: null,
});

interface ShareIntentFile {
  fileName: string;
  mimeType: string;
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

function NativeShareIntentCapture({
  onText,
  onTranscribingChange,
  onNotice,
}: {
  onText: (text: string) => void;
  onTranscribingChange: (transcribing: boolean) => void;
  onNotice: (notice: string | null) => void;
}) {
  const { shareIntent, resetShareIntent } = ShareIntent!.useShareIntent();
  const handledRef = useRef(false);

  useEffect(() => {
    const audioFile = shareIntent?.files?.find((f) => f.mimeType.startsWith("audio/"));
    const text = shareIntent?.text ?? shareIntent?.webUrl ?? null;

    if (audioFile && !handledRef.current) {
      handledRef.current = true;
      onTranscribingChange(true);
      (async () => {
        onNotice(null);
        if (!isFileTranscriptionSupported()) {
          onText(audioFile.fileName);
          onNotice(AUDIO_TRANSCRIPTION_FALLBACK_NOTICE);
          onTranscribingChange(false);
          resetShareIntent();
          return;
        }
        const result = await transcribeAudioFile(audioFile.path, audioFile.fileName);
        if ("text" in result) {
          onText(result.text);
        } else if ("failed" in result) {
          onText(audioFile.fileName);
          onNotice(AUDIO_TRANSCRIPTION_FALLBACK_NOTICE);
        }
        // else: { busy: true } — a live mic session currently owns the input
        // field. Deliberately call neither onText nor onNotice here: touching
        // either would clobber in-progress speech the user is dictating right
        // now (Finding 2a). onTranscribingChange(false) and resetShareIntent()
        // below still run unconditionally, so the share intent doesn't wedge.
        onTranscribingChange(false);
        resetShareIntent();
      })();
      return;
    }

    if (text && !handledRef.current) {
      handledRef.current = true;
      onText(text.trim());
      resetShareIntent();
    }
    if (!audioFile && !text) {
      handledRef.current = false;
    }
  }, [shareIntent, resetShareIntent, onText, onTranscribingChange]);

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

  return (
    <SharedTextContext.Provider
      value={{ sharedText, clearSharedText, sharedAudioTranscribing, sharedAudioNotice }}
    >
      {Platform.OS !== "web" && ShareIntent?.useShareIntent ? (
        <NativeShareIntentCapture
          onText={handleText}
          onTranscribingChange={handleTranscribingChange}
          onNotice={handleNotice}
        />
      ) : null}
      {children}
    </SharedTextContext.Provider>
  );
}

export function useSharedText() {
  return useContext(SharedTextContext);
}
