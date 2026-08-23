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
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import ExactAlarmBanner from "@/components/ExactAlarmBanner";
import NameOnboarding from "@/components/NameOnboarding";
import NotificationResponseHandler from "@/components/NotificationResponseHandler";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SharedTextProvider } from "@/contexts/SharedTextContext";
import {
  checkExactAlarmPermission,
  hasCompletedPermissionOnboarding,
  markPermissionOnboardingComplete,
  openExactAlarmSettings,
  requestNotificationPermissions,
} from "@/services/ReminderService";
import { registerRescheduleTask } from "@/tasks/rescheduleTask";
import { registerNotificationResponseTask } from "@/tasks/notificationResponseTask";

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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
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
  const [readyForNamePrompt, setReadyForNamePrompt] = useState(false);
  const alarmChecked = useRef(false);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    registerRescheduleTask();
    registerNotificationResponseTask();
  }, []);

  // Initial check on mount
  useEffect(() => {
    if (alarmChecked.current) return;
    alarmChecked.current = true;
    checkExactAlarmPermission().then((granted) => {
      if (granted === false) setShowAlarmBanner(true);
    });
  }, []);

  // First-launch onboarding: proactively request the notification permission
  // (rather than waiting for the user's first reminder save) and, on
  // Android 12+, send them straight to the exact-alarm settings screen if
  // it isn't already granted. Runs once per install, tracked in AsyncStorage.
  useEffect(() => {
    hasCompletedPermissionOnboarding().then(async (completed) => {
      if (completed) {
        setReadyForNamePrompt(true);
        return;
      }
      await requestNotificationPermissions();
      const exactAlarmGranted = await checkExactAlarmPermission();
      if (exactAlarmGranted === false) {
        openExactAlarmSettings();
      }
      await markPermissionOnboardingComplete();
      // Only now may the name sheet open. Asking while a system permission
      // dialog is up would put it behind that dialog, and the tap dismissing
      // the dialog would skip the name prompt for good.
      setReadyForNamePrompt(true);
    });
  }, []);

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
      {/* "auto" flips the status-bar icons to match the current scheme.
          Hardcoding "dark" renders dark icons on a dark background, i.e.
          an invisible clock and battery. */}
      <StatusBar style="auto" />
      {/* Outside ErrorBoundary on purpose: ErrorFallback calls useColors(),
          so the provider has to be above it for a crash screen to honour the
          user's theme. */}
      <ThemeProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <RemindersProvider>
                  <NotificationResponseHandler />
                  <NameOnboarding enabled={readyForNamePrompt} />
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
                </RemindersProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
