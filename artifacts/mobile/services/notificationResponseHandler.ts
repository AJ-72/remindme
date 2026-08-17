import {
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
}

function isNotificationData(value: unknown): value is NotificationData {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as NotificationData).reminderId === "string"
  );
}

export async function handleNotificationResponse(
  response: NotificationResponseLike,
  deps: NotificationResponseHandlerDeps
): Promise<void> {
  const notificationIdentifier = response.notification.request.identifier;
  if (deps.lastHandledId.current === notificationIdentifier) return;
  deps.lastHandledId.current = notificationIdentifier;
  // A response can reach us from the headless task, from the live listener, and
  // again from getLastNotificationResponseAsync() on every later cold start.
  // Only the first one may act.
  if (await deps.hasHandledResponse(notificationIdentifier)) return;

  const data = response.notification.request.content.data;
  if (!isNotificationData(data)) return;

  await deps.markResponseHandled(notificationIdentifier);

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

  if (response.actionIdentifier === SNOOZE_ACTION_ID) {
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
