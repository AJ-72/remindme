import {
  handleNotificationResponse,
  type NotificationResponseLike,
} from "@/services/notificationResponseHandler";
import {
  MARK_DONE_ACTION_ID,
  SNOOZE_ACTION_ID,
  SNOOZE_MINUTES,
} from "@/services/ReminderService";

const DEFAULT_ACTION_IDENTIFIER = "expo.modules.notifications.actions.DEFAULT";

function makeResponse(
  actionIdentifier: string,
  overrides: { identifier?: string; data?: unknown } = {}
): NotificationResponseLike {
  return {
    actionIdentifier,
    notification: {
      request: {
        identifier: overrides.identifier ?? "notif-1",
        content: {
          data: "data" in overrides ? overrides.data : { reminderId: "r1" },
        },
      },
    },
  };
}

function makeDeps() {
  return {
    defaultActionIdentifier: DEFAULT_ACTION_IDENTIFIER,
    lastHandledId: { current: null as string | null },
    markDoneById: jest.fn().mockResolvedValue(undefined),
    scheduleSnoozeNotification: jest.fn().mockResolvedValue("new-notif"),
    updateSnoozeById: jest.fn().mockResolvedValue(undefined),
    navigateToDetail: jest.fn(),
  };
}

describe("handleNotificationResponse", () => {
  it("navigates to the detail screen on a body tap", async () => {
    const deps = makeDeps();
    await handleNotificationResponse(makeResponse(DEFAULT_ACTION_IDENTIFIER), deps);
    expect(deps.navigateToDetail).toHaveBeenCalledWith("r1");
    expect(deps.markDoneById).not.toHaveBeenCalled();
    expect(deps.scheduleSnoozeNotification).not.toHaveBeenCalled();
  });

  it("marks the reminder done on the Mark Done action, without navigating", async () => {
    const deps = makeDeps();
    await handleNotificationResponse(makeResponse(MARK_DONE_ACTION_ID), deps);
    expect(deps.markDoneById).toHaveBeenCalledWith("r1");
    expect(deps.navigateToDetail).not.toHaveBeenCalled();
  });

  it("schedules a snooze and persists the new schedule on the Snooze action, without navigating", async () => {
    const deps = makeDeps();
    const data = {
      reminderId: "r1",
      title: "T",
      body: "B",
      alarm: true,
      channelId: "reminders-alarm",
    };
    const before = Date.now();
    await handleNotificationResponse(makeResponse(SNOOZE_ACTION_ID, { data }), deps);
    const after = Date.now();

    expect(deps.scheduleSnoozeNotification).toHaveBeenCalledWith(data);
    expect(deps.navigateToDetail).not.toHaveBeenCalled();

    const [id, datetime, notificationId] = deps.updateSnoozeById.mock.calls[0];
    expect(id).toBe("r1");
    expect(notificationId).toBe("new-notif");
    const ms = new Date(datetime).getTime();
    const snoozeMs = SNOOZE_MINUTES * 60 * 1000;
    expect(ms).toBeGreaterThanOrEqual(before + snoozeMs);
    expect(ms).toBeLessThanOrEqual(after + snoozeMs);
  });

  it("ignores an unknown action identifier", async () => {
    const deps = makeDeps();
    await handleNotificationResponse(makeResponse("SOMETHING_ELSE"), deps);
    expect(deps.navigateToDetail).not.toHaveBeenCalled();
    expect(deps.markDoneById).not.toHaveBeenCalled();
    expect(deps.scheduleSnoozeNotification).not.toHaveBeenCalled();
  });

  it("ignores a response with no reminderId in its data payload", async () => {
    const deps = makeDeps();
    await handleNotificationResponse(
      makeResponse(DEFAULT_ACTION_IDENTIFIER, { data: null }),
      deps
    );
    expect(deps.navigateToDetail).not.toHaveBeenCalled();
  });

  it("dedups: does not re-handle a response with an identifier already processed", async () => {
    const deps = makeDeps();
    const response = makeResponse(DEFAULT_ACTION_IDENTIFIER, { identifier: "notif-1" });
    await handleNotificationResponse(response, deps);
    await handleNotificationResponse(response, deps);
    expect(deps.navigateToDetail).toHaveBeenCalledTimes(1);
  });

  it("processes a different notification identifier normally after a previous one was handled", async () => {
    const deps = makeDeps();
    await handleNotificationResponse(
      makeResponse(DEFAULT_ACTION_IDENTIFIER, { identifier: "notif-1" }),
      deps
    );
    await handleNotificationResponse(
      makeResponse(DEFAULT_ACTION_IDENTIFIER, { identifier: "notif-2" }),
      deps
    );
    expect(deps.navigateToDetail).toHaveBeenCalledTimes(2);
  });
});
