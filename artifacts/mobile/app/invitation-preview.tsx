import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import QuietHoursSheet from "@/components/QuietHoursSheet";
import { useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";
import { respondToInvitation } from "@/services/InvitationService";
import {
  ensureNotificationPermission,
  getNotificationPermissionState,
  setPendingInviteNameAsk,
} from "@/services/ReminderService";
import { getSupabaseClient, getCurrentSession } from "@/services/SessionService";
import { formatDatetime } from "@/utils/formatDatetime";
import { getFontFamily } from "@/utils/getFontFamily";
import { isQuietAt, quietHoursEndAfter } from "@/utils/quietHours";
import { describeRecurrence, isValidRecurrenceRule, type RecurrenceRule } from "@/utils/recurrence";

/**
 * M2 Task 5c: parses and validates the `recurrence` param, or returns
 * undefined for a one-shot invitation or a malformed/unparseable one.
 * Crosses a trust boundary (another user's client -> this device -> its
 * own notification schedule) - never trusted merely because it parsed as
 * JSON, reusing Task 1's isValidRecurrenceRule rather than re-deriving a
 * second definition of "valid" here.
 */
function parseRecurrenceParam(raw: string | undefined): RecurrenceRule | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return isValidRecurrenceRule(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

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
  const { id, title, description, datetime, senderId, recurrence } = useLocalSearchParams<{
    id: string;
    title?: string;
    description?: string;
    datetime: string;
    senderId: string;
    recurrence?: string;
  }>();
  const recurrenceRule = parseRecurrenceParam(recurrence);

  const { addReminder, quietHours, userName } = useReminders();
  // The time this Accept is waiting on a ring-permission answer, or null.
  // Frame I2 of the first-run study: the same system dialog as an ordinary
  // install, reached through a reason this user cares about more - a person
  // is waiting on it.
  const [ringConsentFor, setRingConsentFor] = useState<Date | null>(null);
  const [senderName, setSenderName] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [responding, setResponding] = useState(false);
  // Set once the invitation is accepted server-side but its reminder time
  // falls inside the RECIPIENT's own quiet hours - never the sender's, which
  // is a different bug (QuickAddInput's own check must not decide this
  // reminder's time on the receiving device).
  const [quietPrompt, setQuietPrompt] = useState<Date | null>(null);

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

  // Scheduling content MUST come from the local params captured at claim
  // time, never from respondToInvitation's own response - Task 12's
  // respond_to_invitation() nulls title/description on a successful accept
  // as part of its own transaction (T5.2), so the RPC response for a
  // just-accepted invitation has null content by design. alarm/exactTiming
  // are deliberately omitted so the recipient's own defaults apply
  // (RemindersContext), never anything sender-controlled.
  const scheduleAccepted = async (dateToUse: Date) => {
    await addReminder({
      title: title ?? "",
      description: description ?? "",
      datetime: dateToUse.toISOString(),
      // B13: preserved so the home screen can badge this as "from
      // someone else" - displaySenderName already falls back to
      // "Someone" above (senderName state is null until the RPC
      // resolves, or the sender has no display_name set).
      senderName: displaySenderName,
      senderId,
      // M2 Task 5c: already validated in parseRecurrenceParam above -
      // never re-derived here. addReminder's own "absent means one-shot"
      // convention means an undefined value here correctly omits the key.
      ...(recurrenceRule ? { recurrence: recurrenceRule } : {}),
    });
    // Frame I3: the ask the first-run sheet did not make. It waits for the
    // home screen, where it can name the person who will read the answer.
    if (userName.trim() === "") {
      await setPendingInviteNameAsk(displaySenderName);
    }
    goBack();
  };

  // The server accept and its chosen time travel together in ONE call -
  // respond_to_invitation() needs the final time up front (see
  // respond-invitation's own header: it pushes the sender when this differs
  // from what they sent, and can't do that after the fact). So the
  // quiet-hours decision has to resolve BEFORE the network call, not after
  // it as the local-only version of this flow did.
  const doAccept = async (target: Date) => {
    if (!id) return;
    setResponding(true);
    try {
      const result = await respondToInvitation(id, "accepted", target.toISOString());
      if (result.ok) await scheduleAccepted(target);
    } finally {
      setResponding(false);
    }
  };

  /**
   * Say what the permission is for, then let Android ask.
   *
   * Returns true when the caller should carry on without a sentence: the
   * permission is already granted, or the OS has stopped asking and a
   * sentence would only promise a dialog that will never appear.
   */
  const ringConsentSettled = async (): Promise<boolean> => {
    const state = await getNotificationPermissionState();
    return state.granted || !state.canAskAgain;
  };

  const handleRingAllow = async () => {
    const target = ringConsentFor;
    setRingConsentFor(null);
    await ensureNotificationPermission();
    if (target) continueAccept(target);
  };

  const handleRingNotNow = () => {
    const target = ringConsentFor;
    setRingConsentFor(null);
    // Never a gate. A refused ring costs the reminder its sound, not its
    // existence, and the home screen carries the repair path.
    if (target) continueAccept(target);
  };

  /** Everything after the ring question: quiet hours, then the accept. */
  const continueAccept = (target: Date) => {
    // Ask, never block - and ask about THIS device's own quiet hours, since
    // the receiving device is the one that will actually alert. The
    // sender's quiet hours (checked separately in QuickAddInput) have no
    // bearing on when the recipient wants to be notified.
    if (isQuietAt(target, quietHours)) {
      setQuietPrompt(target);
      return;
    }
    void doAccept(target);
  };

  const handleAccept = () => {
    if (!id || responding) return;
    const target = new Date(datetime);
    void (async () => {
      if (await ringConsentSettled()) {
        continueAccept(target);
        return;
      }
      setRingConsentFor(target);
    })();
  };

  const handleQuietKeep = () => {
    const target = quietPrompt;
    setQuietPrompt(null);
    if (target) void doAccept(target);
  };

  const handleQuietMove = () => {
    const target = quietPrompt;
    setQuietPrompt(null);
    if (target) void doAccept(quietHoursEndAfter(target, quietHours));
  };

  const handleQuietCancel = () => {
    // The invitation is already accepted server-side at this point; closing
    // the prompt without a choice must not lose the reminder, so treat
    // cancel the same as "keep" rather than stranding it unscheduled.
    void handleQuietKeep();
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
    ringConsent: {
      gap: 6,
      marginBottom: 16,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.secondary,
    },
    ringConsentTitle: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.secondaryForeground,
    },
    ringConsentBody: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    ringConsentRow: { flexDirection: "row", gap: 8, marginTop: 6 },
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

        {recurrenceRule && (
          // Accepting a recurring reminder is a materially bigger
          // commitment than a one-off - shown BEFORE Accept, not
          // discovered next morning.
          <View style={styles.timeRow} testID="invitation-recurrence">
            <Feather name="repeat" size={14} color={colors.mutedForeground} />
            <Text style={styles.timeText}>
              {describeRecurrence(recurrenceRule, new Date(datetime))}
            </Text>
          </View>
        )}

        {/* Said before Android asks, never after. A permission dialog with
            no sentence in front of it is a question about nothing; this one
            names the time and the person waiting on it. */}
        {ringConsentFor !== null && (
          <View style={styles.ringConsent} testID="invite-ring-consent">
            <Text style={styles.ringConsentTitle}>
              We ring you {formatDatetime(ringConsentFor.toISOString())}.
            </Text>
            <Text style={styles.ringConsentBody}>
              Allow notifications so {displaySenderName}&apos;s reminder can reach you.
            </Text>
            <View style={styles.ringConsentRow}>
              <Pressable
                style={[styles.actionBtn, styles.primaryBtn]}
                onPress={handleRingAllow}
                testID="invite-ring-allow"
              >
                <Text style={styles.primaryBtnText}>Allow</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.secondaryBtn]}
                onPress={handleRingNotNow}
                testID="invite-ring-not-now"
              >
                <Text style={styles.secondaryBtnText}>Not now</Text>
              </Pressable>
            </View>
          </View>
        )}

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

      <QuietHoursSheet
        visible={!!quietPrompt}
        datetime={quietPrompt ?? new Date()}
        quietEnd={quietPrompt ? quietHoursEndAfter(quietPrompt, quietHours) : new Date()}
        onKeep={handleQuietKeep}
        onMove={handleQuietMove}
        onCancel={handleQuietCancel}
      />
    </View>
  );
}
