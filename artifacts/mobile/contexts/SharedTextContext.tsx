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
}

const SharedTextContext = createContext<SharedTextContextType>({
  sharedText: "",
  clearSharedText: () => {},
  sharedAudioTranscribing: false,
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

function NativeShareIntentCapture({
  onText,
  onTranscribingChange,
}: {
  onText: (text: string) => void;
  onTranscribingChange: (transcribing: boolean) => void;
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
        if (!isFileTranscriptionSupported()) {
          onText(audioFile.fileName);
          onTranscribingChange(false);
          resetShareIntent();
          return;
        }
        const result = await transcribeAudioFile(audioFile.path, audioFile.fileName);
        if ("text" in result) {
          onText(result.text);
        } else {
          onText(audioFile.fileName);
        }
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

  const clearSharedText = useCallback(() => setSharedText(""), []);
  const handleText = useCallback((text: string) => setSharedText(text), []);
  const handleTranscribingChange = useCallback(
    (transcribing: boolean) => setSharedAudioTranscribing(transcribing),
    []
  );

  return (
    <SharedTextContext.Provider
      value={{ sharedText, clearSharedText, sharedAudioTranscribing }}
    >
      {Platform.OS !== "web" && ShareIntent?.useShareIntent ? (
        <NativeShareIntentCapture
          onText={handleText}
          onTranscribingChange={handleTranscribingChange}
        />
      ) : null}
      {children}
    </SharedTextContext.Provider>
  );
}

export function useSharedText() {
  return useContext(SharedTextContext);
}
