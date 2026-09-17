import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { DictationLanguage } from "@/services/ReminderService";
import { getFontFamily } from "@/utils/getFontFamily";

/**
 * The two languages the microphone takes, each written in its own script.
 *
 * "English" and "മലയാളം" are self-evident to the person who reads them; "EN"
 * and "മല" are abbreviations a user has to be taught first, which is the
 * failure this control exists to fix.
 */
const OPTIONS: { value: DictationLanguage; label: string }[] = [
  { value: "en-US", label: "English" },
  { value: "ml-IN", label: "മലയാളം" },
];

interface Props {
  value: DictationLanguage;
  onChange: (lang: DictationLanguage) => void;
  /** Distinguishes two choosers on one screen (title vs. note dictation). */
  testIDPrefix?: string;
}

/**
 * Which language the microphone is listening for, and the one tap that
 * changes it.
 *
 * Until this existed the setting lived only in Settings, which is the one
 * screen a user holding a reminder to dictate is not looking at. Nothing on
 * the quick-add screen said whether the mic expected English or Malayalam, so
 * the only way to find out was to speak and read the wreckage.
 *
 * Three things together say this is about DICTATION and not about the app's
 * own language: the mic glyph, the word "Voice", and the control's place in
 * the row directly above the mic button. The screen-reader label says it in
 * full, because none of the three reach a user who cannot see the row.
 *
 * Both options stay on screen rather than collapsing into one pill with a
 * menu. A user who does not know Malayalam dictation exists never opens a
 * menu to discover it.
 */
export default function DictationLanguageChooser({
  value,
  onChange,
  testIDPrefix = "dictation-language",
}: Props) {
  const colors = useColors();
  const styles = makeStyles(colors);

  return (
    <View
      style={styles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel="Dictation language"
      testID={testIDPrefix}
    >
      <Feather name="mic" size={12} color={colors.mutedForeground} />
      <Text style={styles.caption}>Voice</Text>
      <View style={styles.track}>
        {OPTIONS.map((opt) => {
          const selected = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              style={[styles.pill, selected && styles.pillSelected]}
              onPress={() => onChange(opt.value)}
              hitSlop={6}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Dictate in ${opt.label}`}
              testID={`${testIDPrefix}-${opt.value}`}
            >
              <Text
                style={[
                  styles.pillText,
                  { fontFamily: getFontFamily(opt.label, "600SemiBold") },
                  selected && styles.pillTextSelected,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 10,
    },
    caption: {
      fontSize: 12,
      color: colors.mutedForeground,
    },
    track: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      padding: 2,
      borderRadius: 999,
      backgroundColor: colors.muted,
    },
    pill: {
      // 28pt of pill plus the 6pt hitSlop above clears the 40pt target the
      // rest of this row is built to.
      minHeight: 28,
      justifyContent: "center",
      paddingHorizontal: 12,
      borderRadius: 999,
    },
    pillSelected: {
      // The card colour, not the background: the track already sits ON a card,
      // and a selected pill painted the background colour reads as unselected
      // against it in light mode.
      backgroundColor: colors.card,
    },
    pillText: {
      fontSize: 13,
      color: colors.mutedForeground,
    },
    pillTextSelected: {
      color: colors.foreground,
    },
  });
}
