import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ConfirmSheet from "@/components/ConfirmSheet";
import QuickAddInput from "@/components/QuickAddInput";
import ReminderCard from "@/components/ReminderCard";
import RecurrencePreviewCard from "@/components/RecurrencePreviewCard";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { tabBarContentInset } from "@/constants/tabBar";
import { useReminders, type Reminder } from "@/contexts/RemindersContext";
import {
  clearPendingInviteNameAsk,
  getPendingInviteNameAsk,
  incrementRegisterPromptCount,
  isRecurring,
  isSendReminder,
  markRegisterPromptShown,
  shouldOfferNumberRegistration,
} from "@/services/ReminderService";
import { buildRecurrencePreviews, type RecurrencePreview } from "@/utils/recurrencePreviews";
import { useColors } from "@/hooks/useColors";
import { formatHeaderDate } from "@/utils/formatHeaderDate";
import { buildGreeting, greetingName, initialsFor } from "@/utils/greeting";
import { getFontFamily } from "@/utils/getFontFamily";
import { groupByDate } from "@/utils/groupByDate";
import NameSheet from "@/components/NameSheet";
import InviteNameAsk from "@/components/InviteNameAsk";
import NotificationNudge from "@/components/NotificationNudge";
import RegisterNumberNudge from "@/components/RegisterNumberNudge";
import { useTourTarget } from "@/contexts/TourContext";

// Distinguishes the two confirm sheets that share pendingDelete* state below:
// deleting one reminder vs. clearing every completed one at once.
type PendingDelete = { kind: "single"; id: string } | { kind: "clear-completed" };

/**
 * How many reminders a user saves before the app offers to take their number.
 * The offer is about being reachable by other people, which is worth nothing
 * to someone who has not yet decided the app is worth keeping. Three saved
 * reminders is the cheapest available evidence that they have.
 */
export const REMINDERS_BEFORE_NUMBER_OFFER = 3;

/** How many upcoming occurrences a recurring series previews on the home screen. */
export const PREVIEW_COUNT = 2;

type UpcomingItem = Reminder | RecurrencePreview;

function isPreviewItem(item: UpcomingItem): item is RecurrencePreview {
  return "kind" in item && item.kind === "recurrence-preview";
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    reminders,
    deleteReminder,
    deleteReminders,
    skipOccurrence,
    loading,
    userName,
    setUserName,
  } = useReminders();
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [nameSheetVisible, setNameSheetVisible] = useState(false);
  const insightsTourRef = useTourTarget("header-insights-button");

  const { upcomingGroups, upcomingCount, sending, completed } = useMemo(() => {
    const byDateAsc = (a: Reminder, b: Reminder) =>
      new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
    // Sending and Upcoming partition the incomplete reminders, so nothing can
    // appear in two sections. Completed keeps everything, send or not, so a
    // sent reminder stays where the user expects to find it.
    const incomplete = reminders.filter((r) => !r.completed);
    const sending = incomplete.filter(isSendReminder).sort(byDateAsc);
    const upcoming = incomplete.filter((r) => !isSendReminder(r)).sort(byDateAsc);
    const completed = reminders
      .filter((r) => r.completed)
      .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());

    // Read-only preview cards for a recurring series' next couple of
    // occurrences — generated for every recurring reminder regardless of
    // whether today's occurrence is still pending or was just completed, so
    // the series doesn't visually vanish from the calendar the moment it's
    // checked off for the day. See utils/recurrencePreviews.ts.
    const recurringSources = reminders.filter((r) => isRecurring(r) && !isSendReminder(r));
    const previews = recurringSources.flatMap((r) => buildRecurrencePreviews(r, PREVIEW_COUNT));

    // Today / Tomorrow / named weekdays for the rest of the week / Later —
    // an ever-growing flat list stopped scanning like a calendar once there
    // were more than a handful of reminders.
    const upcomingGroups = groupByDate<UpcomingItem>(
      [...upcoming, ...previews],
      (item) => new Date(item.datetime)
    );
    return { upcomingGroups, upcomingCount: upcoming.length, sending, completed };
  }, [reminders]);

  // Stable across renders (see ReminderCard's React.memo) so passing this
  // down doesn't defeat memoization for every card whenever HomeScreen
  // re-renders for an unrelated reason.
  const handleDelete = useCallback((id: string) => {
    setPendingDelete({ kind: "single", id });
  }, []);

  const handleClearCompleted = () => {
    setPendingDelete({ kind: "clear-completed" });
  };

  const handleConfirmDelete = async () => {
    if (pendingDelete?.kind === "single") {
      await deleteReminder(pendingDelete.id);
    } else if (pendingDelete?.kind === "clear-completed") {
      await deleteReminders(completed.map((r) => r.id));
    }
    setPendingDelete(null);
  };

  // B22: for a recurring reminder, "skip this occurrence" is a distinct
  // choice from deleting the whole series - it advances the series past
  // today rather than ending it. Only reachable when pendingDelete is
  // "single" and that reminder is recurring (see the ConfirmSheet's
  // extraLabel/onExtra below, which only render together).
  const handleSkipOccurrence = async () => {
    if (pendingDelete?.kind === "single") {
      await skipOccurrence(pendingDelete.id);
    }
    setPendingDelete(null);
  };

  const handleCancelDelete = () => {
    setPendingDelete(null);
  };

  const pendingDeleteReminder =
    pendingDelete?.kind === "single"
      ? reminders.find((r) => r.id === pendingDelete.id)
      : undefined;
  const pendingDeleteIsRecurring = !!pendingDeleteReminder && isRecurring(pendingDeleteReminder);

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 400));
    setRefreshing(false);
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 16,
      paddingHorizontal: 20,
      paddingBottom: 12,
      backgroundColor: colors.background,
    },
    headerTitle: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    headerSubtitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 2,
      flexWrap: "wrap",
    },
    headerSubtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    // flex so the title block yields space to the avatar rather than pushing
    // it off-screen once the date sits alongside the title.
    headerTitleBlock: {
      flex: 1,
    },
    headerAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: userName ? colors.primary + "1A" : colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    // Same size as the avatar so the two sit level, and separated from it
    // (rather than merged into one control) since they open unrelated
    // things - a name edit vs. a whole screen - and a merged control would
    // need to guess which one a tap meant.
    headerInsightsBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
    },
    headerAvatarText: {
      fontSize: 14,
      color: colors.primary,
    },
    headerAddName: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      marginTop: 2,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 4,
      // The tab bar floats over this list, so the padding must clear the bar
      // itself, not just the gesture area under it.
      paddingBottom: tabBarContentInset(insets.bottom),
    },
    sectionLabel: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 10,
      marginTop: 6,
    },
    emptyWrap: {
      alignItems: "center",
      paddingTop: 60,
      paddingHorizontal: 24,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    emptyTitle: {
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 6,
    },
    emptyText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 20,
    },
    loadingWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
      marginTop: 6,
    },
    sectionHeaderLabel: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    sectionCount: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      backgroundColor: colors.primary + "18",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    sectionHeaderRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    clearCompletedText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.destructive,
    },
    // Small per-group label inside Upcoming (Today/Tomorrow/weekday/Later) —
    // deliberately smaller and unstyled-as-a-badge compared to sectionHeaderLabel,
    // since these are sub-groups of one section rather than section headers
    // themselves.
    numberOfferWrap: {
      marginTop: 16,
    },
    dateGroupLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      marginBottom: 6,
      marginTop: 10,
    },
  });

  // The offer to register the user's own number, once they have a habit.
  // Null means nothing on screen; the flag is not persisted, because
  // shouldOfferNumberRegistration() already owns the across-install decision
  // and a second store of it could disagree with the first.
  const [numberOffer, setNumberOffer] = useState(false);
  // The offer is counted when it is SHOWN, so this guards against the effect
  // spending a second one on a re-render.
  const offerCheckedRef = useRef(false);

  useEffect(() => {
    if (loading || offerCheckedRef.current) return;
    if (reminders.length < REMINDERS_BEFORE_NUMBER_OFFER) return;
    offerCheckedRef.current = true;
    let live = true;
    (async () => {
      if (!(await shouldOfferNumberRegistration())) return;
      markRegisterPromptShown();
      await incrementRegisterPromptCount();
      if (live) setNumberOffer(true);
    })();
    return () => {
      live = false;
    };
  }, [loading, reminders.length]);

  // Frame I3 of the first-run study. An invited install skips the first-run
  // name sheet, so the ask lands here instead - after the friend's reminder
  // is on screen, where it can name the person who will read the answer.
  //
  // Keyed on the reminder count because accepting an invitation is what adds
  // one: this tab stays mounted under the preview, so a mount-only check
  // would never see the accept that wrote the ask.
  const [inviteNameAsk, setInviteNameAsk] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    let live = true;
    void getPendingInviteNameAsk().then((sender) => {
      // A name typed in the meantime answers the question already.
      if (live) setInviteNameAsk(sender !== null && userName.trim() === "" ? sender : null);
    });
    return () => {
      live = false;
    };
  }, [loading, reminders.length, userName]);

  const settleInviteNameAsk = useCallback(() => {
    setInviteNameAsk(null);
    void clearPendingInviteNameAsk();
  }, []);

  // Dismissal lasts for this mount only. The banner is not an advert: it
  // describes a live fault, so it comes back on the next launch while the
  // fault does, and disappears for good the moment permission is granted.
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const hasMissedRing = useMemo(
    () =>
      reminders.some(
        (r) => !r.completed && new Date(r.datetime).getTime() < Date.now()
      ),
    [reminders]
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingWrap]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const hasAny = reminders.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitleBlock}>
            {/* Someone who skipped onboarding keeps a permanent way in - the
                prompt is a one-time ask, so without this the name could
                never be set from the screen that shows it. */}
            <Pressable
              onPress={() => setNameSheetVisible(true)}
              disabled={!!userName}
              hitSlop={8}
              accessibilityRole={userName ? undefined : "button"}
              accessibilityLabel={userName ? undefined : "Add your name"}
              testID="header-greeting-press"
            >
              <Text
                style={[
                  styles.headerTitle,
                  { fontFamily: getFontFamily(userName, "700Bold") },
                ]}
                numberOfLines={1}
                // Shrinks before it truncates. The greeting already uses the
                // first name only, so this is the last resort for an unusually
                // long one rather than the normal case.
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                testID="header-greeting"
              >
                {userName ? buildGreeting(userName, new Date()) : "Hi there"}
              </Text>
            </Pressable>
            {/* The date moved down here so the greeting owns the full width.
                Sharing a row with it is what truncated "Good morning, Anand"
                to "Good morn.." on a normal-width phone. */}
            {/* Siblings rather than nested Text children: a nested run makes
                the whole subtitle one text node, and every by-text query for
                the count stops matching. */}
            <View style={styles.headerSubtitleRow}>
              <Text style={styles.headerSubtitle} testID="header-date">
                {formatHeaderDate(new Date())}
              </Text>
              <Text style={styles.headerSubtitle}>·</Text>
              {/* Counts BOTH sections: they partition the incomplete
                  reminders, so counting only `upcoming` would under-report
                  the moment a send reminder exists. The count must survive the
                  unnamed state - it is the only status on this screen, and
                  trading it for the name prompt would make the app LESS useful
                  to the user who skipped onboarding. */}
              <Text style={styles.headerSubtitle}>
                {upcomingCount + sending.length === 0
                  ? userName
                    ? `All caught up, ${greetingName(userName)}!`
                    : "All caught up!"
                  : `${upcomingCount + sending.length} upcoming`}
              </Text>
            </View>
          </View>
          <Pressable
            ref={insightsTourRef}
            style={styles.headerInsightsBtn}
            onPress={() => router.push("/insights")}
            accessibilityRole="button"
            accessibilityLabel="How you're doing"
            hitSlop={6}
            testID="header-insights-button"
          >
            <Feather name="bar-chart-2" size={17} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            style={styles.headerAvatar}
            onPress={() => setNameSheetVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={userName ? "Edit your name" : "Add your name"}
            testID="header-avatar"
          >
            {!userName ? (
              <Feather name="user-plus" size={17} color={colors.mutedForeground} />
            ) : (
              <Text
                style={[
                  styles.headerAvatarText,
                  { fontFamily: getFontFamily(userName, "600SemiBold") },
                ]}
                testID="header-initials"
              >
                {initialsFor(userName)}
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      <QuickAddInput />

      <KeyboardAwareScrollViewCompat
        testID="home-scroll"
        contentContainerStyle={[styles.scrollContent, !hasAny && { flexGrow: 1 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!nudgeDismissed && (
          <NotificationNudge
            hasMissedRing={hasMissedRing}
            onDismiss={() => setNudgeDismissed(true)}
          />
        )}

        {!hasAny ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Feather name="bell" size={28} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No reminders yet</Text>
            <Text style={styles.emptyText}>
              Type above to add your first reminder — try "Call dentist tomorrow at 3pm".
            </Text>
          </View>
        ) : (
          <>
            {upcomingGroups.length > 0 && (
              <>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeaderLabel}>Upcoming</Text>
                  <Text style={styles.sectionCount}>{upcomingCount}</Text>
                </View>
                {/* Today / Tomorrow / named weekdays for the rest of the week
                    / Later, instead of one flat list — see utils/groupByDate.
                    Each group gets its own small date label so the section
                    still reads as a calendar once there are more than a
                    handful of reminders. */}
                {upcomingGroups.map((group) => (
                  <View key={`${group.key}-${group.items[0]?.id}`}>
                    <Text style={styles.dateGroupLabel}>{group.label}</Text>
                    {group.items.map((item) =>
                      isPreviewItem(item) ? (
                        <RecurrencePreviewCard key={item.id} preview={item} />
                      ) : (
                        <ReminderCard key={item.id} reminder={item} onDelete={handleDelete} />
                      )
                    )}
                  </View>
                ))}
              </>
            )}

            {sending.length > 0 && (
              <>
                <View
                  style={[
                    styles.sectionHeaderRow,
                    { marginTop: upcomingCount > 0 ? 12 : 6 },
                  ]}
                >
                  <Text style={styles.sectionHeaderLabel}>Remind Someone</Text>
                  <Text style={styles.sectionCount}>{sending.length}</Text>
                </View>
                {sending.map((r) => (
                  <ReminderCard key={r.id} reminder={r} onDelete={handleDelete} />
                ))}
              </>
            )}

            {completed.length > 0 && (
              <>
                <View
                  style={[
                    styles.sectionHeaderRow,
                    {
                      marginTop:
                        upcomingCount > 0 || sending.length > 0 ? 12 : 6,
                    },
                  ]}
                >
                  <Text style={styles.sectionHeaderLabel}>Completed</Text>
                  <View style={styles.sectionHeaderRight}>
                    <Text style={styles.sectionCount}>{completed.length}</Text>
                    <Pressable
                      onPress={handleClearCompleted}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Delete all completed reminders"
                      testID="clear-completed-button"
                    >
                      <Text style={styles.clearCompletedText}>Clear all</Text>
                    </Pressable>
                  </View>
                </View>
                {completed.map((r) => (
                  <ReminderCard key={r.id} reminder={r} onDelete={handleDelete} />
                ))}
              </>
            )}
          </>
        )}

        {/* Under the list, not over it: the reminders are what the user came
            for, and an offer above them would be read as the app interrupting
            its own answer. */}
        {numberOffer && (
          <View style={styles.numberOfferWrap}>
            <RegisterNumberNudge
              reason="milestone"
              onDismiss={() => setNumberOffer(false)}
            />
          </View>
        )}

        {inviteNameAsk !== null && (
          <InviteNameAsk
            senderName={inviteNameAsk}
            onSettled={settleInviteNameAsk}
            onSave={setUserName}
          />
        )}
      </KeyboardAwareScrollViewCompat>

      <NameSheet
        visible={nameSheetVisible}
        initialName={userName}
        onSave={async (name) => {
          await setUserName(name);
          setNameSheetVisible(false);
        }}
        onDismiss={() => setNameSheetVisible(false)}
      />

      <ConfirmSheet
        visible={pendingDelete !== null}
        title={pendingDelete?.kind === "clear-completed" ? "Delete All Completed" : "Delete Reminder"}
        message={
          pendingDelete?.kind === "clear-completed"
            ? `Are you sure you want to delete all ${completed.length} completed reminder${completed.length === 1 ? "" : "s"}? This can't be undone.`
            : pendingDeleteIsRecurring
              ? "This reminder repeats. Skip just today's occurrence, or delete the whole series?"
              : "Are you sure you want to delete this reminder?"
        }
        confirmLabel={pendingDeleteIsRecurring ? "Delete Series" : "Delete"}
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        extraLabel={pendingDeleteIsRecurring ? "Skip This Occurrence" : undefined}
        onExtra={pendingDeleteIsRecurring ? handleSkipOccurrence : undefined}
      />
    </View>
  );
}
