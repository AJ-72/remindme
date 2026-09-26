import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { getLocales } from "expo-localization";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReminders } from "@/contexts/RemindersContext";
import { EVENTS } from "@/constants/analytics";
import { track } from "@/services/AnalyticsService";
import { contentScript } from "@/utils/analyticsProps";
import { useAppDialog } from "@/hooks/useAppDialog";
import { useColors } from "@/hooks/useColors";
import { applySuggestedHour, suggestBetterHour } from "@/utils/adherenceCopy";
import { computeAdherenceStats } from "@/utils/adherenceStats";
import ContactPickerModal from "@/components/ContactPickerModal";
import ListeningSurface from "@/components/ListeningSurface";
import RegisterNumberNudge from "@/components/RegisterNumberNudge";
import RepeatRow from "@/components/RepeatRow";
import { useDictation } from "@/hooks/useDictation";
import type { PickableContact } from "@/services/ContactsService";
import {
  incrementRegisterPromptCount,
  markRegisterPromptShown,
  shouldOfferNumberRegistration,
  type ReminderRecipient,
} from "@/services/ReminderService";
import { checkReachability, isReachabilityStale } from "@/services/RecipientLookupService";
import { sendInvitation } from "@/services/InvitationService";
import { parseNaturalLanguage } from "@/utils/parseNaturalLanguage";
import type { RecurrenceRule } from "@/utils/recurrence";
import { getFontFamily } from "@/utils/getFontFamily";
import { formatTime12h } from "@/utils/formatDatetime";
import {
  DateTimePicker,
  toDateInput,
  toTimeInput,
  type DateTimePickerEvent,
} from "@/utils/dateTimePicker";

function roundToNext5(d: Date): Date {
  const ms = 1000 * 60 * 5;
  return new Date(Math.ceil((d.getTime() + 60000) / ms) * ms);
}

type PickerMode = "date" | "time" | null;

export default function AddReminderScreen() {
  const colors = useColors();
  const { notify, dialog } = useAppDialog();
  const insets = useSafeAreaInsets();
  const {
    reminders,
    loading,
    addReminder,
    attachInvitationId,
    editReminder,
    defaultAlarmEnabled,
    quietHours,
  } = useReminders();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const existing = isEditing ? reminders.find((r) => r.id === id) : null;

  // Who this reminder is about, if anyone. Undefined means an ordinary
  // personal reminder - the key must never be written as undefined.
  // The offer to register the user's OWN number. Fired on the pick rather
  // than on the save, because this screen navigates away the moment it saves -
  // a nudge rendered there would unmount before it could be read. Holds the
  // recipient's name, or null when no offer is on screen.
  const [offerRegistration, setOfferRegistration] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<ReminderRecipient | undefined>(
    undefined
  );
  const [pickerVisible, setPickerVisible] = useState(false);
  // Low-key, additive Tier 2 status - never blocks the existing WhatsApp/
  // local-reminder save (see handleSave). Intentionally minimal UI, expected
  // to iterate; see report.
  const [invitationError, setInvitationError] = useState<string | null>(null);

  // Natural language input (add mode only)
  const [input, setInput] = useState("");

  // Title/description directly edited (edit mode only)
  const [editTitle, setEditTitle] = useState("");
  const [description, setDescription] = useState("");

  // Parsed/overridden values
  const defaultDate = roundToNext5(new Date());
  const [parsedTitle, setParsedTitle] = useState("");
  const [parsedDate, setParsedDate] = useState<Date>(defaultDate);
  const [dateWasParsed, setDateWasParsed] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceRule | undefined>(undefined);
  const [recurrenceWasParsed, setRecurrenceWasParsed] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [alarm, setAlarm] = useState<boolean>(defaultAlarmEnabled);
  const [saving, setSaving] = useState(false);
  /**
   * Dismissal is per-visit, not persisted. A suggestion the user waved off
   * for THIS reminder must not come back while they are still editing it,
   * but a standing "never again" would silently kill the feature after one
   * impatient tap.
   */
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const inputRef = useRef<TextInput>(null);
  // Auto-grow height for the description box, driven by onContentSizeChange
  // rather than a fixed minHeight — a fixed height either wastes space for a
  // one-line description or clips a long one, unlike the quick-add bar's
  // input which grows with its content up to a cap.
  const [descriptionHeight, setDescriptionHeight] = useState(80);
  // The editor had no mic at all: dictation was reachable only from the
  // quick-add bar, so correcting a mis-heard reminder meant typing it out.
  const editDictation = useDictation(editTitle, setEditTitle);
  const newDictation = useDictation(input, setInput);
  const seededFromExisting = useRef(false);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  // Reminders load asynchronously, so `existing` isn't available on the
  // first render in edit mode — seed the editable fields once it arrives.
  useEffect(() => {
    if (!isEditing || !existing || seededFromExisting.current) return;
    seededFromExisting.current = true;
    setEditTitle(existing.title);
    setDescription(existing.description ?? "");
    setParsedTitle(existing.title);
    setParsedDate(new Date(existing.datetime));
    setAlarm(existing.alarm !== false);
    setRecipient(existing.recipient);
    setRecurrence(existing.recurrence);
  }, [isEditing, existing]);

  // Re-parse whenever input changes (add mode)
  useEffect(() => {
    if (isEditing) return;
    const { title, date, recurrence: parsedRecurrence } = parseNaturalLanguage(input, new Date(), { eodMinute: quietHours.startMinute });
    setParsedTitle(title);
    if (date) {
      setParsedDate(date);
      setDateWasParsed(true);
    } else {
      setDateWasParsed(false);
    }
    setRecurrence(parsedRecurrence);
    setRecurrenceWasParsed(parsedRecurrence !== undefined);
  }, [input, isEditing, quietHours.startMinute]);

  // Re-parse the title in edit mode too, so typing e.g. "...tomorrow at 5pm"
  // into an existing reminder's title updates the Date/Time preview instead
  // of silently leaving the old datetime in place. Skipped until the initial
  // seed from `existing` has landed (seededFromExisting), so the seed's own
  // setEditTitle doesn't immediately re-parse and fight with the stored
  // datetime. Only a title that actually contains a date phrase updates
  // parsedDate — a title edited back to something dateless keeps whatever
  // time was set last, since every edited reminder already has a real time
  // and blanking it would be destructive rather than helpful.
  useEffect(() => {
    if (!isEditing || !seededFromExisting.current) return;
    const { date, recurrence: parsedRecurrence } = parseNaturalLanguage(editTitle, new Date(), { eodMinute: quietHours.startMinute });
    if (date) {
      setParsedDate(date);
      setDateWasParsed(true);
    } else {
      setDateWasParsed(false);
    }
    // Same asymmetry as the date above, and for the same reason: an edited
    // reminder already has a real recurrence rule (or deliberately none), and
    // silently blanking it because the user's edit no longer contains the
    // recurrence phrase would be destructive, not helpful. Typing a phrase in
    // sets the rule; removing it does NOT clear one already set — clearing is
    // explicit, via the Repeats row's "Doesn't repeat".
    if (parsedRecurrence !== undefined) {
      setRecurrence(parsedRecurrence);
      setRecurrenceWasParsed(true);
    } else {
      setRecurrenceWasParsed(false);
    }
  }, [editTitle, isEditing, quietHours.startMinute]);

  const handlePickerChange = (event: DateTimePickerEvent, selected: Date | undefined) => {
    if (Platform.OS === "android") setPickerMode(null);
    if (event.type === "set" && selected) {
      if (pickerMode === "date") {
        const updated = new Date(parsedDate);
        updated.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
        setParsedDate(updated);
      } else if (pickerMode === "time") {
        const updated = new Date(parsedDate);
        updated.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        setParsedDate(updated);
      }
    }
  };

  // Walks the whole reminder list, so it is memoised against the list rather
  // than recomputed on every keystroke in the title field.
  const adherence = useMemo(() => computeAdherenceStats(reminders), [reminders]);

  /**
   * A better hour for this reminder, or null -- which is the common case by
   * design (see suggestBetterHour). Recomputed as the user moves the time, so
   * picking the strong hour by hand makes the banner go away on its own.
   */
  const timeSuggestion = useMemo(
    () =>
      // In edit mode parsedDate is a placeholder ("now") until the reminder
      // loads; judging that placeholder flashed a suggestion about an hour the
      // user never picked (and failed tests run near the weak hour).
      suggestionDismissed || (isEditing && !seededFromExisting.current)
        ? null
        : suggestBetterHour(adherence, parsedDate.getHours(), { isRecurring: !!recurrence }),
    [adherence, parsedDate, suggestionDismissed, recurrence]
  );

  const acceptTimeSuggestion = () => {
    if (!timeSuggestion) return;
    setParsedDate(applySuggestedHour(parsedDate, timeSuggestion.hour));
    // The date no longer came from the typed text, so the "auto" badge would
    // now be claiming something untrue.
    setDateWasParsed(false);
    setSuggestionDismissed(true);
  };

  const handleSave = async () => {
    const title = isEditing ? editTitle : parsedTitle || input.trim();
    if (!title.trim()) {
      void notify("Title required", 'Describe your reminder, e.g. "Call dentist tomorrow at 3pm".', "warning");
      return;
    }
    setSaving(true);
    setInvitationError(null);
    // Reported at SAVE, once, deliberately. The parse itself runs on every
    // keystroke (see the effects above), so tracking it where it happens
    // would send one event per character typed and drown every other series
    // in the project.
    track(EVENTS.NL_PARSE_RESULT, {
      date_parsed: dateWasParsed,
      script: contentScript(title),
      editing: isEditing,
      surface: "add_reminder",
    });
    try {
      const trimmedDescription = description.trim();
      const datetimeIso = parsedDate.toISOString();
      const payload = {
        title: title.trim(),
        description: trimmedDescription,
        datetime: datetimeIso,
        alarm,
        // Spread rather than `recipient` so an unset value omits the key
        // entirely - `'recipient' in obj` is true even when it holds undefined.
        ...(recipient ? { recipient } : {}),
        ...(recurrence ? { recurrence } : {}),
      };
      let localId = id;
      if (isEditing && id) {
        // moveAnchor: true — this IS the deliberate schedule restatement the
        // plan's anchor rule means (as opposed to reminder-detail.tsx's
        // "move to strongest hour" nudge or its exact-alarm toggle, neither
        // of which should move a recurring series' anchor).
        await editReminder(id, payload, { moveAnchor: true });
      } else {
        const added = await addReminder(payload);
        localId = added.id;
      }

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
        } else if (localId) {
          // Lets a later invitation_time_changed push find this exact local
          // reminder (see Reminder.invitationId's header) - same wiring as
          // QuickAddInput.tsx#performSave, duplicated here because this
          // screen has its own independent save path.
          await attachInvitationId(localId, result.invitationId);
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      void notify("Couldn't save reminder", "Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const formattedDate = parsedDate.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const formattedTime = formatTime12h(parsedDate);

  const canSave = !saving && !!(isEditing ? editTitle.trim() : parsedTitle || input.trim());

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    saveBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: canSave ? colors.primary : colors.muted,
    },
    saveBtnText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: canSave ? colors.primaryForeground : colors.mutedForeground,
    },
    scroll: { flex: 1 },
    scrollContent: {
      padding: 20,
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20,
      gap: 20,
    },
    inputCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    inputWithMicRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    inputFlex: {
      flex: 1,
    },
    micBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.muted,
    },
    micBtnStandalone: {
      alignSelf: "flex-start",
      marginTop: 8,
    },
    micBtnListening: {
      backgroundColor: colors.primary,
    },
    micNoticeText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 8,
    },
    inputHint: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 10,
    },
    input: {
      fontSize: 18,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      minHeight: 80,
      textAlignVertical: "top",
    },
    descriptionInput: {
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      textAlignVertical: "top",
      // Grows to fit content (see descriptionHeight/onContentSizeChange)
      // between a one-line minimum and a scrollable cap, matching the
      // quick-add bar's feel instead of a fixed empty box.
      minHeight: 24,
      maxHeight: 200,
    },
    examplesWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },
    exampleChip: {
      backgroundColor: colors.muted,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    exampleChipText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    recipientRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    recipientName: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    recipientHint: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 10,
      paddingHorizontal: 4,
    },
    suggestCard: {
      flexDirection: "row",
      gap: 12,
      backgroundColor: colors.warningSurface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginTop: 12,
    },
    suggestText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.warningSurfaceForeground,
      lineHeight: 19,
    },
    suggestActions: { flexDirection: "row", gap: 10, marginTop: 10 },
    suggestBtn: {
      paddingVertical: 7,
      paddingHorizontal: 14,
      borderRadius: colors.radiusCapsule,
      backgroundColor: colors.primary,
    },
    suggestBtnText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    suggestDismiss: { paddingVertical: 7, paddingHorizontal: 8 },
    suggestDismissText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.warningSurfaceForeground,
    },
    previewCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    previewRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    previewRowLast: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },
    previewLabel: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      width: 44,
    },
    previewValue: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    previewValueHighlight: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    parsedBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.primary + "20",
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    parsedBadgeText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    editBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    editBadgeText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    pickerWrap: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    alarmCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    alarmLabel: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    alarmSubLabel: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
  });

  const webInputStyle = {
    width: "100%",
    padding: "10px 12px",
    fontSize: "16px",
    fontFamily: "Inter, sans-serif",
    color: colors.foreground,
    backgroundColor: colors.background,
    border: `1px solid ${colors.border}`,
    borderRadius: "8px",
    outline: "none",
    cursor: "pointer",
    boxSizing: "border-box" as const,
  };

  const EXAMPLES = [
    "Team meeting tomorrow at 10am",
    "Pay bills on Friday",
    "Call mom in 2 hours",
    "Doctor appointment next Monday at 9:30am",
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.closeBtn} onPress={() => router.back()}>
          <Feather name="x" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {isEditing ? "Edit Reminder" : "New Reminder"}
        </Text>
        <Pressable
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={!canSave}
          testID="save-button"
        >
          <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.scroll}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {isEditing ? (
            <View style={styles.inputCard}>
              <Text style={styles.inputHint}>Title</Text>
              <View style={styles.inputWithMicRow}>
                <TextInput
                  ref={inputRef}
                  style={[
                    styles.input,
                    styles.inputFlex,
                    { fontFamily: getFontFamily(editTitle, "400Regular") },
                  ]}
                  placeholder="Reminder title"
                  placeholderTextColor={colors.mutedForeground}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  multiline
                  maxLength={300}
                  returnKeyType="done"
                  blurOnSubmit
                  testID="edit-title-input"
                />
                <Pressable
                  style={[styles.micBtn, editDictation.listening && styles.micBtnListening]}
                  onPress={editDictation.toggle}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={
                    editDictation.listening ? "Stop dictation" : "Dictate title"
                  }
                  testID="edit-title-mic"
                >
                  <Feather
                    name="mic"
                    size={16}
                    color={
                      editDictation.listening
                        ? colors.primaryForeground
                        : colors.mutedForeground
                    }
                  />
                </Pressable>
              </View>
              {editDictation.listening && (
                <ListeningSurface
                  heardSpeech={editDictation.heardSpeech}
                  level={editDictation.level}
                  interim={editDictation.interim}
                  startedAt={editDictation.startedAt ?? undefined}
                  lastHeardAt={editDictation.lastHeardAt}
                  showLanguageLine={editDictation.showLanguageLine}
                  onDone={editDictation.stop}
                  onCancel={editDictation.cancel}
                  testIDPrefix="edit-listening"
                />
              )}
              {!!editDictation.notice && (
                <Text style={styles.micNoticeText}>{editDictation.notice}</Text>
              )}
            </View>
          ) : (
            /* Natural language input */
            <View style={styles.inputCard}>
              <Text style={styles.inputHint}>Describe your reminder in plain English</Text>
              <TextInput
                ref={inputRef}
                style={[styles.input, { fontFamily: getFontFamily(input, "400Regular") }]}
                placeholder={`e.g. "Call dentist tomorrow at 3pm"`}
                placeholderTextColor={colors.mutedForeground}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={300}
                returnKeyType="done"
                blurOnSubmit
                testID="input-textbox"
              />
              <Pressable
                style={[
                  styles.micBtn,
                  styles.micBtnStandalone,
                  newDictation.listening && styles.micBtnListening,
                ]}
                onPress={newDictation.toggle}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  newDictation.listening ? "Stop dictation" : "Dictate reminder"
                }
                testID="new-title-mic"
              >
                <Feather
                  name="mic"
                  size={16}
                  color={
                    newDictation.listening
                      ? colors.primaryForeground
                      : colors.mutedForeground
                  }
                />
              </Pressable>
              {newDictation.listening && (
                <ListeningSurface
                  heardSpeech={newDictation.heardSpeech}
                  level={newDictation.level}
                  interim={newDictation.interim}
                  startedAt={newDictation.startedAt ?? undefined}
                  lastHeardAt={newDictation.lastHeardAt}
                  showLanguageLine={newDictation.showLanguageLine}
                  onDone={newDictation.stop}
                  onCancel={newDictation.cancel}
                  testIDPrefix="new-listening"
                />
              )}
              {!!newDictation.notice && (
                <Text style={styles.micNoticeText}>{newDictation.notice}</Text>
              )}
              {/* Example chips — only when input is empty */}
              {!input && (
                <View style={styles.examplesWrap}>
                  {EXAMPLES.map((ex) => (
                    <Pressable
                      key={ex}
                      style={styles.exampleChip}
                      onPress={() => setInput(ex)}
                    >
                      <Text style={styles.exampleChipText}>{ex}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Description */}
          <View style={styles.inputCard}>
            <Text style={styles.inputHint}>Description (optional)</Text>
            <TextInput
              style={[
                styles.descriptionInput,
                { fontFamily: getFontFamily(description, "400Regular") },
                { height: Math.min(Math.max(descriptionHeight, 24), 200) },
              ]}
              placeholder="Add extra details…"
              placeholderTextColor={colors.mutedForeground}
              value={description}
              onChangeText={setDescription}
              onContentSizeChange={(e) =>
                setDescriptionHeight(e.nativeEvent.contentSize.height)
              }
              multiline
              maxLength={1000}
              returnKeyType="done"
              blurOnSubmit
              testID="description-input"
            />
          </View>

          {/* Parsed preview */}
          <View>
            <Text style={styles.sectionLabel}>Parsed as</Text>
            <View style={styles.previewCard}>
              {/* Title row */}
              {!isEditing && (
                <View style={styles.previewRow}>
                  <Feather name="type" size={16} color={colors.mutedForeground} />
                  <Text style={styles.previewLabel}>Title</Text>
                  <Text style={styles.previewValue} numberOfLines={2}>
                    {parsedTitle || (input.trim() ? input.trim() : "—")}
                  </Text>
                </View>
              )}

              {/* Date row */}
              <Pressable
                style={styles.previewRow}
                onPress={() => setPickerMode((m) => (m === "date" ? null : "date"))}
              >
                <Feather name="calendar" size={16} color={colors.primary} />
                <Text style={styles.previewLabel}>Date</Text>
                <Text style={styles.previewValueHighlight}>{formattedDate}</Text>
                {dateWasParsed ? (
                  <View style={styles.parsedBadge}>
                    <Feather name="zap" size={10} color={colors.primary} />
                    <Text style={styles.parsedBadgeText}>auto</Text>
                  </View>
                ) : (
                  <View style={styles.editBadge}>
                    <Feather name="edit-2" size={12} color={colors.mutedForeground} />
                    <Text style={styles.editBadgeText}>tap to set</Text>
                  </View>
                )}
              </Pressable>

              {/* iOS date picker */}
              {pickerMode === "date" && Platform.OS === "ios" && DateTimePicker && (
                <View style={styles.pickerWrap}>
                  <DateTimePicker
                    value={parsedDate}
                    mode="date"
                    display="inline"
                    minimumDate={new Date()}
                    onChange={handlePickerChange}
                    themeVariant="light"
                    accentColor={colors.primary}
                  />
                </View>
              )}

              {/* Web date picker */}
              {pickerMode === "date" && Platform.OS === "web" && (
                <View style={styles.pickerWrap}>
                  {React.createElement("input", {
                    type: "date",
                    value: toDateInput(parsedDate),
                    min: toDateInput(new Date()),
                    onChange: (e: any) => {
                      const val: string = e.target.value;
                      if (val) {
                        const [y, mo, d] = val.split("-").map(Number);
                        const updated = new Date(parsedDate);
                        updated.setFullYear(y, mo - 1, d);
                        setParsedDate(updated);
                      }
                    },
                    style: webInputStyle,
                  })}
                </View>
              )}

              {/* Time row */}
              <Pressable
                style={styles.previewRow}
                onPress={() => setPickerMode((m) => (m === "time" ? null : "time"))}
              >
                <Feather name="clock" size={16} color={colors.primary} />
                <Text style={styles.previewLabel}>Time</Text>
                <Text style={styles.previewValueHighlight}>{formattedTime}</Text>
                {dateWasParsed ? (
                  <View style={styles.parsedBadge}>
                    <Feather name="zap" size={10} color={colors.primary} />
                    <Text style={styles.parsedBadgeText}>auto</Text>
                  </View>
                ) : (
                  <View style={styles.editBadge}>
                    <Feather name="edit-2" size={12} color={colors.mutedForeground} />
                    <Text style={styles.editBadgeText}>tap to set</Text>
                  </View>
                )}
              </Pressable>

              {/* iOS time picker */}
              {pickerMode === "time" && Platform.OS === "ios" && DateTimePicker && (
                <View style={styles.pickerWrap}>
                  <DateTimePicker
                    value={parsedDate}
                    mode="time"
                    display="spinner"
                    onChange={handlePickerChange}
                    themeVariant="light"
                    accentColor={colors.primary}
                  />
                </View>
              )}

              {/* Web time picker */}
              {pickerMode === "time" && Platform.OS === "web" && (
                <View style={styles.pickerWrap}>
                  {React.createElement("input", {
                    type: "time",
                    value: toTimeInput(parsedDate),
                    onChange: (e: any) => {
                      const val: string = e.target.value;
                      if (val) {
                        const [h, min] = val.split(":").map(Number);
                        const updated = new Date(parsedDate);
                        updated.setHours(h, min, 0, 0);
                        setParsedDate(updated);
                      }
                    },
                    style: webInputStyle,
                  })}
                </View>
              )}

              {/* Repeats row */}
              <RepeatRow
                value={recurrence}
                anchorDate={parsedDate}
                onChange={setRecurrence}
                wasParsed={recurrenceWasParsed}
                isLast
                previewRowStyle={styles.previewRow}
                previewRowLastStyle={styles.previewRowLast}
              />
            </View>
          </View>

          {/* Timing nudge. Sits under the time the user just chose, states the
              evidence for the swap, and never applies anything on its own --
              an app that quietly moves a reminder is one the user stops
              trusting with the times they care about. */}
          {timeSuggestion && (
            <View style={styles.suggestCard} testID="time-suggestion">
              <Feather name="clock" size={18} color={colors.warningSurfaceForeground} />
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestText} testID="time-suggestion-text">
                  {timeSuggestion.text}
                </Text>
                <View style={styles.suggestActions}>
                  <Pressable
                    style={styles.suggestBtn}
                    onPress={acceptTimeSuggestion}
                    testID="time-suggestion-accept"
                  >
                    <Text style={styles.suggestBtnText}>Move it</Text>
                  </Pressable>
                  <Pressable
                    style={styles.suggestDismiss}
                    onPress={() => setSuggestionDismissed(true)}
                    testID="time-suggestion-dismiss"
                  >
                    <Text style={styles.suggestDismissText}>Keep mine</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
          {/* Alarm toggle — label/sublabel text kept identical to the Settings
              screen's "Alarm sound" row (same setting, same wording, so it
              doesn't read as a different control here). */}
          <View style={styles.alarmCard}>
            <Feather
              name={alarm ? "bell" : "bell-off"}
              size={18}
              color={alarm ? colors.primary : colors.mutedForeground}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.alarmLabel}>Alarm sound</Text>
              <Text style={styles.alarmSubLabel}>
                {alarm ? "Rings out loud" : "Silent — arrives without a sound"}
              </Text>
            </View>
            <Switch
              value={alarm}
              onValueChange={(v) => {
                setAlarm(v);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              trackColor={{ false: colors.muted, true: colors.primary + "66" }}
              thumbColor={alarm ? colors.primary : colors.mutedForeground}
            />
          </View>

          {/* Sending - deliberately worded as "message someone", never
              "remind someone else": Tier 1 rings the SENDER's phone and the
              recipient is never contacted unless the sender acts. Placed last
              so the primary reminder fields (title/description/date/time/
              alarm) are settled before this less-common option. */}
          <View>
            <Text style={styles.sectionLabel}>Remind Someone</Text>
            <Pressable
              testID="recipient-row"
              style={styles.recipientRow}
              onPress={() => setPickerVisible(true)}
            >
              <Feather
                name={recipient ? "user-check" : "user-plus"}
                size={16}
                color={recipient ? colors.primary : colors.mutedForeground}
              />
              <View style={{ flex: 1 }}>
                {recipient ? (
                  <>
                    <Text
                      style={[
                        styles.recipientName,
                        { fontFamily: getFontFamily(recipient.name, "600SemiBold") },
                      ]}
                    >
                      {recipient.name}
                    </Text>
                    <Text style={styles.recipientHint}>{recipient.phone}</Text>
                    {recipient.appUserId ? (
                      <View style={[styles.parsedBadge, { alignSelf: "flex-start", marginTop: 6 }]}>
                        <Feather name="zap" size={10} color={colors.primary} />
                        <Text style={styles.parsedBadgeText} testID="recipient-in-app-badge">
                          Has the app — will also send in-app
                        </Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Text style={styles.recipientName}>
                      Remind me to message someone
                    </Text>
                    <Text style={styles.recipientHint}>
                      Your phone rings; you send the message
                    </Text>
                  </>
                )}
              </View>
              {recipient ? (
                <Pressable
                  testID="recipient-clear"
                  hitSlop={10}
                  onPress={() => setRecipient(undefined)}
                >
                  <Feather name="x" size={16} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
            </Pressable>
            {invitationError ? (
              <Text style={styles.micNoticeText} testID="invitation-error">
                {invitationError}
              </Text>
            ) : null}
            {offerRegistration !== null && (
              <RegisterNumberNudge
                recipientName={offerRegistration}
                onDismiss={() => setOfferRegistration(null)}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ContactPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(c: PickableContact) => {
          // Name is a SNAPSHOT - never re-resolved from contacts, so a deleted
          // contact or a revoked permission cannot break an existing reminder.
          const picked: ReminderRecipient = {
            name: c.name,
            phone: c.phone,
            contactId: c.contactId,
          };
          setRecipient(picked);
          setPickerVisible(false);
          setInvitationError(null);
          // Registering the user's own number is what creates the Supabase
          // session, and without a session checkReachability() below returns
          // null for every contact - so no recipient can ever earn the in-app
          // badge until this offer is taken. Counted when SHOWN, not when
          // refused.
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
          });
        }}
      />

      {/* Android date/time dialog */}
      {Platform.OS === "android" && pickerMode !== null && DateTimePicker && (
        <DateTimePicker
          value={parsedDate}
          mode={pickerMode}
          display="default"
          minimumDate={pickerMode === "date" ? new Date() : undefined}
          onChange={handlePickerChange}
        />
      )}
      {dialog}
    </View>
  );
}
