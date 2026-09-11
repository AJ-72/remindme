import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  bindViaInviteToken,
  claimPendingInvitations,
  type ClaimedInvitation,
} from "@/services/InvitationService";
import { registerDeviceForPush } from "@/services/DeviceRegistrationService";

/**
 * Rung-1 onboarding screen (T2.9 addendum, Task 10): the destination of
 * mobile://bind-invite?token=<uuid> (app.json scheme "mobile", Expo Router's
 * built-in deep-link handling - no app.json changes, no universal link; see
 * task-10-brief.md Step 1). Establishes a session and binds the tapped
 * invite token, then immediately claims whatever invitations were pending
 * for the now-verified number. A single claimed invitation navigates
 * straight to invitation-preview; more than one shows a plain tappable list
 * (each row navigating to invitation-preview with that invitation's own
 * data) - not a dedicated claimed-invitations list screen, which stays
 * Task 11/Phase 5's explicit scope boundary.
 */

type ScreenState =
  | { phase: "binding" }
  | { phase: "success"; claimed: ClaimedInvitation[] }
  | { phase: "error"; error: string };

function navigateToInvitationPreview(invitation: ClaimedInvitation) {
  router.push({
    pathname: "/invitation-preview",
    params: {
      id: invitation.id,
      title: invitation.title,
      description: invitation.description,
      datetime: invitation.datetime,
      senderId: invitation.senderId,
    },
  });
}

function copyForError(error: string): string {
  switch (error) {
    case "invalid token":
      return "This link isn't valid or has already been used";
    case "number already bound to a different account":
      return "This number is already linked to another account";
    case "token expired":
      return "This invite link has expired";
    case "network_error":
      return "Couldn't connect. Check your internet connection and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function goHome() {
  router.replace("/(tabs)");
}

export default function BindInviteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [state, setState] = useState<ScreenState>({ phase: "binding" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        if (!cancelled) setState({ phase: "error", error: "invalid token" });
        return;
      }

      const result = await bindViaInviteToken(token);
      if (cancelled) return;

      if (!result.ok) {
        setState({ phase: "error", error: result.error });
        return;
      }

      // Fire-and-forget: binding is exactly the moment a `users` row (and
      // thus a valid FK target for devices.user_id) starts existing, but a
      // missing/failed push registration must never block or fail the bind
      // - same "never fail the primary action" precedent as push-delivery
      // failures elsewhere in this plan.
      registerDeviceForPush();

      const claimed = await claimPendingInvitations();
      if (cancelled) return;
      setState({ phase: "success", claimed });

      // For exactly one claimed invitation, skip the intermediate list and
      // go straight to invitation-preview - the list only earns its place
      // when there's more than one row to choose from (see task-16 brief).
      if (claimed.length === 1) {
        navigateToInvitationPreview(claimed[0]);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      paddingTop: Platform.OS === "web" ? 0 : insets.top,
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
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      marginBottom: 24,
    },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 24,
      backgroundColor: colors.primary,
    },
    primaryBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    claimedList: {
      width: "100%",
      marginBottom: 24,
      gap: 8,
    },
    claimedRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    claimedRowTitle: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {state.phase === "binding" && (
          <>
            <ActivityIndicator size="large" color={colors.primary} testID="bind-loading" />
            <Text style={styles.title}>Linking your number…</Text>
          </>
        )}

        {state.phase === "success" && (
          <>
            <Feather name="check-circle" size={40} color={colors.primary} />
            <Text style={styles.title}>You're all set</Text>
            <Text style={styles.message}>
              {state.claimed.length === 0
                ? "No reminders were waiting for you."
                : state.claimed.length === 1
                  ? "You have 1 reminder waiting for you."
                  : `You have ${state.claimed.length} reminders waiting for you.`}
            </Text>
            {state.claimed.length > 1 && (
              <View style={styles.claimedList}>
                {state.claimed.map((invitation) => (
                  <Pressable
                    key={invitation.id}
                    style={styles.claimedRow}
                    onPress={() => navigateToInvitationPreview(invitation)}
                    testID={`claimed-invitation-row-${invitation.id}`}
                  >
                    <Text style={styles.claimedRowTitle} numberOfLines={1}>
                      {invitation.title || "Reminder"}
                    </Text>
                    <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable style={styles.primaryBtn} onPress={goHome} testID="bind-go-home">
              <Text style={styles.primaryBtnText}>Go to my reminders</Text>
            </Pressable>
          </>
        )}

        {state.phase === "error" && (
          <>
            <Feather name="alert-circle" size={40} color={colors.destructive} />
            <Text style={styles.title}>Couldn't link this number</Text>
            <Text style={styles.message}>{copyForError(state.error)}</Text>
            <Pressable style={styles.primaryBtn} onPress={goHome} testID="bind-go-home">
              <Text style={styles.primaryBtnText}>Back to Reminders</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
