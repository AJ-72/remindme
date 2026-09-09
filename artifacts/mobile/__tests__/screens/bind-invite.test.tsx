import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import BindInviteScreen from "@/app/bind-invite";
import * as InvitationService from "@/services/InvitationService";

jest.mock("expo-haptics");

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();
let mockSearchParams: { token?: string } = { token: "some-token" };

jest.mock("expo-router", () => ({
  router: {
    replace: (...args: any[]) => mockReplace(...args),
    back: (...args: any[]) => mockBack(...args),
    push: (...args: any[]) => mockPush(...args),
    canGoBack: () => false,
  },
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock("@/services/InvitationService");

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <BindInviteScreen />
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = { token: "some-token" };
});

describe("BindInviteScreen", () => {
  it("shows a loading state while the bind call is in flight", async () => {
    let resolveBind: (v: InvitationService.BindResult) => void;
    (InvitationService.bindViaInviteToken as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveBind = resolve;
      })
    );
    (InvitationService.claimPendingInvitations as jest.Mock).mockResolvedValue([]);

    const { getByTestId } = renderScreen();

    expect(getByTestId("bind-loading")).toBeTruthy();

    resolveBind!({ ok: true });
    await waitFor(() => expect(InvitationService.claimPendingInvitations).toHaveBeenCalled());
  });

  it("shows the claimed count and a list of tappable rows for N>1 claimed invitations", async () => {
    (InvitationService.bindViaInviteToken as jest.Mock).mockResolvedValue({ ok: true });
    (InvitationService.claimPendingInvitations as jest.Mock).mockResolvedValue([
      { id: "inv-1", title: "Take BP tablets", description: null, datetime: "2026-09-09T08:00:00Z", senderId: "s1" },
      { id: "inv-2", title: "Pick up milk", description: null, datetime: "2026-09-09T09:00:00Z", senderId: "s1" },
    ]);

    const { findByText, getByTestId } = renderScreen();

    expect(await findByText(/2 reminders waiting/i)).toBeTruthy();
    expect(getByTestId("bind-go-home")).toBeTruthy();

    const row1 = getByTestId("claimed-invitation-row-inv-1");
    fireEvent.press(row1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/invitation-preview",
      params: {
        id: "inv-1",
        title: "Take BP tablets",
        description: null,
        datetime: "2026-09-09T08:00:00Z",
        senderId: "s1",
      },
    });

    expect(getByTestId("claimed-invitation-row-inv-2")).toBeTruthy();
  });

  it("shows singular copy and navigates directly to invitation-preview when exactly one invitation is claimed", async () => {
    (InvitationService.bindViaInviteToken as jest.Mock).mockResolvedValue({ ok: true });
    (InvitationService.claimPendingInvitations as jest.Mock).mockResolvedValue([
      { id: "inv-1", title: "Take BP tablets", description: null, datetime: "2026-09-09T08:00:00Z", senderId: "s1" },
    ]);

    const { findByText } = renderScreen();

    expect(await findByText(/1 reminder waiting/i)).toBeTruthy();
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/invitation-preview",
        params: {
          id: "inv-1",
          title: "Take BP tablets",
          description: null,
          datetime: "2026-09-09T08:00:00Z",
          senderId: "s1",
        },
      })
    );
  });

  it("shows copy for an invalid or already-used token", async () => {
    (InvitationService.bindViaInviteToken as jest.Mock).mockResolvedValue({
      ok: false,
      error: "invalid token",
    });

    const { findByText } = renderScreen();

    expect(
      await findByText("This link isn't valid or has already been used")
    ).toBeTruthy();
    expect(InvitationService.claimPendingInvitations).not.toHaveBeenCalled();
  });

  it("shows copy when the number is already bound to a different account", async () => {
    (InvitationService.bindViaInviteToken as jest.Mock).mockResolvedValue({
      ok: false,
      error: "number already bound to a different account",
    });

    const { findByText } = renderScreen();

    expect(
      await findByText("This number is already linked to another account")
    ).toBeTruthy();
  });

  it("shows copy for an expired token", async () => {
    (InvitationService.bindViaInviteToken as jest.Mock).mockResolvedValue({
      ok: false,
      error: "token expired",
    });

    const { findByText } = renderScreen();

    expect(await findByText("This invite link has expired")).toBeTruthy();
  });

  it("shows offline copy on a network error", async () => {
    (InvitationService.bindViaInviteToken as jest.Mock).mockResolvedValue({
      ok: false,
      error: "network_error",
    });

    const { findByText } = renderScreen();

    expect(
      await findByText(/couldn.?t connect/i)
    ).toBeTruthy();
  });

  it("falls back to generic copy for an unrecognized error code", async () => {
    (InvitationService.bindViaInviteToken as jest.Mock).mockResolvedValue({
      ok: false,
      error: "bind_failed",
    });

    const { findByText } = renderScreen();

    expect(await findByText(/something went wrong/i)).toBeTruthy();
  });
});
