import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import NotificationResponseHandler from "@/components/NotificationResponseHandler";
import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  clearLastNotificationResponse,
  getLastNotificationResponseAsync,
} from "expo-notifications";
import { MARK_DONE_ACTION_ID } from "@/services/ReminderService";
import * as InvitationService from "@/services/InvitationService";

jest.mock("@/services/InvitationService", () => ({
  checkForInvitations: jest.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (InvitationService.checkForInvitations as jest.Mock).mockResolvedValue([]);
});

describe("NotificationResponseHandler", () => {
  it("subscribes to live responses and checks for a cold-start response on mount", () => {
    render(<NotificationResponseHandler />);
    expect(addNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
    expect(getLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
  });

  // The native side keeps re-offering this response on every launch until a
  // newer one replaces it, so leaving it in place re-runs an old Snooze.
  it("clears the cold-start response once it has been handled", async () => {
    (getLastNotificationResponseAsync as jest.Mock).mockResolvedValueOnce({
      actionIdentifier: MARK_DONE_ACTION_ID,
      notification: {
        request: {
          identifier: "notif-cold",
          content: { data: { reminderId: "r1" } },
        },
      },
    });

    render(<NotificationResponseHandler />);

    await waitFor(() =>
      expect(clearLastNotificationResponse).toHaveBeenCalledTimes(1)
    );
  });

  it("does not clear anything when there was no cold-start response", async () => {
    render(<NotificationResponseHandler />);
    await waitFor(() => expect(getLastNotificationResponseAsync).toHaveBeenCalled());
    expect(clearLastNotificationResponse).not.toHaveBeenCalled();
  });

  it("removes the subscription on unmount", () => {
    const remove = jest.fn();
    (addNotificationResponseReceivedListener as jest.Mock).mockReturnValueOnce({
      remove,
    });
    const { unmount } = render(<NotificationResponseHandler />);
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("subscribes to received (not just tapped) notifications, for invitation pushes arriving in the foreground", () => {
    render(<NotificationResponseHandler />);
    expect(addNotificationReceivedListener).toHaveBeenCalledTimes(1);
  });

  it("checks for invitations when a received notification is tagged type:invitation", () => {
    render(<NotificationResponseHandler />);
    const onReceived = (addNotificationReceivedListener as jest.Mock).mock.calls[0][0];
    onReceived({ request: { content: { data: { type: "invitation", invitationId: "inv-1" } } } });
    expect(InvitationService.checkForInvitations).toHaveBeenCalledTimes(1);
  });

  it("ignores a received notification that is not an invitation push", () => {
    render(<NotificationResponseHandler />);
    const onReceived = (addNotificationReceivedListener as jest.Mock).mock.calls[0][0];
    onReceived({ request: { content: { data: { reminderId: "r1" } } } });
    expect(InvitationService.checkForInvitations).not.toHaveBeenCalled();
  });

  it("removes the received-listener subscription on unmount", () => {
    const remove = jest.fn();
    (addNotificationReceivedListener as jest.Mock).mockReturnValueOnce({ remove });
    const { unmount } = render(<NotificationResponseHandler />);
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
