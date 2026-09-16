import { Feather } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import {
  refreshNotificationPermission,
  useNotificationPermission,
} from "@/hooks/useNotificationPermission";
import {
  MAX_NOTIF_PROMPTS,
  ensureNotificationPermission,
  getNotifPromptCount,
  openAppSettings,
} from "@/services/ReminderService";

interface Props {
  /**
   * True when at least one incomplete reminder is already past its time. The
   * nudge is the same control either way, but this is the moment the cost of
   * a missing permission stops being hypothetical, so the copy names it.
   */
  hasMissedRing: boolean;
  onDismiss: () => void;
}

/**
 * The repair path for a notification permission the user skipped or refused.
 *
 * It never shows a dead button: when the OS will not display the dialog again
 * (permanent refusal, or MAX_NOTIF_PROMPTS spent) the action goes to system
 * settings instead of to a request that resolves as denied without a pixel
 * changing on screen.
 */
export default function NotificationNudge({ hasMissedRing, onDismiss }: Props) {
  const colors = useColors();
  const { granted } = useNotificationPermission();
  const [busy, setBusy] = useState(false);

  const handleFix = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const count = await getNotifPromptCount();
      if (count >= MAX_NOTIF_PROMPTS) {
        openAppSettings();
      } else {
        const ok = await ensureNotificationPermission();
        // ensure* returns false both for a refusal just now and for a
        // permanent one it declined to re-ask. Either way settings is the
        // only remaining route, but do not yank the user out of the app on
        // the same tap that showed them a dialog.
        if (!ok) await refreshNotificationPermission();
      }
      await refreshNotificationPermission();
    } finally {
      setBusy(false);
    }
  }, [busy]);

  if (granted) return null;

  return (
    <View
      testID="notification-nudge"
      style={[
        styles.banner,
        { backgroundColor: colors.warningSurface, borderColor: colors.warning },
      ]}
    >
      <Feather name="bell-off" size={16} color={colors.warning} style={styles.icon} />
      <View style={styles.body}>
        <Text style={[styles.message, { color: colors.warningSurfaceForeground }]}>
          {hasMissedRing
            ? "A reminder passed without ringing. Notifications are off."
            : "Notifications are off. Your reminders will not ring."}
        </Text>
        <Pressable onPress={handleFix} disabled={busy} hitSlop={8} testID="notification-nudge-fix">
          <Text style={[styles.link, { color: colors.warning }]}>Turn on</Text>
        </Pressable>
      </View>
      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        accessibilityLabel="Dismiss notification warning"
        testID="notification-nudge-dismiss"
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
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  icon: {
    flexShrink: 0,
    marginTop: 1,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  link: {
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  close: {
    flexShrink: 0,
    padding: 2,
  },
});
