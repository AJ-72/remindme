import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";
import {
  clearDebugLogs,
  formatDebugLogs,
  getDebugLogs,
} from "@/services/DebugLogService";
import {
  buildBackupJson,
  importRemindersFromJson,
} from "@/services/ReminderService";

// Backup/restore and debug logs, split out of the main Settings screen
// (2026-09-06): these are each touched at most once (a phone change, or
// diagnosing a problem) rather than settings someone returns to routinely,
// so they don't belong in the same undifferentiated list as Alarm sound or
// Appearance.
export default function BackupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { refreshFromStorage } = useReminders();

  const [logsVisible, setLogsVisible] = useState(false);
  const [logsText, setLogsText] = useState("");
  const [restoreVisible, setRestoreVisible] = useState(false);
  const [restoreText, setRestoreText] = useState("");
  const [restoreError, setRestoreError] = useState("");

  const openLogs = async () => {
    const entries = await getDebugLogs();
    setLogsText(
      entries.length ? formatDebugLogs(entries) : "No debug logs recorded yet."
    );
    setLogsVisible(true);
  };

  const shareLogs = async () => {
    try {
      await Share.share({ message: logsText });
    } catch {
      // user cancelled or sharing isn't available — nothing to do
    }
  };

  const shareBackup = async () => {
    try {
      await Share.share({ message: await buildBackupJson() });
    } catch {
      // user cancelled or sharing isn't available — nothing to do
    }
  };

  const openRestore = () => {
    setRestoreText("");
    setRestoreError("");
    setRestoreVisible(true);
  };

  const confirmRestore = async () => {
    const result = await importRemindersFromJson(restoreText);
    if (!result.ok) {
      setRestoreError(
        "That doesn't look like a Reminders backup. Paste the whole backup text, including the outer { }."
      );
      return;
    }

    setRestoreVisible(false);
    // The list is loaded once at provider mount, so it has to be told the
    // store changed underneath it.
    await refreshFromStorage();

    const parts = [
      `${result.added} added`,
      result.duplicates ? `${result.duplicates} already here` : "",
      result.skipped ? `${result.skipped} couldn't be read` : "",
    ].filter(Boolean);
    Alert.alert("Restored", `${parts.join(", ")}.`);
  };

  const handleClearLogs = () => {
    Alert.alert("Clear debug logs?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await clearDebugLogs();
          setLogsText("No debug logs recorded yet.");
        },
      },
    ]);
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    headerTitle: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    content: { paddingHorizontal: 20, paddingBottom: insets.bottom + 24 },
    sectionLabel: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      marginTop: 20,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radiusCard,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowLabel: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    rowSubLabel: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    chevron: { marginLeft: "auto" },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    modalSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: "85%",
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: Platform.OS === "ios" ? 40 : 24,
    },
    modalHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 12,
    },
    modalText: {
      fontSize: 11,
      lineHeight: 16,
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
      color: colors.foreground,
    },
    modalBtnRow: {
      flexDirection: "row",
      gap: 12,
      marginTop: 16,
    },
    modalBtn: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: 12,
      alignItems: "center",
    },
    modalBtnSecondary: { backgroundColor: colors.muted },
    modalBtnPrimary: { backgroundColor: colors.primary },
    modalBtnTextSecondary: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    modalBtnTextPrimary: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    restoreHelp: {
      fontSize: 13,
      lineHeight: 18,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 12,
    },
    restoreInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 120,
      maxHeight: 220,
      textAlignVertical: "top",
      fontSize: 12,
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
      color: colors.foreground,
    },
    restoreError: {
      fontSize: 13,
      lineHeight: 18,
      fontFamily: "Inter_400Regular",
      color: colors.destructive,
      marginTop: 10,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="backup-back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Backup &amp; troubleshooting</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Your reminders</Text>
        <View style={styles.card}>
          <Pressable style={styles.row} onPress={shareBackup} testID="backup-row">
            <Feather name="upload" size={18} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Back up reminders</Text>
              <Text style={styles.rowSubLabel}>
                Save a copy you can restore after changing phones
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={styles.chevron} />
          </Pressable>
          <Pressable
            style={[styles.row, styles.rowDivider]}
            onPress={openRestore}
            testID="restore-row"
          >
            <Feather name="download" size={18} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Restore from backup</Text>
              <Text style={styles.rowSubLabel}>
                Paste a backup — your current reminders are kept
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={styles.chevron} />
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>Problems</Text>
        <View style={styles.card}>
          <Pressable style={styles.row} onPress={openLogs} testID="debug-logs-row">
            <Feather name="file-text" size={18} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Debug logs</Text>
              <Text style={styles.rowSubLabel}>
                View or share logs to help diagnose a problem
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={styles.chevron} />
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={logsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLogsVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setLogsVisible(false)}>
          <Pressable onPress={() => {}} style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Debug logs</Text>
            <ScrollView>
              <Text style={styles.modalText} selectable testID="debug-logs-text">
                {logsText}
              </Text>
            </ScrollView>
            <View style={styles.modalBtnRow}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSecondary]}
                onPress={handleClearLogs}
              >
                <Text style={styles.modalBtnTextSecondary}>Clear</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={shareLogs}>
                <Text style={styles.modalBtnTextPrimary}>Share</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={restoreVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setRestoreVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setRestoreVisible(false)}>
          <Pressable onPress={() => {}} style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Restore from backup</Text>
            <Text style={styles.restoreHelp}>
              Paste the backup text you saved earlier. Reminders already on this phone
              are kept — anything already here won&apos;t be added twice.
            </Text>
            <TextInput
              style={styles.restoreInput}
              value={restoreText}
              onChangeText={(text) => {
                setRestoreText(text);
                if (restoreError) setRestoreError("");
              }}
              placeholder="Paste backup text here"
              placeholderTextColor={colors.mutedForeground}
              multiline
              autoCorrect={false}
              autoCapitalize="none"
              testID="restore-input"
            />
            {restoreError ? <Text style={styles.restoreError}>{restoreError}</Text> : null}
            <View style={styles.modalBtnRow}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSecondary]}
                onPress={() => setRestoreVisible(false)}
              >
                <Text style={styles.modalBtnTextSecondary}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={confirmRestore}
                testID="restore-confirm"
              >
                <Text style={styles.modalBtnTextPrimary}>Restore</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
