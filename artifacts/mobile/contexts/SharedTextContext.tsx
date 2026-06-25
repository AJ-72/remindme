import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";

interface SharedTextContextType {
  sharedText: string;
  clearSharedText: () => void;
}

const SharedTextContext = createContext<SharedTextContextType>({
  sharedText: "",
  clearSharedText: () => {},
});

let ShareIntent: {
  useShareIntent: () => {
    shareIntent: { text?: string | null; webUrl?: string | null } | null;
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
}: {
  onText: (text: string) => void;
}) {
  const { shareIntent, resetShareIntent } = ShareIntent!.useShareIntent();
  const handledRef = useRef(false);

  useEffect(() => {
    const text = shareIntent?.text ?? shareIntent?.webUrl ?? null;
    if (text && !handledRef.current) {
      handledRef.current = true;
      onText(text.trim());
      resetShareIntent();
    }
    if (!text) {
      handledRef.current = false;
    }
  }, [shareIntent, resetShareIntent, onText]);

  return null;
}

export function SharedTextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sharedText, setSharedText] = useState("");

  const clearSharedText = useCallback(() => setSharedText(""), []);
  const handleText = useCallback((text: string) => setSharedText(text), []);

  return (
    <SharedTextContext.Provider value={{ sharedText, clearSharedText }}>
      {Platform.OS !== "web" && ShareIntent?.useShareIntent ? (
        <NativeShareIntentCapture onText={handleText} />
      ) : null}
      {children}
    </SharedTextContext.Provider>
  );
}

export function useSharedText() {
  return useContext(SharedTextContext);
}
