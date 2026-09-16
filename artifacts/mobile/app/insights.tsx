import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";
import { getFontFamily } from "@/utils/getFontFamily";
import {
  formatHourRange,
  formatRate,
  formatSlip,
  headlineFor,
  hourAdviceBlocker,
  stuckHeadline,
  WEEKDAY_LABELS,
} from "@/utils/adherenceCopy";
import { computeAdherenceStats } from "@/utils/adherenceStats";

/**
 * "How you're doing" -- the one place the app reports the user's own
 * adherence back to them.
 *
 * Two rules shape every cell on this screen. First, no number appears before
 * its sample supports it: `computeAdherenceStats` returns null rather than a
 * confident-looking fraction, and the copy helpers render that as an em dash
 * and an explanation of what is still missing. Second, nothing here blames.
 * A screen about missed tasks is easy to make unpleasant, and an unpleasant
 * screen gets avoided by exactly the users it exists for.
 */
export default function InsightsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { reminders } = useReminders();

  // Recomputed only when the reminder list actually changes: the whole list is
  // walked here, and the home screen re-renders on every tick of its clock.
  const stats = useMemo(() => computeAdherenceStats(reminders), [reminders]);

  const blocker = hourAdviceBlocker(stats);
  const slip = formatSlip(stats.medianSlipMinutes);
  const weekdayPeak = Math.max(...stats.byWeekday.map((b) => b.scored), 1);

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    headerTitle: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    content: { paddingHorizontal: 20, paddingBottom: insets.bottom + 24 },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radiusCard,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 12,
    },
    headline: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      lineHeight: 22,
    },
    bigRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 14 },
    big: { fontSize: 40, fontFamily: "Inter_700Bold", color: colors.primary },
    bigCaption: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      flex: 1,
      lineHeight: 18,
    },
    label: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    body: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 19,
      marginTop: 6,
    },
    statRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 14,
    },
    stat: { flex: 1, alignItems: "center" },
    statValue: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    statLabel: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 3,
      textAlign: "center",
    },
    hourRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 12,
    },
    hourText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      flex: 1,
    },
    hourRate: {
      fontSize: 14,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    bars: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 6,
      height: 92,
      marginTop: 16,
    },
    barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
    barTrack: {
      width: "100%",
      borderRadius: 5,
      backgroundColor: colors.muted,
      justifyContent: "flex-end",
      overflow: "hidden",
    },
    barFill: { width: "100%", backgroundColor: colors.primary },
    barLabel: {
      fontSize: 10,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginTop: 6,
    },
    stuckRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    stuckTitle: { fontSize: 14, color: colors.foreground, flex: 1 },
    stuckCount: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.warningSurfaceForeground,
      backgroundColor: colors.warningSurface,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: colors.radiusCapsule,
      overflow: "hidden",
    },
    linkRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    empty: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 21,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="insights-back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>How you&apos;re doing</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        testID="insights-scroll"
      >
        <View style={styles.card}>
          <Text style={styles.headline} testID="insights-headline">
            {headlineFor(stats)}
          </Text>
          {stats.scored > 0 && (
            <View style={styles.bigRow}>
              <Text style={styles.big} testID="insights-rate">
                {formatRate(stats.completionRate)}
              </Text>
              <Text style={styles.bigCaption}>
                {stats.completed} of {stats.scored} reminders finished.
                {stats.pending > 0 ? ` ${stats.pending} still ahead of you.` : ""}
              </Text>
            </View>
          )}
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue} testID="insights-streak">
                {stats.streakDays}
              </Text>
              <Text style={styles.statLabel}>
                day{stats.streakDays === 1 ? "" : "s"} clean
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue} testID="insights-on-time">
                {stats.onTime}
              </Text>
              <Text style={styles.statLabel}>on time</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue} testID="insights-postponed">
                {stats.totalSnoozes}
              </Text>
              <Text style={styles.statLabel}>postponements</Text>
            </View>
          </View>
        </View>

        {/* Times of day. The screen's one actionable finding, so it sits high
            and states plainly when it has nothing trustworthy to say. */}
        <View style={styles.card}>
          <Text style={styles.label}>Your times of day</Text>
          {stats.bestHour && stats.worstHour ? (
            <>
              <Text style={styles.body}>
                Reminders you set for these hours end very differently.
              </Text>
              <View style={styles.hourRow} testID="insights-best-hour">
                <Feather name="trending-up" size={16} color={colors.success} />
                <Text style={styles.hourText}>{formatHourRange(stats.bestHour.hour)}</Text>
                <Text style={styles.hourRate}>{formatRate(stats.bestHour.rate)}</Text>
              </View>
              <View style={styles.hourRow} testID="insights-worst-hour">
                <Feather name="trending-down" size={16} color={colors.destructive} />
                <Text style={styles.hourText}>{formatHourRange(stats.worstHour.hour)}</Text>
                <Text style={styles.hourRate}>{formatRate(stats.worstHour.rate)}</Text>
              </View>
              <Text style={styles.body}>
                When you set a reminder for a weak hour, the app offers the
                strong one instead. You always decide.
              </Text>
            </>
          ) : (
            <Text style={[styles.body, styles.empty]} testID="insights-hour-blocker">
              {blocker}
            </Text>
          )}
        </View>

        {/* Weekday load, not weekday rate: the useful question here is which
            days the user is loading up, which is what they can change. */}
        {stats.scored > 0 && (
          <View style={styles.card}>
            <Text style={styles.label}>Your week</Text>
            <Text style={styles.body}>How many reminders came due on each day.</Text>
            <View style={styles.bars} testID="insights-weekday-bars">
              {stats.byWeekday.map((bucket) => {
                const height = Math.round((bucket.scored / weekdayPeak) * 62);
                return (
                  <View key={bucket.key} style={styles.barCol}>
                    <View style={[styles.barTrack, { height: 62 }]}>
                      <View style={[styles.barFill, { height: Math.max(height, 2) }]} />
                    </View>
                    <Text style={styles.barLabel}>{WEEKDAY_LABELS[bucket.key]}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {slip !== null && (
          <View style={styles.card}>
            <Text style={styles.label}>How far things slide</Text>
            <Text style={styles.body}>
              A task you finish typically lands{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                {slip}
              </Text>{" "}
              after the time you first set. That gap is the cost of postponing,
              measured on your own tasks.
            </Text>
          </View>
        )}

        {stats.stuck.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.label} testID="insights-stuck-headline">
              {stuckHeadline(stats.stuck.length)}
            </Text>
            <Text style={styles.body}>
              Each of these was postponed three times or more. A task that
              keeps moving usually needs a smaller first step, not another
              alert.
            </Text>
            {stats.stuck.map((r) => (
              <Pressable
                key={r.id}
                style={styles.stuckRow}
                onPress={() => router.push(`/reminder-detail?id=${r.id}`)}
                testID={`insights-stuck-${r.id}`}
              >
                <Text
                  style={[styles.stuckTitle, { fontFamily: getFontFamily(r.title, "500Medium") }]}
                  numberOfLines={1}
                >
                  {r.title}
                </Text>
                <Text style={styles.stuckCount}>
                  {r.snoozeCount}&#215; moved
                </Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        )}

        <Pressable
          style={styles.card}
          onPress={() => router.push("/why-tasks-slip")}
          testID="insights-why-tasks-slip"
        >
          <View style={styles.linkRow}>
            <Feather name="help-circle" size={18} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Why tasks slip</Text>
              <Text style={styles.body}>
                What the research says about putting things off
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}
