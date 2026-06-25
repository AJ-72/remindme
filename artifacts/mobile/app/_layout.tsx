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
import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import ExactAlarmBanner from "@/components/ExactAlarmBanner";
import {
  RemindersProvider,
  SNOOZE_ACTION_ID,
  scheduleSnoozeNotification,
  type SnoozeData,
} from "@/contexts/RemindersContext";
import { SharedTextProvider } from "@/contexts/SharedTextContext";
import { checkExactAlarmPermission } from "@/services/ReminderService";
import { registerRescheduleTask } from "@/tasks/rescheduleTask";

// eslint-disable-next-line
let Notifications: any = null;
try {
  // @ts-ignore
  Notifications = require("expo-notifications");
} catch {
  Notifications = null;
}

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

  useEffect(() => {
    if (alarmChecked.current) return;
    alarmChecked.current = true;
    checkExactAlarmPermission().then((granted) => {
      if (granted === false) {
        setShowAlarmBanner(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!Notifications) return;
    let subscription: { remove: () => void } | null = null;
    try {
      subscription = Notifications.addNotificationResponseReceivedListener(
        (response: any) => {
          if (response.actionIdentifier !== SNOOZE_ACTION_ID) return;
          const data = response.notification.request.content
            .data as SnoozeData | null;
          if (!data) return;
          scheduleSnoozeNotification(data);
        }
      );
    } catch {
      // ignore — listener may not be available in all environments
    }
    return () => {
      try {
        subscription?.remove();
      } catch {}
    };
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <RemindersProvider>
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
