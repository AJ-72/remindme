import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Mask, Rect } from "react-native-svg";
import { useRouter, usePathname } from "expo-router";

import { useColors } from "@/hooks/useColors";
import { useTour, TourRect } from "@/contexts/TourContext";
import { FEATURE_TOUR_STEPS } from "@/constants/featureTour";

const SPOTLIGHT_PADDING = 8;
const SPOTLIGHT_RADIUS = 12;
// How long to keep retrying a measurement after navigating to a step's
// route, before giving up and showing a centered card with no spotlight.
// Covers the gap between a screen mounting and its layout settling.
const MEASURE_TIMEOUT_MS = 1500;
const MEASURE_RETRY_MS = 100;

/**
 * Full-screen coach-mark overlay. Mounted once at the app root; renders
 * nothing while the tour is inactive. Drives its own navigation - when the
 * active step's route differs from the current screen, it pushes there so
 * a caller never has to sequence screen changes by hand.
 */
export default function TourOverlay() {
  const { active, step, stepIndex, isLastStep, next, skip, measureTarget } =
    useTour();
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const [rect, setRect] = useState<TourRect | null>(null);
  const [ready, setReady] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, [step]);

  // Navigate to the step's screen if we're not already there.
  useEffect(() => {
    if (!active || !step) return;
    if (pathname !== step.route) {
      router.push(step.route as never);
    }
  }, [active, step, pathname, router]);

  // Measure (and re-measure on a short poll) the step's target once its
  // screen is current. Falls back to no-spotlight after MEASURE_TIMEOUT_MS.
  useEffect(() => {
    if (!active || !step) {
      setRect(null);
      setReady(false);
      return;
    }
    if (!step.targetId) {
      setRect(null);
      setReady(true);
      return;
    }
    if (pathname !== step.route) {
      setReady(false);
      return;
    }
    setReady(false);
    const startedAt = Date.now();
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const found = await measureTarget(step.targetId!);
      if (cancelled) return;
      if (found) {
        setRect(found);
        setReady(true);
        return;
      }
      if (Date.now() - startedAt >= MEASURE_TIMEOUT_MS) {
        setRect(null);
        setReady(true);
        return;
      }
      setTimeout(poll, MEASURE_RETRY_MS);
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [active, step, pathname, measureTarget]);

  if (!active || !step || !ready) return null;

  const { width: screenW, height: screenH } = Dimensions.get("window");
  const spot = rect
    ? {
        x: rect.x - SPOTLIGHT_PADDING,
        y: rect.y - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      }
    : null;

  // Place the tooltip card below the spotlight if there's room, otherwise
  // above it; a step with no spotlight centers on screen.
  const cardTop = spot
    ? spot.y + spot.height + 16 < screenH - 220
      ? spot.y + spot.height + 16
      : Math.max(40, spot.y - 200)
    : undefined;

  const styles = StyleSheet.create({
    fill: { flex: 1 },
    card: {
      position: spot ? "absolute" : undefined,
      top: cardTop,
      marginHorizontal: 20,
      alignSelf: spot ? undefined : "center",
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
      maxWidth: 340,
    },
    title: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 6,
    },
    body: {
      fontSize: 14,
      color: colors.mutedForeground,
      lineHeight: 20,
      marginBottom: 16,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    progress: {
      fontSize: 12,
      color: colors.mutedForeground,
    },
    actions: {
      flexDirection: "row",
      gap: 16,
    },
    skipText: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontWeight: "600",
    },
    nextButton: {
      backgroundColor: colors.primary,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 8,
    },
    nextText: {
      fontSize: 14,
      color: colors.primaryForeground,
      fontWeight: "700",
    },
  });

  return (
    <Modal visible transparent animationType="fade" testID="tour-overlay">
      <View style={styles.fill}>
        <Svg
          width={screenW}
          height={screenH}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Mask id="tour-mask">
            <Rect x={0} y={0} width={screenW} height={screenH} fill="#fff" />
            {spot && (
              <Rect
                x={spot.x}
                y={spot.y}
                width={spot.width}
                height={spot.height}
                rx={SPOTLIGHT_RADIUS}
                ry={SPOTLIGHT_RADIUS}
                fill="#000"
              />
            )}
          </Mask>
          <Rect
            x={0}
            y={0}
            width={screenW}
            height={screenH}
            fill="rgba(0,0,0,0.72)"
            mask="url(#tour-mask)"
          />
        </Svg>
        {/* Tapping the dimmed area advances the tour, same as Next. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={next}
          testID="tour-backdrop"
        />
        <View style={styles.card} testID="tour-card">
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>
          <View style={styles.row}>
            <Text style={styles.progress}>
              {stepIndex + 1} / {FEATURE_TOUR_STEPS.length}
            </Text>
            <View style={styles.actions}>
              <Pressable onPress={skip} testID="tour-skip">
                <Text style={styles.skipText}>Skip</Text>
              </Pressable>
              <Pressable style={styles.nextButton} onPress={next} testID="tour-next">
                <Text style={styles.nextText}>
                  {isLastStep ? "Done" : "Next"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
