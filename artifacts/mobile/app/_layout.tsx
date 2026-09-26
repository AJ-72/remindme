import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import {
  NotoSansMalayalam_400Regular,
  NotoSansMalayalam_500Medium,
  NotoSansMalayalam_600SemiBold,
  NotoSansMalayalam_700Bold,
} from "@expo-google-fonts/noto-sans-malayalam";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import ExactAlarmBanner from "@/components/ExactAlarmBanner";
import NameOnboarding from "@/components/NameOnboarding";
import ThemedStatusBar from "@/components/ThemedStatusBar";
import NotificationResponseHandler from "@/components/NotificationResponseHandler";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SharedTextProvider } from "@/contexts/SharedTextContext";
import { TourProvider, useTour } from "@/contexts/TourContext";
import TourOverlay from "@/components/TourOverlay";
import {
  checkExactAlarmPermission,
  hasSeenFeatureTour,
} from "@/services/ReminderService";
import { initAnalytics } from "@/services/AnalyticsService";
import { startAppAutoBackup } from "@/services/DriveBackupService";
import {
  captureHandledError,
  initCrashReporting,
} from "@/services/CrashReportingService";
import { refreshTelemetryConsent } from "@/services/telemetryConsent";
import { registerRescheduleTask } from "@/tasks/rescheduleTask";
import { registerNotificationResponseTask } from "@/tasks/notificationResponseTask";
import { useInvitationCheck } from "@/hooks/useInvitationCheck";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="add-reminder"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="send-reminder"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="reminder-detail"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen name="smart-alerts" options={{ headerShown: false }} />
      <Stack.Screen name="delivery-check" options={{ headerShown: false }} />
      <Stack.Screen name="backup" options={{ headerShown: false }} />
      <Stack.Screen name="welcome-back" options={{ headerShown: false }} />
      <Stack.Screen name="why-tasks-slip" options={{ headerShown: false }} />
      <Stack.Screen name="bind-invite" options={{ headerShown: false }} />
      <Stack.Screen
        name="register-number"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="invitation-preview"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="pending-invitations"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

/**
 * Bridges NameOnboarding's onSettled callback into TourContext.start().
 * A separate component because useTour() must be called under TourProvider,
 * which sits inside RemindersProvider alongside NameOnboarding itself.
 */
function FeatureTourAutoStart({ trigger }: { trigger: number }) {
  const tour = useTour();
  const started = useRef(false);

  useEffect(() => {
    if (trigger === 0 || started.current) return;
    started.current = true;
    (async () => {
      const seen = await hasSeenFeatureTour();
      if (!seen) tour.start();
    })();
  }, [trigger, tour]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    NotoSansMalayalam_400Regular,
    NotoSansMalayalam_500Medium,
    NotoSansMalayalam_600SemiBold,
    NotoSansMalayalam_700Bold,
  });

  const [showAlarmBanner, setShowAlarmBanner] = useState(false);
  const alarmChecked = useRef(false);
  // A counter, not a boolean: NameOnboarding's effect can legitimately fire
  // onSettled more than once across remounts, and FeatureTourAutoStart only
  // needs to know "settled happened", not how many times.
  const [nameSettledTick, setNameSettledTick] = useState(0);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    registerRescheduleTask();
    registerNotificationResponseTask();
  }, []);

  // B3: debounced Drive auto-backup after any change, flushed when the app
  // leaves the foreground. A no-op until the user signs in to Drive, and
  // until this install has settled its restore decision.
  useEffect(() => startAppAutoBackup(), []);

  // Telemetry starts here, and consent is read back FIRST. Both services
  // no-op without their env-var credentials, so this is inert in local dev
  // and under Jest. Nothing here is awaited by render: a telemetry endpoint
  // being slow or unreachable must not hold up first paint.
  useEffect(() => {
    refreshTelemetryConsent()
      .then(() => {
        initCrashReporting();
        return initAnalytics();
      })
      .catch(() => {});
  }, []);

  // Checks for pending invitations on launch and again on every foreground
  // resume, so an already-bound user sees a sender's reminder without
  // reloading or re-registering. See hooks/useInvitationCheck.ts.
  useInvitationCheck();

  // Initial check on mount
  useEffect(() => {
    if (alarmChecked.current) return;
    alarmChecked.current = true;
    checkExactAlarmPermission().then((granted) => {
      if (granted === false) setShowAlarmBanner(true);
    });
  }, []);

  // There is deliberately no notification permission request here any more.
  // A cold-launch dialog asks for something the user cannot yet judge: they
  // have no reminder, so "Allow notifications" buys them nothing visible and
  // a refusal costs them nothing they can see. The ask now happens on the
  // first save, where the answer decides whether that reminder rings - see
  // ensureNotificationPermission() in ReminderService.
  //
  // Re-check when user returns from Settings so banner clears automatically
  // once the permission is granted, without requiring an app restart.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        checkExactAlarmPermission().then((granted) => {
          // granted === false  → still missing, show banner
          // granted === true   → just granted, clear banner
          // granted === null   → not applicable, clear banner
          setShowAlarmBanner(granted === false);
        });
      }
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      {/* Outside ErrorBoundary on purpose: ErrorFallback calls useColors(),
          so the provider has to be above it for a crash screen to honour the
          user's theme. */}
      <ThemeProvider>
        {/* Inside ThemeProvider: the icons must follow the APP's resolved
            scheme, not the device's. See ThemedStatusBar. */}
        <ThemedStatusBar />
        {/* The one place a render crash can still be reported before the
            fallback screen replaces the tree. */}
        <ErrorBoundary
          onError={(error, componentStack) =>
            captureHandledError(error, { component_stack: componentStack })
          }
        >
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <RemindersProvider>
                  <TourProvider>
                    <NotificationResponseHandler />
                    <NameOnboarding
                      enabled
                      onSettled={() => setNameSettledTick((t) => t + 1)}
                    />
                    <FeatureTourAutoStart trigger={nameSettledTick} />
                    <SharedTextProvider>
                      <View style={{ flex: 1 }}>
                        {showAlarmBanner && (
                          <ExactAlarmBanner
                            onDismiss={() => setShowAlarmBanner(false)}
                          />
                        )}
                        <RootLayoutNav />
                      </View>
                    </SharedTextProvider>
                    <TourOverlay />
                  </TourProvider>
                </RemindersProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
