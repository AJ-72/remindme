import React, { useEffect, useState } from "react";
import { StyleSheet, Pressable, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { SILENCE_STOP_MS } from "@/utils/dictationTimer";
import { WAVEFORM_BARS, formatElapsed, waveformHeights } from "@/utils/micLevel";
import { getFontFamily } from "@/utils/getFontFamily";

/** How often the clock and the silence bar redraw. */
const TICK_MS = 100;

/** Past this much of the pause, the surface says it is closing. */
const STOPPING_AT = 0.5;

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

      {showLanguageLine && (
        <Text style={styles.languageLine} testID={`${testIDPrefix}-language`}>
          Speak your reminder. English or Malayalam — change it in Settings.
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
