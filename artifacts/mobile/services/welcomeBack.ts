import { EVENTS } from "@/constants/analytics";
import { track } from "@/services/AnalyticsService";
import { getDriveBackup } from "@/services/DriveBackupService";
import { selfRegister, type ClaimedInvitation } from "@/services/InvitationService";
import { completeRegistration } from "@/services/registration";
import { markNamePromptSeen, type ImportResult } from "@/services/ReminderService";

export type NumberOutcome =
  | { status: "skipped" }
  | { status: "moved"; claimed: ClaimedInvitation[] }
  | { status: "failed"; error: string };

export interface WelcomeBackResult {
  reminders: ImportResult;
  number: NumberOutcome;
}

/**
 * The one-tap "welcome back" restore on a fresh install (B3): reminders
 * first, then - if the user left the box ticked - the registered number.
 *
 * Order matters and is pinned by tests. Reminders are what the user can
 * least afford to lose, so they are restored before anything that can fail
 * on the network, and a number-move failure never rolls them back. The
 * number move is register-then-migrate: `selfRegister(phone)` succeeds
 * outright if the number is free, and on `number_taken` (the old install
 * still holds it) retries as "migrate" - the same server path as
 * register-number's "Yes, it's my old account". Never "reset": erasing an
 * account is only offered in the manual flow, behind its own confirmation.
 */
export async function runWelcomeBackRestore({
  raw,
  phone,
  moveNumber,
}: {
  raw: string;
  phone: string | undefined;
  moveNumber: boolean;
}): Promise<WelcomeBackResult> {
  const drive = getDriveBackup();
  const reminders = await drive.restoreFromBackup(raw);
  if (!reminders.ok) {
    track(EVENTS.DRIVE_RESTORE_RESULT, {
      ok: false,
      source: "welcome_back",
      added: 0,
      duplicates: 0,
      number_moved: false,
    });
    return { reminders, number: { status: "skipped" } };
  }
  // The restore carried the name (import fills a blank one); the first-launch
  // name sheet has nothing left to ask.
  await markNamePromptSeen();

  let number: NumberOutcome = { status: "skipped" };
  if (moveNumber && phone) {
    let result = await selfRegister(phone);
    if (!result.ok && result.error === "number_taken") {
      result = await selfRegister(phone, "migrate");
    }
    number = result.ok
      ? { status: "moved", claimed: await completeRegistration(phone, "drive_restore") }
      : { status: "failed", error: result.error };
  }

  track(EVENTS.DRIVE_RESTORE_RESULT, {
    ok: true,
    source: "welcome_back",
    added: reminders.added,
    duplicates: reminders.duplicates,
    number_moved: number.status === "moved",
  });

  // Drive now reflects this phone, including a moved number.
  await drive.uploadBackup("restore");
  return { reminders, number };
}
