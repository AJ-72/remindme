import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { getFontFamily } from "@/utils/getFontFamily";

/**
 * Three lines a new user can tap instead of inventing one. The third is in
 * Malayalam on purpose: script support is this app's most distinctive
 * capability and it is otherwise invisible until the user happens to type in
 * it. An example the user can SEE parse is worth more than a sentence
 * promising that it will.
 */
export const STARTER_EXAMPLES = [
  "Call Amma at 7 pm",
  "Take medicine 9 am daily",
  "നാളെ രാവിലെ പാൽ വാങ്ങണം",
];

interface Props {
  /** Fills the composer with the tapped line. */
  onPick: (text: string) => void;
}

/**
 * The cold-open helper block. It replaces the empty list as the first thing a
 * new install shows: the old flow spent four permission asks before this
 * screen and then arrived with nothing on it, which taught the user that the
 * app was not ready. Nothing here is stored or dismissed - the block is gone
 * the moment there is a reminder to look at instead, which is the only signal
 * that means the user no longer needs it.
 */
export default function StarterExamples({ onPick }: Props) {
  const colors = useColors();

  const styles = StyleSheet.create({
    wrap: { marginTop: 10, gap: 10 },
    row: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.muted,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    chipText: { fontSize: 12.5, color: colors.mutedForeground },
    helper: {
      backgroundColor: colors.primary + "14",
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    helperText: {
      fontSize: 12.5,
      fontFamily: "Inter_400Regular",
      color: colors.secondaryForeground,
      lineHeight: 18,
    },
  });

  return (
    <View style={styles.wrap} testID="starter-examples">
      <View style={styles.row}>
        {STARTER_EXAMPLES.map((example) => (
          <Pressable
            key={example}
            style={styles.chip}
            onPress={() => onPick(example)}
            accessibilityRole="button"
            accessibilityLabel={`Try: ${example}`}
            testID={`starter-example-${STARTER_EXAMPLES.indexOf(example)}`}
          >
            <Text
              style={[styles.chipText, { fontFamily: getFontFamily(example, "400Regular") }]}
            >
              {example}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.helper}>
        <Text style={styles.helperText} testID="starter-helper">
          Tap an example to try it, or type your own. Nothing is set up yet —
          there is nothing to set up.
        </Text>
      </View>
    </View>
  );
}
