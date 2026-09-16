import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";

interface Props {
  /** Who the user has just sent to. Used only to make the offer concrete. */
  recipientName?: string;
  /**
   * Which of the two earned moments this is. "sent" follows a reminder aimed
   * at somebody else, so it can name that person. "milestone" follows the
   * third saved reminder, where there is no person to name and the offer has
   * to argue for the capability itself.
   */
  reason?: "sent" | "milestone";
  onDismiss: () => void;
}

/**
 * The offer to register the user's own number.
 *
 * It lives here, on the send screen, and appears only AFTER a send. Before
 * that moment the question has no meaning: a user with no one to remind gains
 * nothing from being reachable, so asking on first run bought a refusal for
 * free. After a send, the answer is visible - the person just reminded can
 * remind them back, inside the app, instead of by message.
 *
 * Whether the offer is made at all is decided by
 * shouldOfferNumberRegistration() in ReminderService, which counts the offers
 * and stops at MAX_REGISTER_PROMPTS.
 */
export default function RegisterNumberNudge({
  recipientName,
  reason = "sent",
  onDismiss,
}: Props) {
  const colors = useColors();

  const handleAdd = useCallback(() => {
    onDismiss();
    router.push("/register-number");
  }, [onDismiss]);

  const styles = StyleSheet.create({
    wrap: {
      flexDirection: "row",
      gap: 12,
      backgroundColor: colors.primary + "14",
      borderRadius: 14,
      padding: 14,
    },
    body: { flex: 1, gap: 4 },
    title: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    text: { fontSize: 13, color: colors.mutedForeground, lineHeight: 19 },
    actions: { flexDirection: "row", gap: 16, marginTop: 8 },
    add: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primary },
    later: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
  });

  return (
    <View style={styles.wrap} testID="register-number-nudge">
      <Feather name="smartphone" size={20} color={colors.primary} />
      <View style={styles.body}>
        <Text style={styles.title}>
          {reason === "milestone" ? "Remind someone else?" : "Can they remind you back?"}
        </Text>
        <Text style={styles.text}>
          {reason === "milestone"
            ? "Add your number and a friend can send a reminder straight into this app — and you can send them one. Your own reminders work either way."
            : recipientName
              ? `Add your number and ${recipientName} can send you a reminder in the app, not just a message.`
              : "Add your number and the people you remind can send you one back, in the app."}
        </Text>
        <View style={styles.actions}>
          <Pressable onPress={handleAdd} hitSlop={8} testID="register-number-nudge-add">
            <Text style={styles.add}>Add my number</Text>
          </Pressable>
          <Pressable onPress={onDismiss} hitSlop={8} testID="register-number-nudge-later">
            <Text style={styles.later}>{reason === "milestone" ? "No thanks" : "Not now"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
