import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";
import { getDriveBackup, type RemoteBackup } from "@/services/DriveBackupService";
import { runWelcomeBackRestore, type WelcomeBackResult } from "@/services/welcomeBack";
import { backedUpAgo, maskPhone } from "@/utils/backupDisplay";

/**
 * "I've used Reminders before" (B3). Reached only from the first-launch name
 * sheet on an EMPTY install - after an Android Auto Backup restore the
 * install is not empty, and that restore already brought everything back
 * (D1, 2026-09-25), so this never shows twice.
 *
 * One confirm restores reminders AND moves the registered number. The ticked
 * number box, with its line saying the old phone gets signed out, IS the
 * confirmation for the move - it replaces register-number's separate "Move
 * to this device?" step for this flow only. See
 * docs/superpowers/specs/2026-09-25-google-drive-backup-design.md section 5.
 */

type Phase =
  | { name: "intro" }
  | { name: "busy"; label: string }
  | { name: "found"; email: string; backup: RemoteBackup }
  | { name: "not-found"; email: string }
  | { name: "error"; message: string }
  | { name: "done"; result: WelcomeBackResult };

function copyForDriveError(error: string): string {
  switch (error) {
    case "network":
      return "Couldn't reach Google Drive. Check your internet connection and try again.";
    case "auth":
      return "Google sign-in didn't complete. Try again.";
    default:
      return "Something went wrong talking to Google Drive. Please try again.";
  }
}

export default function WelcomeBackScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { refreshFromStorage } = useReminders();
  const [phase, setPhase] = useState<Phase>({ name: "intro" });
  const [moveNumber, setMoveNumber] = useState(true);
  const drive = getDriveBackup();

  const goHome = () => router.replace("/(tabs)");

  const startFresh = async () => {
    await drive.markRestoreSettled();
    goHome();
  };

  const signInAndSearch = async () => {
    setPhase({ name: "busy", label: "Signing in…" });
    const signedIn = await drive.signIn();
    if (!signedIn.ok) {
      setPhase(signedIn.error === "cancelled" ? { name: "intro" } : { name: "error", message: copyForDriveError(signedIn.error) });
      return;
    }
    setPhase({ name: "busy", label: "Looking for your backup…" });
    const found = await drive.findBackup();
    if (!found.ok) {
      setPhase({ name: "error", message: copyForDriveError(found.error) });
      return;
    }
    setPhase(
      found.backup
        ? { name: "found", email: signedIn.email, backup: found.backup }
        : { name: "not-found", email: signedIn.email }
    );
  };

  const tryAnotherAccount = async () => {
    await drive.signOut();
    await signInAndSearch();
  };

  const restore = async (backup: RemoteBackup) => {
    setPhase({ name: "busy", label: "Restoring…" });
    const result = await runWelcomeBackRestore({
      raw: backup.raw,
      phone: backup.identity.registeredPhone,
      moveNumber,
    });
    await refreshFromStorage();
    if (!result.reminders.ok) {
      setPhase({ name: "error", message: "That backup couldn't be read. Nothing was changed." });
      return;
    }
    setPhase({ name: "done", result });
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      paddingTop: Platform.OS === "web" ? 16 : insets.top + 8,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    closeBtn: { padding: 8 },
    content: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      paddingBottom: Platform.OS === "web" ? 0 : insets.bottom,
    },
    title: {
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      textAlign: "center",
      marginTop: 16,
      marginBottom: 8,
    },
    message: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      marginBottom: 20,
      lineHeight: 20,
    },
    option: {
      width: "100%",
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      padding: 14,
      borderRadius: 12,
      backgroundColor: colors.muted,
      marginBottom: 10,
    },
    optionText: { flex: 1 },
    optionTitle: { fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground },
    optionHelp: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
      lineHeight: 18,
    },
    primaryBtn: {
      width: "100%",
      alignItems: "center",
      borderRadius: 14,
      paddingVertical: 14,
      marginTop: 10,
      backgroundColor: colors.primary,
    },
    primaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    linkBtn: { marginTop: 14, paddingVertical: 8 },
    linkBtnText: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.closeBtn} onPress={startFresh} testID="welcome-back-close">
          <Feather name="x" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <View style={styles.content}>
        {phase.name === "intro" && (
          <>
            <Feather name="refresh-cw" size={40} color={colors.primary} />
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.message}>
              Sign in with the Google account you backed up to, and we'll bring back your
              reminders — and your number, if you'd added one.
            </Text>
            <Pressable style={styles.primaryBtn} onPress={signInAndSearch} testID="welcome-back-signin">
              <Text style={styles.primaryBtnText}>Sign in with Google</Text>
            </Pressable>
            <Pressable style={styles.linkBtn} onPress={startFresh} testID="welcome-back-start-fresh">
              <Text style={styles.linkBtnText}>Start fresh instead</Text>
            </Pressable>
          </>
        )}

        {phase.name === "busy" && (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.message} testID="welcome-back-busy">
              {phase.label}
            </Text>
          </>
        )}

        {phase.name === "found" && (
          <>
            <Feather name="cloud" size={40} color={colors.primary} />
            <Text style={styles.title}>We found your backup</Text>
            <Text style={styles.message}>
              {phase.email} · backed up {backedUpAgo(phase.backup.modifiedTime)}
            </Text>
            <View style={styles.option} testID="welcome-back-reminders-option">
              {/* A statement, not a checkbox: restoring is this screen's whole
                  purpose (skip it with "Not now"); a number-only move already
                  lives in Settings. Only the number option is toggleable. */}
              <Feather name="download-cloud" size={20} color={colors.primary} />
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>
                  Restores {phase.backup.reminderCount}{" "}
                  {phase.backup.reminderCount === 1 ? "reminder" : "reminders"} and your settings
                </Text>
              </View>
            </View>
            {phase.backup.identity.registeredPhone && (
              <Pressable
                style={styles.option}
                onPress={() => setMoveNumber((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: moveNumber }}
                testID="welcome-back-number-option"
              >
                <Feather
                  name={moveNumber ? "check-square" : "square"}
                  size={20}
                  color={moveNumber ? colors.primary : colors.mutedForeground}
                />
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>
                    Move your number {maskPhone(phase.backup.identity.registeredPhone)} to this phone
                  </Text>
                  <Text style={styles.optionHelp}>
                    Reminders people send you will arrive here. Your old phone will be signed
                    out of reminders from others.
                  </Text>
                </View>
              </Pressable>
            )}
            <Pressable
              style={styles.primaryBtn}
              onPress={() => restore(phase.backup)}
              testID="welcome-back-restore"
            >
              <Text style={styles.primaryBtnText}>Restore</Text>
            </Pressable>
            <Pressable style={styles.linkBtn} onPress={startFresh} testID="welcome-back-start-fresh">
              <Text style={styles.linkBtnText}>Start fresh instead</Text>
            </Pressable>
          </>
        )}

        {phase.name === "not-found" && (
          <>
            <Feather name="cloud-off" size={40} color={colors.mutedForeground} />
            <Text style={styles.title}>No backup found</Text>
            <Text style={styles.message}>
              There's no Reminders backup in {phase.email}. If you saved a backup copy
              yourself, you can paste it in instead.
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.replace("/backup")}
              testID="welcome-back-import-file"
            >
              <Text style={styles.primaryBtnText}>Paste a saved backup</Text>
            </Pressable>
            <Pressable style={styles.linkBtn} onPress={tryAnotherAccount} testID="welcome-back-other-account">
              <Text style={styles.linkBtnText}>Try another Google account</Text>
            </Pressable>
            <Pressable style={styles.linkBtn} onPress={startFresh} testID="welcome-back-start-fresh">
              <Text style={styles.linkBtnText}>Start fresh</Text>
            </Pressable>
          </>
        )}

        {phase.name === "error" && (
          <>
            <Feather name="alert-circle" size={40} color={colors.destructive} />
            <Text style={styles.title}>Couldn't restore</Text>
            <Text style={styles.message} testID="welcome-back-error">
              {phase.message}
            </Text>
            <Pressable style={styles.primaryBtn} onPress={signInAndSearch} testID="welcome-back-retry">
              <Text style={styles.primaryBtnText}>Try again</Text>
            </Pressable>
            <Pressable style={styles.linkBtn} onPress={startFresh} testID="welcome-back-start-fresh">
              <Text style={styles.linkBtnText}>Start fresh instead</Text>
            </Pressable>
          </>
        )}

        {phase.name === "done" && (
          <>
            <Feather name="check-circle" size={40} color={colors.primary} />
            <Text style={styles.title}>You're back</Text>
            <Text style={styles.message} testID="welcome-back-done-message">
              {doneMessage(phase.result)}
            </Text>
            <Pressable style={styles.primaryBtn} onPress={goHome} testID="welcome-back-done">
              <Text style={styles.primaryBtnText}>Done</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function doneMessage({ reminders, number }: WelcomeBackResult): string {
  const added = reminders.ok ? reminders.added : 0;
  const restored = `${added} ${added === 1 ? "reminder" : "reminders"} restored.`;
  if (number.status === "failed") {
    return `${restored} Couldn't move your number — you can add it in Settings.`;
  }
  if (number.status === "moved") {
    const waiting = number.claimed.length;
    return waiting === 0
      ? `${restored} Your number now works on this phone.`
      : `${restored} Your number now works on this phone, and ${waiting} ${
          waiting === 1 ? "reminder is" : "reminders are"
        } waiting for you.`;
  }
  return restored;
}
