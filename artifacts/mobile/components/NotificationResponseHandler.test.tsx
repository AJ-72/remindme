import React from "react";
import { Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, waitFor } from "@testing-library/react-native";
import { RemindersProvider, useReminders } from "@/contexts/RemindersContext";
import NotificationResponseHandler from "@/components/NotificationResponseHandler";
import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  clearLastNotificationResponse,
  getLastNotificationResponseAsync,
} from "expo-notifications";
import {
  MARK_DONE_ACTION_ID,
  SNOOZE_ACTION_ID,
  STORAGE_KEY,
} from "@/services/ReminderService";
import * as ReminderService from "@/services/ReminderService";
import * as InvitationService from "@/services/InvitationService";
import * as Throttle from "@/services/invitationClaimThrottle";

jest.mock("@/services/InvitationService", () => ({
  checkForInvitations: jest.fn().mockResolvedValue({ ok: true, claimed: [] }),
}));

jest.mock("@/services/invitationClaimThrottle");
jest.mock("expo-haptics");
// Only markNotifiedById/applyRecipientTimeChangeByInvitationId are mocked;
// everything else stays real so the existing tap-handling tests (which
// exercise the real notificationResponseHandler deps) are unaffected.
//
// Both must be jest.fn() FROM HERE, not spied on later via `import * as
// ReminderService` - Babel's wildcard-import interop copies this factory's
// properties into a SEPARATE object for a `* as` import (no __esModule flag
// on a plain object literal), so a `jest.spyOn(ReminderService, ...)` done
// afterwards in a test only mutates that copy, never the property the
// component's own named import actually reads. Defining the jest.fn() here
// keeps both references pointing at the identical mock function.
jest.mock("@/services/ReminderService", () => ({
  ...jest.requireActual("@/services/ReminderService"),
  markNotifiedById: jest.fn(),
  advanceRecurringById: jest.fn(),
  applyRecipientTimeChangeByInvitationId: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (InvitationService.checkForInvitations as jest.Mock).mockResolvedValue({ ok: true, claimed: [] });
  (Throttle.setLastClaimAt as jest.Mock).mockResolvedValue(undefined);
  (Throttle.setPushPending as jest.Mock).mockResolvedValue(undefined);
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

  // Awaited, not synchronous: the listener arms pushPending before it claims,
  // so the claim lands a microtask later than it used to.
  it("checks for invitations when a received notification is tagged type:invitation", async () => {
    render(<NotificationResponseHandler />);
    const onReceived = (addNotificationReceivedListener as jest.Mock).mock.calls[0][0];
    onReceived({ request: { content: { data: { type: "invitation", invitationId: "inv-1" } } } });
    await waitFor(() =>
      expect(InvitationService.checkForInvitations).toHaveBeenCalledTimes(1)
    );
  });

  it("stamps notifiedAt for a reminder's own notification, without touching invitation logic", async () => {
    render(<NotificationResponseHandler />);
    const onReceived = (addNotificationReceivedListener as jest.Mock).mock.calls[0][0];
    await onReceived({ request: { content: { data: { reminderId: "r1" } } } });
    expect(ReminderService.markNotifiedById).toHaveBeenCalledWith("r1");
    expect(InvitationService.checkForInvitations).not.toHaveBeenCalled();
  });

  it("does not stamp anything for a received notification carrying no reminderId", async () => {
    render(<NotificationResponseHandler />);
    const onReceived = (addNotificationReceivedListener as jest.Mock).mock.calls[0][0];
    await onReceived({ request: { content: { data: { type: "invitation" } } } });
    expect(ReminderService.markNotifiedById).not.toHaveBeenCalled();
  });

  // Deliberately does NOT advance a recurring series on notification-received
  // (regression coverage - it used to). Advancing here ran before the user
  // had tapped anything, so reminder-detail.tsx and the tray's own Snooze
  // action (which reads reminder.datetime as its snooze base) ended up
  // showing/acting on the NEXT occurrence instead of the one that just
  // fired. rescheduleAllFutureReminders' mount-time catch-up sweep is the
  // one path this feature's correctness depends on and still covers it.
  it("does not advance a recurring series on notification-received", async () => {
    render(<NotificationResponseHandler />);
    const onReceived = (addNotificationReceivedListener as jest.Mock).mock.calls[0][0];
    await onReceived({ request: { content: { data: { reminderId: "r1" } } } });
    expect(ReminderService.advanceRecurringById).not.toHaveBeenCalled();
  });

  it("removes the received-listener subscription on unmount", () => {
    const remove = jest.fn();
    (addNotificationReceivedListener as jest.Mock).mockReturnValueOnce({ remove });
    const { unmount } = render(<NotificationResponseHandler />);
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("records lastClaimAt when an invitation push is received", async () => {
    render(<NotificationResponseHandler />);
    const onReceived = (addNotificationReceivedListener as jest.Mock).mock.calls[0][0];
    onReceived({ request: { content: { data: { type: "invitation" } } } });

    await waitFor(() =>
      expect(Throttle.setLastClaimAt).toHaveBeenCalledWith(expect.any(Number))
    );
  });

  it("clears pushPending when an invitation push is received", async () => {
    render(<NotificationResponseHandler />);
    const onReceived = (addNotificationReceivedListener as jest.Mock).mock.calls[0][0];
    onReceived({ request: { content: { data: { type: "invitation" } } } });

    await waitFor(() =>
      expect(Throttle.setPushPending).toHaveBeenCalledWith(false)
    );
  });

  // The flag has to be armed BEFORE the claim runs, so a claim that fails
  // leaves proof that this device did receive a push.
  it("arms pushPending before claiming, so a failed claim is not lost", async () => {
    (InvitationService.checkForInvitations as jest.Mock).mockResolvedValue({
      ok: false,
      claimed: [],
    });
    render(<NotificationResponseHandler />);
    const onReceived = (addNotificationReceivedListener as jest.Mock).mock.calls[0][0];
    onReceived({ request: { content: { data: { type: "invitation" } } } });

    await waitFor(() => expect(Throttle.setPushPending).toHaveBeenCalledWith(true));
    expect(Throttle.setPushPending).not.toHaveBeenCalledWith(false);
    expect(Throttle.setLastClaimAt).not.toHaveBeenCalled();
  });

  it("does not start a cooldown when a received-push claim fails", async () => {
    (InvitationService.checkForInvitations as jest.Mock).mockResolvedValue({
      ok: false,
      claimed: [],
    });
    render(<NotificationResponseHandler />);
    const onReceived = (addNotificationReceivedListener as jest.Mock).mock.calls[0][0];
    onReceived({ request: { content: { data: { type: "invitation" } } } });

    await waitFor(() => expect(InvitationService.checkForInvitations).toHaveBeenCalled());
    expect(Throttle.setLastClaimAt).not.toHaveBeenCalled();
  });

  it("applies an invitation_time_changed push immediately on receipt, without waiting for a tap", async () => {
    const applySpy = ReminderService.applyRecipientTimeChangeByInvitationId as jest.Mock;
    applySpy.mockResolvedValue("r1");
    render(<NotificationResponseHandler />);
    const onReceived = (addNotificationReceivedListener as jest.Mock).mock.calls[0][0];
    await onReceived({
      request: {
        content: {
          data: {
            type: "invitation_time_changed",
            invitationId: "inv-1",
            toDatetime: "2026-09-10T08:00:00.000Z",
            fromDatetime: "2026-09-09T23:00:00.000Z",
            recipientName: "Amma",
          },
        },
      },
    });
    expect(applySpy).toHaveBeenCalledWith(
      "inv-1",
      "2026-09-10T08:00:00.000Z",
      "2026-09-09T23:00:00.000Z",
      "Amma"
    );
    // Does not also go through the invitation-poll path - this push already
    // carries everything needed, unlike a plain "invitation" push.
    expect(InvitationService.checkForInvitations).not.toHaveBeenCalled();
  });
});

// Regression for "Mark Done in the tray does nothing" with the app open.
// Android runs only the foreground listener while the app is in the
// foreground, and pulling down the tray does not change AppState - so the
// provider's AppState-"active" reload never runs. markDoneById wrote
// storage correctly, but the list kept showing the reminder as pending
// until some unrelated reload, and the next in-app write saved that stale
// array back over the completion. These render the real provider around
// the handler, exactly as app/_layout.tsx does.
describe("NotificationResponseHandler inside RemindersProvider", () => {
  const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  function Probe() {
    const { reminders, loading } = useReminders();
    if (loading) return null;
    const r = reminders.find((x) => x.id === "r1");
    return (
      <Text testID="probe">
        {r ? `${r.completed}|${r.datetime}` : "missing"}
      </Text>
    );
  }

  async function renderWithProvider() {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "r1",
          title: "Tray test",
          description: "",
          datetime: FUTURE,
          completed: false,
          notificationId: "notif-r1",
        },
      ])
    );
    const utils = render(
      <RemindersProvider>
        <NotificationResponseHandler />
        <Probe />
      </RemindersProvider>
    );
    await waitFor(() =>
      expect(utils.getByTestId("probe").props.children).toBe(`false|${FUTURE}`)
    );
    const listener = (addNotificationResponseReceivedListener as jest.Mock).mock
      .calls[0][0] as (response: unknown) => void;
    return { utils, listener };
  }

  function responseFor(actionIdentifier: string, identifier: string) {
    return {
      actionIdentifier,
      notification: {
        request: { identifier, content: { data: { reminderId: "r1", title: "Tray test", body: "" } } },
      },
    };
  }

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("shows the reminder as completed after Mark Done is pressed in the tray", async () => {
    const { utils, listener } = await renderWithProvider();

    await act(async () => {
      listener(responseFor(MARK_DONE_ACTION_ID, "notif-done"));
    });

    // Storage was always right; the bug was the list never re-reading it.
    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored[0].completed).toBe(true);
    });
    await waitFor(() =>
      expect(utils.getByTestId("probe").props.children).toBe(`true|${FUTURE}`)
    );
  });

  it("shows the new time after Snooze is pressed in the tray", async () => {
    const { utils, listener } = await renderWithProvider();

    await act(async () => {
      listener(responseFor(SNOOZE_ACTION_ID, "notif-snooze"));
    });

    await waitFor(() =>
      expect(utils.getByTestId("probe").props.children).not.toBe(`false|${FUTURE}`)
    );
  });
});
