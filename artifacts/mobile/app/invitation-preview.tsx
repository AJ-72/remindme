import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";
import { respondToInvitation } from "@/services/InvitationService";
import { getSupabaseClient, getCurrentSession } from "@/services/SessionService";
import { formatDatetime } from "@/utils/formatDatetime";
import { getFontFamily } from "@/utils/getFontFamily";

/**
 * Shown to the recipient for a newly-claimed invitation (Task 9's output),
 * one tap after bind-invite or from a list entry (Task 12 wires that
 * navigation, and Accept/Decline's actual server calls - this screen only
 * builds the buttons and their testIDs so Task 12 has somewhere to attach).
 *
 * T4.5: "Sender name, time, and the reminder text. Block is one tap from
 * this screen." - Block is the one action this task fully wires: it calls
 * `blocks` directly (already client-writable per privileges.sql), no Edge
 * Function needed. blocker_id must be the CALLER's own id - blocks_insert_own
 * RLS (`blocker_id = auth.uid()`) rejects anything else - so this reads the
 * recipient's own id from the current session rather than trusting a param.
 *
 * The sender's display_name is not on this invitation payload (only
 * senderId is) and users_select_self RLS blocks a direct cross-user read of
 * `users` (see system_learnings.md's 2026-09-09 entry) - so it's resolved via
 * the get_sender_display_name() RPC (T4.5/Step 13b), falling back to
 * "Someone" while loading or if the sender has no display_name set.
 */

function goBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/(tabs)");
  }
}

export default function InvitationPreviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id, title, description, datetime, senderId } = useLocalSearchParams<{
    id: string;
    title?: string;
    description?: string;
    datetime: string;
    senderId: string;
  }>();

  const { addReminder } = useReminders();
  const [senderName, setSenderName] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolveSenderName() {
      if (!senderId) return;
      const client = getSupabaseClient();
      const { data, error } = await client.rpc("get_sender_display_name", {
        p_sender_id: senderId,
      });
      if (cancelled) return;
      if (error || !data) {
        setSenderName(null);
        return;
      }
      setSenderName(data);
    }

    resolveSenderName();
    return () => {
      cancelled = true;
    };
  }, [senderId]);

  const displaySenderName = senderName ?? "Someone";

  const handleBlock = async () => {
    if (!senderId || blocking) return;
    setBlocking(true);
    try {
      const session = await getCurrentSession();
      const recipientId = session?.user?.id;
      if (!recipientId) return;

      const client = getSupabaseClient();
      await client.from("blocks").insert({ blocker_id: recipientId, blocked_id: senderId });
      setBlocked(true);
    } finally {
      setBlocking(false);
    }
  };

  const handleAccept = async () => {
    if (!id || responding) return;
    setResponding(true);
    try {
      const result = await respondToInvitation(id, "accepted");
      if (result.ok) {
        // Scheduling content MUST come from the local params captured at
        // claim time, never from respondToInvitation's own response -
        // Task 12's respond_to_invitation() nulls title/description on a
        // successful accept as part of its own transaction (T5.2), so the
        // RPC response for a just-accepted invitation has null content by
        // design. alarm/exactTiming are deliberately omitted so the
        // recipient's own defaults apply (RemindersContext), never
        // anything sender-controlled.
        await addReminder({
          title: title ?? "",
          description: description ?? "",
          datetime,
          // B13: preserved so the home screen can badge this as "from
          // someone else" - displaySenderName already falls back to
          // "Someone" above (senderName state is null until the RPC
          // resolves, or the sender has no display_name set).
          senderName: displaySenderName,
          senderId,
        });
        goBack();
      }
    } finally {
      setResponding(false);
    }
  };

  const handleDecline = async () => {
    if (!id || responding) return;
    setResponding(true);
    try {
      const result = await respondToInvitation(id, "declined");
      if (result.ok) {
        goBack();
      }
    } finally {
      setResponding(false);
    }
  };

  const styles = StyleSheet.create({
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
    senderText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginBottom: 8,
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
    timeText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
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
    blockedText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.closeBtn} onPress={goBack} testID="close-button">
          <Feather name="x" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Reminder Invitation</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.senderText} testID="sender-name">
          From {displaySenderName}
        </Text>
        {!!title && (
          <Text style={[styles.title, { fontFamily: getFontFamily(title, "700Bold") }]}>
            {title}
          </Text>
        )}
        {!!description && (
          <Text
            style={[
              styles.description,
              { fontFamily: getFontFamily(description, "400Regular") },
            ]}
          >
            {description}
          </Text>
        )}
        <View style={styles.timeRow}>
          <Feather name="clock" size={14} color={colors.mutedForeground} />
          <Text style={styles.timeText}>{formatDatetime(datetime)}</Text>
        </View>

        <View style={styles.actionsWrap}>
          <Pressable
            style={[styles.actionBtn, styles.primaryBtn]}
            onPress={handleAccept}
            disabled={responding}
            testID="accept-button"
          >
            {responding ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather name="check" size={16} color={colors.primaryForeground} />
            )}
            <Text style={styles.primaryBtnText}>Accept</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.secondaryBtn]}
            onPress={handleDecline}
            disabled={responding}
            testID="decline-button"
          >
            <Feather name="x-circle" size={16} color={colors.foreground} />
            <Text style={styles.secondaryBtnText}>Decline</Text>
          </Pressable>
          {blocked ? (
            <Text style={styles.blockedText} testID="block-confirmation">
              You won't receive reminders from {displaySenderName} anymore.
            </Text>
          ) : (
            <Pressable
              style={[styles.actionBtn, styles.destructiveBtn]}
              onPress={handleBlock}
              disabled={blocking}
              testID="block-button"
            >
              {blocking ? (
                <ActivityIndicator size="small" color={colors.destructive} />
              ) : (
                <Feather name="slash" size={16} color={colors.destructive} />
              )}
              <Text style={styles.destructiveBtnText}>Block sender</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
