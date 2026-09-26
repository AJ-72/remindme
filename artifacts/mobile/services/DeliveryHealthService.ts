import { Linking, Platform } from "react-native";

import {
  isIgnoringBatteryOptimizations,
  openBatteryOptimizationSettings,
} from "@/modules/delivery-health";
import {
  channelIdForAlarm,
  checkExactAlarmPermission,
  getDefaultAlarmEnabled,
  getNotificationPermissionState,
  getVibrationEnabled,
  openAppSettings,
  openExactAlarmSettings,
} from "@/services/ReminderService";
import type { ChannelLevel, DeliveryInputs, FixAction } from "@/utils/deliveryHealth";
import {
  runDeliveryTestFire,
  TEST_FIRE_DELAY_SECONDS,
  TEST_FIRE_TIMEOUT_MS,
  type TestFireResult,
} from "@/utils/deliveryTestFire";

let Notifications: any = null;
try {
  Notifications = require("expo-notifications");
} catch {
  Notifications = null;
}

/**
 * Android channel importance -> what the user experiences. Compared against
 * the library's own enum values rather than literals, because expo's
 * AndroidImportance is offset from Android's NotificationManager constants.
 */
export function channelLevelFromImportance(
  importance: number | undefined | null,
  enumValues: { NONE: number; LOW: number }
): ChannelLevel | null {
  if (typeof importance !== "number") return null;
  if (importance <= enumValues.NONE) return "blocked";
  if (importance <= enumValues.LOW) return "quiet";
  return "normal";
}

async function readChannelLevel(): Promise<ChannelLevel | null> {
  if (Platform.OS !== "android" || !Notifications?.getNotificationChannelAsync) return null;
  try {
    const id = channelIdForAlarm(await getDefaultAlarmEnabled(), await getVibrationEnabled());
    const channel = await Notifications.getNotificationChannelAsync(id);
    const imp = Notifications.AndroidImportance;
    if (!channel || !imp) return null;
    return channelLevelFromImportance(channel.importance, imp);
  } catch {
    return null;
  }
}

export async function getDeliveryInputs(): Promise<DeliveryInputs> {
  const [perm, channelLevel, exactAlarm] = await Promise.all([
    getNotificationPermissionState(),
    readChannelLevel(),
    checkExactAlarmPermission(),
  ]);
  return {
    notificationsGranted: perm.granted,
    channelLevel,
    exactAlarm,
    ignoringBatteryOptimizations:
      Platform.OS === "android" ? isIgnoringBatteryOptimizations() : null,
  };
}

export function applyFix(fix: FixAction): void {
  switch (fix) {
    case "exact_alarm_settings":
      openExactAlarmSettings();
      return;
    case "battery_settings":
      if (!openBatteryOptimizationSettings()) Linking.openSettings().catch(() => {});
      return;
    case "app_settings":
      openAppSettings();
      return;
  }
}

export async function testFireNotification(): Promise<TestFireResult> {
  if (!Notifications) return "schedule_failed";
  const channelId = channelIdForAlarm(await getDefaultAlarmEnabled(), await getVibrationEnabled());
  return runDeliveryTestFire({
    timeoutMs: TEST_FIRE_TIMEOUT_MS,
    schedule: (token) =>
      Notifications.scheduleNotificationAsync({
        content: {
          title: "Test reminder",
          body: "If you can see this, reminders are reaching you.",
          data: { deliverySelfTest: token },
          ...(Platform.OS === "android" ? { channelId } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes?.TIME_INTERVAL ?? "timeInterval",
          seconds: TEST_FIRE_DELAY_SECONDS,
          ...(Platform.OS === "android" ? { channelId } : {}),
        },
      }),
    cancel: (id) => Notifications.cancelScheduledNotificationAsync(id),
    onReceived: (cb) =>
      Notifications.addNotificationReceivedListener((n: any) =>
        cb(n?.request?.content?.data)
      ),
  });
}
