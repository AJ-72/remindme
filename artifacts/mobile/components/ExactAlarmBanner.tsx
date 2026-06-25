import { Feather } from "@expo/vector-icons";
import React from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props {
  onDismiss: () => void;
}

export default function ExactAlarmBanner({ onDismiss }: Props) {
  const colors = useColors();

  if (Platform.OS !== "android") return null;

  const handleOpenSettings = () => {
    // Linking.sendIntent launches an Android Intent by action name directly —
    // correct way to open "Special app access → Alarms & reminders" on Android 12+.
    // openURL("android.settings.REQUEST_SCHEDULE_EXACT_ALARM") has no scheme so
    // it always throws and falls back to generic notification settings instead.
    const sendIntent = (Linking as any).sendIntent as
      | ((action: string) => Promise<void>)
      | undefined;
    if (sendIntent) {
      sendIntent("android.settings.REQUEST_SCHEDULE_EXACT_ALARM").catch(() =>
        Linking.openSettings()
      );
    } else {
      Linking.openSettings();
    }
  };

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: "#fffbeb",
          borderColor: colors.warning,
        },
      ]}
    >
      <Feather
        name="alert-triangle"
        size={16}
        color={colors.warning}
        style={styles.icon}
      />
      <Text style={[styles.message, { color: "#92400e" }]}>
        Exact alarm permission is off — reminders may fire late.{" "}
        <Text
          style={[styles.link, { color: colors.warning }]}
          onPress={handleOpenSettings}
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
        <Feather name="x" size={16} color="#92400e" />
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
