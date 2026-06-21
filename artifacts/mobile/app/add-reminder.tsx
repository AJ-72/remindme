import { Feather } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";

function roundToNext5(d: Date): Date {
  const ms = 1000 * 60 * 5;
  return new Date(Math.ceil((d.getTime() + 60000) / ms) * ms);
}

type PickerMode = "date" | "time" | null;

export default function AddReminderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { reminders, addReminder, editReminder } = useReminders();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const existing = isEditing ? reminders.find((r) => r.id === id) : null;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [date, setDate] = useState(
    existing ? new Date(existing.datetime) : roundToNext5(new Date())
  );
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<TextInput>(null);
  const minDate = useMemo(() => new Date(), []);

  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 300);
  }, []);

  const formattedDate = date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const formattedTime = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const handlePickerChange = (
    event: DateTimePickerEvent,
    selected: Date | undefined
  ) => {
    if (Platform.OS === "android") {
      setPickerMode(null);
    }
    if (event.type === "set" && selected) {
      if (pickerMode === "date") {
        const updated = new Date(date);
        updated.setFullYear(
          selected.getFullYear(),
          selected.getMonth(),
          selected.getDate()
        );
        setDate(updated);
      } else if (pickerMode === "time") {
        const updated = new Date(date);
        updated.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        setDate(updated);
      }
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Title required", "Please enter a title for your reminder.");
      return;
    }
    setSaving(true);
    try {
      if (isEditing && id) {
        await editReminder(id, {
          title: title.trim(),
          description: description.trim(),
          datetime: date.toISOString(),
        });
      } else {
        await addReminder({
          title: title.trim(),
          description: description.trim(),
          datetime: date.toISOString(),
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert("Error", "Could not save reminder. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
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
      backgroundColor: saving || !title.trim() ? colors.muted : colors.primary,
    },
    saveBtnText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color:
        saving || !title.trim()
          ? colors.mutedForeground
          : colors.primaryForeground,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20,
      gap: 16,
    },
    section: {
      backgroundColor: colors.card,
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    inputRow: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    inputRowLast: {
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    input: {
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      minHeight: 24,
    },
    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    dateRowLast: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    dateLabel: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    dateLabelText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    dateValue: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    iosPicker: {
      paddingHorizontal: 8,
      paddingBottom: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    hint: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 8,
    },
  });

  return (
    <View style={styles.container}>
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
          disabled={saving || !title.trim()}
        >
          <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.scroll}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View>
            <Text style={styles.sectionLabel}>Details</Text>
            <View style={styles.section}>
              <View style={styles.inputRow}>
                <TextInput
                  ref={titleRef}
                  style={styles.input}
                  placeholder="Title"
                  placeholderTextColor={colors.mutedForeground}
                  value={title}
                  onChangeText={setTitle}
                  returnKeyType="next"
                  maxLength={100}
                />
              </View>
              <View style={styles.inputRowLast}>
                <TextInput
                  style={[styles.input, { minHeight: 60 }]}
                  placeholder="Notes (optional)"
                  placeholderTextColor={colors.mutedForeground}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  returnKeyType="done"
                  maxLength={300}
                  textAlignVertical="top"
                />
              </View>
            </View>
          </View>

          <View>
            <Text style={styles.sectionLabel}>Schedule</Text>
            <View style={styles.section}>
              <Pressable
                style={styles.dateRow}
                onPress={() =>
                  setPickerMode((m) => (m === "date" ? null : "date"))
                }
              >
                <View style={styles.dateLabel}>
                  <Feather name="calendar" size={18} color={colors.primary} />
                  <Text style={styles.dateLabelText}>Date</Text>
                </View>
                <Text style={styles.dateValue}>{formattedDate}</Text>
              </Pressable>

              {pickerMode === "date" && Platform.OS === "ios" && (
                <View style={styles.iosPicker}>
                  <DateTimePicker
                    value={date}
                    mode="date"
                    display="inline"
                    minimumDate={minDate}
                    onChange={handlePickerChange}
                    themeVariant="light"
                    accentColor={colors.primary}
                  />
                </View>
              )}

              <Pressable
                style={styles.dateRowLast}
                onPress={() =>
                  setPickerMode((m) => (m === "time" ? null : "time"))
                }
              >
                <View style={styles.dateLabel}>
                  <Feather name="clock" size={18} color={colors.primary} />
                  <Text style={styles.dateLabelText}>Time</Text>
                </View>
                <Text style={styles.dateValue}>{formattedTime}</Text>
              </Pressable>

              {pickerMode === "time" && Platform.OS === "ios" && (
                <View style={styles.iosPicker}>
                  <DateTimePicker
                    value={date}
                    mode="time"
                    display="spinner"
                    onChange={handlePickerChange}
                    themeVariant="light"
                    accentColor={colors.primary}
                  />
                  <Text style={styles.hint}>
                    You'll get a notification at this time
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Android: render picker outside ScrollView so it appears as a system dialog */}
      {Platform.OS === "android" && pickerMode !== null && (
        <DateTimePicker
          value={date}
          mode={pickerMode}
          display="default"
          minimumDate={pickerMode === "date" ? minDate : undefined}
          onChange={handlePickerChange}
        />
      )}
    </View>
  );
}
