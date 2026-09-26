import {
  LEGACY_SNOOZE_ACTION_ID,
  MARK_DONE_ACTION_ID,
  SNOOZE_ACTION_ID,
  SNOOZE_MORE_ACTION_ID,
  isSendReminder,
  type NotificationData,
  type Reminder,
} from "@/services/ReminderService";
import { resolveSnoozeTarget, type SnoozePreset } from "@/utils/snoozePresets";

export interface NotificationResponseLike {
  actionIdentifier: string;
  notification: {
    request: {
      identifier: string;
      content: {
        data: unknown;
      };
    };
  };
}

export interface NotificationResponseHandlerDeps {
  defaultActionIdentifier: string;
  lastHandledId: { current: string | null };
  /**
   * Cross-process dedupe. `lastHandledId` only covers repeat calls inside one
   * JS context; these two cover the headless task and the foreground listener
   * seeing the same response, and the cold-start replay of it.
   */
  hasHandledResponse: (identifier: string) => Promise<boolean>;
  markResponseHandled: (identifier: string) => Promise<void>;
  markDoneById: (id: string) => Promise<void>;
  /** Sweeps every pending notification carrying this reminderId. */
  cancelScheduledForReminder: (reminderId: string) => Promise<void>;
  cancelNotification: (notificationId?: string) => Promise<void>;
  scheduleSnoozeNotification: (
    data: NotificationData,
    target: Date
  ) => Promise<string | undefined>;
  updateSnoozeById: (
    id: string,
    datetime: string,
    notificationId: string | undefined
  ) => Promise<void>;
  navigateToDetail: (id: string, options: { openSnoozeSheet: boolean }) => void;
  navigateToSend: (id: string) => void;
  getSnoozePreset: () => Promise<SnoozePreset>;
  loadReminderById: (id: string) => Promise<Reminder | undefined>;
  /**
   * Reacts to a tapped invitation push (see send-invitation/index.ts's
   * data.type:"invitation" tag). Deliberately takes no navigate callback: the
   * two callers react in different ways and only they know which is possible.
   *
   * - Foreground (NotificationResponseHandler.tsx) HAS a navigator, so it
   *   claims and goes straight to the invitation.
   * - Headless (notificationResponseTask.ts) has none, so it must NOT claim -
   *   claiming consumes the row and there would be nothing left for the app
   *   to show. It arms a flag and lets the launch do the work.
   *
   * Named for the event, not for claiming, because half the implementations
   * deliberately do not claim.
   */
  onInvitationPush: () => Promise<unknown>;
  /**
   * Reacts to a tapped invitation_time_changed push (see
   * respond-invitation/index.ts). Unlike onInvitationPush above, this
   * DOES need to navigate on tap - the local reminder to update already
   * exists on this device (it's the sender's own), there is nothing to
   * "go check for" first. Returns the updated reminder's local id (or
   * undefined if it's gone) so the handler can route straight to it.
   */
  applyRecipientTimeChange: (data: {
    invitationId: string;
    toDatetime: string;
    fromDatetime: string;
    recipientName: string;
  }) => Promise<string | undefined>;
}

function isNotificationData(value: unknown): value is NotificationData {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as NotificationData).reminderId === "string"
  );
}

function isInvitationData(value: unknown): value is { type: "invitation" } {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "invitation"
  );
}

interface TimeChangedData {
  type: "invitation_time_changed";
  invitationId: string;
  toDatetime: string;
  fromDatetime: string;
  recipientName: string;
}

function isTimeChangedData(value: unknown): value is TimeChangedData {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "invitation_time_changed" &&
    typeof (value as { invitationId?: unknown }).invitationId === "string"
  );
}

export async function handleNotificationResponse(
  response: NotificationResponseLike,
  deps: NotificationResponseHandlerDeps
): Promise<void> {
  // Keyed by notification AND action, not by notification alone. One tray
  // notification legitimately carries several distinct responses: tapping the
  // body opens the app, and Mark Done is pressed afterwards on the SAME
  // notification. Keying on the notification id alone let the body tap consume
  // the key and silently drop every later action on that notification - which
  // is exactly how Mark Done from the tray stopped working, and why send
  // reminders (whose flow always starts with a body tap) could never be
  // completed there. Replays of one action still collapse, which is all the
  // dedupe ever needed to do.
  const responseKey = `${response.notification.request.identifier}::${response.actionIdentifier}`;
  if (deps.lastHandledId.current === responseKey) return;
  deps.lastHandledId.current = responseKey;
  // A response can reach us from the headless task, from the live listener, and
  // again from getLastNotificationResponseAsync() on every later cold start.
  // Only the first one may act.
  if (await deps.hasHandledResponse(responseKey)) return;

  const data = response.notification.request.content.data;

  // Invitation pushes carry no reminderId - they're server-originated, not
  // a locally-scheduled reminder - so they must branch off before
  // isNotificationData's reminderId check, which would otherwise just
  // silently drop them. No action-identifier distinction: this push has no
  // custom actions, so any tap (the default action) means "open it".
  if (isInvitationData(data)) {
    await deps.markResponseHandled(responseKey);
    // What "react to this push" means is the INJECTED dep's job, not this
    // function's: only the caller knows whether a navigator exists, and so
    // whether claiming here would consume the row with nothing able to show
    // it. This module stays free of storage side effects either way.
    await deps.onInvitationPush();
    return;
  }

  // Same "no reminderId, must branch before isNotificationData" reasoning
  // as the invitation branch above - this is the sender's own device
  // reacting to the receiver's choice, not a locally-scheduled reminder
  // firing.
  if (isTimeChangedData(data)) {
    await deps.markResponseHandled(responseKey);
    const localId = await deps.applyRecipientTimeChange(data);
    if (localId) {
      deps.navigateToDetail(localId, { openSnoozeSheet: false });
    }
    return;
  }

  if (!isNotificationData(data)) return;

  await deps.markResponseHandled(responseKey);

  if (response.actionIdentifier === deps.defaultActionIdentifier) {
    // Read STORAGE, not the notification payload. Notifications already in the
    // tray at upgrade time carry no send marker, and an unread payload field
    // that looks authoritative is worse than no field at all. A missing
    // reminder falls back to the detail screen, which handles not-found.
    const stored = await deps.loadReminderById(data.reminderId);
    if (stored && isSendReminder(stored)) {
      deps.navigateToSend(data.reminderId);
    } else {
      deps.navigateToDetail(data.reminderId, { openSnoozeSheet: false });
    }
    return;
  }

  // Opens the app rather than snoozing here: the preset list is a sheet, and
  // a notification action can't render one.
  if (response.actionIdentifier === SNOOZE_MORE_ACTION_ID) {
    deps.navigateToDetail(data.reminderId, { openSnoozeSheet: true });
    return;
  }

  if (
    response.actionIdentifier === SNOOZE_ACTION_ID ||
    response.actionIdentifier === LEGACY_SNOOZE_ACTION_ID
  ) {
    const preset = await deps.getSnoozePreset();
    // "tomorrow" needs the reminder's own scheduled time, which the
    // notification payload doesn't carry — look it up. Falling back to now
    // keeps a minutes-preset snooze working even if the lookup fails.
    const reminder = await deps.loadReminderById(data.reminderId);
    const base = reminder?.datetime ?? new Date().toISOString();
    const target = resolveSnoozeTarget(preset, base, new Date());
    // Snoozing REPLACES this reminder's alarm, so everything still pending for
    // it has to go first. Without this, the reminder's original notification
    // (and any orphan left by an earlier double-handled response) stays armed
    // and fires alongside the snoozed copy — updateSnoozeById overwrites the
    // one stored id, so nothing else would ever reach them.
    await deps.cancelScheduledForReminder(data.reminderId);
    await deps.cancelNotification(reminder?.notificationId);
    const notificationId = await deps.scheduleSnoozeNotification(data, target);
    await deps.updateSnoozeById(data.reminderId, target.toISOString(), notificationId);
    return;
  }

  if (response.actionIdentifier === MARK_DONE_ACTION_ID) {
    await deps.markDoneById(data.reminderId);
  }
}
