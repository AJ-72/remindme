import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { openExactAlarmSettings } from "@/services/ReminderService";

interface Props {
  onDismiss: () => void;
}

export default function ExactAlarmBanner({ onDismiss }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  if (Platform.OS !== "android") return null;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: colors.warningSurface,
          borderColor: colors.warning,
          paddingTop: insets.top + 10,
        },
      ]}
    >
      <Feather
        name="alert-triangle"
        size={16}
        color={colors.warning}
        style={styles.icon}
      />
      <Text style={[styles.message, { color: colors.warningSurfaceForeground }]}>
        Exact alarm permission is off — reminders may fire late.{" "}
        <Text
          style={[styles.link, { color: colors.warning }]}
          onPress={openExactAlarmSettings}
        >
          Fix in Settings
        </Text>
      </Text>
      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        accessibilityLabel="Dismiss warning"
        style={styles.close}
      >
        <Feather name="x" size={16} color={colors.warningSurfaceForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  icon: {
    flexShrink: 0,
  },
  message: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  link: {
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  close: {
    flexShrink: 0,
    padding: 2,
  },
});
