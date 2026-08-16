import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import NotificationResponseHandler from "@/components/NotificationResponseHandler";
import {
  addNotificationResponseReceivedListener,
  clearLastNotificationResponse,
  getLastNotificationResponseAsync,
} from "expo-notifications";
import { MARK_DONE_ACTION_ID } from "@/services/ReminderService";

beforeEach(() => {
  jest.clearAllMocks();
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
});
