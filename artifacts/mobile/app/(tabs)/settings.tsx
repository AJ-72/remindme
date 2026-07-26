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

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    defaultAlarmEnabled,
    setDefaultAlarmEnabled,
    showDescriptionInNotifications,
    setShowDescriptionInNotifications,
  } = useReminders();

  const [logsVisible, setLogsVisible] = useState(false);
  const [logsText, setLogsText] = useState("");

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
    descriptionCard: {
      marginTop: 12,
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
    </View>
  );
}
