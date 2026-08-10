import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
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
import {
  useThemePreference,
  type ThemePreference,
} from "@/contexts/ThemeContext";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    defaultAlarmEnabled,
    setDefaultAlarmEnabled,
    showDescriptionInNotifications,
    setShowDescriptionInNotifications,
    vibrationEnabled,
    setVibrationEnabled,
    dictationLanguage,
    setDictationLanguage,
    refreshFromStorage,
  } = useReminders();
  const { preference, setPreference } = useThemePreference();

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
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 16,
      paddingHorizontal: 20,
      paddingBottom: 12,
      backgroundColor: colors.background,
    },
    headerTitle: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 4,
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
    // No flex here: this label sits inside a nested column View alongside its
    // sub-label. flex:1 in a column makes the title fight the sub-label for
    // vertical space and collapse to zero height. The row-level flex belongs
    // on the wrapping View, not on the Text.
    alarmLabel: {
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
    descriptionCard: {
      marginTop: 12,
    },
    languageCard: {
      marginTop: 12,
    },
    languageLabel: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      marginBottom: 10,
    },
    languagePillRow: {
      flexDirection: "row",
      gap: 8,
    },
    languageNotice: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 10,
    },
    languagePill: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    languagePillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    languagePillText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    languagePillTextActive: {
      color: colors.primaryForeground,
    },
    debugRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    chevron: {
      marginLeft: "auto",
    },
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
    modalBtnSecondary: {
      backgroundColor: colors.muted,
    },
    modalBtnPrimary: {
      backgroundColor: colors.primary,
    },
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
        <Text style={styles.headerTitle}>Settings</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.alarmCard}>
          <Feather
            name={defaultAlarmEnabled ? "bell" : "bell-off"}
            size={18}
            color={defaultAlarmEnabled ? colors.primary : colors.mutedForeground}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.alarmLabel}>Play alarm sound by default</Text>
            <Text style={styles.alarmSubLabel}>
              {defaultAlarmEnabled
                ? "Notification will play a sound"
                : "Notification will be silent"}
            </Text>
          </View>
          <Switch
            testID="default-alarm-switch"
            value={defaultAlarmEnabled}
            onValueChange={(v) => setDefaultAlarmEnabled(v)}
            trackColor={{ false: colors.muted, true: colors.primary + "66" }}
            thumbColor={defaultAlarmEnabled ? colors.primary : colors.mutedForeground}
          />
        </View>
        <View style={[styles.alarmCard, styles.descriptionCard]}>
          <Feather
            name={vibrationEnabled ? "smartphone" : "slash"}
            size={18}
            color={vibrationEnabled ? colors.primary : colors.mutedForeground}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.alarmLabel}>Vibrate</Text>
            <Text style={styles.alarmSubLabel}>
              {vibrationEnabled
                ? "Notification will vibrate, even when sound is off"
                : "Notification will not vibrate"}
            </Text>
          </View>
          <Switch
            testID="vibration-switch"
            value={vibrationEnabled}
            onValueChange={(v) => setVibrationEnabled(v)}
            trackColor={{ false: colors.muted, true: colors.primary + "66" }}
            thumbColor={vibrationEnabled ? colors.primary : colors.mutedForeground}
          />
        </View>
        <View style={[styles.alarmCard, styles.descriptionCard]}>
          <Feather
            name={showDescriptionInNotifications ? "eye" : "eye-off"}
            size={18}
            color={
              showDescriptionInNotifications ? colors.primary : colors.mutedForeground
            }
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.alarmLabel}>Show description in notifications</Text>
            <Text style={styles.alarmSubLabel}>
              {showDescriptionInNotifications
                ? "Description appears on the lock screen and notification shade"
                : "Notification shows only the reminder title"}
            </Text>
          </View>
          <Switch
            testID="show-description-switch"
            value={showDescriptionInNotifications}
            onValueChange={(v) => setShowDescriptionInNotifications(v)}
            trackColor={{ false: colors.muted, true: colors.primary + "66" }}
            thumbColor={
              showDescriptionInNotifications ? colors.primary : colors.mutedForeground
            }
          />
        </View>

        <View style={[styles.alarmCard, styles.languageCard]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.languageLabel}>Appearance</Text>
            <View style={styles.languagePillRow}>
              {THEME_OPTIONS.map(({ value, label }) => (
                <Pressable
                  key={value}
                  testID={`theme-${value}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: preference === value }}
                  style={[
                    styles.languagePill,
                    preference === value && styles.languagePillActive,
                  ]}
                  onPress={() => setPreference(value)}
                >
                  <Text
                    style={[
                      styles.languagePillText,
                      preference === value && styles.languagePillTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={[styles.alarmCard, styles.languageCard]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.languageLabel}>Dictation language</Text>
            <View style={styles.languagePillRow}>
              <Pressable
                testID="dictation-language-en"
                accessibilityRole="button"
                accessibilityState={{ selected: dictationLanguage === "en-US" }}
                style={[
                  styles.languagePill,
                  dictationLanguage === "en-US" && styles.languagePillActive,
                ]}
                onPress={() => setDictationLanguage("en-US")}
              >
                <Text
                  style={[
                    styles.languagePillText,
                    dictationLanguage === "en-US" && styles.languagePillTextActive,
                  ]}
                >
                  English
                </Text>
              </Pressable>
              <Pressable
                testID="dictation-language-ml"
                accessibilityRole="button"
                accessibilityState={{ selected: dictationLanguage === "ml-IN" }}
                style={[
                  styles.languagePill,
                  dictationLanguage === "ml-IN" && styles.languagePillActive,
                ]}
                onPress={() => setDictationLanguage("ml-IN")}
              >
                <Text
                  style={[
                    styles.languagePillText,
                    dictationLanguage === "ml-IN" && styles.languagePillTextActive,
                  ]}
                >
                  മലയാളം
                </Text>
              </Pressable>
            </View>
            {dictationLanguage !== "en-US" && (
              <Text style={styles.languageNotice}>
                Non-English dictation may use Google's online speech recognition when an
                offline model isn't available on this device — your voice audio is sent to
                Google's servers to be transcribed, and an internet connection is required.
              </Text>
            )}
          </View>
        </View>

        <Pressable
          style={[styles.alarmCard, styles.descriptionCard, styles.debugRow]}
          onPress={shareBackup}
          testID="backup-row"
        >
          <Feather name="upload" size={18} color={colors.mutedForeground} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alarmLabel}>Back up reminders</Text>
            <Text style={styles.alarmSubLabel}>
              Save a copy you can restore after changing phones
            </Text>
          </View>
          <Feather
            name="chevron-right"
            size={18}
            color={colors.mutedForeground}
            style={styles.chevron}
          />
        </Pressable>

        <Pressable
          style={[styles.alarmCard, styles.descriptionCard, styles.debugRow]}
          onPress={openRestore}
          testID="restore-row"
        >
          <Feather name="download" size={18} color={colors.mutedForeground} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alarmLabel}>Restore from backup</Text>
            <Text style={styles.alarmSubLabel}>
              Paste a backup — your current reminders are kept
            </Text>
          </View>
          <Feather
            name="chevron-right"
            size={18}
            color={colors.mutedForeground}
            style={styles.chevron}
          />
        </Pressable>

        <Pressable
          style={[styles.alarmCard, styles.descriptionCard, styles.debugRow]}
          onPress={openLogs}
          testID="debug-logs-row"
        >
          <Feather name="file-text" size={18} color={colors.mutedForeground} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alarmLabel}>Debug logs</Text>
            <Text style={styles.alarmSubLabel}>
              View or share logs to help diagnose a problem
            </Text>
          </View>
          <Feather
            name="chevron-right"
            size={18}
            color={colors.mutedForeground}
            style={styles.chevron}
          />
        </Pressable>
      </View>

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
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={shareLogs}
              >
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
            {restoreError ? (
              <Text style={styles.restoreError}>{restoreError}</Text>
            ) : null}
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
