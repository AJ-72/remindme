import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ConfirmSheet from "@/components/ConfirmSheet";
import SnoozeSheet from "@/components/SnoozeSheet";
import { useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";
import { formatDatetime } from "@/utils/formatDatetime";
import { getFontFamily } from "@/utils/getFontFamily";
import type { SnoozePreset } from "@/utils/snoozePresets";

function goBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/(tabs)");
  }
}

export default function ReminderDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    reminders,
    loading,
    toggleComplete,
    snoozeReminder,
    deleteReminder,
    snoozePreset,
    setSnoozePreset,
  } = useReminders();
  const { id, openSnooze } = useLocalSearchParams<{
    id: string;
    openSnooze?: string;
  }>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Opens straight to the sheet when arriving from the notification's "More…"
  // action, which exists precisely because the tray can't show the presets.
  const [snoozeSheetVisible, setSnoozeSheetVisible] = useState(openSnooze === "1");

  const reminder = reminders.find((r) => r.id === id);

  const handleMarkDone = async () => {
    await toggleComplete(id);
    goBack();
  };

  const handleSnooze = () => {
    setSnoozeSheetVisible(true);
  };

  const handleSelectSnoozePreset = async (preset: SnoozePreset) => {
    setSnoozeSheetVisible(false);
    // The chosen preset becomes the new default, so the notification-tray
    // button converges on whatever the user actually uses.
    await setSnoozePreset(preset);
    await snoozeReminder(id, preset);
    goBack();
  };

  const handleEdit = () => {
    router.push({ pathname: "/add-reminder", params: { id } });
  };

  const handleDelete = () => {
    setConfirmingDelete(true);
  };

  const handleConfirmDelete = async () => {
    setConfirmingDelete(false);
    await deleteReminder(id);
    goBack();
  };

  const handleCancelDelete = () => {
    setConfirmingDelete(false);
  };

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
    content: {
      flex: 1,
      padding: 20,
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20,
    },
    loadingWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: 22,
      color: colors.foreground,
      marginBottom: 8,
    },
    description: {
      fontSize: 15,
      color: colors.mutedForeground,
      marginBottom: 12,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 24,
    },
    timeText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    actionsWrap: { gap: 12 },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 14,
      paddingVertical: 14,
    },
    primaryBtn: { backgroundColor: colors.primary },
    secondaryBtn: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    destructiveBtn: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: "#fca5a5",
    },
    primaryBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    secondaryBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    destructiveBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: "#ef4444",
    },
    handledWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    handledText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textAlign: "center",
      marginBottom: 16,
    },
    handledLinkText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.closeBtn} onPress={goBack} testID="close-button">
          <Feather name="x" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Reminder</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
            testID="loading-indicator"
          />
        </View>
      ) : !reminder || reminder.completed ? (
        <View style={styles.handledWrap}>
          <Text style={styles.handledText}>
            This reminder was already completed or removed.
          </Text>
          <Pressable onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.handledLinkText}>Back to list</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.content}>
          <Text style={[styles.title, { fontFamily: getFontFamily(reminder.title, "700Bold") }]}>
            {reminder.title}
          </Text>
          {!!reminder.description && (
            <Text
              style={[
                styles.description,
                { fontFamily: getFontFamily(reminder.description, "400Regular") },
              ]}
            >
              {reminder.description}
            </Text>
          )}
          <View style={styles.timeRow}>
            <Feather name="clock" size={14} color={colors.mutedForeground} />
            <Text style={styles.timeText}>{formatDatetime(reminder.datetime)}</Text>
          </View>

          <View style={styles.actionsWrap}>
            <Pressable
              style={[styles.actionBtn, styles.primaryBtn]}
              onPress={handleMarkDone}
              testID="mark-done-button"
            >
              <Feather name="check" size={16} color={colors.primaryForeground} />
              <Text style={styles.primaryBtnText}>Mark Done</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn]}
              onPress={handleSnooze}
              testID="snooze-button"
            >
              <Feather name="clock" size={16} color={colors.foreground} />
              <Text style={styles.secondaryBtnText}>Snooze</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn]}
              onPress={handleEdit}
              testID="edit-button"
            >
              <Feather name="edit-2" size={16} color={colors.foreground} />
              <Text style={styles.secondaryBtnText}>Edit</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.destructiveBtn]}
              onPress={handleDelete}
              testID="delete-button"
            >
              <Feather name="trash-2" size={16} color="#ef4444" />
              <Text style={styles.destructiveBtnText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      )}

      <ConfirmSheet
        visible={confirmingDelete}
        title="Delete Reminder"
        message="Are you sure you want to delete this reminder?"
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      <SnoozeSheet
        visible={snoozeSheetVisible}
        current={snoozePreset}
        onSelect={handleSelectSnoozePreset}
        onCancel={() => setSnoozeSheetVisible(false)}
      />
    </View>
  );
}
