import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { EVENTS } from "@/constants/analytics";
import { useReminders } from "@/contexts/RemindersContext";
import { type DialogButton } from "@/components/AppDialog";
import { useAppDialog } from "@/hooks/useAppDialog";
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

export default function DriveBackupCard() {
  const colors = useColors();
  const { reminders, refreshFromStorage } = useReminders();
  const drive = getDriveBackup();
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const { show, notify, dialog } = useAppDialog();
  // A choice that can lose data gets the warning tone.
  const ask = (title: string, message: string, buttons: DialogButton[]) =>
    show({
      title,
      message,
      buttons,
      tone: buttons.some((b) => b.style === "destructive") ? "warning" : "info",
    });

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
      await notify("Couldn't restore", "The backup in Google Drive couldn't be read. Nothing was changed.", "error");
      return;
    }
    // Drive now holds the merged set, not just what was there before.
    await drive.uploadBackup("restore");
    await notify("Restored", `${result.added} added${result.duplicates ? `, ${result.duplicates} already here` : ""}.`, "success");
  };

  const connect = () =>
    run(async () => {
      const signedIn = await drive.signIn();
      if (!signedIn.ok) {
        if (signedIn.error !== "cancelled") await notify("Couldn't sign in", errorCopy(signedIn.error), "error");
        return;
      }
      const found = await drive.findBackup();
      if (!found.ok) {
        await notify("Couldn't check Google Drive", errorCopy(found.error), "error");
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
      if (!result.ok) await notify("Backup failed", errorCopy(result.error), "error");
    });

  const restoreNow = () =>
    run(async () => {
      const found = await drive.findBackup();
      if (!found.ok) {
        await notify("Couldn't check Google Drive", errorCopy(found.error), "error");
        return;
      }
      if (!found.backup) {
        await notify("No backup yet", "There's nothing in Google Drive to restore.");
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
        {dialog}
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
      {dialog}
    </View>
  );
}
