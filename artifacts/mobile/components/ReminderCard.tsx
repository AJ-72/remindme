import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { Reminder, useReminders } from "@/contexts/RemindersContext";
import { formatDatetime } from "@/utils/formatDatetime";

function isOverdue(iso: string, completed: boolean): boolean {
  return !completed && new Date(iso) < new Date();
}

interface Props {
  reminder: Reminder;
  onDelete: (id: string) => void;
}

export default function ReminderCard({ reminder, onDelete }: Props) {
  const colors = useColors();
  const { toggleComplete } = useReminders();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const overdue = isOverdue(reminder.datetime, reminder.completed);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start(() => {
      router.push({ pathname: "/add-reminder", params: { id: reminder.id } });
    });
  };

  const handleToggle = () => {
    toggleComplete(reminder.id);
  };

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      ...(Platform.OS === "web"
        ? { boxShadow: "0 2px 8px rgba(99,102,241,0.06)" }
        : {
            shadowColor: "#6366f1",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
            elevation: 2,
          }),
      borderWidth: 1,
      borderColor: overdue && !reminder.completed ? "#fca5a5" : colors.border,
    },
    checkButton: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: reminder.completed ? colors.primary : colors.border,
      backgroundColor: reminder.completed ? colors.primary : "transparent",
      alignItems: "center",
      justifyContent: "center",
    },
    content: {
      flex: 1,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    title: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: reminder.completed ? colors.mutedForeground : colors.foreground,
      textDecorationLine: reminder.completed ? "line-through" : "none",
    },
    description: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 6,
    },
    timeText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: overdue && !reminder.completed ? "#ef4444" : colors.mutedForeground,
    },
    deleteBtn: {
      padding: 6,
    },
  });

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={styles.card}
        onPress={handlePress}
        android_ripple={{ color: colors.muted }}
      >
        <Pressable
          style={styles.checkButton}
          onPress={handleToggle}
          hitSlop={8}
        >
          {reminder.completed && (
            <Feather name="check" size={14} color={colors.primaryForeground} />
          )}
        </Pressable>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {reminder.title}
            </Text>
            {reminder.alarm === false && (
              <Feather name="bell-off" size={13} color={colors.mutedForeground} />
            )}
          </View>
          {!!reminder.description && (
            <Text style={styles.description} numberOfLines={1}>
              {reminder.description}
            </Text>
          )}
          <View style={styles.timeRow}>
            <Feather
              name={overdue && !reminder.completed ? "alert-circle" : "clock"}
              size={11}
              color={overdue && !reminder.completed ? "#ef4444" : colors.mutedForeground}
            />
            <Text style={styles.timeText}>{formatDatetime(reminder.datetime)}</Text>
          </View>
        </View>

        <Pressable
          style={styles.deleteBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onDelete(reminder.id);
          }}
          hitSlop={8}
        >
          <Feather name="trash-2" size={17} color={colors.mutedForeground} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}
