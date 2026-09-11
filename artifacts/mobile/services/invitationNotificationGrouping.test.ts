import * as Notifications from "expo-notifications";
import { collapseInvitationNotifications } from "./invitationNotificationGrouping";

jest.mock("expo-notifications");

const getPresented = Notifications.getPresentedNotificationsAsync as jest.Mock;
const dismiss = Notifications.dismissNotificationAsync as jest.Mock;
const schedule = Notifications.scheduleNotificationAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  getPresented.mockResolvedValue([]);
});

describe("collapseInvitationNotifications", () => {
  it("does nothing when fewer than 2 are pending", async () => {
    await collapseInvitationNotifications(1, "Amma");
    expect(getPresented).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it("dismisses every presented invitation notification and posts one summary", async () => {
    getPresented.mockResolvedValue([
      { request: { identifier: "n1", content: { data: { type: "invitation" } } } },
      { request: { identifier: "n2", content: { data: { type: "invitation" } } } },
      // A non-invitation notification (a locally-scheduled reminder) must be
      // left alone - this workaround only touches invitation pushes.
      { request: { identifier: "n3", content: { data: { reminderId: "r1" } } } },
    ]);

    await collapseInvitationNotifications(3, "Ravi");

    expect(dismiss).toHaveBeenCalledWith("n1");
    expect(dismiss).toHaveBeenCalledWith("n2");
    expect(dismiss).not.toHaveBeenCalledWith("n3");
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "Ravi + 2 more reminders waiting",
          data: { type: "invitation" },
        }),
        trigger: null,
      })
    );
  });

  it("uses singular copy for exactly one other pending invitation", async () => {
    await collapseInvitationNotifications(2, "Amma");

    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ title: "Amma + 1 more reminder waiting" }),
      })
    );
  });

  it("never throws when the underlying notification calls fail", async () => {
    getPresented.mockRejectedValue(new Error("boom"));
    await expect(collapseInvitationNotifications(2, "Amma")).resolves.toBeUndefined();
  });

  it("skips a presented notification with no identifier rather than dismissing undefined", async () => {
    getPresented.mockResolvedValue([
      { request: { identifier: undefined, content: { data: { type: "invitation" } } } },
    ]);

    await collapseInvitationNotifications(2, "Amma");

    expect(dismiss).not.toHaveBeenCalled();
    expect(schedule).toHaveBeenCalled();
  });
});
