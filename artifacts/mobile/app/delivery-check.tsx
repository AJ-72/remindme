import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  applyFix,
  getDeliveryInputs,
  testFireNotification,
} from "@/services/DeliveryHealthService";
import {
  assessDelivery,
  type CheckStatus,
  type DeliveryAssessment,
} from "@/utils/deliveryHealth";
import type { TestFireResult } from "@/utils/deliveryTestFire";

type TestState = "idle" | "waiting" | TestFireResult;

const OVERALL_COPY: Record<CheckStatus, string> = {
  ok: "Reminders should reach you on time.",
  problem: "Something on this phone can stop reminders from reaching you.",
  unknown: "No problems found, but some settings could not be read.",
};

const TEST_COPY: Record<Exclude<TestState, "idle">, string> = {
  waiting: "Sending a test reminder in a few seconds…",
  arrived: "The test reminder arrived. Delivery works while the app is open.",
  timeout: "The test reminder did not arrive. Fix the items marked above, then try again.",
  schedule_failed: "Could not schedule a test reminder - check notification permission.",
};

export default function DeliveryCheckScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [assessment, setAssessment] = useState<DeliveryAssessment | null>(null);
  const [test, setTest] = useState<TestState>("idle");
  // Once a test reminder arrives, every later refresh (including from
  // AppState resuming) keeps treating unresolved checks as confirmed - a
  // positive delivery proof shouldn't be re-doubted a few seconds later just
  // because the app was backgrounded. A ref (not state) because `refresh`
  // reads it without wanting to be redefined - and re-subscribed to
  // AppState - every time it flips.
  const confirmedByTestFireRef = useRef(false);

  const refresh = useCallback(async () => {
    setAssessment(assessDelivery(await getDeliveryInputs(), confirmedByTestFireRef.current));
  }, []);

  // Re-read on return from a system settings screen the user was sent to.
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const runTest = async () => {
    setTest("waiting");
    const result = await testFireNotification();
    setTest(result);
    if (result === "arrived") confirmedByTestFireRef.current = true;
    refresh();
  };

  const tone = (s: CheckStatus) =>
    s === "ok" ? colors.success : s === "problem" ? colors.destructive : colors.warning;
  const icon = (s: CheckStatus) =>
    s === "ok" ? "check-circle" : s === "problem" ? "x-circle" : "help-circle";

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
    headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    content: { paddingHorizontal: 20, paddingBottom: insets.bottom + 24 },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radiusCard,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 12,
    },
    row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
    label: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    subLabel: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
      lineHeight: 18,
    },
    fix: {
      alignSelf: "flex-start",
      marginTop: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: colors.radiusCapsule,
      backgroundColor: colors.primary,
    },
    fixText: { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 13 },
    button: {
      marginTop: 4,
      paddingVertical: 14,
      borderRadius: colors.radiusCapsule,
      backgroundColor: colors.primary,
      alignItems: "center",
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Will reminders reach me?</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {!assessment ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View
              style={[styles.card, styles.row]}
              testID={`delivery-overall-${assessment.overall}`}
            >
              <Feather name={icon(assessment.overall)} size={20} color={tone(assessment.overall)} />
              <Text style={[styles.label, { flex: 1 }]}>{OVERALL_COPY[assessment.overall]}</Text>
            </View>

            {assessment.checks.map((c) => (
              <View key={c.id} style={styles.card}>
                <View style={styles.row} testID={`delivery-status-${c.id}-${c.status}`}>
                  <Feather name={icon(c.status)} size={18} color={tone(c.status)} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>{c.title}</Text>
                    <Text style={styles.subLabel}>{c.detail}</Text>
                    {c.fix && (
                      <Pressable
                        style={styles.fix}
                        onPress={() => applyFix(c.fix!)}
                        testID={`delivery-fix-${c.id}`}
                      >
                        <Text style={styles.fixText}>Fix in Settings</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        <View style={styles.card}>
          <Text style={styles.label}>Send a test reminder</Text>
          <Text style={styles.subLabel}>
            Settings can look right and still fail. This sends a real reminder in a few
            seconds and checks that it arrives. Keep the app open while it runs.
          </Text>
          {test !== "idle" && (
            <Text
              style={[
                styles.subLabel,
                {
                  marginTop: 10,
                  color:
                    test === "arrived"
                      ? colors.success
                      : test === "waiting"
                        ? colors.mutedForeground
                        : colors.destructive,
                },
              ]}
              testID={`delivery-test-${test}`}
            >
              {TEST_COPY[test]}
            </Text>
          )}
          <Pressable
            style={[styles.button, { opacity: test === "waiting" ? 0.5 : 1, marginTop: 12 }]}
            disabled={test === "waiting"}
            onPress={runTest}
            testID="delivery-test-fire"
          >
            <Text style={styles.fixText}>
              {test === "idle" || test === "waiting" ? "Send test reminder" : "Send again"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
