import {
  MARK_DONE_ACTION_ID,
  SNOOZE_ACTION_ID,
  SNOOZE_MORE_ACTION_ID,
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
  markDoneById: (id: string) => Promise<void>;
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

  const data = response.notification.request.content.data;
  if (!isNotificationData(data)) return;

  if (response.actionIdentifier === deps.defaultActionIdentifier) {
    deps.navigateToDetail(data.reminderId, { openSnoozeSheet: false });
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
    const notificationId = await deps.scheduleSnoozeNotification(data, target);
    await deps.updateSnoozeById(data.reminderId, target.toISOString(), notificationId);
    return;
  }

  if (response.actionIdentifier === MARK_DONE_ACTION_ID) {
    await deps.markDoneById(data.reminderId);
  }
}
