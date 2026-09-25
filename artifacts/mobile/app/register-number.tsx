import { Feather } from "@expo/vector-icons";
import { getLocales } from "expo-localization";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { selfRegister, type ClaimedInvitation } from "@/services/InvitationService";
import { completeRegistration } from "@/services/registration";
import { EVENTS } from "@/constants/analytics";
import { track } from "@/services/AnalyticsService";
import { clearRegisteredPhone, getRegisteredPhone } from "@/services/ReminderService";
import { callingCodeForRegion, listCountries, normalizeForIdentity } from "@/utils/phoneNumber";

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
  | { phase: "error"; error: string }
  // B9: the number just typed already belongs to a different account. Offer
  // the two collision-recovery choices rather than a bare dead-end error -
  // this is reachable only from that specific collision, never proactively.
  | { phase: "collision"; e164: string }
  | { phase: "collision-confirm"; e164: string; action: "reset" | "migrate" };

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
  // `optional` marks a prompted visit rather than one the user navigated to
  // themselves: it adds the Optional badge and the Skip button. First run no
  // longer pushes this screen at all - the number is asked where it buys the
  // user something, never before their first reminder.
  const { optional } = useLocalSearchParams<{ optional?: string }>();
  const isOptional = optional === "1";
  const [raw, setRaw] = useState("");
  const [state, setState] = useState<ScreenState>({ phase: "input" });
  const countries = useState(() => listCountries())[0];
  // Defaults to the device region when it's one we recognize, so the common
  // case needs no picker interaction - but the choice is explicit from here
  // on, never re-guessed from the device at submit time (see B-country-code
  // in normalizeForIdentity: an explicit pick is not ambiguous the way a
  // device-region guess is).
  const [selectedRegion, setSelectedRegion] = useState<string>(() => {
    const deviceRegion = getLocales()[0]?.regionCode ?? null;
    return deviceRegion && callingCodeForRegion(deviceRegion) ? deviceRegion : "IN";
  });
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);

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

  const { e164 } = normalizeForIdentity(raw, selectedRegion, true);
  const canSubmit = !!e164 && state.phase !== "submitting";
  const selectedCallingCode = callingCodeForRegion(selectedRegion) ?? "";

  const skip = async () => {
    // A prompted visit can sit at the bottom of the stack with nothing under
    // it - a bare router.back() then no-ops and leaves this screen on screen
    // forever. Same fallback as invitation-preview.tsx's goBack().
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
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
      track(EVENTS.NUMBER_REGISTERED, {
        method: "self_register",
        ok: false,
        error: String(result.error),
        claimed: 0,
      });
      if (result.error === "number_taken") {
        setState({ phase: "collision", e164 });
        return;
      }
      setState({ phase: "error", error: result.error });
      return;
    }
    await finishRegistration(e164, "self_register");
  };

  // Runs after the user confirms a collision-recovery choice. Irreversible -
  // the confirmation screen (collision-confirm) is what stands in for the
  // OTP proof this app doesn't have yet, so it must be explicit and must
  // name what will be lost, not just what will be gained.
  const confirmCollisionAction = async (targetE164: string, action: "reset" | "migrate") => {
    setState({ phase: "submitting" });
    const result = await selfRegister(targetE164, action);
    if (!result.ok) {
      track(EVENTS.NUMBER_REGISTERED, {
        method: action,
        ok: false,
        error: String(result.error),
        claimed: 0,
      });
      setState({ phase: "error", error: result.error });
      return;
    }
    await finishRegistration(targetE164, action);
  };

  // Shared by the ordinary register path and both collision-recovery
  // actions (reset/migrate) - all three end the same way, with a session
  // bound to phoneE164 and pending invitations claimed. The sequence itself
  // lives in services/registration.ts, shared with the Drive welcome-back
  // restore (B3).
  const finishRegistration = async (phoneE164: string, method: "self_register" | "reset" | "migrate") => {
    const claimed = await completeRegistration(phoneE164, method);
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
    phoneRow: {
      width: "100%",
      flexDirection: "row",
      gap: 8,
      marginBottom: 18,
    },
    countryBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.muted,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    countryBtnText: {
      fontSize: 16,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: colors.foreground,
      backgroundColor: colors.muted,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      textAlign: "left",
    },
    countryModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    countryModalSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: "70%",
      paddingTop: 16,
    },
    countryModalTitle: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      textAlign: "center",
      marginBottom: 8,
    },
    countryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    countryRowName: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    countryRowCode: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
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
    destructiveBtn: { backgroundColor: colors.destructive, marginTop: 10 },
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
    optionalBadge: {
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
            {isOptional && (
              <Text style={styles.optionalBadge} testID="register-number-optional-badge">
                Optional
              </Text>
            )}
            <Text style={styles.title}>Add your number</Text>
            <Text style={styles.message}>
              {isOptional
                ? "Only needed if you want to remind someone else, or have someone remind you, in-app. Your own reminders work without this — you can always add it later in Settings."
                : "Lets other people find you and remind you in-app, instead of only over WhatsApp. We don't verify it with a code yet — just don't use someone else's number."}
            </Text>
            <View style={styles.phoneRow}>
              <Pressable
                style={styles.countryBtn}
                onPress={() => setCountryPickerVisible(true)}
                disabled={state.phase === "submitting"}
                testID="register-number-country-btn"
              >
                <Text style={styles.countryBtnText}>+{selectedCallingCode}</Text>
                <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
              </Pressable>
              <TextInput
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor={colors.mutedForeground}
                value={raw}
                onChangeText={setRaw}
                keyboardType="phone-pad"
                autoFocus
                editable={state.phase !== "submitting"}
                testID="register-number-input"
              />
            </View>
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
            {isOptional && state.phase === "input" && (
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

        {state.phase === "collision" && (
          <>
            <Feather name="alert-circle" size={40} color={colors.destructive} />
            <Text style={styles.title}>That number is already registered</Text>
            <Text style={styles.message}>
              Is this your own number from a previous phone or install? We don't verify
              numbers with a code yet, so you'll need to choose what happens to the old
              account.
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => setState({ phase: "collision-confirm", e164: state.e164, action: "migrate" })}
              testID="register-number-collision-migrate"
            >
              <Text style={styles.primaryBtnText}>Yes, it's my old account — keep its history</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, styles.destructiveBtn]}
              onPress={() => setState({ phase: "collision-confirm", e164: state.e164, action: "reset" })}
              testID="register-number-collision-reset"
            >
              <Text style={styles.primaryBtnText}>Start fresh — erase the old account</Text>
            </Pressable>
            <Pressable
              style={styles.skipBtn}
              onPress={() => setState({ phase: "input" })}
              testID="register-number-collision-cancel"
            >
              <Text style={styles.skipBtnText}>Use a different number instead</Text>
            </Pressable>
          </>
        )}

        {state.phase === "collision-confirm" && (
          <>
            <Feather
              name={state.action === "reset" ? "trash-2" : "refresh-cw"}
              size={40}
              color={colors.destructive}
            />
            <Text style={styles.title}>
              {state.action === "reset" ? "Erase the old account?" : "Move to this device?"}
            </Text>
            <Text style={styles.message}>
              {state.action === "reset"
                ? "This permanently deletes the old account for this number, including everything it sent or received. This cannot be undone."
                : "Reminders that account sent or received move to this device instead. The old account's devices are removed — this device becomes the only one signed in."}
            </Text>
            <Pressable
              style={[styles.primaryBtn, styles.destructiveBtn]}
              onPress={() => confirmCollisionAction(state.e164, state.action)}
              testID="register-number-collision-confirm"
            >
              <Text style={styles.primaryBtnText}>
                {state.action === "reset" ? "Erase and continue" : "Move my data here"}
              </Text>
            </Pressable>
            <Pressable
              style={styles.skipBtn}
              onPress={() => setState({ phase: "collision", e164: state.e164 })}
              testID="register-number-collision-confirm-back"
            >
              <Text style={styles.skipBtnText}>Go back</Text>
            </Pressable>
          </>
        )}
      </View>

      <Modal
        visible={countryPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCountryPickerVisible(false)}
      >
        <Pressable
          style={styles.countryModalOverlay}
          onPress={() => setCountryPickerVisible(false)}
          testID="register-number-country-modal-overlay"
        >
          <Pressable onPress={() => {}} style={styles.countryModalSheet}>
            <Text style={styles.countryModalTitle}>Choose a country</Text>
            <FlatList
              data={countries}
              keyExtractor={(item) => item.region}
              initialNumToRender={countries.length}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.countryRow}
                  onPress={() => {
                    setSelectedRegion(item.region);
                    setCountryPickerVisible(false);
                  }}
                  testID={`register-number-country-${item.region}`}
                >
                  <Text style={styles.countryRowName}>{item.name}</Text>
                  <Text style={styles.countryRowCode}>+{item.callingCode}</Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
