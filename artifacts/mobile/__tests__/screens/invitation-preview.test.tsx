import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import InvitationPreviewScreen from "@/app/invitation-preview";
import { RemindersProvider } from "@/contexts/RemindersContext";
import * as SessionService from "@/services/SessionService";
import * as InvitationService from "@/services/InvitationService";
import * as ReminderService from "@/services/ReminderService";

jest.mock("expo-haptics");
jest.mock("@/services/SessionService");

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockSearchParams: Record<string, string | undefined> = {
  id: "inv-1",
  title: "Take BP tablets",
  description: "After breakfast",
  datetime: "2026-09-09T08:00:00.000Z",
  senderId: "sender-1",
};

jest.mock("expo-router", () => ({
  router: {
    replace: (...args: any[]) => mockReplace(...args),
    back: (...args: any[]) => mockBack(...args),
    canGoBack: () => false,
  },
  useLocalSearchParams: () => mockSearchParams,
}));

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <RemindersProvider>
        <InvitationPreviewScreen />
      </RemindersProvider>
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
  mockSearchParams = {
    id: "inv-1",
    title: "Take BP tablets",
    description: "After breakfast",
    datetime: "2026-09-09T08:00:00.000Z",
    senderId: "sender-1",
  };
  (SessionService.getCurrentSession as jest.Mock).mockResolvedValue({
    user: { id: "recipient-1" },
  });
});

describe("InvitationPreviewScreen", () => {
  it("renders the resolved sender name, time, and reminder text", async () => {
    const rpcMock = jest.fn().mockResolvedValue({ data: "Amma", error: null });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });

    const { findByText, getByTestId } = renderScreen();

    expect(await findByText("From Amma")).toBeTruthy();
    expect(getByTestId("sender-name")).toBeTruthy();
    expect(await findByText("Take BP tablets")).toBeTruthy();
    expect(await findByText("After breakfast")).toBeTruthy();
    expect(rpcMock).toHaveBeenCalledWith("get_sender_display_name", { p_sender_id: "sender-1" });
  });

  it("falls back to 'Someone' when the sender has no display name", async () => {
    const rpcMock = jest.fn().mockResolvedValue({ data: null, error: null });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });

    const { findByText } = renderScreen();

    expect(await findByText("From Someone")).toBeTruthy();
  });

  it("falls back to 'Someone' when the lookup errors", async () => {
    const rpcMock = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });

    const { findByText } = renderScreen();

    expect(await findByText("From Someone")).toBeTruthy();
  });

  it("shows Accept, Decline, and Block reachable in one tap with no intermediate screen", async () => {
    const rpcMock = jest.fn().mockResolvedValue({ data: "Amma", error: null });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });

    const { getByTestId, findByText } = renderScreen();
    await findByText("From Amma");

    expect(getByTestId("accept-button")).toBeTruthy();
    expect(getByTestId("decline-button")).toBeTruthy();
    expect(getByTestId("block-button")).toBeTruthy();
  });

  it("blocking calls the blocks insert with the recipient as blocker and sender as blocked", async () => {
    const rpcMock = jest.fn().mockResolvedValue({ data: "Amma", error: null });
    const insertMock = jest.fn().mockResolvedValue({ data: null, error: null });
    const fromMock = jest.fn().mockReturnValue({ insert: insertMock });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({
      rpc: rpcMock,
      from: fromMock,
    });

    const { getByTestId, findByText } = renderScreen();
    await findByText("From Amma");

    fireEvent.press(getByTestId("block-button"));

    await waitFor(() => expect(fromMock).toHaveBeenCalledWith("blocks"));
    expect(insertMock).toHaveBeenCalledWith({
      blocker_id: "recipient-1",
      blocked_id: "sender-1",
    });
    expect(await findByText(/won't receive reminders from Amma anymore/i)).toBeTruthy();
  });

  it("accepting calls respondToInvitation and adds a local reminder with no alarm/exactTiming override", async () => {
    const rpcMock = jest.fn().mockResolvedValue({ data: "Amma", error: null });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });
    const addReminderSpy = jest.spyOn(ReminderService, "addReminder");
    jest.spyOn(InvitationService, "respondToInvitation").mockResolvedValue({ ok: true });

    const { getByTestId, findByText } = renderScreen();
    await findByText("From Amma");

    fireEvent.press(getByTestId("accept-button"));

    await waitFor(() =>
      expect(InvitationService.respondToInvitation).toHaveBeenCalledWith(
        expect.any(String),
        "accepted",
        "2026-09-09T08:00:00.000Z"
      )
    );
    expect(InvitationService.respondToInvitation).toHaveBeenCalledWith(
      "inv-1",
      "accepted",
      "2026-09-09T08:00:00.000Z"
    );
    await waitFor(() => expect(addReminderSpy).toHaveBeenCalled());
    const [, data] = addReminderSpy.mock.calls[0];
    // The screen itself must never pass `alarm`/`exactTiming` - no property
    // for `alarm` reaches ReminderService.addReminder at all (the context
    // passes it through untouched, and the screen never sets it). For
    // `exactTiming`, RemindersContext.addReminder always injects a concrete
    // value from the recipient's OWN stored default
    // (getDefaultExactTimingEnabled(), true on clean storage) before
    // calling the service - so its presence here is the context's existing,
    // desired default-reading behavior, not a sender-controlled override.
    expect(data).not.toHaveProperty("alarm");
    expect(data.exactTiming).toBe(true);
    expect(data).toMatchObject({
      title: "Take BP tablets",
      description: "After breakfast",
      datetime: "2026-09-09T08:00:00.000Z",
      // B13: provenance carried onto the local reminder so the home screen
      // can badge it as "from someone else" - see ReminderCard.
      senderName: "Amma",
      senderId: "sender-1",
    });
  });

  it("declining calls respondToInvitation and does NOT add a local reminder", async () => {
    const rpcMock = jest.fn().mockResolvedValue({ data: "Amma", error: null });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });
    jest.spyOn(InvitationService, "respondToInvitation").mockResolvedValue({ ok: true });
    const addReminderSpy = jest.spyOn(ReminderService, "addReminder");

    const { getByTestId, findByText } = renderScreen();
    await findByText("From Amma");

    fireEvent.press(getByTestId("decline-button"));

    await waitFor(() =>
      expect(InvitationService.respondToInvitation).toHaveBeenCalledWith(
        expect.any(String),
        "declined"
      )
    );
    expect(addReminderSpy).not.toHaveBeenCalled();
  });

  describe("recipient's own quiet hours (not the sender's)", () => {
    beforeEach(() => {
      mockSearchParams = {
        ...mockSearchParams,
        // 23:00 UTC - inside the default 22:00-08:00 quiet window on this
        // device (the RECIPIENT's), regardless of whatever the sender's own
        // device thought at send time.
        datetime: "2026-09-09T23:00:00.000Z",
      };
    });

    it("prompts with this device's own quiet hours BEFORE the server accept call", async () => {
      const rpcMock = jest.fn().mockResolvedValue({ data: "Amma", error: null });
      (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });
      const addReminderSpy = jest.spyOn(ReminderService, "addReminder");
      const respondSpy = jest
        .spyOn(InvitationService, "respondToInvitation")
        .mockResolvedValue({ ok: true });

      const { getByTestId, findByText } = renderScreen();
      await findByText("From Amma");

      fireEvent.press(getByTestId("accept-button"));

      // The server accept needs the FINAL chosen time up front (so
      // respond-invitation can diff it against what the sender sent) - it
      // must not fire until the quiet-hours prompt resolves.
      expect(await findByText(/inside your quiet hours/i)).toBeTruthy();
      expect(respondSpy).not.toHaveBeenCalled();
      expect(addReminderSpy).not.toHaveBeenCalled();
    });

    it("keeps the original time when the recipient chooses Keep it", async () => {
      const rpcMock = jest.fn().mockResolvedValue({ data: "Amma", error: null });
      (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });
      const addReminderSpy = jest.spyOn(ReminderService, "addReminder");
      const respondSpy = jest
        .spyOn(InvitationService, "respondToInvitation")
        .mockResolvedValue({ ok: true });

      const { getByTestId, findByText } = renderScreen();
      await findByText("From Amma");
      fireEvent.press(getByTestId("accept-button"));
      await findByText(/inside your quiet hours/i);

      fireEvent.press(getByTestId("quiet-hours-sheet-keep"));

      await waitFor(() => expect(addReminderSpy).toHaveBeenCalled());
      expect(respondSpy).toHaveBeenCalledWith("inv-1", "accepted", "2026-09-09T23:00:00.000Z");
      const [, data] = addReminderSpy.mock.calls[0];
      expect(data.datetime).toBe("2026-09-09T23:00:00.000Z");
    });

    it("moves to after quiet hours when the recipient chooses Move", async () => {
      const rpcMock = jest.fn().mockResolvedValue({ data: "Amma", error: null });
      (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });
      const addReminderSpy = jest.spyOn(ReminderService, "addReminder");
      const respondSpy = jest
        .spyOn(InvitationService, "respondToInvitation")
        .mockResolvedValue({ ok: true });

      const { getByTestId, findByText } = renderScreen();
      await findByText("From Amma");
      fireEvent.press(getByTestId("accept-button"));
      await findByText(/inside your quiet hours/i);

      fireEvent.press(getByTestId("quiet-hours-sheet-move"));

      await waitFor(() => expect(addReminderSpy).toHaveBeenCalled());
      // Default quiet hours end at 08:00 local, the day after the chosen
      // 23:00 - moved forward one calendar day, same as QuickAddInput's own
      // quietHoursEndAfter behavior.
      expect(respondSpy).toHaveBeenCalledWith("inv-1", "accepted", "2026-09-10T08:00:00.000Z");
      const [, data] = addReminderSpy.mock.calls[0];
      expect(data.datetime).toBe("2026-09-10T08:00:00.000Z");
    });
  });
});
