import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
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
  getNotificationPermissionState,
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
  // True once a tap can no longer produce a system dialog: the OS has stopped
  // asking, or this install has spent MAX_NOTIF_PROMPTS. The label has to say
  // so, because the tap stops meaning "ask" and starts meaning "leave the app".
  const [settingsOnly, setSettingsOnly] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const [state, count] = await Promise.all([
        getNotificationPermissionState(),
        getNotifPromptCount(),
      ]);
      if (live) setSettingsOnly(!state.canAskAgain || count >= MAX_NOTIF_PROMPTS);
    })();
    return () => {
      live = false;
    };
    // Re-read whenever the shared permission snapshot changes, which the
    // provider refreshes on every foreground resume - a user who revoked the
    // permission in system settings comes back to the right label.
  }, [granted]);

  const handleFix = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      // canAskAgain, not the prompt count alone. Revoking the permission from
      // system settings leaves the count at zero while the OS refuses to show
      // the dialog ever again, so a count-only check sent that user into
      // ensureNotificationPermission(), which returned false without a single
      // pixel changing on screen. That is the dead button.
      const [state, count] = await Promise.all([
        getNotificationPermissionState(),
        getNotifPromptCount(),
      ]);
      if (!state.canAskAgain || count >= MAX_NOTIF_PROMPTS) {
        setSettingsOnly(true);
        openAppSettings();
        return;
      }
      const ok = await ensureNotificationPermission();
      // A refusal just now can be the LAST one the OS allows. Re-reading the
      // state here is what turns the button into "Open settings" before the
      // user taps it a second time and finds nothing happens.
      if (!ok) {
        const after = await getNotificationPermissionState();
        setSettingsOnly(!after.canAskAgain);
      }
    } finally {
      await refreshNotificationPermission();
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
          <Text style={[styles.link, { color: colors.warning }]}>
            {settingsOnly ? "Open settings" : "Turn on"}
          </Text>
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
