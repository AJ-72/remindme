import {
  handleNotificationResponse,
  type NotificationResponseLike,
} from "@/services/notificationResponseHandler";
import {
  MARK_DONE_ACTION_ID,
  SNOOZE_ACTION_ID,
  SNOOZE_MORE_ACTION_ID,
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
  // Stands in for the AsyncStorage-backed set, shared by every deps object a
  // test builds so two "processes" can be simulated against one store.
  const handled = new Set<string>();
  return {
    defaultActionIdentifier: DEFAULT_ACTION_IDENTIFIER,
    lastHandledId: { current: null as string | null },
    handled,
    hasHandledResponse: jest.fn(async (id: string) => handled.has(id)),
    markResponseHandled: jest.fn(async (id: string) => {
      handled.add(id);
    }),
    markDoneById: jest.fn().mockResolvedValue(undefined),
    cancelScheduledForReminder: jest.fn().mockResolvedValue(undefined),
    cancelNotification: jest.fn().mockResolvedValue(undefined),
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
    expect(deps.navigateToDetail).toHaveBeenCalledWith("r1", { openSnoozeSheet: false });
    expect(deps.markDoneById).not.toHaveBeenCalled();
    expect(deps.scheduleSnoozeNotification).not.toHaveBeenCalled();
  });

  // Android notification actions cannot open a sub-menu, so reaching the full
  // preset list means opening the app with the sheet already showing.
  it("opens the app to the snooze sheet on the More options action", async () => {
    const deps = makeDeps();
    await handleNotificationResponse(makeResponse(SNOOZE_MORE_ACTION_ID), deps);
    expect(deps.navigateToDetail).toHaveBeenCalledWith("r1", { openSnoozeSheet: true });
  });

  it("does not snooze or mark done when opening the sheet", async () => {
    const deps = makeDeps();
    await handleNotificationResponse(makeResponse(SNOOZE_MORE_ACTION_ID), deps);
    expect(deps.scheduleSnoozeNotification).not.toHaveBeenCalled();
    expect(deps.updateSnoozeById).not.toHaveBeenCalled();
    expect(deps.markDoneById).not.toHaveBeenCalled();
  });

  // The one-tap button must keep working untouched alongside the new one.
  it("still snoozes with the stored preset on the quick Snooze action", async () => {
    const deps = makeDeps();
    await handleNotificationResponse(makeResponse(SNOOZE_ACTION_ID), deps);
    expect(deps.scheduleSnoozeNotification).toHaveBeenCalled();
    expect(deps.navigateToDetail).not.toHaveBeenCalled();
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

  // The spam bug: one Snooze press reached both the headless task and the
  // foreground listener, each with its own in-memory ref, so both scheduled.
  it("dedups across JS contexts that share the persisted handled set", async () => {
    const headless = makeDeps();
    const foreground = makeDeps();
    // One store, two "processes" — mirrors AsyncStorage being shared.
    foreground.hasHandledResponse = jest.fn(async (id: string) =>
      headless.handled.has(id)
    );
    foreground.markResponseHandled = jest.fn(async (id: string) => {
      headless.handled.add(id);
    });
    const response = makeResponse(SNOOZE_ACTION_ID);

    await handleNotificationResponse(response, headless);
    await handleNotificationResponse(response, foreground);

    expect(headless.scheduleSnoozeNotification).toHaveBeenCalledTimes(1);
    expect(foreground.scheduleSnoozeNotification).not.toHaveBeenCalled();
  });

  // getLastNotificationResponseAsync() re-offers the same response on every
  // cold start, and the component's ref is new on every mount — only the
  // persisted mark can stop the replay from snoozing again.
  it("does not re-snooze a replayed cold-start response in a fresh context", async () => {
    const first = makeDeps();
    const response = makeResponse(SNOOZE_ACTION_ID);
    await handleNotificationResponse(response, first);

    const relaunch = makeDeps();
    relaunch.hasHandledResponse = jest.fn(async (id: string) =>
      first.handled.has(id)
    );
    await handleNotificationResponse(response, relaunch);

    expect(relaunch.scheduleSnoozeNotification).not.toHaveBeenCalled();
  });

  it("cancels everything still pending for the reminder before scheduling the snooze", async () => {
    const deps = makeDeps();
    deps.loadReminderById.mockResolvedValue({
      id: "r1",
      title: "T",
      description: "",
      datetime: new Date().toISOString(),
      completed: false,
      notificationId: "old-notif",
    });

    await handleNotificationResponse(makeResponse(SNOOZE_ACTION_ID), deps);

    expect(deps.cancelScheduledForReminder).toHaveBeenCalledWith("r1");
    expect(deps.cancelNotification).toHaveBeenCalledWith("old-notif");
    const cancelOrder = deps.cancelScheduledForReminder.mock.invocationCallOrder[0];
    const scheduleOrder =
      deps.scheduleSnoozeNotification.mock.invocationCallOrder[0];
    // Order matters: sweeping after scheduling would cancel the new one.
    expect(cancelOrder).toBeLessThan(scheduleOrder);
  });

  it("does not mark a response with no reminderId as handled", async () => {
    const deps = makeDeps();
    await handleNotificationResponse(
      makeResponse(DEFAULT_ACTION_IDENTIFIER, { data: null }),
      deps
    );
    expect(deps.markResponseHandled).not.toHaveBeenCalled();
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
