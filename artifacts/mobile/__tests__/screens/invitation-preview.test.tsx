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
        "accepted"
      )
    );
    expect(InvitationService.respondToInvitation).toHaveBeenCalledWith("inv-1", "accepted");
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
});
