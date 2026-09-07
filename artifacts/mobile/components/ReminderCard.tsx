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
import { isSendReminder } from "@/services/ReminderService";
import { formatDatetime } from "@/utils/formatDatetime";
import { getFontFamily } from "@/utils/getFontFamily";

function isOverdue(iso: string, completed: boolean): boolean {
  return !completed && new Date(iso) < new Date();
}

interface Props {
  reminder: Reminder;
  onDelete: (id: string) => void;
}

// Static across every card and every render — hoisted out of the component
// so a list of N cards re-renders without rebuilding N copies of these style
// objects. Only the handful of values that actually vary per reminder/theme
// (see dynamicCardStyles below) are computed inline.
const staticStyles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
  },
  checkButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
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
  },
  recipientChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    maxWidth: "100%",
  },
  recipientChipText: {
    fontSize: 11,
    flexShrink: 1,
  },
  description: {
    fontSize: 13,
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
  },
  deleteBtn: {
    padding: 6,
  },
});

function ReminderCard({ reminder, onDelete }: Props) {
  const colors = useColors();
  const { toggleComplete } = useReminders();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const overdue = isOverdue(reminder.datetime, reminder.completed);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start(() => {
      // A send reminder opens the send screen, not the editor. That screen is
      // where its actions live - WhatsApp/SMS handoff and an explicit "Mark as
      // done" - and tapping the card was previously the one route that never
      // reached them, leaving the tray notification as the only way in.
      if (isSendReminder(reminder)) {
        router.push({ pathname: "/send-reminder", params: { id: reminder.id } });
        return;
      }
      router.push({ pathname: "/add-reminder", params: { id: reminder.id } });
    });
  };

  const handleToggle = () => {
    toggleComplete(reminder.id);
  };

  // Only the values that actually depend on props/theme, computed as plain
  // objects (not StyleSheet.create — registering these with the native style
  // manager buys nothing for objects that are already new every render).
  const dynamicCardStyle = {
    backgroundColor: colors.card,
    borderRadius: colors.radiusCard,
    borderColor: overdue && !reminder.completed ? colors.destructiveBorder : colors.border,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 2px 8px rgba(232,92,60,0.06)" }
      : {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 2,
        }),
  };
  const dynamicCheckButtonStyle = {
    borderColor: reminder.completed ? colors.primary : colors.border,
    backgroundColor: reminder.completed ? colors.primary : "transparent",
  };
  const dynamicTitleStyle: { color: string; textDecorationLine: "line-through" | "none" } = {
    color: reminder.completed ? colors.mutedForeground : colors.foreground,
    textDecorationLine: reminder.completed ? "line-through" : "none",
  };
  const dynamicTimeTextStyle = {
    color: overdue && !reminder.completed ? colors.destructive : colors.mutedForeground,
  };
  const styles = {
    ...staticStyles,
    card: [staticStyles.card, dynamicCardStyle],
    checkButton: [staticStyles.checkButton, dynamicCheckButtonStyle],
    title: [staticStyles.title, dynamicTitleStyle],
    recipientChip: [staticStyles.recipientChip, { backgroundColor: colors.primary + "1A" }],
    recipientChipText: [staticStyles.recipientChipText, { color: colors.primary }],
    description: [staticStyles.description, { color: colors.mutedForeground }],
    timeText: [staticStyles.timeText, dynamicTimeTextStyle],
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={styles.card}
        onPress={handlePress}
        android_ripple={{ color: colors.muted }}
      >
        <Pressable
          testID="complete-toggle"
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
            <Text
              style={[styles.title, { fontFamily: getFontFamily(reminder.title, "600SemiBold") }]}
              numberOfLines={1}
            >
              {reminder.title}
            </Text>
            {reminder.alarm === false && (
              <Feather
                testID="alarm-off-icon"
                name="bell-off"
                size={13}
                color={colors.mutedForeground}
              />
            )}
          </View>
          {!!reminder.description && (
            <Text
              style={[
                styles.description,
                { fontFamily: getFontFamily(reminder.description, "400Regular") },
              ]}
              numberOfLines={1}
            >
              {reminder.description}
            </Text>
          )}

          {isSendReminder(reminder) && reminder.recipient && (
            <View style={styles.recipientChip} testID="recipient-chip">
              <Feather name="send" size={11} color={colors.primary} />
              <Text
                style={[
                  styles.recipientChipText,
                  {
                    fontFamily: getFontFamily(
                      reminder.recipient.name,
                      "600SemiBold"
                    ),
                  },
                ]}
                numberOfLines={1}
              >
                {reminder.recipient.name}
              </Text>
            </View>
          )}
          <View style={styles.timeRow}>
            <Feather
              name={overdue && !reminder.completed ? "alert-circle" : "clock"}
              size={11}
              color={overdue && !reminder.completed ? colors.destructive : colors.mutedForeground}
            />
            <Text style={styles.timeText}>{formatDatetime(reminder.datetime)}</Text>
          </View>
        </View>

        <Pressable
          testID={`delete-reminder-${reminder.id}`}
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

// Memoized: HomeScreen re-renders its whole card list on every reminders
// change (add/edit/delete/toggle all replace the array reference), but only
// the one changed reminder's props actually differ — this skips re-rendering
// (and rebuilding dynamic styles for) every other card in the list.
export default React.memo(ReminderCard);
