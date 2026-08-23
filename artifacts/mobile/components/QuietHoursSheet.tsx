import React from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { formatQuietTime, minutesFromDate } from "@/utils/quietHours";

interface Props {
  visible: boolean;
  /** The time the user actually chose. */
  datetime: Date;
  /** When the quiet window ends - the offered alternative. */
  quietEnd: Date;
  onKeep: () => void;
  onMove: () => void;
  onCancel: () => void;
}

/**
 * Asks - never blocks - about a reminder the user deliberately set inside
 * their quiet hours.
 *
 * The asymmetry is the point: the app defers its OWN notifications out of
 * quiet hours silently, but a time the user chose is a different thing. 2am
 * medication and night-shift work are real reasons to choose one, so "Keep it"
 * is the primary action, listed first, not a grudging escape hatch.
 */
export default function QuietHoursSheet({
  visible,
  datetime,
  quietEnd,
  onKeep,
  onMove,
  onCancel,
}: Props) {
  const colors = useColors();

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: Platform.OS === "ios" ? 40 : 28,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    title: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 4,
    },
    message: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 20,
      lineHeight: 20,
    },
    primaryBtn: {
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: "center",
      marginBottom: 10,
    },
    primaryText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    secondaryBtn: {
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: colors.muted,
      alignItems: "center",
    },
    secondaryText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel} testID="quiet-hours-sheet-overlay">
        <Pressable onPress={() => {}} style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>
            That&apos;s {formatQuietTime(minutesFromDate(datetime))}, inside your quiet hours
          </Text>
          <Text style={styles.message}>
            Quiet hours only hold back alerts the app schedules by itself. If
            this one is meant for then, keep it.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={onKeep} testID="quiet-hours-sheet-keep">
            <Text style={styles.primaryText}>Keep it</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={onMove} testID="quiet-hours-sheet-move">
            <Text style={styles.secondaryText}>
              Move to {formatQuietTime(minutesFromDate(quietEnd))}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
