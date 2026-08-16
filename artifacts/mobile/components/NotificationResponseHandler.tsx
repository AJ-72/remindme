import { router } from "expo-router";
import React, { useEffect, useRef } from "react";

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
      hasHandledResponse,
      markResponseHandled,
      markDoneById,
      cancelScheduledForReminder,
      cancelNotification,
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

    // NOT a queue drain: this keeps resolving with the same response on every
    // launch until a newer one replaces it, and `lastHandledId` is a fresh ref
    // on every mount. The persisted dedupe inside handleNotificationResponse is
    // what stops the replay; clearing afterwards (where the SDK offers it) just
    // keeps the stale response from being re-offered at all.
    Notifications.getLastNotificationResponseAsync()
      .then(async (response: any) => {
        if (!response) return;
        await handleNotificationResponse(response, deps);
        try {
          // clearLastNotificationResponseAsync is the deprecated spelling;
          // prefer the current one where the installed SDK has it.
          const clear =
            Notifications.clearLastNotificationResponse ??
            Notifications.clearLastNotificationResponseAsync;
          await clear?.();
        } catch {}
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
