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
import { checkForInvitations } from "@/services/InvitationService";
import { navigateToInvitationPreview } from "@/hooks/useInvitationCheck";

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
      navigateToSend: (id: string) => {
        router.push({ pathname: "/send-reminder", params: { id } });
      },
      navigateToDetail: (id: string, options: { openSnoozeSheet: boolean }) => {
        router.push({
          pathname: "/reminder-detail",
          // Router params serialize to strings, so the flag travels as "1"
          // rather than a boolean the screen would receive as the string
          // "false" and read as truthy.
          params: options.openSnoozeSheet ? { id, openSnooze: "1" } : { id },
        });
      },
      // Tapped while the app is foregrounded (or the tap just launched it and
      // this listener is already live) - a navigator exists here, unlike the
      // headless task's own deps, so this can go straight to the invitation
      // instead of waiting for the next useInvitationCheck() foreground pass.
      checkForInvitations: () => checkForInvitations(navigateToInvitationPreview),
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

    // Separate from the response listener above: that one only fires on a
    // TAP. An invitation push that arrives while the app is already open
    // needs to be picked up without waiting for the user to tap the tray -
    // this is the foreground-received case from
    // hooks/useInvitationCheck.ts's own header (mount/foreground-resume
    // covers launch and backgrounded-then-resumed; this covers "already
    // looking at the app when the push lands").
    let receivedSubscription: { remove: () => void } | null = null;
    try {
      receivedSubscription = Notifications.addNotificationReceivedListener(
        (notification: any) => {
          const data = notification?.request?.content?.data;
          if (data?.type === "invitation") {
            checkForInvitations(navigateToInvitationPreview);
          }
        }
      );
    } catch {
      // ignore — listener may not be available in all environments
    }

    return () => {
      try {
        subscription?.remove();
      } catch {}
      try {
        receivedSubscription?.remove();
      } catch {}
    };
  }, []);

  return null;
}
