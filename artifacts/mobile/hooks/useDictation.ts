import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import * as Haptics from "expo-haptics";

import {
  abortListening,
  ensureOfflineModelReady,
  getMicPermissionStatus,
  requestMicPermission,
  startListening,
  stopListening,
} from "@/services/SpeechService";
import { createDictationTimer, type DictationTimer } from "@/utils/dictationTimer";
import { useReminders } from "@/contexts/RemindersContext";

/**
 * Mic dictation for a single text field: permission, the Android per-locale
 * offline model, start/stop of the recognizer, and the pause clock that ends a
 * session the recognizer itself would keep open forever.
 *
 * QuickAddInput deliberately does NOT use this. It shares the recognizer with
 * expo-share-intent audio transcription, so every start/stop there has to
 * consult `micSourceRef` first and must not stop a transcription in flight.
 * Folding that branch in here would put a concern this hook's only caller
 * cannot reach into every caller. The two share `createDictationTimer`,
 * `ListeningSurface` and SpeechService instead, which is where the behaviour
 * they must agree on actually lives.
 */
export interface UseDictationResult {
  listening: boolean;
  /** True once the recognizer has returned at least one word this session. */
  heardSpeech: boolean;
  notice: string | null;
  toggle: () => void;
  /** End the session and keep what was heard. */
  stop: () => void;
  /** End the session and restore the text as it was before the mic opened. */
  cancel: () => void;
  clearNotice: () => void;
}

export function useDictation(
  currentText: string,
  onText: (fullText: string) => void
): UseDictationResult {
  const { dictationLanguage } = useReminders();
  const [listening, setListening] = useState(false);
  const [heardSpeech, setHeardSpeech] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // The same fact as `heardSpeech`, readable from inside a timer callback,
  // which closes over state as it was when the timer was armed.
  const heardSpeechRef = useRef(false);
  // What the field held before dictation started. Cancel puts it back.
  const baselineRef = useRef("");
  const timerRef = useRef<DictationTimer | null>(null);

  const settle = useCallback(() => {
    timerRef.current?.clear();
    timerRef.current = null;
    heardSpeechRef.current = false;
    setHeardSpeech(false);
    setListening(false);
  }, []);

  const stop = useCallback(() => {
    stopListening();
    settle();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [settle]);

  const cancel = useCallback(() => {
    abortListening();
    onText(baselineRef.current);
    settle();
    setNotice(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [onText, settle]);

  const start = useCallback(async () => {
    setNotice(null);
    const { granted, canAskAgain } = await getMicPermissionStatus();
    if (!granted) {
      // Permanently denied: the in-app prompt will never appear again, so the
      // OS settings page is the only place the user can undo it. Say so before
      // leaving the app - a jump with no sentence reads as a crash.
      if (!canAskAgain) {
        setNotice("Microphone access is off. Turn it on in Settings to dictate.");
        Linking.openSettings();
        return;
      }
      if (!(await requestMicPermission())) {
        setNotice("No microphone access. Type it instead.");
        return;
      }
    }

    const modelStatus = await ensureOfflineModelReady(dictationLanguage);
    if (modelStatus === "preparing") {
      setNotice("Preparing voice recognition — try again in a moment");
      return;
    }

    const baseline = currentText;
    baselineRef.current = baseline;

    // Built per session, so each one closes over the baseline it started from.
    const timer = createDictationTimer({
      onSilence: () => {
        stopListening();
        settle();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onNoSpeech: () => {
        // Nothing was heard, so there is nothing to keep. Cancel rather than
        // stop, and say why - a mic that closes in silence with no message
        // reads as a broken button.
        abortListening();
        onText(baseline);
        settle();
        setNotice("Didn't hear anything — try again or type it in.");
      },
    });
    timerRef.current = timer;

    const { busy } = startListening(
      baseline,
      dictationLanguage,
      (fullText) => {
        onText(fullText);
        if (!heardSpeechRef.current) {
          heardSpeechRef.current = true;
          setHeardSpeech(true);
        }
        timer.heard();
      },
      () => settle(),
      () => {
        settle();
        setNotice("Couldn't hear that — try again or type it in.");
      },
      modelStatus !== "unavailable"
    );
    if (busy) {
      setNotice("Still transcribing the shared audio…");
      return;
    }
    heardSpeechRef.current = false;
    setHeardSpeech(false);
    setListening(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    timer.begin();
  }, [currentText, dictationLanguage, onText, settle]);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
      return;
    }
    start();
  }, [listening, start, stop]);

  // Leaving the app stops dictation. Android hands the microphone to whatever
  // comes to the front anyway, so a session left running here would keep the
  // surface on screen over a recognizer that is already dead.
  useEffect(() => {
    if (!listening) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") return;
      stopListening();
      settle();
      setNotice("Voice input stopped when you left the app. Your words were kept.");
    });
    return () => sub.remove();
  }, [listening, settle]);

  // A screen change while the mic is open must not leave the native session
  // running with nothing left to receive its results.
  useEffect(() => {
    return () => {
      timerRef.current?.clear();
      timerRef.current = null;
      abortListening();
    };
  }, []);

  return {
    listening,
    heardSpeech,
    notice,
    toggle,
    stop,
    cancel,
    clearNotice: useCallback(() => setNotice(null), []),
  };
}
