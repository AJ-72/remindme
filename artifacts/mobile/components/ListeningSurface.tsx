import React, { useEffect, useState } from "react";
import { StyleSheet, Pressable, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { SILENCE_STOP_MS } from "@/utils/dictationTimer";
import { WAVEFORM_BARS, formatElapsed, waveformHeights } from "@/utils/micLevel";
import type { DictationLanguage } from "@/services/ReminderService";
import { getFontFamily } from "@/utils/getFontFamily";

/** How often the clock and the silence bar redraw. */
const TICK_MS = 100;

/** Past this much of the pause, the surface says it is closing. */
const STOPPING_AT = 0.5;

/**
 * Each language written in its own script. A user who reads only Malayalam
 * gains nothing from the word "Malayalam".
 */
export const LANGUAGE_NAMES: Record<DictationLanguage, string> = {
  "en-US": "English",
  "ml-IN": "മലയാളം",
};

/** With two languages, "the other one" is the whole of the switch. */
const OTHER_LANGUAGE: Record<DictationLanguage, DictationLanguage> = {
  "en-US": "ml-IN",
  "ml-IN": "en-US",
};

/** Full height of a waveform bar, in points. */
const WAVE_HEIGHT = 20;

interface Props {
  /** True once the recognizer has returned at least one word. */
  heardSpeech: boolean;
  /** Input loudness, 0..1. Drives the waveform. */
  level?: number;
  /** The segment the recognizer has not committed yet. Drawn grey. */
  interim?: string;
  /** Date.now() when the session opened. Drives the elapsed clock. */
  startedAt?: number;
  /** Date.now() of the last word heard. Drives the silence bar. */
  lastHeardAt?: number | null;
  /** How long a pause ends the session. */
  silenceMs?: number;
  /** Say once per install which languages the mic takes. */
  showLanguageLine?: boolean;
  /** The language the recognizer is running in right now. */
  language?: DictationLanguage;
  /** Change that language and start the session again. */
  onSwitchLanguage?: (lang: DictationLanguage) => void;
  /** End the session and KEEP what was heard. */
  onDone: () => void;
  /** End the session and throw away what was heard. */
  onCancel: () => void;
  /**
   * Distinguishes this surface from another one on the same screen. The
   * add/edit sheet has two dictation targets - the title and the note - and a
   * duplicate testID would make either one unaddressable from a test.
   */
  testIDPrefix?: string;
}

/**
 * The one place that says a live microphone is open.
 *
 * Dictation is the only input mode with no cursor, so the state has to be
 * stated: that the mic is listening, whether anything has reached it yet, and
 * the two different ways out. Before this, "stop" and "throw it away" were the
 * same tap on the same mic button.
 *
 * The waveform answers a different question from the label. "Listening" says
 * the session is open; a wave that follows the user's own voice says the
 * device can hear THEM, which is what someone who has just been ignored by a
 * microphone is actually asking. For that reason the bars are driven by the
 * recognizer's own loudness events and by nothing else - an idle animation
 * here would perform perfectly with the microphone switched off.
 */
export default function ListeningSurface({
  heardSpeech,
  level = 0,
  interim = "",
  startedAt,
  lastHeardAt = null,
  silenceMs = SILENCE_STOP_MS,
  showLanguageLine = false,
  language,
  onSwitchLanguage,
  onDone,
  onCancel,
  testIDPrefix = "listening",
}: Props) {
  const colors = useColors();
  // One clock for both the elapsed time and the pause bar. Held in state
  // rather than in an Animated value so a test can read what the user sees.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const elapsed = startedAt === undefined ? 0 : Math.max(0, now - startedAt);
  const sinceHeard = lastHeardAt === null ? 0 : Math.max(0, now - lastHeardAt);
  const silenceProgress =
    lastHeardAt === null || silenceMs <= 0 ? 0 : Math.min(1, sinceHeard / silenceMs);
  const stopping = heardSpeech && silenceProgress >= STOPPING_AT;
  const heights = waveformHeights(level, WAVEFORM_BARS);

  const styles = StyleSheet.create({
    surface: {
      gap: 8,
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.primary + "14",
    },
    topRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    wave: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      height: WAVE_HEIGHT,
    },
    bar: { width: 3, borderRadius: 2, backgroundColor: colors.primary },
    label: {
      flex: 1,
      fontSize: 13,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
    },
    timer: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontVariant: ["tabular-nums"],
    },
    interim: { fontSize: 13, color: colors.mutedForeground, fontStyle: "italic" },
    silenceTrack: {
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.muted,
      overflow: "hidden",
    },
    silenceFill: { height: "100%", borderRadius: 2, backgroundColor: colors.primary },
    languageLine: { fontSize: 12, color: colors.mutedForeground },
    languageRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
    },
    languageName: { fontSize: 12, color: colors.foreground },
    switchBtn: {
      minHeight: 28,
      justifyContent: "center",
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: colors.muted,
    },
    switchText: { fontSize: 12, color: colors.foreground },
    actionRow: { flexDirection: "row", justifyContent: "flex-end", gap: 4 },
    action: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      paddingHorizontal: 4,
    },
    actionMuted: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      paddingHorizontal: 4,
    },
  });

  const label = stopping
    ? "Stopping…"
    : heardSpeech
      ? "Listening — stop speaking when you're done"
      : "Listening — say your reminder";

  return (
    <View style={styles.surface} testID={`${testIDPrefix}-surface`}>
      <View style={styles.topRow}>
        <View style={styles.wave} testID={`${testIDPrefix}-wave`}>
          {heights.map((h, i) => (
            <View
              key={i}
              testID={`${testIDPrefix}-wave-bar-${i}`}
              style={[styles.bar, { height: Math.max(2, h * WAVE_HEIGHT) }]}
            />
          ))}
        </View>
        <Text style={styles.label}>{label}</Text>
        {startedAt !== undefined && (
          <Text style={styles.timer} testID={`${testIDPrefix}-timer`}>
            {formatElapsed(elapsed)}
          </Text>
        )}
      </View>

      {/* The words the recognizer has not committed. Muted and italic, so a
          guess is never mistaken for something the app has written down. */}
      {interim !== "" && (
        <Text
          style={[styles.interim, { fontFamily: getFontFamily(interim, "400Regular") }]}
          testID={`${testIDPrefix}-interim`}
        >
          {interim}…
        </Text>
      )}

      {/* The pause clock, made visible. Every word heard resets it, so a user
          who is still thinking can see that they have not been cut off. */}
      {heardSpeech && (
        <View style={styles.silenceTrack} testID={`${testIDPrefix}-silence`}>
          <View
            style={[styles.silenceFill, { width: `${Math.round(silenceProgress * 100)}%` }]}
          />
        </View>
      )}

      {/* The language, at the one moment the user can still act on it. A
          mic that is listening in the wrong language produces nonsense, and
          before this the only cure was to stop, leave the screen, find
          Settings, and start over. */}
      {language !== undefined && onSwitchLanguage !== undefined && (
        <View style={styles.languageRow} testID={`${testIDPrefix}-language-row`}>
          <Text style={styles.languageLine}>Hearing</Text>
          <Text
            style={[
              styles.languageName,
              { fontFamily: getFontFamily(LANGUAGE_NAMES[language], "600SemiBold") },
            ]}
            testID={`${testIDPrefix}-language-name`}
          >
            {LANGUAGE_NAMES[language]}
          </Text>
          <Pressable
            style={styles.switchBtn}
            onPress={() => onSwitchLanguage(OTHER_LANGUAGE[language])}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Switch dictation to ${LANGUAGE_NAMES[OTHER_LANGUAGE[language]]}`}
            testID={`${testIDPrefix}-language-switch`}
          >
            <Text
              style={[
                styles.switchText,
                {
                  fontFamily: getFontFamily(
                    LANGUAGE_NAMES[OTHER_LANGUAGE[language]],
                    "600SemiBold"
                  ),
                },
              ]}
            >
              {`Switch to ${LANGUAGE_NAMES[OTHER_LANGUAGE[language]]}`}
            </Text>
          </Pressable>
        </View>
      )}

      {showLanguageLine && (
        <Text style={styles.languageLine} testID={`${testIDPrefix}-language`}>
          Speak your reminder. Tap the language above to change it.
        </Text>
      )}

      <View style={styles.actionRow}>
        <Pressable onPress={onCancel} hitSlop={10} testID={`${testIDPrefix}-cancel`}>
          <Text style={styles.actionMuted}>Cancel</Text>
        </Pressable>
        <Pressable onPress={onDone} hitSlop={10} testID={`${testIDPrefix}-done`}>
          <Text style={styles.action}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}
