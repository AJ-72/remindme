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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NameSheet from "@/components/NameSheet";
import { buildAppShareMessage } from "@/utils/appShare";
import { getFontFamily } from "@/utils/getFontFamily";
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
  openExactAlarmSettings,
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
  const [alarmIconExplained, setAlarmIconExplained] = useState(false);
  const insets = useSafeAreaInsets();
  const {
    defaultAlarmEnabled,
    setDefaultAlarmEnabled,
    showDescriptionInNotifications,
    setShowDescriptionInNotifications,
    inviteNudgeEnabled,
    setInviteNudgeEnabled,
    vibrationEnabled,
    setVibrationEnabled,
    dictationLanguage,
    setDictationLanguage,
    userName,
    setUserName,
    refreshFromStorage,
  } = useReminders();
  const { preference, setPreference } = useThemePreference();

  const [logsVisible, setLogsVisible] = useState(false);
  const [logsText, setLogsText] = useState("");
  const [restoreVisible, setRestoreVisible] = useState(false);
  const [restoreText, setRestoreText] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [nameSheetVisible, setNameSheetVisible] = useState(false);

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

  const shareApp = async () => {
    try {
      await Share.share({ message: buildAppShareMessage() });
    } catch {
      // User dismissed the sheet, or no share target exists — nothing to say.
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
    // contentContainerStyle for a ScrollView, not a View style. The screen
    // grew past one viewport once Smart Alerts was added, and a plain View
    // simply clipped everything below the fold with no way to reach it.
    content: {
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: insets.bottom + 24,
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
    explainerCard: {
      marginTop: 12,
      flexDirection: "column",
      alignItems: "stretch",
      gap: 0,
    },
    explainerHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    explainerTitle: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    explainerBody: {
      marginTop: 10,
      gap: 10,
    },
    explainerText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 19,
    },
    explainerLink: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      marginTop: 2,
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
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        testID="settings-scroll"
      >
        <View style={styles.alarmCard}>
          <Feather
            name={defaultAlarmEnabled ? "bell" : "bell-off"}
            size={18}
            color={defaultAlarmEnabled ? colors.primary : colors.mutedForeground}
          />
          <View style={{ flex: 1 }}>
            {/* The label names punctuality, not just sound. Turning this off
                routes the reminder through the API aggressive OEM power
                management downgrades (see D7/D19 in device-tests.md), so a
                silent reminder is also a late one — a behaviour the old
                "Play alarm sound by default" wording hid completely. */}
            <Text style={styles.alarmLabel}>
              Alarm — rings, and arrives on time
            </Text>
            <Text style={styles.alarmSubLabel}>
              {defaultAlarmEnabled
                ? "Rings out loud, and fires at exactly the time you set"
                : "Silent, and may arrive up to 20 minutes late"}
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
        {/* Android-only: the persistent status-bar clock is a side effect of
            setAlarmClock(), the one scheduling API these OEMs honour. It
            cannot be engineered away — one pending registration is enough to
            show it — so the honest move is to explain it rather than hide it. */}
        {Platform.OS === "android" && (
          <Pressable
            testID="alarm-icon-explainer"
            style={[styles.alarmCard, styles.explainerCard]}
            onPress={() => setAlarmIconExplained((v) => !v)}
          >
            <View style={styles.explainerHeader}>
              <Feather name="help-circle" size={16} color={colors.mutedForeground} />
              <Text style={styles.explainerTitle}>
                Why is there an alarm icon in my status bar?
              </Text>
              <Feather
                name={alarmIconExplained ? "chevron-up" : "chevron-down"}
                size={16}
                color={colors.mutedForeground}
              />
            </View>
            {alarmIconExplained && (
              <View style={styles.explainerBody}>
                <Text style={styles.explainerText}>
                  It means at least one reminder is armed to go off at exactly
                  its time. Android shows the icon whenever an app registers a
                  precise alarm, and that registration is the only thing that
                  stops your phone&apos;s battery saver from delaying the
                  reminder by several minutes — or an hour for a next-day one.
                </Text>
                <Text style={styles.explainerText}>
                  The icon does not mean anything is running in the background
                  or draining your battery. It disappears once no alarm
                  reminders are pending.
                </Text>
                <Text style={styles.explainerText}>
                  If you would rather have a clean status bar, Android&apos;s
                  own switch for this is Settings › Apps › Reminders › Allow
                  setting alarms and reminders. Turning it off trades
                  punctuality for the icon — your reminders will still arrive,
                  just late.
                </Text>
                <Pressable
                  testID="alarm-icon-explainer-settings"
                  onPress={openExactAlarmSettings}
                  hitSlop={8}
                >
                  <Text style={styles.explainerLink}>
                    Open alarms &amp; reminders settings
                  </Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        )}
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

        <View style={[styles.alarmCard, styles.descriptionCard]}>
          <Feather
            name={inviteNudgeEnabled ? "gift" : "slash"}
            size={18}
            color={inviteNudgeEnabled ? colors.primary : colors.mutedForeground}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.alarmLabel}>Mention this app when messaging</Text>
            <Text style={styles.alarmSubLabel}>
              {inviteNudgeEnabled
                ? "Adds a short line to the first few messages you send someone"
                : "Your messages go out with nothing extra added"}
            </Text>
          </View>
          <Switch
            testID="invite-nudge-switch"
            value={inviteNudgeEnabled}
            onValueChange={(v) => setInviteNudgeEnabled(v)}
            trackColor={{ false: colors.muted, true: colors.primary + "66" }}
            thumbColor={
              inviteNudgeEnabled ? colors.primary : colors.mutedForeground
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
          onPress={() => router.push("/smart-alerts")}
          testID="smart-alerts-row"
        >
          <Feather name="bell" size={18} color={colors.mutedForeground} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alarmLabel}>Smart Alerts</Text>
            <Text style={styles.alarmSubLabel}>
              Quiet hours, and how the app follows up on what slips
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
          onPress={() => setNameSheetVisible(true)}
          testID="user-name-row"
        >
          <Feather name="user" size={18} color={colors.mutedForeground} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alarmLabel}>Your name</Text>
            <Text
              style={[
                styles.alarmSubLabel,
                userName
                  ? { fontFamily: getFontFamily(userName, "400Regular") }
                  : null,
              ]}
              testID="user-name-value"
            >
              {userName || "Not set — used to greet you and sign your messages"}
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
          onPress={shareApp}
          testID="share-app-row"
        >
          <Feather name="share-2" size={18} color={colors.mutedForeground} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alarmLabel}>Share this app</Text>
            <Text style={styles.alarmSubLabel}>
              Send someone a short note about Reminders and where to get it
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

      <NameSheet
        visible={nameSheetVisible}
        initialName={userName}
        onSave={async (name) => {
          await setUserName(name);
          setNameSheetVisible(false);
        }}
        onDismiss={() => setNameSheetVisible(false)}
      />
    </View>
  );
}
