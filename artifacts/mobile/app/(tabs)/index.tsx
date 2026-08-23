import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
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
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useReminders, type Reminder } from "@/contexts/RemindersContext";
import { isSendReminder } from "@/services/ReminderService";
import { useColors } from "@/hooks/useColors";
import { formatHeaderDate } from "@/utils/formatHeaderDate";
import { buildGreeting, initialsFor } from "@/utils/greeting";
import { getFontFamily } from "@/utils/getFontFamily";
import NameSheet from "@/components/NameSheet";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { reminders, deleteReminder, loading, userName, setUserName } =
    useReminders();
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [nameSheetVisible, setNameSheetVisible] = useState(false);

  const { upcoming, sending, completed } = useMemo(() => {
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
    return { upcoming, sending, completed };
  }, [reminders]);

  const handleDelete = (id: string) => {
    setPendingDeleteId(id);
  };

  const handleConfirmDelete = async () => {
    if (pendingDeleteId) await deleteReminder(pendingDeleteId);
    setPendingDeleteId(null);
  };

  const handleCancelDelete = () => {
    setPendingDeleteId(null);
  };

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
    headerSubtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
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
    headerTitleRow: {
      flexDirection: "row",
      // baseline, not center: the date is much smaller than the title, and
      // centering it against a 28px word makes it look like it's floating.
      alignItems: "baseline",
      gap: 8,
    },
    headerDate: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      // Lets the date shrink before the title does if the row runs out of room.
      flexShrink: 1,
    },
    headerAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: userName ? colors.primary + "1A" : colors.muted,
      alignItems: "center",
      justifyContent: "center",
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
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20,
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
  });

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
            <View style={styles.headerTitleRow}>
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
                style={styles.headerTitleBlock}
              >
                <Text
                  style={[
                    styles.headerTitle,
                    { fontFamily: getFontFamily(userName, "700Bold") },
                  ]}
                  numberOfLines={1}
                  testID="header-greeting"
                >
                  {userName ? buildGreeting(userName, new Date()) : "Hi there"}
                </Text>
              </Pressable>
              <Text style={styles.headerDate} testID="header-date">
                {formatHeaderDate(new Date())}
              </Text>
            </View>
            <Text style={styles.headerSubtitle}>
              {/* Counts BOTH sections: they partition the incomplete
                  reminders, so counting only `upcoming` would under-report
                  the moment a send reminder exists. The count must survive the
                  unnamed state - it is the only status on this screen, and
                  trading it for the name prompt would make the app LESS useful
                  to the user who skipped onboarding. */}
              {upcoming.length + sending.length === 0
                ? userName
                  ? `All caught up, ${userName}!`
                  : "All caught up!"
                : `${upcoming.length + sending.length} upcoming`}
            </Text>
          </View>
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
            {upcoming.length > 0 && (
              <>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeaderLabel}>Upcoming</Text>
                  <Text style={styles.sectionCount}>{upcoming.length}</Text>
                </View>
                {upcoming.map((r) => (
                  <ReminderCard key={r.id} reminder={r} onDelete={handleDelete} />
                ))}
              </>
            )}

            {sending.length > 0 && (
              <>
                <View
                  style={[
                    styles.sectionHeaderRow,
                    { marginTop: upcoming.length > 0 ? 12 : 6 },
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
                        upcoming.length > 0 || sending.length > 0 ? 12 : 6,
                    },
                  ]}
                >
                  <Text style={styles.sectionHeaderLabel}>Completed</Text>
                  <Text style={styles.sectionCount}>{completed.length}</Text>
                </View>
                {completed.map((r) => (
                  <ReminderCard key={r.id} reminder={r} onDelete={handleDelete} />
                ))}
              </>
            )}
          </>
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
        visible={pendingDeleteId !== null}
        title="Delete Reminder"
        message="Are you sure you want to delete this reminder?"
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </View>
  );
}
