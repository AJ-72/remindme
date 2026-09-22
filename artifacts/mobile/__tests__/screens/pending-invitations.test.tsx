import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import PendingInvitationsScreen from "@/app/pending-invitations";
import { RemindersProvider } from "@/contexts/RemindersContext";
import * as SessionService from "@/services/SessionService";
import * as InvitationService from "@/services/InvitationService";
import * as ReminderService from "@/services/ReminderService";

jest.mock("expo-haptics");
jest.mock("@/services/SessionService");

const CLAIMED = [
  {
    id: "inv-1",
    title: "Take BP tablets",
    description: "After breakfast",
    datetime: "2026-09-09T08:00:00.000Z",
    senderId: "sender-1",
  },
  {
    id: "inv-2",
    title: "Pick up milk",
    description: null,
    datetime: "2026-09-10T09:00:00.000Z",
    senderId: "sender-2",
  },
];

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn().mockReturnValue(false);
let mockSearchParams: Record<string, string | undefined> = {
  invitations: JSON.stringify(CLAIMED),
};

jest.mock("expo-router", () => ({
  router: {
    replace: (...args: any[]) => mockReplace(...args),
    back: (...args: any[]) => mockBack(...args),
    canGoBack: () => mockCanGoBack(),
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
        <PendingInvitationsScreen />
      </RemindersProvider>
    </SafeAreaProvider>
  );
}

function mockRpcByArgs(names: Record<string, string | null>) {
  return jest.fn().mockImplementation((_fn: string, args: { p_sender_id: string }) =>
    Promise.resolve({ data: names[args.p_sender_id] ?? null, error: null })
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
  mockCanGoBack.mockReturnValue(false);
  mockSearchParams = { invitations: JSON.stringify(CLAIMED) };
  (SessionService.getCurrentSession as jest.Mock).mockResolvedValue({
    user: { id: "recipient-1" },
  });
});

describe("PendingInvitationsScreen", () => {
  it("renders every claimed invitation with its own resolved sender name", async () => {
    const rpcMock = mockRpcByArgs({ "sender-1": "Amma", "sender-2": "Ravi" });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });

    const { findByText, getByTestId } = renderScreen();

    expect(await findByText("From Amma")).toBeTruthy();
    expect(await findByText("From Ravi")).toBeTruthy();
    expect(getByTestId("pending-invitation-inv-1")).toBeTruthy();
    expect(getByTestId("pending-invitation-inv-2")).toBeTruthy();
    expect(await findByText("Take BP tablets")).toBeTruthy();
    expect(await findByText("Pick up milk")).toBeTruthy();
  });

  it("shows the claimed count in the header", async () => {
    const rpcMock = mockRpcByArgs({ "sender-1": "Amma", "sender-2": "Ravi" });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });

    const { findByText } = renderScreen();

    expect(await findByText("2 Reminders Waiting")).toBeTruthy();
  });

  it("falls back to 'Someone' for a sender with no resolvable display_name", async () => {
    const rpcMock = mockRpcByArgs({ "sender-1": null, "sender-2": "Ravi" });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });

    const { findByText } = renderScreen();

    expect(await findByText("From Someone")).toBeTruthy();
    expect(await findByText("From Ravi")).toBeTruthy();
  });

  it("each row has its own Accept/Decline, independent of the other rows", async () => {
    const rpcMock = mockRpcByArgs({ "sender-1": "Amma", "sender-2": "Ravi" });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });

    const { getByTestId, findByText } = renderScreen();
    await findByText("From Amma");

    expect(getByTestId("pending-invitation-accept-inv-1")).toBeTruthy();
    expect(getByTestId("pending-invitation-decline-inv-1")).toBeTruthy();
    expect(getByTestId("pending-invitation-accept-inv-2")).toBeTruthy();
    expect(getByTestId("pending-invitation-decline-inv-2")).toBeTruthy();
  });

  it("accepting one row calls respondToInvitation and adds a local reminder carrying that row's sender", async () => {
    const rpcMock = mockRpcByArgs({ "sender-1": "Amma", "sender-2": "Ravi" });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });
    const addReminderSpy = jest.spyOn(ReminderService, "addReminder");
    jest.spyOn(InvitationService, "respondToInvitation").mockResolvedValue({ ok: true });

    const { getByTestId, findByText } = renderScreen();
    await findByText("From Amma");

    fireEvent.press(getByTestId("pending-invitation-accept-inv-1"));

    await waitFor(() =>
      expect(InvitationService.respondToInvitation).toHaveBeenCalledWith("inv-1", "accepted")
    );
    await waitFor(() => expect(addReminderSpy).toHaveBeenCalled());
    const [, data] = addReminderSpy.mock.calls[0];
    expect(data).toMatchObject({
      title: "Take BP tablets",
      description: "After breakfast",
      datetime: "2026-09-09T08:00:00.000Z",
      senderName: "Amma",
      senderId: "sender-1",
    });
  });

  // M2 Task 5c: this screen has its own inline Accept, bypassing
  // invitation-preview.tsx entirely (see this file's own header comment).
  // A recurring invitation accepted here must not silently drop the rule -
  // and the recipient must be able to see it repeats before tapping Accept,
  // the same requirement invitation-preview.tsx's own mockup satisfies with
  // a full screen.
  it("threads recurrence through to addReminder when accepting a recurring invitation", async () => {
    mockSearchParams = {
      invitations: JSON.stringify([
        { ...CLAIMED[0], recurrence: { freq: "daily", interval: 1 } },
      ]),
    };
    const rpcMock = mockRpcByArgs({ "sender-1": "Amma" });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });
    const addReminderSpy = jest.spyOn(ReminderService, "addReminder");
    jest.spyOn(InvitationService, "respondToInvitation").mockResolvedValue({ ok: true });

    const { getByTestId, findByText } = renderScreen();
    await findByText("From Amma");
    fireEvent.press(getByTestId("pending-invitation-accept-inv-1"));

    await waitFor(() => expect(addReminderSpy).toHaveBeenCalled());
    const [, data] = addReminderSpy.mock.calls[0];
    expect(data.recurrence).toEqual({ freq: "daily", interval: 1 });

    mockSearchParams = { invitations: JSON.stringify(CLAIMED) };
  });

  it("shows a repeat marker on a recurring invitation's row, before Accept is tapped", async () => {
    mockSearchParams = {
      invitations: JSON.stringify([
        { ...CLAIMED[0], recurrence: { freq: "daily", interval: 1 } },
      ]),
    };
    const rpcMock = mockRpcByArgs({ "sender-1": "Amma" });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });

    const { findByText, getByTestId } = renderScreen();
    await findByText("From Amma");
    expect(getByTestId("pending-invitation-repeat-inv-1")).toBeTruthy();

    mockSearchParams = { invitations: JSON.stringify(CLAIMED) };
  });

  it("does not show a repeat marker on a one-shot invitation's row", async () => {
    const rpcMock = mockRpcByArgs({ "sender-1": "Amma", "sender-2": "Ravi" });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });

    const { findByText, queryByTestId } = renderScreen();
    await findByText("From Amma");
    expect(queryByTestId("pending-invitation-repeat-inv-1")).toBeNull();
  });

  it("rejects an invalid recurrence rule rather than scheduling it, and does not show the repeat marker", async () => {
    mockSearchParams = {
      invitations: JSON.stringify([
        { ...CLAIMED[0], recurrence: { freq: "hourly", interval: 1 } },
      ]),
    };
    const rpcMock = mockRpcByArgs({ "sender-1": "Amma" });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });
    const addReminderSpy = jest.spyOn(ReminderService, "addReminder");
    jest.spyOn(InvitationService, "respondToInvitation").mockResolvedValue({ ok: true });

    const { getByTestId, findByText, queryByTestId } = renderScreen();
    await findByText("From Amma");
    expect(queryByTestId("pending-invitation-repeat-inv-1")).toBeNull();

    fireEvent.press(getByTestId("pending-invitation-accept-inv-1"));

    await waitFor(() => expect(addReminderSpy).toHaveBeenCalled());
    const [, data] = addReminderSpy.mock.calls[0];
    expect(data.recurrence).toBeUndefined();

    mockSearchParams = { invitations: JSON.stringify(CLAIMED) };
  });

  it("declining one row does not add a local reminder and leaves the other row untouched", async () => {
    const rpcMock = mockRpcByArgs({ "sender-1": "Amma", "sender-2": "Ravi" });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });
    const addReminderSpy = jest.spyOn(ReminderService, "addReminder");
    jest.spyOn(InvitationService, "respondToInvitation").mockResolvedValue({ ok: true });

    const { getByTestId, findByText } = renderScreen();
    await findByText("From Amma");

    fireEvent.press(getByTestId("pending-invitation-decline-inv-1"));

    await waitFor(() =>
      expect(InvitationService.respondToInvitation).toHaveBeenCalledWith("inv-1", "declined")
    );
    expect(addReminderSpy).not.toHaveBeenCalled();
    // The other row's own actions are still present and untouched.
    expect(getByTestId("pending-invitation-accept-inv-2")).toBeTruthy();
  });

  it("goes back once every row has been resolved", async () => {
    mockCanGoBack.mockReturnValue(true);
    const rpcMock = mockRpcByArgs({ "sender-1": "Amma", "sender-2": "Ravi" });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });
    jest.spyOn(InvitationService, "respondToInvitation").mockResolvedValue({ ok: true });

    const { getByTestId, findByText } = renderScreen();
    await findByText("From Amma");

    fireEvent.press(getByTestId("pending-invitation-accept-inv-1"));
    await waitFor(() => expect(getByTestId("pending-invitation-inv-1")).toBeTruthy());
    fireEvent.press(getByTestId("pending-invitation-decline-inv-2"));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("does not go back while any row is still unresolved", async () => {
    const rpcMock = mockRpcByArgs({ "sender-1": "Amma", "sender-2": "Ravi" });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });
    jest.spyOn(InvitationService, "respondToInvitation").mockResolvedValue({ ok: true });

    const { getByTestId, findByText } = renderScreen();
    await findByText("From Amma");

    fireEvent.press(getByTestId("pending-invitation-accept-inv-1"));
    await waitFor(() =>
      expect(InvitationService.respondToInvitation).toHaveBeenCalledWith("inv-1", "accepted")
    );

    expect(mockBack).not.toHaveBeenCalled();
  });

  it("the close button navigates back", async () => {
    mockCanGoBack.mockReturnValue(true);
    const rpcMock = mockRpcByArgs({ "sender-1": "Amma", "sender-2": "Ravi" });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });

    const { getByTestId, findByText } = renderScreen();
    await findByText("From Amma");

    fireEvent.press(getByTestId("pending-invitations-close"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("renders nothing crash-worthy for an empty/unparseable invitations param", () => {
    mockSearchParams = { invitations: undefined };
    const rpcMock = jest.fn();
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });

    const { getByTestId } = renderScreen();
    expect(getByTestId("pending-invitations-list")).toBeTruthy();
  });
});
