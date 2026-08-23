import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useReminders } from "@/contexts/RemindersContext";
import { buildSendOptions } from "@/services/messageLinks";
import {
  getInviteNudgeCount,
  incrementInviteNudgeCount,
  isSendReminder,
} from "@/services/ReminderService";
import { composeMessage, nudgeForSendCount, stripNudge } from "@/utils/inviteNudges";
import { normalizePhone, toWhatsAppDigits } from "@/utils/phoneNumber";
import { getFontFamily } from "@/utils/getFontFamily";
import { formatDatetime } from "@/utils/formatDatetime";

export default function SendReminderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { reminders, loading, inviteNudgeEnabled, toggleComplete, userName } =
    useReminders();

  const reminder = reminders.find((r) => r.id === id);

  const [message, setMessage] = useState("");
  const [nudgeOn, setNudgeOn] = useState(inviteNudgeEnabled);
  const [nudgeLine, setNudgeLine] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const seeded = useRef(false);

  const phoneDigits = useMemo(
    () => toWhatsAppDigits(normalizePhone(reminder?.recipient?.phone ?? "")) ?? "",
    [reminder?.recipient?.phone]
  );

  // Seed the editable message once the reminder and the stored nudge count are
  // both available. Reading the count here is safe - it is only ADVANCED on an
  // actual send, so opening this screen twice cannot burn a stage.
  useEffect(() => {
    if (seeded.current || !reminder) return;
    seeded.current = true;
    let cancelled = false;

    (async () => {
      const count = phoneDigits ? await getInviteNudgeCount(phoneDigits) : 0;
      if (cancelled) return;
      const line = inviteNudgeEnabled ? nudgeForSendCount(count, phoneDigits) : null;
      setNudgeLine(line);
      setNudgeOn(inviteNudgeEnabled && !!line);
      setMessage(
        composeMessage({
          title: reminder.title,
          description: reminder.description ?? "",
          signature: userName,
          nudge: inviteNudgeEnabled ? line : null,
        })
      );
    })();

    return () => {
      cancelled = true;
    };
    // userName is intentionally absent from the deps: `seeded` makes this run
    // once, and re-seeding on a later name change would discard whatever the
    // user has already typed into the message box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminder, phoneDigits, inviteNudgeEnabled]);

  const options = useMemo(
    () => buildSendOptions(reminder?.recipient?.phone ?? "", message),
    [reminder?.recipient?.phone, message]
  );

  // The toggle may only append/remove the EXACT line. If the user has edited it
  // away, disable rather than attempt a fuzzy removal that mangles their text.
  const nudgePresent = !!nudgeLine && message.includes(nudgeLine);
  const nudgeToggleDisabled = !nudgeLine || (nudgeOn && !nudgePresent);

  function handleNudgeToggle(next: boolean) {
    if (!nudgeLine) return;
    if (next) {
      setMessage((m) => (m.includes(nudgeLine) ? m : `${m.trimEnd()}\n\n${nudgeLine}`));
    } else {
      const stripped = stripNudge(message, nudgeLine);
      if (stripped === null) return;
      setMessage(stripped);
    }
    setNudgeOn(next);
  }

  async function handleSend(url: string | null) {
    if (!url || sending) return;
    setSending(true);
    try {
      await Linking.openURL(url);
      // Advance ONLY here, and only when the nudge was actually included.
      if (phoneDigits && nudgeLine && message.includes(nudgeLine)) {
        await incrementInviteNudgeCount(phoneDigits);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Opening can fail if no handler exists; the other button stays available.
    } finally {
      setSending(false);
    }
  }

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background, paddingTop: insets.top },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    body: { paddingHorizontal: 20, paddingBottom: 40, gap: 20 },
    label: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 10,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    recipientName: { fontSize: 16, color: colors.foreground },
    recipientPhone: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
    due: { fontSize: 13, color: colors.mutedForeground, marginTop: 6 },
    input: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      minHeight: 140,
      fontSize: 15,
      color: colors.foreground,
      textAlignVertical: "top",
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginTop: 12,
    },
    toggleLabel: { flex: 1, fontSize: 14, color: colors.foreground },
    toggleHint: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
    notice: {
      fontSize: 13,
      color: colors.warningSurfaceForeground,
      backgroundColor: colors.warningSurface,
      borderRadius: 10,
      padding: 12,
      lineHeight: 18,
    },
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 14,
      paddingVertical: 15,
    },
    primaryButton: { backgroundColor: colors.primary },
    primaryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    secondaryButton: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    doneRow: { alignItems: "center", paddingVertical: 8 },
    doneText: { fontSize: 14, color: colors.primary },
    disclaimer: {
      fontSize: 12,
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 17,
    },
    stateWrap: { padding: 40, alignItems: "center", gap: 10 },
  });

  if (!reminder) {
    return (
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Feather name="x" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={styles.headerTitle}>Send</Text>
        </View>
        {!loading && (
          <View style={styles.stateWrap} testID="send-not-found">
            <Feather name="alert-circle" size={28} color={colors.mutedForeground} />
            <Text style={styles.recipientPhone}>This reminder no longer exists.</Text>
          </View>
        )}
      </View>
    );
  }

  const recipient = reminder.recipient;
  const primaryIsWhatsApp = options.primary === "whatsapp";

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Send</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={styles.label}>To</Text>
          <View style={styles.card}>
            <Text
              style={[
                styles.recipientName,
                { fontFamily: getFontFamily(recipient?.name ?? "", "600SemiBold") },
              ]}
            >
              {recipient?.name}
            </Text>
            <Text style={styles.recipientPhone}>{recipient?.phone}</Text>
            <Text style={styles.due}>{formatDatetime(reminder.datetime)}</Text>
          </View>
        </View>

        <View>
          <Text style={styles.label}>Message</Text>
          <TextInput
            testID="message-input"
            style={[styles.input, { fontFamily: getFontFamily(message, "400Regular") }]}
            value={message}
            onChangeText={setMessage}
            multiline
            textAlignVertical="top"
          />

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Mention the app</Text>
              <Text style={styles.toggleHint}>
                {nudgeToggleDisabled
                  ? "You've edited the message, so this can't be changed automatically"
                  : "Adds one short line at the end"}
              </Text>
            </View>
            <Switch
              testID="nudge-toggle"
              value={nudgeOn && nudgePresent}
              disabled={nudgeToggleDisabled}
              onValueChange={handleNudgeToggle}
              trackColor={{ false: colors.muted, true: colors.primary + "66" }}
              thumbColor={nudgeOn ? colors.primary : colors.mutedForeground}
            />
          </View>
        </View>

        {options.notice && <Text style={styles.notice}>{options.notice}</Text>}

        {/* Both buttons are always offered - openURL resolving only means an
            app opened, so an automatic WhatsApp->SMS chain would fire for
            cases that actually worked. Emphasis swaps instead. */}
        {options.whatsApp && (
          <Pressable
            testID="send-whatsapp"
            style={[
              styles.button,
              primaryIsWhatsApp ? styles.primaryButton : styles.secondaryButton,
            ]}
            onPress={() => handleSend(options.whatsApp)}
          >
            <Feather
              name="message-circle"
              size={17}
              color={primaryIsWhatsApp ? colors.primaryForeground : colors.foreground}
            />
            <Text style={primaryIsWhatsApp ? styles.primaryText : styles.secondaryText}>
              Send on WhatsApp
            </Text>
          </Pressable>
        )}

        {options.sms && (
          <Pressable
            testID="send-sms"
            style={[
              styles.button,
              primaryIsWhatsApp ? styles.secondaryButton : styles.primaryButton,
            ]}
            onPress={() => handleSend(options.sms)}
          >
            <Feather
              name="message-square"
              size={17}
              color={primaryIsWhatsApp ? colors.foreground : colors.primaryForeground}
            />
            <Text style={primaryIsWhatsApp ? styles.secondaryText : styles.primaryText}>
              Send by SMS
            </Text>
          </Pressable>
        )}

        {/* Completion is always explicit: the app cannot observe whether a
            message was actually sent, so auto-completing would lie. */}
        {!reminder.completed && (
          <Pressable
            testID="mark-done"
            style={styles.doneRow}
            onPress={async () => {
              await toggleComplete(reminder.id);
              router.back();
            }}
          >
            <Text style={styles.doneText}>Mark as done</Text>
          </Pressable>
        )}

        <Text style={styles.disclaimer}>
          Reminders can't send this for you — tapping a button opens the app with
          your message ready, and you send it.
        </Text>
      </ScrollView>
    </View>
  );
}
