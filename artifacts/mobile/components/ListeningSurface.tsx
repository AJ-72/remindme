import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props {
  /** True once the recognizer has returned at least one word. */
  heardSpeech: boolean;
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
 */
export default function ListeningSurface({
  heardSpeech,
  onDone,
  onCancel,
  testIDPrefix = "listening",
}: Props) {
  const colors = useColors();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.5,
          duration: 550,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 550,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(1);
    };
  }, [pulse]);

  const styles = StyleSheet.create({
    surface: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.primary + "14",
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.destructive,
    },
    label: {
      flex: 1,
      fontSize: 13,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
    },
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

  return (
    <View style={styles.surface} testID={`${testIDPrefix}-surface`}>
      <Animated.View style={[styles.dot, { transform: [{ scale: pulse }] }]} />
      <Text style={styles.label}>
        {heardSpeech
          ? "Listening — stop speaking when you're done"
          : "Listening — say your reminder"}
      </Text>
      <Pressable onPress={onCancel} hitSlop={10} testID={`${testIDPrefix}-cancel`}>
        <Text style={styles.actionMuted}>Cancel</Text>
      </Pressable>
      <Pressable onPress={onDone} hitSlop={10} testID={`${testIDPrefix}-done`}>
        <Text style={styles.action}>Done</Text>
      </Pressable>
    </View>
  );
}
