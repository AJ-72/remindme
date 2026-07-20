import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
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
import NotificationResponseHandler from "@/components/NotificationResponseHandler";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { SharedTextProvider } from "@/contexts/SharedTextContext";
import {
  checkExactAlarmPermission,
  hasCompletedPermissionOnboarding,
  markPermissionOnboardingComplete,
  openExactAlarmSettings,
  requestNotificationPermissions,
} from "@/services/ReminderService";
import { registerRescheduleTask } from "@/tasks/rescheduleTask";

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
  });

  const [showAlarmBanner, setShowAlarmBanner] = useState(false);
  const alarmChecked = useRef(false);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    registerRescheduleTask();
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
      if (completed) return;
      await requestNotificationPermissions();
      const exactAlarmGranted = await checkExactAlarmPermission();
      if (exactAlarmGranted === false) {
        openExactAlarmSettings();
      }
      await markPermissionOnboardingComplete();
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
      <StatusBar style="dark" />
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <RemindersProvider>
                <NotificationResponseHandler />
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
    </SafeAreaProvider>
  );
}
