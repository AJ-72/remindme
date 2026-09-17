import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getLocales } from "expo-localization";
import ContactPickerModal from "@/components/ContactPickerModal";
import QuietHoursSheet from "@/components/QuietHoursSheet";
import { useReminders } from "@/contexts/RemindersContext";
import { useSharedText } from "@/contexts/SharedTextContext";
import { useColors } from "@/hooks/useColors";
import { useTourTarget } from "@/contexts/TourContext";
import {
  abortListening,
  ensureOfflineModelReady,
  getMicPermissionStatus,
  requestMicPermission,
  startListening,
  stopListening,
} from "@/services/SpeechService";
import { checkReachability, isReachabilityStale } from "@/services/RecipientLookupService";
import { sendInvitation } from "@/services/InvitationService";
import type { PickableContact } from "@/services/ContactsService";
import {
  incrementRegisterPromptCount,
  markMicLanguageLineSeen,
  markRegisterPromptShown,
  shouldOfferNumberRegistration,
  shouldShowMicLanguageLine,
  type ReminderRecipient,
} from "@/services/ReminderService";
import { formatTime12h } from "@/utils/formatDatetime";
import { parseNaturalLanguage } from "@/utils/parseNaturalLanguage";
import { EVENTS } from "@/constants/analytics";
import { track } from "@/services/AnalyticsService";
import { contentScript } from "@/utils/analyticsProps";
import type { ParsedAmbiguity } from "@/utils/malayalamDateParser";
import { isQuietAt, quietHoursEndAfter } from "@/utils/quietHours";
import { createDictationTimer, type DictationTimer } from "@/utils/dictationTimer";
import ListeningSurface from "@/components/ListeningSurface";
import RegisterNumberNudge from "@/components/RegisterNumberNudge";
import StarterExamples from "@/components/StarterExamples";
import { detectPersonInTitle } from "@/utils/personInTitle";
import { detectVagueOpener } from "@/utils/vagueTask";
import { getFontFamily } from "@/utils/getFontFamily";
import {
  DateTimePicker,
  toDateInput,
  toTimeInput,
  type DateTimePickerEvent,
} from "@/utils/dateTimePicker";

type PickerMode = "date" | "time" | null;


function roundToNextHour(d: Date): Date {
  const result = new Date(d);
  result.setMinutes(0, 0, 0);
  result.setHours(result.getHours() + 1);
  if (result.getTime() - d.getTime() < 60 * 60 * 1000) {
    result.setHours(result.getHours() + 1);
  }
  return result;
}

function formatDatePill(d: Date): string {
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear();

  if (isToday) return "Today";
  if (isTomorrow) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatTimePill(d: Date): string {
  return formatTime12h(d);
}

function formatSuggestedTime(d: Date): string {
  const datePart = formatDatePill(d);
  const timePart = formatTimePill(d);
  return `${datePart} at ${timePart}`;
}

interface Props {
  onSaved?: () => void;
}

export default function QuickAddInput({ onSaved }: Props) {
  const colors = useColors();
  const quickAddInputTourRef = useTourTarget("quick-add-input");
  const micTourRef = useTourTarget("quick-add-mic");
  const remindSomeoneTourRef = useTourTarget("quick-add-remind-someone");
  const {
    addReminder,
    attachInvitationId,
    defaultAlarmEnabled,
    dictationLanguage,
    quietHours,
    reminders,
  } =
    useReminders();
  const {
    sharedText,
    clearSharedText,
    sharedAudioTranscribing,
    sharedAudioNotice,
    sharedAudioDebugInfo,
  } = useSharedText();

  const [input, setInput] = useState("");
  const [parsedTitle, setParsedTitle] = useState("");
  const [parsedDate, setParsedDate] = useState<Date | null>(null);
  const [alarm, setAlarm] = useState(defaultAlarmEnabled);
  // Tracks whether the user has overridden the alarm for the reminder they're
  // currently composing, so the sync effect below doesn't undo that.
  const alarmTouchedRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [notesVisible, setNotesVisible] = useState(false);
  const [recipient, setRecipient] = useState<ReminderRecipient | undefined>(undefined);
  // The offer to register the user's OWN number, shown after they have sent a
  // reminder to somebody else - the first moment being reachable back means
  // anything. Until a number is registered there is no Supabase session, so
  // checkReachability() returns null for every contact and no recipient can
  // ever earn the in-app badge: this offer is the only route to that state.
  // Holds the recipient's name while the offer is up, so the copy can say who
  // it was that the user just reminded. Null means no offer on screen.
  const [offerRegistration, setOfferRegistration] = useState<string | null>(null);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [contactPickerVisible, setContactPickerVisible] = useState(false);
  const [quietPrompt, setQuietPrompt] = useState<Date | null>(null);
  // A ref, not state: it is read inside the quiet-hours handlers on a later
  // turn and never rendered, so a re-render for it would be noise.
  const pendingTitleRef = useRef<string | undefined>(undefined);
  // The parse the user still has to disambiguate, and the prompt showing it.
  // Kept apart so a stale prompt cannot outlive the text that produced it.
  const [ambiguity, setAmbiguity] = useState<ParsedAmbiguity | null>(null);
  const [ambiguityPrompt, setAmbiguityPrompt] = useState<ParsedAmbiguity | null>(null);
  const [dismissedVagueText, setDismissedVagueText] = useState<string | null>(null);
  // Keyed by the name, not by a boolean: refusing to send "Call Amma" to Amma
  // says nothing about whether the next reminder should go to Priya.
  const [dismissedPerson, setDismissedPerson] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [listening, setListening] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [micNoticeDebugInfo, setMicNoticeDebugInfo] = useState<string | null>(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const micPulse = useRef(new Animated.Value(1)).current;
  const micSourceRef = useRef<"live" | "shared" | null>(null);
  // Only a LIVE mic session gets the listening surface. A shared audio file
  // transcribing in the background also sets `listening`, but it has no
  // silence to time and no session the user can stop or cancel.
  const [liveListening, setLiveListening] = useState(false);
  // The listening surface's own state: loudness for the waveform, the
  // uncommitted segment, and the two clocks it draws.
  const [micLevel, setMicLevel] = useState(0);
  const [micInterim, setMicInterim] = useState("");
  const [micStartedAt, setMicStartedAt] = useState<number | null>(null);
  const [micLastHeardAt, setMicLastHeardAt] = useState<number | null>(null);
  const [micLanguageLine, setMicLanguageLine] = useState(false);
  const [heardSpeech, setHeardSpeech] = useState(false);
  // The same fact as `heardSpeech`, readable from inside the timer callback,
  // which closes over the state value as it was when the timer was armed.
  const heardSpeechRef = useRef(false);
  // What the input held before dictation started. Cancel puts it back.
  const dictationBaselineRef = useRef("");
  const dictationTimerRef = useRef<DictationTimer | null>(null);

  const [showNoTimeSheet, setShowNoTimeSheet] = useState(false);
  const [suggestedTime, setSuggestedTime] = useState<Date>(roundToNextHour(new Date()));
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);

  const pillAnim = useRef(new Animated.Value(0)).current;
  const pillTranslate = useRef(new Animated.Value(-6)).current;

  useEffect(() => {
    if (sharedAudioTranscribing) {
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
  }, [sharedAudioTranscribing]);

  useEffect(() => {
    if (sharedAudioNotice) {
      setMicNotice(sharedAudioNotice);
    }
  }, [sharedAudioNotice]);

  useEffect(() => {
    setMicNoticeDebugInfo(sharedAudioDebugInfo);
  }, [sharedAudioDebugInfo]);

  useEffect(() => {
    if (sharedText) {
      setInput(sharedText);
      clearSharedText();
    }
  }, [sharedText, clearSharedText]);

  // useState only seeds on first mount, but this component lives on the home
  // screen and never unmounts — so a Settings change (or the initial async
  // load, which resolves after mount) would otherwise never reach the icon,
  // leaving a lit bell while sound was off. Skipped once the user has
  // toggled the alarm for the reminder in progress.
  useEffect(() => {
    if (!alarmTouchedRef.current) {
      setAlarm(defaultAlarmEnabled);
    }
  }, [defaultAlarmEnabled]);

  useEffect(() => {
    const { title, date, ambiguity: parsedAmbiguity } = parseNaturalLanguage(input);
    setParsedTitle(title);
    setParsedDate(date);
    setAmbiguity(parsedAmbiguity ?? null);

    if (date) {
      Animated.parallel([
        Animated.spring(pillAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 }),
        Animated.spring(pillTranslate, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(pillAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(pillTranslate, { toValue: -6, duration: 140, useNativeDriver: true }),
      ]).start();
    }
  }, [input]);

  const doSave = async (dateToUse: Date, titleOverride?: string) => {
    // Once per save, not once per keystroke - the parse effect above runs on
    // every character. `ambiguity` records that the parser could not decide
    // between a numeral being a time and being part of the text, which is the
    // Malayalam-input case worth watching separately.
    track(EVENTS.NL_PARSE_RESULT, {
      date_parsed: parsedDate !== null,
      script: contentScript(titleOverride ?? parsedTitle ?? input),
      ambiguous: ambiguity !== null,
      surface: "quick_add",
    });
    // Ask, never block. The app defers its OWN alerts out of quiet hours
    // silently, but a time the user chose deliberately is a different thing -
    // refusing to set it is the only genuinely wrong move here.
    if (isQuietAt(dateToUse, quietHours)) {
      setQuietPrompt(dateToUse);
      // The quiet-hours sheet resolves on its own turn of the loop, so the
      // chosen title has to survive until then; parsedTitle is the wrong one
      // whenever the user picked the "it's part of the reminder" reading.
      pendingTitleRef.current = titleOverride;
      return;
    }
    await performSave(dateToUse, titleOverride);
  };

  const handleQuietKeep = async () => {
    const target = quietPrompt;
    const title = pendingTitleRef.current;
    setQuietPrompt(null);
    pendingTitleRef.current = undefined;
    if (target) await performSave(target, title);
  };

  const handleQuietMove = async () => {
    const target = quietPrompt;
    const title = pendingTitleRef.current;
    setQuietPrompt(null);
    pendingTitleRef.current = undefined;
    if (target) await performSave(quietHoursEndAfter(target, quietHours), title);
  };

  const performSave = async (dateToUse: Date, titleOverride?: string) => {
    const title = titleOverride ?? (parsedTitle || input.trim());
    if (!title.trim()) return;
    setSaving(true);
    setInvitationError(null);
    try {
      const trimmedDescription = description.trim();
      const datetimeIso = dateToUse.toISOString();
      const added = await addReminder({
        title: title.trim(),
        description: trimmedDescription,
        datetime: datetimeIso,
        alarm,
        // Spread rather than `recipient` so an unset value omits the key
        // entirely - `'recipient' in obj` is true even when it holds undefined,
        // which is what isSendReminder would otherwise trip over.
        ...(recipient ? { recipient } : {}),
      });

      // Additive Tier 2 send - never blocks the Tier 1 save above, which has
      // already completed by this point. A failure here degrades silently to
      // the existing WhatsApp-link flow; only a low-key inline notice shows.
      if (recipient?.appUserId && !isReachabilityStale(recipient.lookedUpAt)) {
        const result = await sendInvitation(
          recipient.appUserId,
          title.trim(),
          trimmedDescription,
          datetimeIso
        );
        if (!result.ok) {
          setInvitationError("Couldn't send in-app — you can still message via WhatsApp.");
        } else {
          // Lets a later invitation_time_changed push find this exact local
          // reminder (see Reminder.invitationId's header) - only reachable
          // here, since this is the one moment both ids are known at once.
          await attachInvitationId(added.id, result.invitationId);
        }
      }

      setInput("");
      setParsedTitle("");
      setParsedDate(null);
      setAmbiguity(null);
      // Back to the user's Settings default, not a hardcoded true — resetting
      // to true left a lit bell after every save even with sound turned off.
      alarmTouchedRef.current = false;
      setAlarm(defaultAlarmEnabled);
      setDescription("");
      setNotesVisible(false);
      setRecipient(undefined);
      setDismissedVagueText(null);
      onSaved?.();
    } catch {
      // silent — the list will just not update
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const title = parsedTitle || input.trim();
    if (!title.trim()) return;

    // A numeral that could be the hour or could be part of the reminder is a
    // coin flip the app must not call on the user's behalf: guessing "time"
    // silently deletes the number from what they typed. Ask once, then save.
    if (ambiguity) {
      setAmbiguityPrompt(ambiguity);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }

    if (parsedDate) {
      await doSave(parsedDate);
    } else {
      const suggested = roundToNextHour(new Date());
      setSuggestedTime(suggested);
      setShowNoTimeSheet(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleConfirmNoTime = async () => {
    setPickerMode(null);
    setShowNoTimeSheet(false);
    await doSave(suggestedTime);
  };

  const handleAmbiguityChoice = async (reading: ParsedAmbiguity["asTime"]) => {
    setAmbiguityPrompt(null);
    setAmbiguity(null);
    if (reading.date) {
      await doSave(reading.date, reading.title);
    } else {
      setSuggestedTime(roundToNextHour(new Date()));
      setShowNoTimeSheet(true);
    }
  };

  const handleCancelNoTime = () => {
    setPickerMode(null);
    setShowNoTimeSheet(false);
  };

  const handlePickerChange = (event: DateTimePickerEvent, date: Date | undefined) => {
    if (Platform.OS === "android") {
      if (event.type === "dismissed" || !date) {
        setPickerMode(null);
        return;
      }
      if (pickerMode === "date") {
        const updated = new Date(suggestedTime);
        updated.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        setSuggestedTime(updated);
        setPickerMode("time");
      } else if (pickerMode === "time") {
        const updated = new Date(suggestedTime);
        updated.setHours(date.getHours(), date.getMinutes(), 0, 0);
        setSuggestedTime(updated);
        setPickerMode(null);
      }
    } else {
      if (date) setSuggestedTime(date);
    }
  };

  // Clears everything the user typed in this box, plus the time that was read
  // out of it. The recipient chip is deliberately left alone: it has its own
  // remove button, and it is not text the user typed here.
  const handleClearInput = () => {
    setInput("");
    setParsedTitle("");
    setParsedDate(null);
    setAmbiguity(null);
    setAmbiguityPrompt(null);
    setDescription("");
    setDismissedVagueText(null);
    setInvitationError(null);
    setShowNoTimeSheet(false);
    setPickerMode(null);
    setSuggestedTime(roundToNextHour(new Date()));
  };

  const handleChangePress = () => {
    if (Platform.OS === "android") {
      setPickerMode("date");
    } else {
      setPickerMode((m) => (m !== null ? null : "date"));
    }
  };

  const startMicPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(micPulse, { toValue: 1.15, duration: 400, useNativeDriver: true }),
        Animated.timing(micPulse, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    ).start();
  };

  const stopMicPulse = () => {
    micPulse.stopAnimation();
    micPulse.setValue(1);
  };

  const clearDictationTimer = () => {
    dictationTimerRef.current?.clear();
    dictationTimerRef.current = null;
  };

  /** Put the UI back to "not listening". Safe to call more than once. */
  const settleAfterListening = () => {
    clearDictationTimer();
    micSourceRef.current = null;
    setListening(false);
    setLiveListening(false);
    setHeardSpeech(false);
    heardSpeechRef.current = false;
    setMicLevel(0);
    setMicInterim("");
    setMicStartedAt(null);
    setMicLastHeardAt(null);
    setMicLanguageLine(false);
    stopMicPulse();
  };

  /**
   * End the session and KEEP what was heard.
   *
   * `reason` only decides the notice. "silence" is the ordinary end of a
   * dictation, so it says nothing at all; the other two name something the
   * user did not choose, so they say what happened.
   */
  const stopSpeakMode = (reason: "user" | "silence" | "interrupted" = "user") => {
    if (micSourceRef.current === "shared") {
      // A shared audio file is transcribing right now — stopping here would
      // kill its native listeners and permanently wedge the concurrency
      // guard (see Finding 2b). Surface a notice instead of stopping it.
      setMicNotice("Still transcribing the shared audio…");
      return;
    }
    stopListening();
    settleAfterListening();
    if (reason === "interrupted") {
      setMicNotice("Voice input stopped when you left the app. Your words were kept.");
    } else if (reason === "user") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  /** End the session and THROW AWAY what was heard. */
  const cancelSpeakMode = () => {
    if (micSourceRef.current === "shared") {
      setMicNotice("Still transcribing the shared audio…");
      return;
    }
    abortListening();
    setInput(dictationBaselineRef.current);
    settleAfterListening();
    setMicNotice(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const startSpeakMode = async () => {
    setMicNotice(null);
    const { granted, canAskAgain } = await getMicPermissionStatus();
    if (!granted) {
      if (!canAskAgain) {
        setMicNotice("Microphone access is off. Turn it on in Settings to dictate.");
        Linking.openSettings();
        return;
      }
      const nowGranted = await requestMicPermission();
      if (!nowGranted) return;
    }

    const locale = dictationLanguage;
    const modelStatus = await ensureOfflineModelReady(locale);
    if (modelStatus === "preparing") {
      setMicNotice("Preparing voice recognition — try again in a moment");
      return;
    }

    const baseline = input;
    dictationBaselineRef.current = baseline;

    // Built per session, so each one closes over the baseline it started from.
    const timer = createDictationTimer({
      onSilence: () => {
        stopSpeakMode("silence");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onNoSpeech: () => {
        // Nothing was heard, so there is nothing to keep. Cancel rather than
        // stop, and say why - a mic that closes in silence with no message
        // reads as a broken button.
        abortListening();
        setInput(baseline);
        settleAfterListening();
        setMicNotice("Didn't hear anything — try again or type it in.");
      },
    });
    dictationTimerRef.current = timer;

    /** A word reached the recognizer: reset the pause clock and the bar. */
    const heard = () => {
      if (!heardSpeechRef.current) {
        heardSpeechRef.current = true;
        setHeardSpeech(true);
      }
      setMicLastHeardAt(Date.now());
      timer.heard();
    };

    const { busy } = startListening(
      baseline,
      locale,
      (fullText) => {
        setInput(fullText);
        heard();
      },
      () => {
        settleAfterListening();
      },
      () => {
        settleAfterListening();
        setMicNotice("Couldn't hear that — try again or type it in.");
      },
      modelStatus !== "unavailable",
      {
        // An interim segment is speech too, so it resets the pause clock.
        // Without this the session would close 2.5s into a long word the
        // recognizer has not finished committing.
        onInterim: (segment) => {
          setMicInterim(segment);
          if (segment !== "") heard();
        },
        onVolume: setMicLevel,
      }
    );
    if (busy) {
      setMicNotice("Still transcribing the shared audio…");
      return;
    }
    micSourceRef.current = "live";
    heardSpeechRef.current = false;
    setHeardSpeech(false);
    setMicLevel(0);
    setMicInterim("");
    setMicLastHeardAt(null);
    setMicStartedAt(Date.now());
    void shouldShowMicLanguageLine().then((show) => {
      if (!show) return;
      setMicLanguageLine(true);
      return markMicLanguageLineSeen();
    });
    setListening(true);
    setLiveListening(true);
    startMicPulse();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    timer.begin();
  };

  // Leaving the app stops dictation. Android hands the microphone to whatever
  // comes to the front anyway, so a session left running here would keep the
  // pulse and the surface on screen over a recognizer that is already dead.
  useEffect(() => {
    if (!liveListening) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") stopSpeakMode("interrupted");
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveListening]);

  // A screen change while the mic is open must not leave the native session
  // running with nothing left to receive its results.
  useEffect(() => {
    return () => {
      clearDictationTimer();
      abortListening();
    };
  }, []);

  const handleMicPress = () => {
    if (!listening) {
      startSpeakMode();
    } else if (micSourceRef.current === "shared") {
      // A shared audio file is already transcribing — surface a busy
      // notice rather than silently no-op'ing.
      setMicNotice("Still transcribing the shared audio…");
    } else {
      stopSpeakMode("user");
    }
  };

  // Derived from the PARSED title where one exists, so the hint tracks what
  // will actually be saved rather than the raw text including the date phrase.
  const vagueCandidate = (parsedTitle || input).trim();
  const showVagueHint =
    !!detectVagueOpener(vagueCandidate) && vagueCandidate !== dismissedVagueText;

  // The parser has already read the title, so naming the person in it costs
  // nothing more. Suppressed once a recipient is attached: the offer has been
  // taken, and the chip would then be asking a question already answered.
  const personInTitle = recipient ? null : detectPersonInTitle(parsedTitle || input);
  const showPersonChip = personInTitle !== null && personInTitle !== dismissedPerson;

  // Only on a genuinely cold open: no reminder saved yet AND nothing typed.
  // The block is help, and help that stays on screen over a user who is
  // already typing is clutter.
  const showStarters = reminders.length === 0 && input.trim() === "" && !listening;

  const canSave = !saving && !!(parsedTitle || input.trim());

  const webInputStyle = {
    width: "100%",
    padding: "8px 12px",
    fontSize: "15px",
    fontFamily: "Inter, sans-serif",
    color: colors.foreground,
    backgroundColor: colors.background,
    border: `1px solid ${colors.border}`,
    borderRadius: "8px",
    outline: "none",
    cursor: "pointer",
    boxSizing: "border-box" as const,
    marginBottom: "8px",
  };

  const styles = StyleSheet.create({
    wrapper: {
      marginHorizontal: 20,
      marginBottom: 12,
    },
    bar: {
      // Column, not row: sharing a row with five buttons left the input about
      // half the card width, so ordinary text wrapped after two or three
      // words. The buttons now sit on their own line beneath it.
      flexDirection: "column",
      alignItems: "stretch",
      backgroundColor: colors.card,
      borderRadius: colors.radiusCapsule,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === "web" ? 12 : 10,
      gap: 8,
      ...(Platform.OS === "web"
        ? { boxShadow: "0 2px 12px rgba(232,92,60,0.08)" }
        : {
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 3,
          }),
    },
    // Groups the mic/notes/alarm/save buttons so they align to each other
    // instead of to the (possibly multi-line) input beside them. The 32px
    // minHeight matches the button size, keeping the cluster centered against
    // a single line of text as well as a tall one.
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 32,
      marginTop: 10,
    },
    // Pushes the save button to the trailing edge, away from the toggles, so
    // the committing action is not adjacent to the ones that only alter state.
    actionSpacer: {
      flex: 1,
    },
    recipientChip: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 4,
      marginTop: 10,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: colors.primary + "1A",
      maxWidth: "100%",
    },
    recipientChipText: {
      fontSize: 12,
      color: colors.primary,
      flexShrink: 1,
    },
    recipientChipBadge: {
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary + "33",
    },
    invitationErrorText: {
      fontSize: 11,
      color: colors.mutedForeground,
      marginTop: 4,
      marginLeft: 4,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    clearButton: {
      paddingTop: 1,
    },
    textInput: {
      flex: 1,
      fontSize: 15,
      lineHeight: 20,
      color: colors.foreground,
      paddingVertical: 0,
      // Grows with the text instead of scrolling long input out of sight
      // horizontally, then caps and scrolls internally so the capsule can
      // never push the rest of the screen off. ~5 lines at lineHeight 20.
      maxHeight: 100,
      ...(Platform.OS === "web" ? { outlineStyle: "none" } as any : {}),
    },
    notesInput: {
      marginTop: 8,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.foreground,
      minHeight: 60,
      textAlignVertical: "top",
      ...(Platform.OS === "web" ? { outlineStyle: "none" } as any : {}),
    },
    alarmBtn: {
      padding: 4,
    },
    saveBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: canSave ? colors.primary : colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    micBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    micBtnListening: {
      backgroundColor: colors.destructive,
    },
    pillRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 8,
      paddingHorizontal: 4,
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.primary + "18",
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    pillText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    pillDivider: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    micNoticeText: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 6,
      paddingHorizontal: 4,
    },
    debugModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    debugModalSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: "80%",
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: Platform.OS === "ios" ? 40 : 24,
    },
    debugModalTitle: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 12,
    },
    debugModalText: {
      fontSize: 12,
      lineHeight: 18,
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
      color: colors.foreground,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: Platform.OS === "ios" ? 40 : 28,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    sheetTitle: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 4,
    },
    sheetSubtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 16,
    },
    sheetTimeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.background,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 20,
    },
    sheetTimeText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    sheetTimeEdit: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    // One tappable row per reading: the resulting time on the left, the title
    // it would save on the right, so the choice is shown rather than described.
    choiceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      marginTop: 10,
    },
    choiceLabel: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
      color: colors.primary,
    },
    choiceDetail: {
      flex: 1,
      fontSize: 14,
      color: colors.mutedForeground,
      textAlign: "right",
    },
    sheetBtnRow: {
      flexDirection: "row",
      gap: 12,
    },
    sheetCancelBtn: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: colors.muted,
      alignItems: "center",
    },
    sheetCancelText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    sheetConfirmBtn: {
      flex: 2,
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: "center",
    },
    sheetConfirmText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    vagueHint: {
      marginTop: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.muted,
      gap: 6,
    },
    vagueHintText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 17,
    },
    vagueHintDismiss: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      alignSelf: "flex-start",
    },
    personChipRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 8,
    },
    personChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.secondary,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    personChipText: {
      fontSize: 12.5,
      color: colors.secondaryForeground,
    },
    remindSomeoneBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      marginTop: 10,
      paddingVertical: 11,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    remindSomeoneText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    webPickerWrap: {
      marginBottom: 16,
    },
  });

  return (
    <View style={styles.wrapper}>
      <View style={styles.bar}>
        <View style={styles.inputRow}>
        <TextInput
          ref={quickAddInputTourRef}
          style={[styles.textInput, { fontFamily: getFontFamily(input, "400Regular") }]}
          placeholder="Add a reminder…"
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={setInput}
          returnKeyType="done"
          onSubmitEditing={handleSave}
          // multiline wraps long reminders into view instead of scrolling them
          // off the right edge. blurOnSubmit must be true here: on a multiline
          // input the return key inserts a newline by default and never fires
          // onSubmitEditing, so Done would stop saving without it.
          multiline
          blurOnSubmit
          maxLength={300}
          editable={!saving}
          testID="quick-add-input"
        />
        {input.length > 0 || description.length > 0 ? (
          <Pressable
            onPress={handleClearInput}
            hitSlop={10}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Clear input"
            testID="quick-add-clear"
            style={styles.clearButton}
          >
            <Feather name="x-circle" size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
        </View>
        {recipient && (
          <>
            <View style={styles.recipientChip} testID="quick-add-recipient-chip">
              <Feather name="send" size={11} color={colors.primary} />
              <Text
                style={[
                  styles.recipientChipText,
                  { fontFamily: getFontFamily(recipient.name, "600SemiBold") },
                ]}
                numberOfLines={1}
              >
                {recipient.name}
              </Text>
              {recipient.appUserId ? (
                <View style={styles.recipientChipBadge} testID="recipient-in-app-badge">
                  <Feather name="zap" size={9} color={colors.primary} />
                </View>
              ) : null}
              <Pressable
                onPress={() => setRecipient(undefined)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${recipient.name}`}
                testID="quick-add-recipient-clear"
              >
                <Feather name="x" size={12} color={colors.primary} />
              </Pressable>
            </View>
            {invitationError ? (
              <Text style={styles.invitationErrorText} testID="invitation-error">
                {invitationError}
              </Text>
            ) : null}
          </>
        )}

        {/* Dictation is the one input mode with no visible cursor, so the
            state has to be said out loud: that the mic is open, whether
            anything has been heard yet, and the two ways out of it. Without
            this, "stop" and "throw it away" were the same tap on the mic. */}
        {liveListening && (
          <ListeningSurface
            heardSpeech={heardSpeech}
            level={micLevel}
            interim={micInterim}
            startedAt={micStartedAt ?? undefined}
            lastHeardAt={micLastHeardAt}
            showLanguageLine={micLanguageLine}
            onDone={() => stopSpeakMode("user")}
            onCancel={cancelSpeakMode}
          />
        )}

        <View style={styles.actionRow}>
        <Pressable
          ref={micTourRef}
          style={[styles.micBtn, listening && styles.micBtnListening]}
          onPress={handleMicPress}
          hitSlop={8}
          testID="quick-add-mic"
        >
          <Animated.View style={{ transform: [{ scale: listening ? micPulse : 1 }] }}>
            <Feather
              name="mic"
              size={16}
              color={listening ? colors.primaryForeground : colors.mutedForeground}
            />
          </Animated.View>
        </Pressable>
        {/* Lets a reminder be aimed at someone without a trip through the
            editor, which was the only place a recipient could be attached. */}
        <Pressable
          style={styles.alarmBtn}
          onPress={() => setContactPickerVisible(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={
            recipient ? `Remind ${recipient.name}` : "Remind someone"
          }
          testID="quick-add-recipient"
        >
          <Feather
            name={recipient ? "user-check" : "user-plus"}
            size={16}
            color={recipient ? colors.primary : colors.mutedForeground}
          />
        </Pressable>
        <Pressable
          style={styles.alarmBtn}
          onPress={() => setNotesVisible((v) => !v)}
          hitSlop={8}
          testID="quick-add-notes-toggle"
        >
          <Feather
            name="file-text"
            size={16}
            color={notesVisible || description ? colors.primary : colors.mutedForeground}
          />
        </Pressable>
        <Pressable
          style={styles.alarmBtn}
          onPress={() => {
            alarmTouchedRef.current = true;
            setAlarm((a) => !a);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ selected: alarm }}
          testID="quick-add-alarm-toggle"
        >
          <Feather
            name={alarm ? "bell" : "bell-off"}
            size={16}
            color={alarm ? colors.primary : colors.mutedForeground}
          />
        </Pressable>
        <View style={styles.actionSpacer} />
        <Pressable
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={!canSave}
          hitSlop={4}
          testID="quick-add-save"
        >
          <Feather name="check" size={16} color={canSave ? colors.primaryForeground : colors.mutedForeground} />
        </Pressable>
        </View>
      </View>

      {showStarters && <StarterExamples onPick={setInput} />}

      {/* A permanent way to aim a reminder at somebody else. It is on screen
          from install day and is never dismissed, which is what replaced the
          first-run "Add your number" modal: that was seen once, this is seen
          every session. The action-row icon stays as the shortcut for a user
          who already knows where it is. */}
      <Pressable
        ref={remindSomeoneTourRef}
        style={styles.remindSomeoneBtn}
        onPress={() => setContactPickerVisible(true)}
        accessibilityRole="button"
        testID="quick-add-remind-someone"
      >
        <Feather name="user-plus" size={14} color={colors.mutedForeground} />
        <Text style={styles.remindSomeoneText}>Remind someone else</Text>
      </Pressable>

      {offerRegistration !== null && (
        <RegisterNumberNudge
          recipientName={offerRegistration}
          onDismiss={() => setOfferRegistration(null)}
        />
      )}

      {/* Shown only when the reminder being composed will actually be silent
          AND that came from the Settings default rather than a deliberate tap.
          Keyed off `alarm` (state) rather than alarmTouchedRef, since a ref
          does not re-render — the hint has to clear the moment the bell is
          tapped. Silence only: punctuality is carried independently by
          exactTiming, so a silent reminder is no longer a late one. */}
      {!defaultAlarmEnabled && !alarm && (
        <View style={styles.vagueHint} testID="quick-add-silent-hint">
          <Text style={styles.vagueHintText}>
            Silent — arrives on time, without a sound. Tap the bell to make it
            ring.
          </Text>
        </View>
      )}

      {showVagueHint && (
        <View style={styles.vagueHint} testID="vague-task-hint">
          <Text style={styles.vagueHintText}>
            What&apos;s the first step? A reminder is easier to start when it
            names one action — e.g. &quot;Call HDFC about the renewal&quot;.
          </Text>
          <Pressable
            onPress={() => setDismissedVagueText(vagueCandidate)}
            hitSlop={8}
            testID="vague-task-hint-dismiss"
          >
            <Text style={styles.vagueHintDismiss}>Use as is</Text>
          </Pressable>
        </View>
      )}

      {micNotice && (
        micNoticeDebugInfo ? (
          <Pressable onPress={() => setShowDebugInfo(true)}>
            <Text style={styles.micNoticeText}>{micNotice} (tap for details)</Text>
          </Pressable>
        ) : (
          <Text style={styles.micNoticeText}>{micNotice}</Text>
        )
      )}

      {quietPrompt && (
        <QuietHoursSheet
          visible
          datetime={quietPrompt}
          quietEnd={quietHoursEndAfter(quietPrompt, quietHours)}
          onKeep={handleQuietKeep}
          onMove={handleQuietMove}
          onCancel={() => setQuietPrompt(null)}
        />
      )}

      <ContactPickerModal
        visible={contactPickerVisible}
        onClose={() => setContactPickerVisible(false)}
        onSelect={(c: PickableContact) => {
          // Name is a SNAPSHOT - never re-resolved from contacts, so a deleted
          // contact or a revoked permission cannot break an existing reminder.
          const picked: ReminderRecipient = { name: c.name, phone: c.phone, contactId: c.contactId };
          setRecipient(picked);
          setContactPickerVisible(false);
          setInvitationError(null);
          // Raised here rather than at Save, matching add-reminder.tsx: the
          // study's trigger is the tap that names a person, and the two
          // screens disagreeing meant the same act offered at two different
          // moments. Registering is also what creates the Supabase session,
          // without which checkReachability() below returns null for every
          // contact - so no recipient earns the in-app badge until this offer
          // is taken. Counted when SHOWN, not when it is taken.
          shouldOfferNumberRegistration().then(async (offer) => {
            if (!offer) return;
            markRegisterPromptShown();
            await incrementRegisterPromptCount();
            setOfferRegistration(picked.name);
          });
          // Additive Tier 2 check - never blocks or delays showing the picked
          // contact; the existing Tier 1 WhatsApp-link flow keeps working
          // unmodified whether this resolves, fails, or is still in flight.
          const deviceRegion = getLocales()[0]?.regionCode ?? null;
          checkReachability(picked, deviceRegion).then((result) => {
            if (!result) return;
            setRecipient((current) =>
              current && current.phone === picked.phone
                ? { ...current, appUserId: result.appUserId, lookedUpAt: result.lookedUpAt }
                : current
            );
          }).catch(() => {
            // Reachability is additive. A failed lookup leaves the recipient
            // without the in-app badge and the WhatsApp route still works.
          });
        }}
      />

      <Modal
        visible={showDebugInfo}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDebugInfo(false)}
      >
        <Pressable style={styles.debugModalOverlay} onPress={() => setShowDebugInfo(false)}>
          <Pressable onPress={() => {}} style={styles.debugModalSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.debugModalTitle}>Shared audio details</Text>
            <ScrollView>
              <Text style={styles.debugModalText} selectable>
                {micNoticeDebugInfo}
              </Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {notesVisible && (
        <TextInput
          style={[styles.notesInput, { fontFamily: getFontFamily(description, "400Regular") }]}
          placeholder="Add a note…"
          placeholderTextColor={colors.mutedForeground}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={1000}
          editable={!saving}
          testID="quick-add-notes-input"
        />
      )}

      <Animated.View
        style={[
          styles.pillRow,
          {
            opacity: pillAnim,
            transform: [{ translateY: pillTranslate }],
            pointerEvents: "none",
          },
        ]}
      >
        {parsedDate && (
          <>
            <View style={styles.pill}>
              <Feather name="calendar" size={11} color={colors.primary} />
              <Text style={styles.pillText}>{formatDatePill(parsedDate)}</Text>
            </View>
            <Text style={styles.pillDivider}>·</Text>
            <View style={styles.pill}>
              <Feather name="clock" size={11} color={colors.primary} />
              <Text style={styles.pillText}>{formatTimePill(parsedDate)}</Text>
            </View>
          </>
        )}
      </Animated.View>

      {/* Discovery at the moment of intent. A user who has just typed "Call
          Amma" is the one user on the home screen who can be shown what
          sending a reminder to another person is FOR, and the sentence needs
          no explaining because they wrote the name themselves. */}
      {showPersonChip && (
        <View style={styles.personChipRow}>
          <Pressable
            style={styles.personChip}
            onPress={() => setContactPickerVisible(true)}
            accessibilityRole="button"
            testID="send-to-person-chip"
          >
            <Feather name="send" size={11} color={colors.primary} />
            <Text
              style={[
                styles.personChipText,
                { fontFamily: getFontFamily(personInTitle, "600SemiBold") },
              ]}
            >
              Send to {personInTitle} instead?
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setDismissedPerson(personInTitle)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            testID="send-to-person-chip-dismiss"
          >
            <Feather name="x" size={13} color={colors.mutedForeground} />
          </Pressable>
        </View>
      )}

      <Modal
        visible={ambiguityPrompt !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setAmbiguityPrompt(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setAmbiguityPrompt(null)}>
          <Pressable onPress={() => {}} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              Is &quot;{ambiguityPrompt?.numberText}&quot; the time?
            </Text>
            <Text style={styles.sheetSubtitle}>
              It could be the hour, or part of what you are reminding yourself about.
            </Text>

            {ambiguityPrompt && (
              <>
                <Pressable
                  style={styles.choiceRow}
                  onPress={() => handleAmbiguityChoice(ambiguityPrompt.asTime)}
                  disabled={saving}
                >
                  <Text style={styles.choiceLabel}>
                    {ambiguityPrompt.asTime.date
                      ? formatTimePill(ambiguityPrompt.asTime.date)
                      : "Pick a time"}
                  </Text>
                  <Text
                    style={[
                      styles.choiceDetail,
                      { fontFamily: getFontFamily(ambiguityPrompt.asTime.title, "400Regular") },
                    ]}
                    numberOfLines={1}
                  >
                    {ambiguityPrompt.asTime.title}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.choiceRow}
                  onPress={() => handleAmbiguityChoice(ambiguityPrompt.asText)}
                  disabled={saving}
                >
                  <Text style={styles.choiceLabel}>
                    {ambiguityPrompt.asText.date
                      ? formatTimePill(ambiguityPrompt.asText.date)
                      : "Pick a time"}
                  </Text>
                  <Text
                    style={[
                      styles.choiceDetail,
                      { fontFamily: getFontFamily(ambiguityPrompt.asText.title, "400Regular") },
                    ]}
                    numberOfLines={1}
                  >
                    {ambiguityPrompt.asText.title}
                  </Text>
                </Pressable>
              </>
            )}

            <View style={styles.sheetBtnRow}>
              <Pressable
                style={styles.sheetCancelBtn}
                onPress={() => setAmbiguityPrompt(null)}
              >
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showNoTimeSheet}
        transparent
        animationType="slide"
        onRequestClose={handleCancelNoTime}
      >
        <Pressable style={styles.modalOverlay} onPress={handleCancelNoTime}>
          <Pressable onPress={() => {}} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>No time found</Text>
            <Text style={styles.sheetSubtitle}>
              Remind you at:
            </Text>

            <Pressable
              style={styles.sheetTimeRow}
              onPress={handleChangePress}
            >
              <Text style={styles.sheetTimeText}>
                {formatSuggestedTime(suggestedTime)}
              </Text>
              {Platform.OS !== "web" && (
                <Text style={styles.sheetTimeEdit}>
                  {pickerMode !== null ? "Done" : "Change"}
                </Text>
              )}
            </Pressable>

            {/* iOS: single inline datetime spinner */}
            {pickerMode !== null && Platform.OS === "ios" && DateTimePicker && (
              <DateTimePicker
                value={suggestedTime}
                mode="datetime"
                display="spinner"
                minimumDate={new Date()}
                onChange={handlePickerChange}
              />
            )}

            {/* Web: inline date + time inputs */}
            {Platform.OS === "web" && (
              <View style={styles.webPickerWrap}>
                {React.createElement("input", {
                  type: "date",
                  value: toDateInput(suggestedTime),
                  min: toDateInput(new Date()),
                  onChange: (e: any) => {
                    const val: string = e.target.value;
                    if (val) {
                      const [y, mo, d] = val.split("-").map(Number);
                      const updated = new Date(suggestedTime);
                      updated.setFullYear(y, mo - 1, d);
                      setSuggestedTime(updated);
                    }
                  },
                  style: webInputStyle,
                })}
                {React.createElement("input", {
                  type: "time",
                  value: toTimeInput(suggestedTime),
                  onChange: (e: any) => {
                    const val: string = e.target.value;
                    if (val) {
                      const [h, min] = val.split(":").map(Number);
                      const updated = new Date(suggestedTime);
                      updated.setHours(h, min, 0, 0);
                      setSuggestedTime(updated);
                    }
                  },
                  style: webInputStyle,
                })}
              </View>
            )}

            <View style={styles.sheetBtnRow}>
              <Pressable style={styles.sheetCancelBtn} onPress={handleCancelNoTime}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.sheetConfirmBtn}
                onPress={handleConfirmNoTime}
                disabled={saving}
              >
                <Text style={styles.sheetConfirmText}>Confirm</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Android: dialog pickers rendered outside Modal to avoid nesting issues */}
      {Platform.OS === "android" && pickerMode !== null && DateTimePicker && (
        <DateTimePicker
          value={suggestedTime}
          mode={pickerMode}
          display="default"
          minimumDate={pickerMode === "date" ? new Date() : undefined}
          onChange={handlePickerChange}
        />
      )}
    </View>
  );
}
