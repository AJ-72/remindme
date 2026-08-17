/**
 * Headless handler for notification action buttons (Mark Done / Snooze).
 *
 * THE BUG THIS FIXES: those actions set opensAppToForeground: false, so
 * Android delivers them without launching the app. The only response handler
 * used to be a listener registered inside a React useEffect
 * (components/NotificationResponseHandler.tsx), which by definition exists
 * only while the app is running. Tapping Mark Done on a fired reminder with
 * the app closed therefore ran no JS at all and saved nothing.
 *
 * expo-notifications' own Android delegate says so explicitly:
 *   "NOTE the listeners are not set up when the app is killed and is launched
 *    in response to tapping a notification button — this code is a noop in
 *    that case"
 * and in the same function it runs TaskManager tasks whenever the app is not
 * in the foreground. That is the hook this file registers against.
 *
 * The response was not lost outright: the native side queues it in
 * sPendingNotificationResponses, and getLastNotificationResponseAsync() drains
 * it on next launch. So the action appeared to work "eventually" — whenever
 * the user next opened the app — which reads as broken.
 *
 * iOS does not run background tasks for notification responses at all (the
 * delegate comment notes Android matches that behavior deliberately). There,
 * these actions are still handled by the foreground listener.
 */
import { Platform } from "react-native";

import * as TaskManager from "expo-task-manager";

import {
  cancelNotification,
  cancelScheduledForReminder,
  getSnoozePreset,
  loadReminderById,
  markDoneById,
  scheduleSnoozeNotification,
  updateSnoozeById,
} from "@/services/ReminderService";
import {
  hasHandledResponse,
  markResponseHandled,
} from "@/services/handledResponses";
import {
  handleNotificationResponse,
  type NotificationResponseHandlerDeps,
  type NotificationResponseLike,
} from "@/services/notificationResponseHandler";

// eslint-disable-next-line
let Notifications: any = null;
try {
  // @ts-ignore
  Notifications = require("expo-notifications");
} catch {
  Notifications = null;
}

export const NOTIFICATION_RESPONSE_TASK_NAME = "HANDLE_NOTIFICATION_RESPONSE";

/**
 * Deps for the headless path. Deliberately separate from the component's:
 * there is no navigator here, and the dedupe ref is per-invocation rather
 * than per-app-lifetime because each headless wake gets a fresh JS context.
 * That in-memory ref is exactly why the persisted hasHandledResponse /
 * markResponseHandled pair matters here — this context and the foreground
 * listener are handed the same response and can only see each other through
 * storage.
 */
export function buildBackgroundResponseDeps(): NotificationResponseHandlerDeps {
  return {
    defaultActionIdentifier:
      Notifications?.DEFAULT_ACTION_IDENTIFIER ??
      "expo.modules.notifications.actions.DEFAULT",
    lastHandledId: { current: null },
    hasHandledResponse,
    markResponseHandled,
    markDoneById,
    cancelScheduledForReminder,
    cancelNotification,
    scheduleSnoozeNotification,
    updateSnoozeById,
    getSnoozePreset,
    loadReminderById,
    // No navigator exists in a headless context. Actions that need one set
    // opensAppToForeground, so the foreground listener picks them up once the
    // app is open; here this must stay an inert no-op rather than throwing and
    // taking down the task before the storage write.
    navigateToDetail: () => {},
    navigateToSend: () => {},
  };
}

function isResponseLike(value: unknown): value is NotificationResponseLike {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as NotificationResponseLike).actionIdentifier === "string" &&
    !!(value as NotificationResponseLike).notification?.request
  );
}

// defineTask must run at module load, not inside a function, so the task is
// registered before TaskManager wakes the JS runtime headlessly. Mirrors the
// pattern in tasks/rescheduleTask.ts.
if (Platform.OS !== "web") {
  TaskManager.defineTask(
    NOTIFICATION_RESPONSE_TASK_NAME,
    async ({ data, error }: { data: unknown; error: unknown }) => {
      if (error) return;
      // TaskManager hands the response through as a serialized bundle, whose
      // exact shape varies by platform — unwrap defensively rather than
      // trusting one nesting.
      const payload =
        (data as { notificationResponse?: unknown })?.notificationResponse ??
        data;
      if (!isResponseLike(payload)) return;
      try {
        await handleNotificationResponse(payload, buildBackgroundResponseDeps());
      } catch {
        // Swallow: a throw here surfaces as an unhandled rejection in a
        // headless context with nothing to report it to.
      }
    }
  );
}

export async function registerNotificationResponseTask(): Promise<void> {
  if (Platform.OS === "web" || !Notifications?.registerTaskAsync) return;
  try {
    await Notifications.registerTaskAsync(NOTIFICATION_RESPONSE_TASK_NAME);
  } catch {
    // Not available in every environment (Expo Go, web).
  }
}
