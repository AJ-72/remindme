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
import { useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { reminders, deleteReminder, loading } = useReminders();
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { upcoming, completed } = useMemo(() => {
    const upcoming = reminders
      .filter((r) => !r.completed)
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
    const completed = reminders
      .filter((r) => r.completed)
      .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());
    return { upcoming, completed };
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
    headerAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.muted,
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
          <View>
            <Text style={styles.headerTitle}>Today</Text>
            <Text style={styles.headerSubtitle}>
              {upcoming.length === 0 ? "All caught up!" : `${upcoming.length} upcoming`}
            </Text>
          </View>
          <View style={styles.headerAvatar} />
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

            {completed.length > 0 && (
              <>
                <View style={[styles.sectionHeaderRow, { marginTop: upcoming.length > 0 ? 12 : 6 }]}>
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
