// eslint-disable-next-line
let Notifications: any = null;
try {
  // @ts-ignore
  Notifications = require("expo-notifications");
} catch {
  Notifications = null;
}

/**
 * B15's client-side push-grouping workaround. Expo's push API has no field
 * for Android's native notification group/tag - `PushMessage` in
 * supabase/functions/_shared/expoPush.ts only carries title/body/data - so a
 * server-sent "collapse these into one tray entry" isn't available without
 * bypassing Expo Push for a raw FCM call (a separate, larger piece of
 * infrastructure - see backlog.md B15's own notes on why that was deferred).
 *
 * Instead: when the app is alive to see an invitation push arrive (the
 * addNotificationReceivedListener scope - a fully killed app can't run
 * this, but useInvitationCheck()'s mount-time check already routes 2+
 * pending invitations to the list screen for that case), dismiss whatever
 * individual invitation notifications are already presented and post one
 * locally-built summary in their place. The summary carries the same
 * data.type:"invitation" tag as a server push, so tapping it goes through
 * the exact same handleNotificationResponse branch.
 *
 * Only ever called with 2+ pending - a single pending invitation's own
 * server-sent push (already sender-named per B11) is left alone.
 */
export async function collapseInvitationNotifications(
  pendingCount: number,
  latestSenderName: string
): Promise<void> {
  if (!Notifications || pendingCount < 2) return;

  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    const invitationNotifications = (presented ?? []).filter(
      (n: any) => n?.request?.content?.data?.type === "invitation"
    );

    for (const n of invitationNotifications) {
      const id = n?.request?.identifier;
      if (id) {
        try {
          await Notifications.dismissNotificationAsync(id);
        } catch {}
      }
    }

    const others = pendingCount - 1;
    await Notifications.scheduleNotificationAsync({
      content: {
        title:
          others === 1
            ? `${latestSenderName} + 1 more reminder waiting`
            : `${latestSenderName} + ${others} more reminders waiting`,
        body: "Tap to see all of them",
        data: { type: "invitation" },
      },
      trigger: null,
    });
  } catch {
    // Best-effort - a failure here must never affect invitation delivery
    // itself, which already happened server-side. Worst case the recipient
    // just sees the individual pushes uncollapsed, same as before B15.
  }
}
