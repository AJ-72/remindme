import {
  handleNotificationResponse,
  type NotificationResponseLike,
} from "@/services/notificationResponseHandler";
import {
  MARK_DONE_ACTION_ID,
  SNOOZE_ACTION_ID,
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
    getSnoozePreset: jest
      .fn()
      .mockResolvedValue({ kind: "minutes", minutes: 15 } as const),
    loadReminderById: jest.fn().mockResolvedValue({
      id: "r1",
      title: "T",
      description: "",
      datetime: new Date("2026-08-07T08:30:00").toISOString(),
      completed: false,
    }),
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

  it("schedules a snooze at the preset's target and persists it, without navigating", async () => {
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

    expect(deps.navigateToDetail).not.toHaveBeenCalled();

    const [passedData, target] = deps.scheduleSnoozeNotification.mock.calls[0];
    expect(passedData).toEqual(data);
    const snoozeMs = 15 * 60 * 1000;
    expect(target.getTime()).toBeGreaterThanOrEqual(before + snoozeMs);
    expect(target.getTime()).toBeLessThanOrEqual(after + snoozeMs);

    const [id, datetime, notificationId] = deps.updateSnoozeById.mock.calls[0];
    expect(id).toBe("r1");
    expect(notificationId).toBe("new-notif");
    // The persisted datetime must match the scheduled target exactly.
    expect(datetime).toBe(target.toISOString());
  });

  it("uses the reminder's own datetime for the tomorrow preset", async () => {
    const deps = makeDeps();
    deps.getSnoozePreset.mockResolvedValue({ kind: "tomorrow" } as const);
    const scheduled = new Date(Date.now() + 2 * 60 * 60 * 1000);
    deps.loadReminderById.mockResolvedValue({
      id: "r1",
      title: "T",
      description: "",
      datetime: scheduled.toISOString(),
      completed: false,
    });
    const data = {
      reminderId: "r1",
      title: "T",
      body: "B",
      alarm: true,
      channelId: "reminders-alarm",
    };

    await handleNotificationResponse(makeResponse(SNOOZE_ACTION_ID, { data }), deps);

    const [, target] = deps.scheduleSnoozeNotification.mock.calls[0];
    expect(target.getTime()).toBe(scheduled.getTime() + 24 * 60 * 60 * 1000);
  });

  it("still snoozes by the minutes preset when the reminder can't be loaded", async () => {
    const deps = makeDeps();
    deps.loadReminderById.mockResolvedValue(undefined);
    const data = {
      reminderId: "r1",
      title: "T",
      body: "B",
      alarm: true,
      channelId: "reminders-alarm",
    };
    const before = Date.now();

    await handleNotificationResponse(makeResponse(SNOOZE_ACTION_ID, { data }), deps);

    const [, target] = deps.scheduleSnoozeNotification.mock.calls[0];
    expect(target.getTime()).toBeGreaterThanOrEqual(before + 15 * 60 * 1000);
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
