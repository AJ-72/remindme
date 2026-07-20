import {
  MARK_DONE_ACTION_ID,
  SNOOZE_ACTION_ID,
  SNOOZE_MINUTES,
  type NotificationData,
} from "@/services/ReminderService";

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
  scheduleSnoozeNotification: (data: NotificationData) => Promise<string | undefined>;
  updateSnoozeById: (
    id: string,
    datetime: string,
    notificationId: string | undefined
  ) => Promise<void>;
  navigateToDetail: (id: string) => void;
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
    deps.navigateToDetail(data.reminderId);
    return;
  }

  if (response.actionIdentifier === SNOOZE_ACTION_ID) {
    const notificationId = await deps.scheduleSnoozeNotification(data);
    const datetime = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000).toISOString();
    await deps.updateSnoozeById(data.reminderId, datetime, notificationId);
    return;
  }

  if (response.actionIdentifier === MARK_DONE_ACTION_ID) {
    await deps.markDoneById(data.reminderId);
  }
}
