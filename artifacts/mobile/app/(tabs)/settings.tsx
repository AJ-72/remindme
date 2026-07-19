import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { defaultAlarmEnabled, setDefaultAlarmEnabled } = useReminders();

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
            value={defaultAlarmEnabled}
            onValueChange={(v) => setDefaultAlarmEnabled(v)}
            trackColor={{ false: colors.muted, true: colors.primary + "66" }}
            thumbColor={defaultAlarmEnabled ? colors.primary : colors.mutedForeground}
          />
        </View>
      </View>
    </View>
  );
}
