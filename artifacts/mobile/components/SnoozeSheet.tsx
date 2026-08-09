import { Feather } from "@expo/vector-icons";
import React from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import {
  SNOOZE_PRESETS,
  snoozePresetLabel,
  type SnoozePreset,
} from "@/utils/snoozePresets";

interface Props {
  visible: boolean;
  current: SnoozePreset;
  onSelect: (preset: SnoozePreset) => void | Promise<void>;
  onCancel: () => void;
}

function testIdFor(preset: SnoozePreset): string {
  return preset.kind === "tomorrow"
    ? "snooze-option-tomorrow"
    : `snooze-option-${preset.minutes}`;
}

function isSame(a: SnoozePreset, b: SnoozePreset): boolean {
  if (a.kind === "tomorrow" || b.kind === "tomorrow") {
    return a.kind === b.kind;
  }
  return a.minutes === b.minutes;
}

export default function SnoozeSheet({ visible, current, onSelect, onCancel }: Props) {
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
      marginBottom: 12,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionLabel: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    cancelBtn: {
      marginTop: 16,
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: colors.muted,
      alignItems: "center",
    },
    cancelText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel} testID="snooze-sheet-overlay">
        <Pressable onPress={() => {}} style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Snooze until…</Text>
          {SNOOZE_PRESETS.map((preset) => {
            const selected = isSame(preset, current);
            return (
              <Pressable
                key={testIdFor(preset)}
                testID={testIdFor(preset)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={styles.option}
                onPress={() => onSelect(preset)}
              >
                <Text style={styles.optionLabel}>{snoozePresetLabel(preset)}</Text>
                {selected && <Feather name="check" size={18} color={colors.primary} />}
              </Pressable>
            );
          })}
          <Pressable
            style={styles.cancelBtn}
            onPress={onCancel}
            testID="snooze-sheet-cancel"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
