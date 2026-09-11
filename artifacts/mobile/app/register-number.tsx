import { Feather } from "@expo/vector-icons";
import { getLocales } from "expo-localization";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { registerDeviceForPush } from "@/services/DeviceRegistrationService";
import {
  claimPendingInvitations,
  selfRegister,
  syncDisplayName,
  type ClaimedInvitation,
} from "@/services/InvitationService";
import {
  clearRegisteredPhone,
  getRegisteredPhone,
  getUserName,
  markRegistrationOnboardingComplete,
  setRegisteredPhone,
} from "@/services/ReminderService";
import { normalizeForIdentity } from "@/utils/phoneNumber";

/**
 * Self-serve first-time registration (OTP verification deferred - tracked
 * separately). Lets a brand-new number become a registered app user without
 * needing an invitation first: before this screen, the only ways in were
 * bind_via_invite_token() (needs an existing invitation's bind_token) and
 * send_invitation() (needs the recipient to already exist) - neither can be
 * the mechanism that creates a user row from nothing, so a never-before-seen
 * number had no path in at all. See services/InvitationService.ts#selfRegister
 * and lib/db/src/functions/selfRegister.sql for the enforcement.
 *
 * Deliberately trusts whatever number the user types - there is no
 * verification step yet, only the same "can't steal an already-registered
 * number" guard bind_via_invite_token() uses. Reachable from Settings ("You"
 * section) rather than auto-prompted on first launch, matching this app's
 * anonymous-by-default posture (SessionService.ts header): registering is
 * something a user opts into, not something that happens to them.
 *
 * Claims pending invitations right after a successful register, same as
 * bind-invite.tsx does after bind_via_invite_token() - self_register()
 * proves phone-number ownership exactly the same way binding does, so any
 * invitation already waiting for this number must be pulled in the same
 * way. Without this, an invitation sent to a number that self-registers
 * (rather than binds via a link) never shows to its recipient - discovered
 * live while testing the Tier 2 "remind someone else" flow end-to-end.
 */

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

type ScreenState =
  | { phase: "loading" }
  | { phase: "already-registered"; phone: string }
  | { phase: "input" }
  | { phase: "submitting" }
  | { phase: "success"; claimed: ClaimedInvitation[] }
  | { phase: "error"; error: string };

function copyForError(error: string): string {
  switch (error) {
    case "number_taken":
      return "That number is already registered to a different account";
    case "network_error":
      return "Couldn't connect. Check your internet connection and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export default function RegisterNumberScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { firstRun } = useLocalSearchParams<{ firstRun?: string }>();
  const isFirstRun = firstRun === "1";
  const [raw, setRaw] = useState("");
  const [state, setState] = useState<ScreenState>({ phase: "input" });

  // B10: a device that already registered a number must not be able to
  // silently register a second one over it - the phone check only guards
  // against a DIFFERENT account claiming an ALREADY-TAKEN number
  // (number_taken), not against this same device re-registering with no
  // warning. Checked once on mount; already-registered wins over whatever
  // the sync initial "input" state above rendered.
  useEffect(() => {
    let cancelled = false;
    getRegisteredPhone().then((phone) => {
      if (!cancelled && phone) setState({ phase: "already-registered", phone });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const region = getLocales()[0]?.regionCode ?? null;
  const { e164 } = normalizeForIdentity(raw, region);
  const canSubmit = !!e164 && state.phase !== "submitting";

  const finishFirstRunIfNeeded = async () => {
    if (isFirstRun) await markRegistrationOnboardingComplete();
  };

  const skip = async () => {
    await finishFirstRunIfNeeded();
    router.back();
  };

  const removeNumber = async () => {
    await clearRegisteredPhone();
    setState({ phase: "input" });
  };

  const submit = async () => {
    if (!e164) return;
    setState({ phase: "submitting" });
    const result = await selfRegister(e164);
    if (!result.ok) {
      setState({ phase: "error", error: result.error });
      return;
    }
    await setRegisteredPhone(e164);
    await finishFirstRunIfNeeded();
    // B11: this is the first moment a session/users row exists for someone
    // who set their name before ever registering - syncDisplayName() from
    // setUserName() would have no-op'd back then (no session yet), so it's
    // repeated here now that one does. Fire-and-forget, same precedent as
    // registerDeviceForPush() below.
    getUserName().then((name) => {
      if (name) syncDisplayName(name);
    });
    // Fire-and-forget, same precedent as bind-invite.tsx: this is exactly
    // the moment a `users` row starts existing (a valid FK target for
    // devices.user_id), but a missing/failed push registration must never
    // block or fail the primary action.
    registerDeviceForPush();

    const claimed = await claimPendingInvitations();
    setState({ phase: "success", claimed });

    // For exactly one claimed invitation, skip the intermediate list and go
    // straight to invitation-preview - same precedent as bind-invite.tsx.
    if (claimed.length === 1) {
      navigateToInvitationPreview(claimed[0]);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
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
    input: {
      width: "100%",
      fontSize: 16,
      color: colors.foreground,
      backgroundColor: colors.muted,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 18,
      textAlign: "center",
    },
    primaryBtn: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 24,
      backgroundColor: colors.primary,
    },
    primaryBtnDisabled: { backgroundColor: colors.muted },
    primaryBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    primaryBtnTextDisabled: { color: colors.mutedForeground },
    claimedList: {
      width: "100%",
      marginBottom: 18,
    },
    claimedRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: colors.muted,
      borderRadius: 12,
      marginBottom: 8,
    },
    claimedRowTitle: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      marginRight: 8,
    },
    skipBtn: {
      marginTop: 14,
      paddingVertical: 8,
    },
    skipBtnText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    firstRunBadge: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 4,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.closeBtn}
          onPress={skip}
          testID="register-number-close"
        >
          <Feather name="x" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <View style={styles.content}>
        {state.phase === "input" || state.phase === "submitting" ? (
          <>
            <Feather name="phone" size={40} color={colors.primary} />
            {isFirstRun && (
              <Text style={styles.firstRunBadge} testID="register-number-optional-badge">
                Optional
              </Text>
            )}
            <Text style={styles.title}>Add your number</Text>
            <Text style={styles.message}>
              {isFirstRun
                ? "Only needed if you want to remind someone else, or have someone remind you, in-app. Your own reminders work without this — you can always add it later in Settings."
                : "Lets other people find you and remind you in-app, instead of only over WhatsApp. We don't verify it with a code yet — just don't use someone else's number."}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Your phone number"
              placeholderTextColor={colors.mutedForeground}
              value={raw}
              onChangeText={setRaw}
              keyboardType="phone-pad"
              autoFocus
              editable={state.phase !== "submitting"}
              testID="register-number-input"
            />
            <Pressable
              style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
              onPress={submit}
              disabled={!canSubmit}
              testID="register-number-submit"
            >
              {state.phase === "submitting" ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text
                  style={[styles.primaryBtnText, !canSubmit && styles.primaryBtnTextDisabled]}
                >
                  Register
                </Text>
              )}
            </Pressable>
            {isFirstRun && state.phase === "input" && (
              <Pressable style={styles.skipBtn} onPress={skip} testID="register-number-skip">
                <Text style={styles.skipBtnText}>Skip for now</Text>
              </Pressable>
            )}
          </>
        ) : null}

        {state.phase === "already-registered" && (
          <>
            <Feather name="phone" size={40} color={colors.primary} />
            <Text style={styles.title}>Your number is registered</Text>
            <Text style={styles.message}>
              This device is registered as {state.phone}. To register a different number,
              remove this one first.
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={removeNumber}
              testID="register-number-remove"
            >
              <Text style={styles.primaryBtnText}>Remove this number</Text>
            </Pressable>
          </>
        )}

        {state.phase === "success" && (
          <>
            <Feather name="check-circle" size={40} color={colors.primary} />
            <Text style={styles.title}>You're registered</Text>
            <Text style={styles.message}>
              {state.claimed.length === 0
                ? "Other people can now find you in the app and remind you directly."
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
            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.back()}
              testID="register-number-done"
            >
              <Text style={styles.primaryBtnText}>Done</Text>
            </Pressable>
          </>
        )}

        {state.phase === "error" && (
          <>
            <Feather name="alert-circle" size={40} color={colors.destructive} />
            <Text style={styles.title}>Couldn't register</Text>
            <Text style={styles.message}>{copyForError(state.error)}</Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => setState({ phase: "input" })}
              testID="register-number-retry"
            >
              <Text style={styles.primaryBtnText}>Try again</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
