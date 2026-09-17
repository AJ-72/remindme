import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import NameSheet from "@/components/NameSheet";
import { useColors } from "@/hooks/useColors";
import { getFontFamily } from "@/utils/getFontFamily";

interface Props {
  /** Who accepted this user's invitation, and will read the answer. */
  senderName: string;
  /** Answered or skipped - either way the ask is spent. */
  onSettled: () => void;
  onSave: (name: string) => void | Promise<void>;
}

/**
 * The name ask an invited install gets instead of the first-run sheet.
 *
 * The first-run sheet asks before the user knows what the app is. This asks
 * after they have accepted a friend's reminder, and it can say who is
 * waiting to read the answer - which is the only honest argument for typing
 * a name into a reminders app at all. Skipping settles it for good: one ask,
 * not a standing banner.
 */
export default function InviteNameAsk({ senderName, onSettled, onSave }: Props) {
  const colors = useColors();
  const [sheetVisible, setSheetVisible] = useState(false);

  const styles = StyleSheet.create({
    card: {
      gap: 6,
      marginTop: 16,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.secondary,
    },
    text: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.secondaryForeground,
    },
    row: { flexDirection: "row", gap: 8, marginTop: 6 },
    btn: {
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: colors.primary,
    },
    btnText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    ghost: {
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    ghostText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
  });

  return (
    <View style={styles.card} testID="invite-name-ask">
      <Text style={[styles.text, { fontFamily: getFontFamily(senderName, "400Regular") }]}>
        {senderName} sees that someone accepted. Add your name so they see who.
      </Text>
      <View style={styles.row}>
        <Pressable
          style={styles.btn}
          onPress={() => setSheetVisible(true)}
          accessibilityRole="button"
          testID="invite-name-ask-add"
        >
          <Text style={styles.btnText}>Add name</Text>
        </Pressable>
        <Pressable
          style={styles.ghost}
          onPress={onSettled}
          accessibilityRole="button"
          testID="invite-name-ask-skip"
        >
          <Text style={styles.ghostText}>Skip</Text>
        </Pressable>
      </View>

      <NameSheet
        visible={sheetVisible}
        onSave={async (name) => {
          setSheetVisible(false);
          await onSave(name);
          onSettled();
        }}
        onDismiss={() => setSheetVisible(false)}
      />
    </View>
  );
}
