import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ARTICLE_BODY, REFERENCES, SLIP_CARDS } from "@/constants/whyTasksSlip";
import { useColors } from "@/hooks/useColors";

export default function WhyTasksSlipScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  // Progressive disclosure: four cards carry the whole point in about a
  // minute, and the cited article waits behind them for anyone who wants to
  // check the claims rather than take them on faith.
  const [expanded, setExpanded] = useState(false);

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    headerTitle: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    content: { paddingHorizontal: 20, paddingBottom: insets.bottom + 24 },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radiusCard,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 12,
    },
    cardTitle: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    cardBody: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 19,
      marginTop: 6,
    },
    cardAction: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      marginTop: 10,
    },
    readMore: { paddingVertical: 14, alignItems: "center" },
    readMoreText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    para: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 21,
      marginBottom: 14,
    },
    refHeading: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginTop: 8,
      marginBottom: 10,
    },
    refClaim: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      lineHeight: 18,
    },
    ref: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 18,
      marginTop: 2,
      marginBottom: 12,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="why-tasks-slip-back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Why tasks slip</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {SLIP_CARDS.map((card) => (
          <View key={card.title} style={styles.card}>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardBody}>{card.body}</Text>
            <Text style={styles.cardAction}>{card.action}</Text>
          </View>
        ))}

        {!expanded ? (
          <Pressable
            style={styles.readMore}
            onPress={() => setExpanded(true)}
            testID="read-more"
          >
            <Text style={styles.readMoreText}>Read more</Text>
          </Pressable>
        ) : (
          <View testID="full-article">
            {ARTICLE_BODY.map((para) => (
              <Text key={para.slice(0, 24)} style={styles.para}>
                {para}
              </Text>
            ))}
            {REFERENCES.length > 0 && (
              <>
                <Text style={styles.refHeading}>Sources</Text>
                {REFERENCES.map((ref) => (
                  <View key={ref.citation}>
                    <Text style={styles.refClaim}>{ref.claim}</Text>
                    <Text style={styles.ref}>{ref.citation}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
