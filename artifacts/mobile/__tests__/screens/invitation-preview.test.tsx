import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import InvitationPreviewScreen from "@/app/invitation-preview";
import * as SessionService from "@/services/SessionService";

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
      <InvitationPreviewScreen />
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
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
});
