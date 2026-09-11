import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import RegisterNumberScreen from "@/app/register-number";
import * as InvitationService from "@/services/InvitationService";
import * as DeviceRegistrationService from "@/services/DeviceRegistrationService";

jest.mock("expo-haptics");
jest.mock("expo-localization");
jest.mock("@/services/DeviceRegistrationService");
jest.mock("@/services/InvitationService");

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    back: (...args: any[]) => mockBack(...args),
    push: (...args: any[]) => mockPush(...args),
    canGoBack: () => true,
  },
}));

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <RegisterNumberScreen />
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (DeviceRegistrationService.registerDeviceForPush as jest.Mock).mockResolvedValue({ ok: true });
  (InvitationService.claimPendingInvitations as jest.Mock).mockResolvedValue([]);
});

describe("RegisterNumberScreen", () => {
  it("disables Register until a number that resolves to a valid E.164 is entered", () => {
    const { getByTestId } = renderScreen();

    expect(getByTestId("register-number-submit").props.accessibilityState?.disabled).toBe(true);

    // Mocked region is US (see __mocks__/expo-localization.ts) - a bare 10-digit
    // number resolves unambiguously via normalizeForIdentity's region path.
    fireEvent.changeText(getByTestId("register-number-input"), "4155552671");

    expect(getByTestId("register-number-submit").props.accessibilityState?.disabled).toBe(false);
  });

  it("stays disabled for input that doesn't resolve to a phone number at all", () => {
    const { getByTestId } = renderScreen();
    fireEvent.changeText(getByTestId("register-number-input"), "abc");
    expect(getByTestId("register-number-submit").props.accessibilityState?.disabled).toBe(true);
  });

  it("calls selfRegister with the normalized E.164 number on submit", async () => {
    (InvitationService.selfRegister as jest.Mock).mockResolvedValue({
      ok: true,
      appUserId: "user-1",
    });

    const { getByTestId, findByText } = renderScreen();
    fireEvent.changeText(getByTestId("register-number-input"), "4155552671");
    fireEvent.press(getByTestId("register-number-submit"));

    await findByText(/you're registered/i);
    expect(InvitationService.selfRegister).toHaveBeenCalledWith("+14155552671");
  });

  it("shows a loading spinner while submitting, and disables the input", async () => {
    let resolveRegister: (v: InvitationService.SelfRegisterResult) => void;
    (InvitationService.selfRegister as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveRegister = resolve;
      })
    );

    const { getByTestId } = renderScreen();
    fireEvent.changeText(getByTestId("register-number-input"), "4155552671");
    fireEvent.press(getByTestId("register-number-submit"));

    expect(getByTestId("register-number-input").props.editable).toBe(false);

    resolveRegister!({ ok: true, appUserId: "user-1" });
    await waitFor(() => expect(InvitationService.selfRegister).toHaveBeenCalled());
  });

  it("calls registerDeviceForPush after a successful registration, without blocking the success screen", async () => {
    (InvitationService.selfRegister as jest.Mock).mockResolvedValue({
      ok: true,
      appUserId: "user-1",
    });
    let resolveDeviceReg: (v: { ok: true }) => void;
    (DeviceRegistrationService.registerDeviceForPush as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveDeviceReg = resolve;
      })
    );

    const { getByTestId, findByText } = renderScreen();
    fireEvent.changeText(getByTestId("register-number-input"), "4155552671");
    fireEvent.press(getByTestId("register-number-submit"));

    // The success screen renders even though registerDeviceForPush's promise
    // is still pending - fire-and-forget, never blocks the primary action.
    expect(await findByText(/you're registered/i)).toBeTruthy();
    expect(DeviceRegistrationService.registerDeviceForPush).toHaveBeenCalled();

    resolveDeviceReg!({ ok: true });
  });

  it("does not call registerDeviceForPush when self-registration fails", async () => {
    (InvitationService.selfRegister as jest.Mock).mockResolvedValue({
      ok: false,
      error: "number_taken",
    });

    const { getByTestId, findByText } = renderScreen();
    fireEvent.changeText(getByTestId("register-number-input"), "4155552671");
    fireEvent.press(getByTestId("register-number-submit"));

    await findByText(/already registered to a different account/i);
    expect(DeviceRegistrationService.registerDeviceForPush).not.toHaveBeenCalled();
  });

  it("shows copy for a number already registered to a different account", async () => {
    (InvitationService.selfRegister as jest.Mock).mockResolvedValue({
      ok: false,
      error: "number_taken",
    });

    const { getByTestId, findByText } = renderScreen();
    fireEvent.changeText(getByTestId("register-number-input"), "4155552671");
    fireEvent.press(getByTestId("register-number-submit"));

    expect(
      await findByText("That number is already registered to a different account")
    ).toBeTruthy();
  });

  it("shows offline copy on a network error", async () => {
    (InvitationService.selfRegister as jest.Mock).mockResolvedValue({
      ok: false,
      error: "network_error",
    });

    const { getByTestId, findByText } = renderScreen();
    fireEvent.changeText(getByTestId("register-number-input"), "4155552671");
    fireEvent.press(getByTestId("register-number-submit"));

    expect(await findByText(/couldn.?t connect/i)).toBeTruthy();
  });

  it("falls back to generic copy for an unrecognized error code", async () => {
    (InvitationService.selfRegister as jest.Mock).mockResolvedValue({
      ok: false,
      error: "self_register_failed",
    });

    const { getByTestId, findByText } = renderScreen();
    fireEvent.changeText(getByTestId("register-number-input"), "4155552671");
    fireEvent.press(getByTestId("register-number-submit"));

    expect(await findByText(/something went wrong/i)).toBeTruthy();
  });

  it("returns to the input phase from the error screen on 'Try again'", async () => {
    (InvitationService.selfRegister as jest.Mock).mockResolvedValue({
      ok: false,
      error: "network_error",
    });

    const { getByTestId, findByText } = renderScreen();
    fireEvent.changeText(getByTestId("register-number-input"), "4155552671");
    fireEvent.press(getByTestId("register-number-submit"));

    await findByText(/couldn.?t connect/i);
    fireEvent.press(getByTestId("register-number-retry"));

    expect(getByTestId("register-number-input")).toBeTruthy();
    expect(getByTestId("register-number-submit")).toBeTruthy();
  });

  it("closes the screen via the close button", () => {
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId("register-number-close"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("closes the screen via Done on the success screen", async () => {
    (InvitationService.selfRegister as jest.Mock).mockResolvedValue({
      ok: true,
      appUserId: "user-1",
    });

    const { getByTestId, findByTestId } = renderScreen();
    fireEvent.changeText(getByTestId("register-number-input"), "4155552671");
    fireEvent.press(getByTestId("register-number-submit"));

    const doneBtn = await findByTestId("register-number-done");
    fireEvent.press(doneBtn);
    expect(mockBack).toHaveBeenCalled();
  });

  // Registering proves phone-number ownership exactly the same way binding
  // via an invite link does, so any invitation already waiting for this
  // number must be claimed the same way bind-invite.tsx does.
  it("claims pending invitations after a successful registration", async () => {
    (InvitationService.selfRegister as jest.Mock).mockResolvedValue({
      ok: true,
      appUserId: "user-1",
    });
    (InvitationService.claimPendingInvitations as jest.Mock).mockResolvedValue([]);

    const { getByTestId, findByText } = renderScreen();
    fireEvent.changeText(getByTestId("register-number-input"), "4155552671");
    fireEvent.press(getByTestId("register-number-submit"));

    await findByText(/you're registered/i);
    expect(InvitationService.claimPendingInvitations).toHaveBeenCalled();
  });

  it("navigates straight to invitation-preview for exactly one claimed invitation", async () => {
    (InvitationService.selfRegister as jest.Mock).mockResolvedValue({
      ok: true,
      appUserId: "user-1",
    });
    (InvitationService.claimPendingInvitations as jest.Mock).mockResolvedValue([
      { id: "inv-1", title: "Pick up mom", description: "", datetime: "2026-09-12T10:00:00Z", senderId: "sender-1" },
    ]);

    const { getByTestId } = renderScreen();
    fireEvent.changeText(getByTestId("register-number-input"), "4155552671");
    fireEvent.press(getByTestId("register-number-submit"));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: "/invitation-preview",
          params: expect.objectContaining({ id: "inv-1" }),
        })
      )
    );
  });

  it("shows a tappable list for more than one claimed invitation, without auto-navigating", async () => {
    (InvitationService.selfRegister as jest.Mock).mockResolvedValue({
      ok: true,
      appUserId: "user-1",
    });
    (InvitationService.claimPendingInvitations as jest.Mock).mockResolvedValue([
      { id: "inv-1", title: "Pick up mom", description: "", datetime: "2026-09-12T10:00:00Z", senderId: "sender-1" },
      { id: "inv-2", title: "Call the plumber", description: "", datetime: "2026-09-13T10:00:00Z", senderId: "sender-2" },
    ]);

    const { getByTestId, findByText } = renderScreen();
    fireEvent.changeText(getByTestId("register-number-input"), "4155552671");
    fireEvent.press(getByTestId("register-number-submit"));

    expect(await findByText(/you have 2 reminders waiting for you/i)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.press(getByTestId("claimed-invitation-row-inv-2"));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/invitation-preview",
        params: expect.objectContaining({ id: "inv-2" }),
      })
    );
  });
});
