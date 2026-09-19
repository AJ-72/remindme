import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ConfirmSheet from "@/components/ConfirmSheet";
import SnoozeSheet from "@/components/SnoozeSheet";
import { useReminders } from "@/contexts/RemindersContext";
import { applySuggestedHour, formatHourRange } from "@/utils/adherenceCopy";
import { computeAdherenceStats, STUCK_SNOOZE_THRESHOLD } from "@/utils/adherenceStats";
import { useColors } from "@/hooks/useColors";
import { isSendReminder } from "@/services/ReminderService";
import { formatDatetime } from "@/utils/formatDatetime";
import { getFontFamily } from "@/utils/getFontFamily";
import { computeNextOccurrence, describeRecurrence } from "@/utils/recurrence";
import type { SnoozePreset } from "@/utils/snoozePresets";

function goBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/(tabs)");
  }
}

export default function ReminderDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    reminders,
    loading,
    toggleComplete,
    snoozeReminder,
    deleteReminder,
    snoozePreset,
    setSnoozePreset,
    editReminder,
    markOpened,
  } = useReminders();
  const { id, openSnooze } = useLocalSearchParams<{
    id: string;
    openSnooze?: string;
  }>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Opens straight to the sheet when arriving from the notification's "More…"
  // action, which exists precisely because the tray can't show the presets.
  const [snoozeSheetVisible, setSnoozeSheetVisible] = useState(openSnooze === "1");

  const reminder = reminders.find((r) => r.id === id);

  // Keyed on `id` alone, not on `reminder` or `reminders`: this must fire
  // once when the screen is opened for this id, not again on every state
  // update the screen's own actions cause (marking done, editing the alarm
  // toggle) while the user is still looking at it.
  useEffect(() => {
    if (id) markOpened(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /**
   * A reminder past the postponement threshold is not mis-timed, it is being
   * avoided -- and another alert at another hour is the one response that has
   * already been tried and failed. The panel below offers the two things that
   * do move an avoided task: a smaller first step, and the user's own
   * strongest hour.
   */
  const snoozes = reminder?.snoozeCount ?? 0;
  const isStuck = !!reminder && !reminder.completed && snoozes >= STUCK_SNOOZE_THRESHOLD;
  const stuckStats = useMemo(
    () => (isStuck ? computeAdherenceStats(reminders) : null),
    [isStuck, reminders]
  );
  const strongHour = stuckStats?.bestHour ?? null;

  // The one place a user can verify a rule means what they think before
  // trusting it overnight. The card's own upcoming datetime IS the first of
  // the three (matching the mockup: "Today · 8:00 AM" and "Next 3" both
  // start from the same occurrence) — the other two come from walking
  // computeNextOccurrence (Task 1) forward twice more.
  const nextOccurrences = useMemo(() => {
    if (!reminder?.recurrence) return [];
    const dates: Date[] = [new Date(reminder.datetime)];
    let from = dates[0];
    for (let i = 0; i < 2; i++) {
      from = computeNextOccurrence(reminder.recurrence, from);
      dates.push(from);
    }
    return dates;
  }, [reminder?.recurrence, reminder?.datetime]);

  const handleMoveToStrongHour = async () => {
    if (!reminder || !strongHour) return;
    const moved = applySuggestedHour(new Date(reminder.datetime), strongHour.hour);
    // Spread the whole record: editReminder replaces the reminder's data, so
    // dropping a field here would quietly clear the recipient or the sender.
    const { id: _id, completed: _c, notificationId: _n, ...rest } = reminder;
    await editReminder(reminder.id, { ...rest, datetime: moved.toISOString() });
  };

  const handleMarkDone = async () => {
    await toggleComplete(id);
    goBack();
  };

  const handleSnooze = () => {
    setSnoozeSheetVisible(true);
  };

  // Per-reminder override of the Settings default. Goes through editReminder
  // so the notification is cancelled and re-armed on the new API -- writing
  // the field alone would leave the old, already-registered alarm in place.
  // `exactTiming` keeps its original polarity in storage; only the switch
  // below negates it for display, to match the Settings screen's "Do not use
  // Android Alarm feature" framing.
  const handleToggleExactTiming = async (value: boolean) => {
    if (!reminder) return;
    const { id: _id, completed, notificationId, ...rest } = reminder;
    await editReminder(reminder.id, { ...rest, exactTiming: value });
  };

  const handleToggleDisableExactAlarm = (disable: boolean) =>
    handleToggleExactTiming(!disable);

  const handleSelectSnoozePreset = async (preset: SnoozePreset) => {
    setSnoozeSheetVisible(false);
    // The chosen preset becomes the new default, so the notification-tray
    // button converges on whatever the user actually uses.
    await setSnoozePreset(preset);
    await snoozeReminder(id, preset);
    goBack();
  };

  const handleEdit = () => {
    router.push({ pathname: "/add-reminder", params: { id } });
  };

  const handleDelete = () => {
    setConfirmingDelete(true);
  };

  const handleConfirmDelete = async () => {
    setConfirmingDelete(false);
    await deleteReminder(id);
    goBack();
  };

  const handleCancelDelete = () => {
    setConfirmingDelete(false);
  };

  const styles = StyleSheet.create({
    stuckCard: {
      backgroundColor: colors.warningSurface,
      borderRadius: colors.radiusCard,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginTop: 16,
      gap: 8,
    },
    stuckHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    stuckTitle: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.warningSurfaceForeground,
      flex: 1,
    },
    stuckBody: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.warningSurfaceForeground,
      lineHeight: 19,
    },
    stuckActions: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 2 },
    stuckBtn: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: colors.radiusCapsule,
      backgroundColor: colors.primary,
    },
    stuckBtnText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    stuckBtnGhost: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: colors.radiusCapsule,
      borderWidth: 1,
      borderColor: colors.warningSurfaceForeground,
    },
    stuckBtnGhostText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.warningSurfaceForeground,
    },
    stuckLink: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      marginTop: 2,
    },
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    content: {
      flex: 1,
      padding: 20,
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20,
    },
    loadingWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: 22,
      color: colors.foreground,
      marginBottom: 8,
    },
    description: {
      fontSize: 15,
      color: colors.mutedForeground,
      marginBottom: 12,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 24,
    },
    timeRowWithRepeat: {
      marginBottom: 6,
    },
    timeText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    timeChangeText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 20,
    },
    repeatRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 8,
    },
    nextOccurrencesText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 20,
    },
    settingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 16,
      borderRadius: 12,
      backgroundColor: colors.muted,
    },
    settingLabel: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    settingSubLabel: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    actionsWrap: { gap: 12 },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 14,
      paddingVertical: 14,
    },
    primaryBtn: { backgroundColor: colors.primary },
    secondaryBtn: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    destructiveBtn: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.destructiveBorder,
    },
    primaryBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    secondaryBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    destructiveBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.destructive,
    },
    handledWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    handledText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textAlign: "center",
      marginBottom: 16,
    },
    handledLinkText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.closeBtn} onPress={goBack} testID="close-button">
          <Feather name="x" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Reminder</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
            testID="loading-indicator"
          />
        </View>
      ) : !reminder || reminder.completed ? (
        <View style={styles.handledWrap}>
          <Text style={styles.handledText}>
            This reminder was already completed or removed.
          </Text>
          <Pressable onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.handledLinkText}>Back to list</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.content}>
          <Text style={[styles.title, { fontFamily: getFontFamily(reminder.title, "700Bold") }]}>
            {reminder.title}
          </Text>
          {!!reminder.description && (
            <Text
              style={[
                styles.description,
                { fontFamily: getFontFamily(reminder.description, "400Regular") },
              ]}
            >
              {reminder.description}
            </Text>
          )}
          <View style={[styles.timeRow, !!reminder.recurrence && styles.timeRowWithRepeat]}>
            <Feather name="clock" size={14} color={colors.mutedForeground} />
            <Text style={styles.timeText}>{formatDatetime(reminder.datetime)}</Text>
          </View>

          {reminder.recurrence && (
            <View style={styles.repeatRow} testID="repeat-detail">
              <Feather name="repeat" size={14} color={colors.mutedForeground} />
              <Text style={styles.timeText}>
                {describeRecurrence(reminder.recurrence, new Date(reminder.datetime))}
              </Text>
            </View>
          )}

          {nextOccurrences.length > 0 && (
            <Text style={styles.nextOccurrencesText} testID="repeat-next-occurrences">
              Next 3:{" "}
              {nextOccurrences
                .map((d) =>
                  d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
                )
                .join(" · ")}
            </Text>
          )}

          {isSendReminder(reminder) && reminder.recipientTimeChange && (
            <Text style={styles.timeChangeText} testID="recipient-time-change-text">
              {reminder.recipientTimeChange.by} moved this from{" "}
              {formatDatetime(reminder.recipientTimeChange.from)} to{" "}
              {formatDatetime(reminder.recipientTimeChange.to)}.
            </Text>
          )}

          {isStuck && (
            <View style={styles.stuckCard} testID="stuck-panel">
              <View style={styles.stuckHeaderRow}>
                <Feather
                  name="rotate-ccw"
                  size={16}
                  color={colors.warningSurfaceForeground}
                />
                <Text style={styles.stuckTitle} testID="stuck-panel-count">
                  You have moved this {snoozes} times
                </Text>
              </View>
              <Text style={styles.stuckBody}>
                A task that keeps moving is usually too big to start, not badly
                timed. Edit the title into the smallest first step you could
                finish in two minutes.
              </Text>
              <View style={styles.stuckActions}>
                <Pressable
                  style={styles.stuckBtn}
                  onPress={() => router.push(`/add-reminder?id=${reminder.id}`)}
                  testID="stuck-shrink-button"
                >
                  <Text style={styles.stuckBtnText}>Make it smaller</Text>
                </Pressable>
                {/* Only offered when the user's own history actually names a
                    strong hour -- otherwise this is a guess dressed as data. */}
                {strongHour && (
                  <Pressable
                    style={styles.stuckBtnGhost}
                    onPress={handleMoveToStrongHour}
                    testID="stuck-move-button"
                  >
                    <Text style={styles.stuckBtnGhostText}>
                      Try {formatHourRange(strongHour.hour)}
                    </Text>
                  </Pressable>
                )}
              </View>
              <Pressable
                onPress={() => router.push("/why-tasks-slip")}
                testID="stuck-why-link"
              >
                <Text style={styles.stuckLink}>Why tasks slip</Text>
              </Pressable>
            </View>
          )}

          {/* Completed reminders have nothing pending to re-arm, so the
              control would be inert -- hidden rather than shown disabled. */}
          {!reminder.completed && (
            <View style={styles.settingRow}>
              <Feather
                name={reminder.exactTiming === false ? "watch" : "clock"}
                size={14}
                color={
                  reminder.exactTiming === false
                    ? colors.mutedForeground
                    : colors.primary
                }
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Do not use Android Alarm feature</Text>
                <Text style={styles.settingSubLabel}>
                  {reminder.exactTiming === false
                    ? "Your phone may delay this by several minutes"
                    : "Fires at exactly the time you set"}
                </Text>
              </View>
              <Switch
                testID="detail-exact-timing-switch"
                value={reminder.exactTiming === false}
                onValueChange={handleToggleDisableExactAlarm}
                trackColor={{ false: colors.muted, true: colors.primary + "66" }}
                thumbColor={
                  reminder.exactTiming === false
                    ? colors.primary
                    : colors.mutedForeground
                }
              />
            </View>
          )}

          <View style={styles.actionsWrap}>
            <Pressable
              style={[styles.actionBtn, styles.primaryBtn]}
              onPress={handleMarkDone}
              testID="mark-done-button"
            >
              <Feather name="check" size={16} color={colors.primaryForeground} />
              <Text style={styles.primaryBtnText}>Mark Done</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn]}
              onPress={handleSnooze}
              testID="snooze-button"
            >
              <Feather name="clock" size={16} color={colors.foreground} />
              <Text style={styles.secondaryBtnText}>Snooze</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn]}
              onPress={handleEdit}
              testID="edit-button"
            >
              <Feather name="edit-2" size={16} color={colors.foreground} />
              <Text style={styles.secondaryBtnText}>Edit</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.destructiveBtn]}
              onPress={handleDelete}
              testID="delete-button"
            >
              <Feather name="trash-2" size={16} color={colors.destructive} />
              <Text style={styles.destructiveBtnText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      )}

      <ConfirmSheet
        visible={confirmingDelete}
        title="Delete Reminder"
        message="Are you sure you want to delete this reminder?"
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      <SnoozeSheet
        visible={snoozeSheetVisible}
        current={snoozePreset}
        onSelect={handleSelectSnoozePreset}
        onCancel={() => setSnoozeSheetVisible(false)}
      />
    </View>
  );
}
