import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

import DriveBackupCard from "@/components/DriveBackupCard";
import { getDriveBackup } from "@/services/DriveBackupService";

jest.mock("expo-haptics");
jest.mock("@/services/DriveBackupService");

const mockRefresh = jest.fn();
let mockReminders: unknown[] = [];
jest.mock("@/contexts/RemindersContext", () => ({
  useReminders: () => ({ reminders: mockReminders, refreshFromStorage: mockRefresh }),
}));

const drive = {
  isConfigured: jest.fn(() => true),
  getStatus: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  findBackup: jest.fn(),
  uploadBackup: jest.fn(),
  restoreFromBackup: jest.fn(),
};

const BACKUP = {
  raw: "{raw}",
  modifiedTime: new Date().toISOString(),
  reminderCount: 5,
  identity: {},
};

beforeEach(() => {
  jest.clearAllMocks();
  mockReminders = [];
  (getDriveBackup as jest.Mock).mockReturnValue(drive);
  drive.isConfigured.mockReturnValue(true);
  drive.getStatus.mockResolvedValue(null);
  drive.signIn.mockResolvedValue({ ok: true, email: "me@example.com" });
  drive.findBackup.mockResolvedValue({ ok: true, backup: null });
  drive.uploadBackup.mockResolvedValue({ ok: true, uploaded: true, uploadedAt: "x" });
  drive.restoreFromBackup.mockResolvedValue({ ok: true, added: 5, duplicates: 0, skipped: 0 });
});

describe("DriveBackupCard", () => {
  it("renders nothing in a build without Drive support", () => {
    drive.isConfigured.mockReturnValue(false);
    const { toJSON } = render(<DriveBackupCard />);
    expect(toJSON()).toBeNull();
  });

  it("connects and backs up straight away when Drive has no backup yet", async () => {
    const { findByTestId } = render(<DriveBackupCard />);
    fireEvent.press(await findByTestId("drive-connect"));

    await waitFor(() => expect(drive.uploadBackup).toHaveBeenCalledWith("manual"));
  });

  // The non-welcome-back half of invariant 1: an existing backup is never
  // overwritten just because this install signed in.
  it("asks before touching an existing backup, and restores when asked to", async () => {
    drive.findBackup.mockResolvedValue({ ok: true, backup: BACKUP });
    const { findByTestId } = render(<DriveBackupCard />);
    fireEvent.press(await findByTestId("drive-connect"));
    fireEvent.press(await findByTestId("app-dialog-btn-restore"));

    await waitFor(() => expect(drive.restoreFromBackup).toHaveBeenCalledWith("{raw}"));
    expect(mockRefresh).toHaveBeenCalled();
    expect(drive.uploadBackup).toHaveBeenCalledWith("restore");
    expect(drive.uploadBackup).not.toHaveBeenCalledWith("manual");
  });

  it("offers no replace option on an empty phone", async () => {
    drive.findBackup.mockResolvedValue({ ok: true, backup: BACKUP });
    const { findByTestId, queryByTestId, getByTestId } = render(<DriveBackupCard />);
    fireEvent.press(await findByTestId("drive-connect"));

    expect(await findByTestId("app-dialog-btn-restore")).toBeTruthy();
    expect(queryByTestId("app-dialog-btn-replace")).toBeNull();
    expect(getByTestId("app-dialog-btn-cancel")).toBeTruthy();
  });

  it("signs back out when the user cancels the choice", async () => {
    mockReminders = [{ id: "a" }];
    drive.findBackup.mockResolvedValue({ ok: true, backup: BACKUP });
    const { findByTestId } = render(<DriveBackupCard />);
    fireEvent.press(await findByTestId("drive-connect"));
    fireEvent.press(await findByTestId("app-dialog-btn-cancel"));

    await waitFor(() => expect(drive.signOut).toHaveBeenCalled());
    expect(drive.uploadBackup).not.toHaveBeenCalled();
  });

  it("treats dismissing the sheet as cancel", async () => {
    mockReminders = [{ id: "a" }];
    drive.findBackup.mockResolvedValue({ ok: true, backup: BACKUP });
    const { findByTestId } = render(<DriveBackupCard />);
    fireEvent.press(await findByTestId("drive-connect"));
    fireEvent.press(await findByTestId("app-dialog-overlay"));

    await waitFor(() => expect(drive.signOut).toHaveBeenCalled());
    expect(drive.uploadBackup).not.toHaveBeenCalled();
  });

  it("reports a failed backup in the app's own dialog", async () => {
    drive.getStatus.mockResolvedValue({ email: "me@example.com", lastBackupAt: null, lastError: null });
    drive.uploadBackup.mockResolvedValueOnce({ ok: false, error: "quota" });
    const { findByTestId, getByTestId } = render(<DriveBackupCard />);
    fireEvent.press(await findByTestId("drive-backup-now"));

    expect((await findByTestId("app-dialog-title")).props.children).toBe("Backup failed");
    expect(getByTestId("app-dialog-message").props.children).toBe("Your Google Drive is full");
  });

  it("shows the account and when it last backed up", async () => {
    drive.getStatus.mockResolvedValue({ email: "me@example.com", lastBackupAt: new Date().toISOString(), lastError: null });
    const { findByText } = render(<DriveBackupCard />);
    expect(await findByText("me@example.com")).toBeTruthy();
    expect(await findByText("Last backed up just now")).toBeTruthy();
  });

  it("confirms before replacing a backup with an empty one", async () => {
    drive.getStatus.mockResolvedValue({ email: "me@example.com", lastBackupAt: null, lastError: null });
    drive.uploadBackup.mockResolvedValueOnce({ ok: true, uploaded: false, skipped: "guard" });
    const { findByTestId } = render(<DriveBackupCard />);
    fireEvent.press(await findByTestId("drive-backup-now"));
    fireEvent.press(await findByTestId("app-dialog-btn-replace"));

    await waitFor(() =>
      expect(drive.uploadBackup).toHaveBeenLastCalledWith("manual", { allowReplaceWithEmpty: true })
    );
  });
});
