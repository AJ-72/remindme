import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { EVENTS } from "@/constants/analytics";
import { useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";
import { track } from "@/services/AnalyticsService";
import {
  getDriveBackup,
  type DriveError,
  type DriveStatus,
  type RemoteBackup,
} from "@/services/DriveBackupService";
import { backedUpAgo } from "@/utils/backupDisplay";

/**
 * Settings → Backup's Google Drive section (B3). Hidden entirely when the
 * build has no Drive support (Expo Go, web, no client ID).
 *
 * Connecting on an install that finds a backup already in Drive always asks
 * which copy wins before anything uploads - the non-welcome-back half of the
 * service's invariant 1. Signing out leaves the Drive file in place.
 */

function errorCopy(error: DriveError): string {
  switch (error) {
    case "network":
      return "Couldn't reach Google Drive";
    case "auth":
      return "Sign in again to keep backing up";
    case "quota":
      return "Your Google Drive is full";
    default:
      return "Last backup failed";
  }
}

function ask(title: string, message: string, buttons: { text: string; value: string; style?: "cancel" | "destructive" }[]) {
  return new Promise<string>((resolve) => {
    Alert.alert(
      title,
      message,
      buttons.map((b) => ({ text: b.text, style: b.style, onPress: () => resolve(b.value) })),
      { cancelable: true, onDismiss: () => resolve("cancel") }
    );
  });
}

export default function DriveBackupCard() {
  const colors = useColors();
  const { reminders, refreshFromStorage } = useReminders();
  const drive = getDriveBackup();
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => setStatus(await drive.getStatus()), [drive]);

  useEffect(() => {
    if (drive.isConfigured()) void reload();
  }, [drive, reload]);

  if (!drive.isConfigured()) return null;

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } finally {
      await reload();
      setBusy(false);
    }
  };

  const restore = async (backup: RemoteBackup) => {
    const result = await drive.restoreFromBackup(backup.raw);
    track(EVENTS.DRIVE_RESTORE_RESULT, {
      ok: result.ok,
      source: "settings",
      added: result.ok ? result.added : 0,
      duplicates: result.ok ? result.duplicates : 0,
      number_moved: false,
    });
    await refreshFromStorage();
    if (!result.ok) {
      Alert.alert("Couldn't restore", "The backup in Google Drive couldn't be read. Nothing was changed.");
      return;
    }
    // Drive now holds the merged set, not just what was there before.
    await drive.uploadBackup("restore");
    Alert.alert("Restored", `${result.added} added${result.duplicates ? `, ${result.duplicates} already here` : ""}.`);
  };

  const connect = () =>
    run(async () => {
      const signedIn = await drive.signIn();
      if (!signedIn.ok) {
        if (signedIn.error !== "cancelled") Alert.alert("Couldn't sign in", errorCopy(signedIn.error));
        return;
      }
      const found = await drive.findBackup();
      if (!found.ok) {
        Alert.alert("Couldn't check Google Drive", errorCopy(found.error));
        await drive.signOut();
        return;
      }
      if (!found.backup) {
        await drive.uploadBackup("manual");
        return;
      }
      const { backup } = found;
      const choice = await ask(
        "You already have a backup",
        `${signedIn.email} has a backup from ${backedUpAgo(backup.modifiedTime)} with ${backup.reminderCount} reminders.`,
        [
          { text: "Restore it", value: "restore" },
          ...(reminders.length > 0
            ? [{ text: "Replace it with this phone's", value: "replace", style: "destructive" as const }]
            : []),
          { text: "Cancel", value: "cancel", style: "cancel" },
        ]
      );
      if (choice === "restore") await restore(backup);
      else if (choice === "replace") await drive.uploadBackup("manual");
      // Cancelling leaves no half-connected state: auto-backup could not run
      // anyway until one of the two copies is chosen.
      else await drive.signOut();
    });

  const backUpNow = () =>
    run(async () => {
      let result = await drive.uploadBackup("manual");
      if (result.ok && !result.uploaded && result.skipped === "guard") {
        const choice = await ask(
          "Replace your backup?",
          "This phone has no reminders. Backing up now would replace the reminders saved in Google Drive with nothing.",
          [
            { text: "Cancel", value: "cancel", style: "cancel" },
            { text: "Replace", value: "replace", style: "destructive" },
          ]
        );
        if (choice !== "replace") return;
        result = await drive.uploadBackup("manual", { allowReplaceWithEmpty: true });
      }
      if (!result.ok) Alert.alert("Backup failed", errorCopy(result.error));
    });

  const restoreNow = () =>
    run(async () => {
      const found = await drive.findBackup();
      if (!found.ok) {
        Alert.alert("Couldn't check Google Drive", errorCopy(found.error));
        return;
      }
      if (!found.backup) {
        Alert.alert("No backup yet", "There's nothing in Google Drive to restore.");
        return;
      }
      const { backup } = found;
      const choice = await ask(
        "Restore from Google Drive?",
        `Adds reminders from the backup made ${backedUpAgo(backup.modifiedTime)} (${backup.reminderCount} reminders). Reminders already on this phone are kept.`,
        [
          { text: "Cancel", value: "cancel", style: "cancel" },
          { text: "Restore", value: "restore" },
        ]
      );
      if (choice === "restore") await restore(backup);
    });

  const stop = () =>
    run(async () => {
      const choice = await ask(
        "Stop backing up?",
        "Your existing backup stays in Google Drive. Changes on this phone won't be saved to it any more.",
        [
          { text: "Cancel", value: "cancel", style: "cancel" },
          { text: "Stop", value: "stop", style: "destructive" },
        ]
      );
      if (choice === "stop") await drive.signOut();
    });

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radiusCard,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    label: { fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground },
    sub: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    subError: { color: colors.destructive },
  });

  if (!status) {
    return (
      <View style={styles.card}>
        <Pressable style={styles.row} onPress={connect} disabled={busy} testID="drive-connect">
          <Feather name="cloud" size={18} color={colors.mutedForeground} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Back up to Google Drive</Text>
            <Text style={styles.sub}>Automatic, and private to this app</Text>
          </View>
          {busy && <ActivityIndicator size="small" color={colors.primary} />}
        </Pressable>
      </View>
    );
  }

  const statusLine = status.lastError
    ? errorCopy(status.lastError)
    : status.lastBackupAt
      ? `Last backed up ${backedUpAgo(status.lastBackupAt)}`
      : "Not backed up yet";

  return (
    <View style={styles.card}>
      <View style={styles.row} testID="drive-status">
        <Feather name="cloud" size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{status.email}</Text>
          <Text style={[styles.sub, status.lastError ? styles.subError : null]} testID="drive-status-line">
            {statusLine}
          </Text>
        </View>
        {busy && <ActivityIndicator size="small" color={colors.primary} />}
      </View>
      <Pressable style={[styles.row, styles.divider]} onPress={backUpNow} disabled={busy} testID="drive-backup-now">
        <Feather name="upload-cloud" size={18} color={colors.mutedForeground} />
        <Text style={styles.label}>Back up now</Text>
      </Pressable>
      <Pressable style={[styles.row, styles.divider]} onPress={restoreNow} disabled={busy} testID="drive-restore">
        <Feather name="download-cloud" size={18} color={colors.mutedForeground} />
        <Text style={styles.label}>Restore from Google Drive</Text>
      </Pressable>
      <Pressable style={[styles.row, styles.divider]} onPress={stop} disabled={busy} testID="drive-stop">
        <Feather name="x-circle" size={18} color={colors.mutedForeground} />
        <Text style={styles.label}>Stop backing up</Text>
      </Pressable>
    </View>
  );
}
