import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Linking } from "react-native";

import {
  getMicPermissionStatus,
  requestMicPermission,
  resolveDictationReadiness,
  startListening,
  stopListening,
} from "@/services/SpeechService";

/**
 * Mic dictation for QuickAddInput specifically: the one caller that shares
 * the recognizer with expo-share-intent audio transcription (see
 * useDictation's own doc comment for why that caller does NOT use this hook
 * instead — it has no shared-audio session to coordinate with).
 *
 * Owns the full mic lifecycle: permission, the offline-model readiness check
 * (via resolveDictationReadiness, shared with SharedTextContext's file
 * transcription path so the two can't silently disagree on what "still
 * downloading" means), the pulsing mic-icon animation, and the mutex against
 * a shared-audio transcription already in flight (micSourceRef). Callers
 * outside this hook never touch micSourceRef, activeMode, or the pulse
 * animation directly — the hook's interface is start/stop/notice/listening.
 */
export interface UseSharedAwareDictationResult {
  listening: boolean;
  micNotice: string | null;
  micNoticeDebugInfo: string | null;
  micPulse: Animated.Value;
  handleMicPress: () => void;
}

export function useSharedAwareDictation(
  input: string,
  onText: (fullText: string) => void,
  dictationLanguage: string,
  shared: {
    sharedAudioTranscribing: boolean;
    sharedAudioNotice: string | null;
    sharedAudioDebugInfo: string | null;
  }
): UseSharedAwareDictationResult {
  const [listening, setListening] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [micNoticeDebugInfo, setMicNoticeDebugInfo] = useState<string | null>(null);
  const micPulse = useRef(new Animated.Value(1)).current;
  const micSourceRef = useRef<"live" | "shared" | null>(null);
  // Read fresh on every call rather than captured once — startSpeakMode is
  // created once via useCallback with a stable identity, but the text the
  // user has typed since changes on every keystroke.
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    if (shared.sharedAudioTranscribing) {
      if (micSourceRef.current === "live") {
        // A live mic session already owns listening/pulse state — don't let
        // this (typically near-instantly-busy) shared-audio attempt touch it.
        return;
      }
      micSourceRef.current = "shared";
      setListening(true);
      startMicPulse();
      setMicNotice(null);
    } else if (micSourceRef.current === "shared") {
      micSourceRef.current = null;
      setListening(false);
      stopMicPulse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared.sharedAudioTranscribing]);

  useEffect(() => {
    if (shared.sharedAudioNotice) {
      setMicNotice(shared.sharedAudioNotice);
    }
  }, [shared.sharedAudioNotice]);

  useEffect(() => {
    setMicNoticeDebugInfo(shared.sharedAudioDebugInfo);
  }, [shared.sharedAudioDebugInfo]);

  function startMicPulse() {
    Animated.loop(
      Animated.sequence([
        Animated.timing(micPulse, { toValue: 1.15, duration: 400, useNativeDriver: true }),
        Animated.timing(micPulse, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    ).start();
  }

  function stopMicPulse() {
    micPulse.stopAnimation();
    micPulse.setValue(1);
  }

  const startSpeakMode = useCallback(async () => {
    setMicNotice(null);
    const { granted, canAskAgain } = await getMicPermissionStatus();
    if (!granted) {
      if (!canAskAgain) {
        Linking.openSettings();
        return;
      }
      const nowGranted = await requestMicPermission();
      if (!nowGranted) return;
    }

    // Live mic falls back to online recognition rather than bailing when the
    // offline model is still downloading — a person is waiting right now, so
    // proceeding online is the correct choice here (see
    // resolveDictationReadiness's doc comment for why shared-audio
    // transcription makes the opposite call).
    const { status, onDevice } = await resolveDictationReadiness(dictationLanguage);
    if (status === "preparing") {
      setMicNotice("Preparing voice recognition — try again in a moment");
      return;
    }

    const { busy } = startListening(
      inputRef.current,
      dictationLanguage,
      (fullText) => onText(fullText),
      () => {
        micSourceRef.current = null;
        setListening(false);
        stopMicPulse();
      },
      () => {
        micSourceRef.current = null;
        setListening(false);
        stopMicPulse();
        setMicNotice("Couldn't hear that — try again or type it in.");
      },
      onDevice
    );
    if (busy) {
      setMicNotice("Still transcribing the shared audio…");
      return;
    }
    micSourceRef.current = "live";
    setListening(true);
    startMicPulse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictationLanguage, onText]);

  const stopSpeakMode = useCallback(() => {
    if (micSourceRef.current === "shared") {
      // A shared audio file is transcribing right now — stopping here would
      // kill its native listeners and permanently wedge the concurrency
      // guard. Surface a notice instead of stopping it.
      setMicNotice("Still transcribing the shared audio…");
      return;
    }
    stopListening();
    micSourceRef.current = null;
    setListening(false);
    stopMicPulse();
  }, []);

  const handleMicPress = useCallback(() => {
    if (!listening) {
      startSpeakMode();
    } else if (micSourceRef.current === "shared") {
      setMicNotice("Still transcribing the shared audio…");
    } else {
      stopSpeakMode();
    }
  }, [listening, startSpeakMode, stopSpeakMode]);

  return { listening, micNotice, micNoticeDebugInfo, micPulse, handleMicPress };
}
