import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
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
import ContactPickerModal from "@/components/ContactPickerModal";
import { useReminders } from "@/contexts/RemindersContext";
import { useSharedText } from "@/contexts/SharedTextContext";
import { useColors } from "@/hooks/useColors";
import {
  ensureOfflineModelReady,
  getMicPermissionStatus,
  requestMicPermission,
  startListening,
  stopListening,
} from "@/services/SpeechService";
import type { PickableContact } from "@/services/ContactsService";
import type { ReminderRecipient } from "@/services/ReminderService";
import { parseNaturalLanguage } from "@/utils/parseNaturalLanguage";
import { getFontFamily } from "@/utils/getFontFamily";

type DateTimePickerEvent = { type: string; nativeEvent: object };
const DateTimePicker: React.ComponentType<any> | null =
  Platform.OS !== "web"
    ? require("@react-native-community/datetimepicker").default
    : null;

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

function roundToNext5(d: Date): Date {
  const ms = 1000 * 60 * 5;
  return new Date(Math.ceil((d.getTime() + 60000) / ms) * ms);
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
  const { addReminder, defaultAlarmEnabled, dictationLanguage } = useReminders();
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
  const [contactPickerVisible, setContactPickerVisible] = useState(false);
  const [description, setDescription] = useState("");
  const [listening, setListening] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [micNoticeDebugInfo, setMicNoticeDebugInfo] = useState<string | null>(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const micPulse = useRef(new Animated.Value(1)).current;
  const micSourceRef = useRef<"live" | "shared" | null>(null);

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
    const { title, date } = parseNaturalLanguage(input);
    setParsedTitle(title);
    setParsedDate(date);

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

  const doSave = async (dateToUse: Date) => {
    const title = parsedTitle || input.trim();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await addReminder({
        title: title.trim(),
        description: description.trim(),
        datetime: dateToUse.toISOString(),
        alarm,
        // Spread rather than `recipient` so an unset value omits the key
        // entirely - `'recipient' in obj` is true even when it holds undefined,
        // which is what isSendReminder would otherwise trip over.
        ...(recipient ? { recipient } : {}),
      });
      setInput("");
      setParsedTitle("");
      setParsedDate(null);
      // Back to the user's Settings default, not a hardcoded true — resetting
      // to true left a lit bell after every save even with sound turned off.
      alarmTouchedRef.current = false;
      setAlarm(defaultAlarmEnabled);
      setDescription("");
      setNotesVisible(false);
      setRecipient(undefined);
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

  const startSpeakMode = async () => {
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

    const locale = dictationLanguage;
    const modelStatus = await ensureOfflineModelReady(locale);
    if (modelStatus === "preparing") {
      setMicNotice("Preparing voice recognition — try again in a moment");
      return;
    }

    const { busy } = startListening(
      input,
      locale,
      (fullText) => setInput(fullText),
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
      modelStatus !== "unavailable"
    );
    if (busy) {
      setMicNotice("Still transcribing the shared audio…");
      return;
    }
    micSourceRef.current = "live";
    setListening(true);
    startMicPulse();
  };

  const stopSpeakMode = () => {
    if (micSourceRef.current === "shared") {
      // A shared audio file is transcribing right now — stopping here would
      // kill its native listeners and permanently wedge the concurrency
      // guard (see Finding 2b). Surface a notice instead of stopping it.
      setMicNotice("Still transcribing the shared audio…");
      return;
    }
    stopListening();
    micSourceRef.current = null;
    setListening(false);
    stopMicPulse();
  };

  const handleMicPress = () => {
    if (!listening) {
      startSpeakMode();
    } else if (micSourceRef.current === "shared") {
      // A shared audio file is already transcribing — surface a busy
      // notice rather than silently no-op'ing.
      setMicNotice("Still transcribing the shared audio…");
    } else {
      stopSpeakMode();
    }
  };

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
      flexDirection: "row",
      // flex-end so the button cluster stays on the last line as the input
      // grows. The buttons center themselves within that cluster (see
      // actionRow) rather than each aligning to the row's baseline.
      alignItems: "flex-end",
      backgroundColor: colors.card,
      borderRadius: colors.radiusCapsule,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === "web" ? 12 : 10,
      gap: 8,
      ...(Platform.OS === "web"
        ? { boxShadow: "0 2px 12px rgba(99,102,241,0.08)" }
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
    webPickerWrap: {
      marginBottom: 16,
    },
  });

  return (
    <View style={styles.wrapper}>
      <View style={styles.bar}>
        <TextInput
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
        <View style={styles.actionRow}>
        <Pressable
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

      {micNotice && (
        micNoticeDebugInfo ? (
          <Pressable onPress={() => setShowDebugInfo(true)}>
            <Text style={styles.micNoticeText}>{micNotice} (tap for details)</Text>
          </Pressable>
        ) : (
          <Text style={styles.micNoticeText}>{micNotice}</Text>
        )
      )}

      <ContactPickerModal
        visible={contactPickerVisible}
        onClose={() => setContactPickerVisible(false)}
        onSelect={(c: PickableContact) => {
          // Name is a SNAPSHOT - never re-resolved from contacts, so a deleted
          // contact or a revoked permission cannot break an existing reminder.
          setRecipient({ name: c.name, phone: c.phone, contactId: c.contactId });
          setContactPickerVisible(false);
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
