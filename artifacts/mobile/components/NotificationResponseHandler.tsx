import { router } from "expo-router";
import React, { useEffect, useRef } from "react";

import {
  getSnoozePreset,
  loadReminderById,
  markDoneById,
  scheduleSnoozeNotification,
  updateSnoozeById,
} from "@/services/ReminderService";
import { handleNotificationResponse } from "@/services/notificationResponseHandler";

// eslint-disable-next-line
let Notifications: any = null;
try {
  // @ts-ignore
  Notifications = require("expo-notifications");
} catch {
  Notifications = null;
}

export default function NotificationResponseHandler() {
  const lastHandledId = useRef<string | null>(null);

  useEffect(() => {
    if (!Notifications) return;

    const deps = {
      defaultActionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
      lastHandledId,
      markDoneById,
      scheduleSnoozeNotification,
      updateSnoozeById,
      getSnoozePreset,
      loadReminderById,
      navigateToDetail: (id: string, options: { openSnoozeSheet: boolean }) => {
        router.push({
          pathname: "/reminder-detail",
          // Router params serialize to strings, so the flag travels as "1"
          // rather than a boolean the screen would receive as the string
          // "false" and read as truthy.
          params: options.openSnoozeSheet ? { id, openSnooze: "1" } : { id },
        });
      },
    };

    Notifications.getLastNotificationResponseAsync()
      .then((response: any) => {
        if (response) handleNotificationResponse(response, deps);
      })
      .catch(() => {});

    let subscription: { remove: () => void } | null = null;
    try {
      subscription = Notifications.addNotificationResponseReceivedListener(
        (response: any) => {
          handleNotificationResponse(response, deps);
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

  return null;
}
