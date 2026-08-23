import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";
import { formatQuietTime, minutesFromDate } from "@/utils/quietHours";

type DateTimePickerEvent = { type: string; nativeEvent: object };
const DateTimePicker: React.ComponentType<any> | null =
  Platform.OS !== "web"
    ? require("@react-native-community/datetimepicker").default
    : null;

/** Which end of the window the open picker is editing. */
type PickerTarget = "start" | "end" | null;

export default function SmartAlertsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { quietHours, setQuietHours } = useReminders();
  const [picking, setPicking] = useState<PickerTarget>(null);

  const dateForMinute = (minute: number) => {
    const d = new Date();
    d.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
    return d;
  };

  const handlePicked = (event: DateTimePickerEvent, selected?: Date) => {
    const target = picking;
    setPicking(null);
    if (event.type === "dismissed" || !selected || !target) return;
    const minute = minutesFromDate(selected);
    setQuietHours(
      target === "start"
        ? { ...quietHours, startMinute: minute }
        : { ...quietHours, endMinute: minute }
    );
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
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radiusCard,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 12,
    },
    label: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    subLabel: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
      lineHeight: 18,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 14,
    },
    timeBtn: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: colors.muted,
    },
    timeText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    timeSep: { fontSize: 14, color: colors.mutedForeground },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    footer: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 19,
      marginTop: 4,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="smart-alerts-back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Smart Alerts</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.label}>Quiet hours</Text>
          <Text style={styles.subLabel}>
            Nothing the app schedules on its own arrives during these hours.
            Reminders you set yourself are always kept.
          </Text>
          <View style={styles.timeRow}>
            <Pressable
              style={styles.timeBtn}
              onPress={() => setPicking("start")}
              accessibilityRole="button"
              accessibilityLabel="Quiet hours start"
            >
              <Text style={styles.timeText} testID="quiet-hours-start">
                {formatQuietTime(quietHours.startMinute)}
              </Text>
            </Pressable>
            <Text style={styles.timeSep}>to</Text>
            <Pressable
              style={styles.timeBtn}
              onPress={() => setPicking("end")}
              accessibilityRole="button"
              accessibilityLabel="Quiet hours end"
            >
              <Text style={styles.timeText} testID="quiet-hours-end">
                {formatQuietTime(quietHours.endMinute)}
              </Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={styles.card}
          onPress={() => router.push("/why-tasks-slip")}
          testID="why-tasks-slip-row"
        >
          <View style={styles.row}>
            <Feather name="help-circle" size={18} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Why tasks slip</Text>
              <Text style={styles.subLabel}>
                What the research says about putting things off
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </View>
        </Pressable>

        {/* States an automatic behaviour that has no control, so it never
            reads as a bug when the user notices alerts going quiet. */}
        <Text style={styles.footer}>
          When a task keeps getting postponed, the app stops sending alerts for
          it and offers to help instead.
        </Text>
      </ScrollView>

      {picking !== null && DateTimePicker && (
        <DateTimePicker
          value={dateForMinute(
            picking === "start" ? quietHours.startMinute : quietHours.endMinute
          )}
          mode="time"
          display="default"
          onChange={handlePicked}
        />
      )}
    </View>
  );
}
