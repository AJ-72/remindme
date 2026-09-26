import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WelcomeBackScreen from "@/app/welcome-back";
import { backedUpAgo, maskPhone } from "@/utils/backupDisplay";
import { getDriveBackup } from "@/services/DriveBackupService";
import { runWelcomeBackRestore } from "@/services/welcomeBack";

jest.mock("expo-haptics");
jest.mock("@/services/DriveBackupService");
jest.mock("@/services/welcomeBack");

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: { replace: (...args: any[]) => mockReplace(...args) },
}));

const mockRefresh = jest.fn();
jest.mock("@/contexts/RemindersContext", () => ({
  useReminders: () => ({ refreshFromStorage: mockRefresh }),
}));

const drive = {
  signIn: jest.fn(),
  signOut: jest.fn(),
  findBackup: jest.fn(),
  markRestoreSettled: jest.fn(),
};

const BACKUP = {
  raw: "{raw}",
  modifiedTime: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  reminderCount: 42,
  identity: { userName: "Anand", registeredPhone: "+919876543210" },
};

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <WelcomeBackScreen />
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (getDriveBackup as jest.Mock).mockReturnValue(drive);
  drive.signIn.mockResolvedValue({ ok: true, email: "me@example.com" });
  drive.findBackup.mockResolvedValue({ ok: true, backup: BACKUP });
  (runWelcomeBackRestore as jest.Mock).mockResolvedValue({
    reminders: { ok: true, added: 42, duplicates: 0, skipped: 0 },
    number: { status: "moved", claimed: [] },
  });
});

async function reachFound() {
  const screen = renderScreen();
  fireEvent.press(screen.getByTestId("welcome-back-signin"));
  await screen.findByTestId("welcome-back-restore");
  return screen;
}

describe("WelcomeBackScreen", () => {
  it("shows the reminder count as a statement and the masked number as a ticked checkbox", async () => {
    const { getByText, getByTestId } = await reachFound();

    expect(getByText("Restores 42 reminders and your settings")).toBeTruthy();
    // Only the number option is a checkbox; the restore line is a statement.
    expect(getByTestId("welcome-back-reminders-option").props.accessibilityRole).toBeUndefined();
    expect(getByText("Move your number +9198••• ••210 to this phone")).toBeTruthy();
    expect(getByTestId("welcome-back-number-option").props.accessibilityState).toEqual({ checked: true });
  });

  it("restores reminders and moves the number in one tap", async () => {
    const { getByTestId, findByTestId } = await reachFound();
    fireEvent.press(getByTestId("welcome-back-restore"));

    await findByTestId("welcome-back-done");
    expect(runWelcomeBackRestore).toHaveBeenCalledWith({
      raw: "{raw}",
      phone: "+919876543210",
      moveNumber: true,
    });
    expect(mockRefresh).toHaveBeenCalled();
    expect(getByTestId("welcome-back-done-message").props.children).toBe(
      "42 reminders restored. Your number now works on this phone."
    );
  });

  it("restores reminders only when the number box is unticked", async () => {
    const { getByTestId, findByTestId } = await reachFound();
    fireEvent.press(getByTestId("welcome-back-number-option"));
    fireEvent.press(getByTestId("welcome-back-restore"));

    await findByTestId("welcome-back-done");
    expect(runWelcomeBackRestore).toHaveBeenCalledWith(expect.objectContaining({ moveNumber: false }));
  });

  it("offers no number box when the backup carries no number", async () => {
    drive.findBackup.mockResolvedValue({ ok: true, backup: { ...BACKUP, identity: {} } });
    const { queryByTestId } = await reachFound();
    expect(queryByTestId("welcome-back-number-option")).toBeNull();
  });

  it("says so plainly when the number could not be moved", async () => {
    (runWelcomeBackRestore as jest.Mock).mockResolvedValue({
      reminders: { ok: true, added: 3, duplicates: 0, skipped: 0 },
      number: { status: "failed", error: "network_error" },
    });
    const { getByTestId, findByTestId } = await reachFound();
    fireEvent.press(getByTestId("welcome-back-restore"));

    expect((await findByTestId("welcome-back-done-message")).props.children).toBe(
      "3 reminders restored. Couldn't move your number — you can add it in Settings."
    );
  });

  it("offers a file import when the account has no backup", async () => {
    drive.findBackup.mockResolvedValue({ ok: true, backup: null });
    const { getByTestId, findByTestId } = renderScreen();
    fireEvent.press(getByTestId("welcome-back-signin"));

    fireEvent.press(await findByTestId("welcome-back-import-file"));
    expect(mockReplace).toHaveBeenCalledWith("/backup");
  });

  it("returns to the intro, not an error, when sign-in is cancelled", async () => {
    drive.signIn.mockResolvedValue({ ok: false, error: "cancelled" });
    const { getByTestId, findByTestId } = renderScreen();
    fireEvent.press(getByTestId("welcome-back-signin"));

    expect(await findByTestId("welcome-back-signin")).toBeTruthy();
  });

  // Starting fresh is itself the restore decision: it releases auto-backup
  // (invariant 1) so this install's own reminders get backed up from now on.
  it("settles the restore decision when the user starts fresh", async () => {
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId("welcome-back-start-fresh"));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/(tabs)"));
    expect(drive.markRestoreSettled).toHaveBeenCalled();
  });
});

describe("helpers", () => {
  it("masks all but the country prefix and last three digits", () => {
    expect(maskPhone("+919876543210")).toBe("+9198••• ••210");
  });

  it("describes backup age in plain words", () => {
    const now = Date.parse("2026-09-25T12:00:00Z");
    expect(backedUpAgo("2026-09-25T11:59:30Z", now)).toBe("just now");
    expect(backedUpAgo("2026-09-25T11:20:00Z", now)).toBe("40 minutes ago");
    expect(backedUpAgo("2026-09-25T09:00:00Z", now)).toBe("3 hours ago");
    expect(backedUpAgo("2026-09-24T12:00:00Z", now)).toBe("yesterday");
    expect(backedUpAgo("2026-09-20T12:00:00Z", now)).toBe("5 days ago");
  });
});
