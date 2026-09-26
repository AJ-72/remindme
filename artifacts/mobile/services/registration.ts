import { EVENTS } from "@/constants/analytics";
import { track } from "@/services/AnalyticsService";
import { registerDeviceForPush } from "@/services/DeviceRegistrationService";
import {
  claimPendingInvitations,
  syncDisplayName,
  type ClaimedInvitation,
} from "@/services/InvitationService";
import { getUserName, setRegisteredPhone } from "@/services/ReminderService";

export type RegistrationMethod = "self_register" | "reset" | "migrate" | "drive_restore";

/**
 * Everything that happens once the server has accepted a number for this
 * install, whichever way it got there: typed on register-number (plain,
 * reset, or migrate) or moved by the Drive welcome-back restore (B3). One
 * copy, so the two flows cannot drift - the last time a success path was
 * duplicated, one copy forgot to claim invitations and stranded them (see
 * CLAUDE.md, "three real bugs found live-testing").
 *
 * Its own module rather than part of InvitationService so tests that mock
 * InvitationService still exercise this sequence against those mocks.
 */
export async function completeRegistration(
  phoneE164: string,
  method: RegistrationMethod
): Promise<ClaimedInvitation[]> {
  await setRegisteredPhone(phoneE164);
  // B11: this is the first moment a session/users row exists for someone
  // who set their name before ever registering - syncDisplayName() from
  // setUserName() would have no-op'd back then (no session yet), so it's
  // repeated here now that one does. Fire-and-forget, same precedent as
  // registerDeviceForPush() below.
  getUserName().then((name) => {
    if (name) syncDisplayName(name);
  });
  // Fire-and-forget, same precedent as bind-invite.tsx: this is exactly
  // the moment a `users` row starts existing (a valid FK target for
  // devices.user_id), but a missing/failed push registration must never
  // block or fail the primary action.
  registerDeviceForPush();

  const claimed = await claimPendingInvitations();
  // `claimed` is the number that makes this event worth having: it is how
  // many reminders somebody had already been sent and could not receive
  // until this moment. A stranded invitation is the exact bug that was
  // found live-testing on two devices (see CLAUDE.md), so it is measured
  // now rather than rediscovered.
  track(EVENTS.NUMBER_REGISTERED, {
    method,
    ok: true,
    error: null,
    claimed: claimed.length,
  });
  return claimed;
}
