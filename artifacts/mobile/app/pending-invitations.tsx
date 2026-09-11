import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";
import {
  respondToInvitation,
  resolveSenderNames,
  type ClaimedInvitation,
} from "@/services/InvitationService";
import { formatDatetime } from "@/utils/formatDatetime";
import { getFontFamily } from "@/utils/getFontFamily";

/**
 * B15: shown when 2+ invitations were claimed at once (useInvitationCheck.ts
 * / NotificationResponseHandler.tsx's navigateToPendingList) - previously
 * this case claimed the invitations (marking them delivered) and then showed
 * nothing at all, since checkForInvitations() only ever navigated for
 * exactly one. Every row gets its own inline Accept/Decline rather than
 * drilling into invitation-preview.tsx per row (bind-invite.tsx's older,
 * narrower "more than one" list does drill in - that one is scoped to the
 * bind flow only and is left as-is here) - the whole point of this screen is
 * clearing several at once without a tap-open-decide-back loop per item.
 *
 * Reads its list from a single JSON-serialized `invitations` param rather
 * than one per invitation - see navigateToPendingList's own doc comment for
 * why. Sender names are resolved in one batched call
 * (resolveSenderNames) rather than one RPC per row.
 */

type RowState = "pending" | "responding" | "done";

function parseInvitations(raw: string | undefined): ClaimedInvitation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function goBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/(tabs)");
  }
}

export default function PendingInvitationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { invitations: invitationsParam } = useLocalSearchParams<{ invitations?: string }>();
  const { addReminder } = useReminders();

  const [invitations, setInvitations] = useState<ClaimedInvitation[]>(() =>
    parseInvitations(invitationsParam)
  );
  const [senderNames, setSenderNames] = useState<Record<string, string | null>>({});
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

  useEffect(() => {
    let cancelled = false;
    const senderIds = invitations.map((i) => i.senderId);
    if (senderIds.length === 0) return;

    resolveSenderNames(senderIds).then((names) => {
      if (!cancelled) setSenderNames(names);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every row resolved (accepted or declined) - nothing left to show, so
  // return to wherever the list was opened from. Same "go back once empty"
  // shape as invitation-preview.tsx's own goBack after a single response.
  useEffect(() => {
    if (invitations.length > 0 && invitations.every((i) => rowStates[i.id] === "done")) {
      goBack();
    }
  }, [invitations, rowStates]);

  const displayName = (invitation: ClaimedInvitation) => senderNames[invitation.senderId] ?? "Someone";

  const handleRespond = async (invitation: ClaimedInvitation, response: "accepted" | "declined") => {
    if (rowStates[invitation.id] === "responding" || rowStates[invitation.id] === "done") return;
    setRowStates((prev) => ({ ...prev, [invitation.id]: "responding" }));

    const result = await respondToInvitation(invitation.id, response);
    if (!result.ok) {
      // Leave the row actionable rather than stuck on a spinner - matches
      // invitation-preview.tsx's own behavior of just re-enabling the
      // buttons on failure (no toast infrastructure exists yet for this
      // screen either).
      setRowStates((prev) => ({ ...prev, [invitation.id]: "pending" }));
      return;
    }

    if (response === "accepted") {
      // Scheduling content comes from the claimed invitation captured at
      // claim time, never from respondToInvitation's response - same rule
      // as invitation-preview.tsx's handleAccept (respond_to_invitation()
      // nulls title/description server-side on a successful accept).
      await addReminder({
        title: invitation.title ?? "",
        description: invitation.description ?? "",
        datetime: invitation.datetime,
        senderName: displayName(invitation),
        senderId: invitation.senderId,
      });
    }

    setRowStates((prev) => ({ ...prev, [invitation.id]: "done" }));
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
      gap: 12,
    },
    card: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 16,
      gap: 8,
    },
    senderText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    title: {
      fontSize: 17,
      color: colors.foreground,
    },
    description: {
      fontSize: 14,
      color: colors.mutedForeground,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    timeText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    actionsRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 4,
    },
    actionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 12,
      paddingVertical: 11,
    },
    primaryBtn: { backgroundColor: colors.primary },
    secondaryBtn: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    primaryBtnText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    secondaryBtnText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    doneText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textAlign: "center",
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.closeBtn} onPress={goBack} testID="pending-invitations-close">
          <Feather name="x" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {invitations.length} Reminders Waiting
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content} testID="pending-invitations-list">
        {invitations.map((invitation) => {
          const rowState = rowStates[invitation.id] ?? "pending";
          const responding = rowState === "responding";
          const done = rowState === "done";

          return (
            <View key={invitation.id} style={styles.card} testID={`pending-invitation-${invitation.id}`}>
              <Text style={styles.senderText} testID={`pending-invitation-sender-${invitation.id}`}>
                From {displayName(invitation)}
              </Text>
              {!!invitation.title && (
                <Text
                  style={[styles.title, { fontFamily: getFontFamily(invitation.title, "700Bold") }]}
                >
                  {invitation.title}
                </Text>
              )}
              {!!invitation.description && (
                <Text
                  style={[
                    styles.description,
                    { fontFamily: getFontFamily(invitation.description, "400Regular") },
                  ]}
                >
                  {invitation.description}
                </Text>
              )}
              <View style={styles.timeRow}>
                <Feather name="clock" size={13} color={colors.mutedForeground} />
                <Text style={styles.timeText}>{formatDatetime(invitation.datetime)}</Text>
              </View>

              {done ? (
                <Text style={styles.doneText}>Done</Text>
              ) : (
                <View style={styles.actionsRow}>
                  <Pressable
                    style={[styles.actionBtn, styles.primaryBtn]}
                    onPress={() => handleRespond(invitation, "accepted")}
                    disabled={responding}
                    testID={`pending-invitation-accept-${invitation.id}`}
                  >
                    {responding ? (
                      <ActivityIndicator size="small" color={colors.primaryForeground} />
                    ) : (
                      <Feather name="check" size={14} color={colors.primaryForeground} />
                    )}
                    <Text style={styles.primaryBtnText}>Accept</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, styles.secondaryBtn]}
                    onPress={() => handleRespond(invitation, "declined")}
                    disabled={responding}
                    testID={`pending-invitation-decline-${invitation.id}`}
                  >
                    <Feather name="x-circle" size={14} color={colors.foreground} />
                    <Text style={styles.secondaryBtnText}>Decline</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
