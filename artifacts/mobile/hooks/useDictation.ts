import { useCallback, useState } from "react";
import { Linking } from "react-native";

import {
  ensureOfflineModelReady,
  getMicPermissionStatus,
  requestMicPermission,
  startListening,
  stopListening,
} from "@/services/SpeechService";
import { useReminders } from "@/contexts/RemindersContext";

/**
 * Mic dictation for a single text field: permission, the Android per-locale
 * offline model, and start/stop of the recognizer.
 *
 * QuickAddInput deliberately does NOT use this. It shares the recognizer with
 * expo-share-intent audio transcription, so every start/stop there has to
 * consult `micSourceRef` first and must not stop a transcription in flight.
 * Folding that branch in here would put a concern this hook's only caller
 * cannot reach into every caller.
 */
export interface UseDictationResult {
  listening: boolean;
  notice: string | null;
  toggle: () => void;
  clearNotice: () => void;
}

export function useDictation(
  currentText: string,
  onText: (fullText: string) => void
): UseDictationResult {
  const { dictationLanguage } = useReminders();
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const start = useCallback(async () => {
    setNotice(null);
    const { granted, canAskAgain } = await getMicPermissionStatus();
    if (!granted) {
      // Permanently denied: the in-app prompt will never appear again, so the
      // OS settings page is the only place the user can undo it.
      if (!canAskAgain) {
        Linking.openSettings();
        return;
      }
      if (!(await requestMicPermission())) return;
    }

    const modelStatus = await ensureOfflineModelReady(dictationLanguage);
    if (modelStatus === "preparing") {
      setNotice("Preparing voice recognition — try again in a moment");
      return;
    }

    const { busy } = startListening(
      currentText,
      dictationLanguage,
      onText,
      () => setListening(false),
      () => {
        setListening(false);
        setNotice("Couldn't hear that — try again or type it in.");
      },
      modelStatus !== "unavailable"
    );
    if (busy) {
      setNotice("Still transcribing the shared audio…");
      return;
    }
    setListening(true);
  }, [currentText, dictationLanguage, onText]);

  const toggle = useCallback(() => {
    if (listening) {
      stopListening();
      setListening(false);
      return;
    }
    start();
  }, [listening, start]);

  return {
    listening,
    notice,
    toggle,
    clearNotice: useCallback(() => setNotice(null), []),
  };
}
