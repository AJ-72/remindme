import { runWelcomeBackRestore } from "@/services/welcomeBack";
import { selfRegister } from "@/services/InvitationService";
import { completeRegistration } from "@/services/registration";
import { getDriveBackup } from "@/services/DriveBackupService";
import { markNamePromptSeen } from "@/services/ReminderService";

jest.mock("@/services/InvitationService");
jest.mock("@/services/registration");
jest.mock("@/services/DriveBackupService");
jest.mock("@/services/ReminderService", () => ({ markNamePromptSeen: jest.fn() }));

const drive = {
  restoreFromBackup: jest.fn(),
  uploadBackup: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (getDriveBackup as jest.Mock).mockReturnValue(drive);
  drive.restoreFromBackup.mockResolvedValue({ ok: true, added: 42, duplicates: 0, skipped: 0 });
  drive.uploadBackup.mockResolvedValue({ ok: true, uploaded: true, uploadedAt: "x" });
  (completeRegistration as jest.Mock).mockResolvedValue([]);
});

const PHONE = "+919876543210";

describe("runWelcomeBackRestore", () => {
  it("restores reminders only when the number box is unticked", async () => {
    const result = await runWelcomeBackRestore({ raw: "{}", phone: PHONE, moveNumber: false });

    expect(result.reminders).toMatchObject({ ok: true, added: 42 });
    expect(result.number).toEqual({ status: "skipped" });
    expect(selfRegister).not.toHaveBeenCalled();
    expect(markNamePromptSeen).toHaveBeenCalled();
  });

  it("registers a number that is free without migrating anything", async () => {
    (selfRegister as jest.Mock).mockResolvedValue({ ok: true, appUserId: "u" });

    const result = await runWelcomeBackRestore({ raw: "{}", phone: PHONE, moveNumber: true });

    expect(selfRegister).toHaveBeenCalledTimes(1);
    expect(selfRegister).toHaveBeenCalledWith(PHONE);
    expect(completeRegistration).toHaveBeenCalledWith(PHONE, "drive_restore");
    expect(result.number).toEqual({ status: "moved", claimed: [] });
  });

  // The common case: the old install still holds the number. The ticked box
  // is the user's confirmation, so this migrates - never resets.
  it("migrates the old account when the number is already taken", async () => {
    (selfRegister as jest.Mock)
      .mockResolvedValueOnce({ ok: false, error: "number_taken" })
      .mockResolvedValueOnce({ ok: true, appUserId: "u" });

    const result = await runWelcomeBackRestore({ raw: "{}", phone: PHONE, moveNumber: true });

    expect(selfRegister).toHaveBeenNthCalledWith(2, PHONE, "migrate");
    expect(selfRegister).not.toHaveBeenCalledWith(PHONE, "reset");
    expect(result.number.status).toBe("moved");
  });

  it("keeps the restored reminders when moving the number fails", async () => {
    (selfRegister as jest.Mock).mockResolvedValue({ ok: false, error: "network_error" });

    const result = await runWelcomeBackRestore({ raw: "{}", phone: PHONE, moveNumber: true });

    expect(result.reminders).toMatchObject({ ok: true, added: 42 });
    expect(result.number).toEqual({ status: "failed", error: "network_error" });
    expect(completeRegistration).not.toHaveBeenCalled();
  });

  it("does not touch the number when the reminder restore itself fails", async () => {
    drive.restoreFromBackup.mockResolvedValue({ ok: false, reason: "not-a-backup" });

    const result = await runWelcomeBackRestore({ raw: "{}", phone: PHONE, moveNumber: true });

    expect(result.reminders).toEqual({ ok: false, reason: "not-a-backup" });
    expect(selfRegister).not.toHaveBeenCalled();
    expect(drive.uploadBackup).not.toHaveBeenCalled();
  });

  it("backs up straight away so Drive reflects this phone", async () => {
    await runWelcomeBackRestore({ raw: "{}", phone: undefined, moveNumber: true });
    expect(drive.uploadBackup).toHaveBeenCalledWith("restore");
  });
});
