import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ReminderCard from "@/components/ReminderCard";
import { Reminder, useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { reminders, deleteReminder, loading } = useReminders();
  const [refreshing, setRefreshing] = useState(false);

  const { upcoming, completed } = useMemo(() => {
    const now = new Date();
    const sorted = [...reminders].sort(
      (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
    );
    return {
      upcoming: sorted.filter((r) => !r.completed),
      completed: sorted.filter((r) => r.completed),
    };
  }, [reminders]);

  const handleDelete = (id: string) => {
    Alert.alert("Delete Reminder", "Are you sure you want to delete this reminder?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteReminder(id),
      },
    ]);
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
      paddingBottom: 16,
      backgroundColor: colors.background,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
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
    addButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 8,
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
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 80,
    },
    emptyIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
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
      paddingHorizontal: 24,
    },
    emptyButton: {
      marginTop: 20,
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: colors.primary,
      borderRadius: 24,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    emptyButtonText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    summaryBar: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 20,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    summaryNumber: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
    },
    summaryLabel: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    loadingWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
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
            <Text style={styles.headerTitle}>Reminders</Text>
            <Text style={styles.headerSubtitle}>
              {upcoming.length === 0
                ? "All caught up!"
                : `${upcoming.length} upcoming`}
            </Text>
          </View>
          <Pressable
            style={styles.addButton}
            onPress={() => router.push("/add-reminder")}
          >
            <Feather name="plus" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>

      {!hasAny ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { flexGrow: 1 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        >
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Feather name="bell" size={30} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No reminders yet</Text>
            <Text style={styles.emptyText}>
              Tap the + button to create your first reminder and stay on top of your day.
            </Text>
            <Pressable
              style={styles.emptyButton}
              onPress={() => router.push("/add-reminder")}
            >
              <Feather name="plus" size={16} color={colors.primaryForeground} />
              <Text style={styles.emptyButtonText}>Add Reminder</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.summaryBar}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryNumber}>{upcoming.length}</Text>
              <Text style={styles.summaryLabel}>Upcoming</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryNumber}>{completed.length}</Text>
              <Text style={styles.summaryLabel}>Completed</Text>
            </View>
          </View>

          {upcoming.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Upcoming</Text>
              {upcoming.map((r) => (
                <ReminderCard key={r.id} reminder={r} onDelete={handleDelete} />
              ))}
            </>
          )}

          {completed.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Completed</Text>
              {completed.map((r) => (
                <ReminderCard key={r.id} reminder={r} onDelete={handleDelete} />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
