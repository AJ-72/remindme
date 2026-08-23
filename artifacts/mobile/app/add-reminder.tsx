import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
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
import { useColors } from "@/hooks/useColors";
import ContactPickerModal from "@/components/ContactPickerModal";
import { useDictation } from "@/hooks/useDictation";
import type { PickableContact } from "@/services/ContactsService";
import type { ReminderRecipient } from "@/services/ReminderService";
import { parseNaturalLanguage } from "@/utils/parseNaturalLanguage";
import { getFontFamily } from "@/utils/getFontFamily";

type DateTimePickerEvent = { type: string; nativeEvent: object };
const DateTimePicker: React.ComponentType<any> | null =
  Platform.OS !== "web"
    ? require("@react-native-community/datetimepicker").default
    : null;

function roundToNext5(d: Date): Date {
  const ms = 1000 * 60 * 5;
  return new Date(Math.ceil((d.getTime() + 60000) / ms) * ms);
}

function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeInput(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type PickerMode = "date" | "time" | null;

export default function AddReminderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { reminders, loading, addReminder, editReminder, defaultAlarmEnabled } =
    useReminders();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const existing = isEditing ? reminders.find((r) => r.id === id) : null;

  // Who this reminder is about, if anyone. Undefined means an ordinary
  // personal reminder - the key must never be written as undefined.
  const [recipient, setRecipient] = useState<ReminderRecipient | undefined>(
    undefined
  );
  const [pickerVisible, setPickerVisible] = useState(false);

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
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [alarm, setAlarm] = useState<boolean>(defaultAlarmEnabled);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);
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
  }, [isEditing, existing]);

  // Re-parse whenever input changes (not in edit mode — just use existing values)
  useEffect(() => {
    if (isEditing) return;
    const { title, date } = parseNaturalLanguage(input);
    setParsedTitle(title);
    if (date) {
      setParsedDate(date);
      setDateWasParsed(true);
    } else {
      setDateWasParsed(false);
    }
  }, [input, isEditing]);

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

  const handleSave = async () => {
    const title = isEditing ? editTitle : parsedTitle || input.trim();
    if (!title.trim()) {
      Alert.alert("Title required", 'Describe your reminder, e.g. "Call dentist tomorrow at 3pm".');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        datetime: parsedDate.toISOString(),
        alarm,
        // Spread rather than `recipient` so an unset value omits the key
        // entirely - `'recipient' in obj` is true even when it holds undefined.
        ...(recipient ? { recipient } : {}),
      };
      if (isEditing && id) {
        await editReminder(id, payload);
      } else {
        await addReminder(payload);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert("Error", "Could not save reminder. Please try again.");
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
  const formattedTime = parsedDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

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
                  maxLength={300}
                  returnKeyType="done"
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
              style={[styles.input, { fontFamily: getFontFamily(description, "400Regular") }]}
              placeholder="Add extra details…"
              placeholderTextColor={colors.mutedForeground}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={1000}
              returnKeyType="done"
              blurOnSubmit
              testID="description-input"
            />
          </View>

          {/* Sending - deliberately worded as "message someone", never
              "remind someone else": Tier 1 rings the SENDER's phone and the
              recipient is never contacted unless the sender acts. */}
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
                style={styles.previewRowLast}
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
            </View>
          </View>
          {/* Alarm toggle */}
          <View style={styles.alarmCard}>
            <Feather
              name={alarm ? "bell" : "bell-off"}
              size={18}
              color={alarm ? colors.primary : colors.mutedForeground}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.alarmLabel}>Play alarm sound</Text>
              <Text style={styles.alarmSubLabel}>
                {alarm ? "Notification will play a sound" : "Notification will be silent"}
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
        </ScrollView>
      </KeyboardAvoidingView>

      <ContactPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(c: PickableContact) => {
          // Name is a SNAPSHOT - never re-resolved from contacts, so a deleted
          // contact or a revoked permission cannot break an existing reminder.
          setRecipient({ name: c.name, phone: c.phone, contactId: c.contactId });
          setPickerVisible(false);
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
    </View>
  );
}
