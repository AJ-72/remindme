import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Cooldown between two POLLED claims (useInvitationCheck's mount and
 * foreground-resume passes). The push-triggered paths stay ungated:
 * - NotificationResponseHandler.tsx (addNotificationReceivedListener)
 * - NotificationResponseHandler.tsx's deps.checkForInvitations (tap)
 * - notificationResponseTask.ts (headless; sets pushPending instead)
 *
 * ONE HOUR, NOT SIX. The cooldown is an upper bound on how long a recipient
 * whose push is broken cannot see an invitation, and `invitations.expires_at`
 * equals the reminder's own `datetime` (see lib/db/src/schema/invitations.ts)
 * - an unaccepted 08:00 reminder is deleted at 08:01 by expireInvitations.sql.
 * A cooldown longer than the invitation's own horizon does not delay the
 * invitation, it destroys it: the row expires before the next poll and the
 * recipient never learns it existed. Six hours is longer than most reminders
 * people send. One hour sits under the common case and still removes roughly
 * two thirds of the polling calls.
 *
 * Raising this value trades a recipient's lost reminders for Edge Function
 * quota. Do not raise it without re-reading expires_at above.
 */
export const CLAIM_COOLDOWN_MS = 60 * 60 * 1000;

const LAST_CLAIM_AT_KEY = "invitationClaimThrottle:lastClaimAt";
const PUSH_PENDING_KEY = "invitationClaimThrottle:pushPending";

/**
 * Pure function. No side effects, no clock, no storage. Given lastClaimAt and
 * the current time, decide whether a polling claim should proceed.
 *
 * - If pushPending is true, claim immediately. A push landed; the cooldown does
 *   not apply.
 * - If lastClaimAt is null, claim immediately. A fresh install must never wait.
 * - If `now` is BEFORE lastClaimAt, claim immediately. Both are wall-clock
 *   epochs, so an NTP correction, a carrier time update or a hand-set clock
 *   can leave a timestamp in the future. Without this branch the subtraction
 *   below stays negative and the user is locked out until real time catches
 *   up, which can be days. The write that follows a successful claim
 *   overwrites the bad value, so the state repairs itself.
 * - Otherwise, claim if we are past the cooldown window.
 *
 * Every uncertain case resolves to "claim". A wasted call costs a fraction of
 * a cent; a skipped one can cost the user a reminder.
 */
export function shouldClaimNow(
  lastClaimAt: number | null,
  now: number,
  pushPending: boolean
): boolean {
  if (pushPending) return true;
  if (lastClaimAt === null) return true;
  if (now < lastClaimAt) return true;
  return now - lastClaimAt >= CLAIM_COOLDOWN_MS;
}

/**
 * Get the timestamp of the last claim, or null if never claimed.
 */
export async function getLastClaimAt(): Promise<number | null> {
  try {
    const value = await AsyncStorage.getItem(LAST_CLAIM_AT_KEY);
    return value ? parseInt(value, 10) : null;
  } catch {
    return null;
  }
}

/**
 * Record the timestamp of a claim (typically Date.now()).
 */
export async function setLastClaimAt(timestamp: number): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_CLAIM_AT_KEY, String(timestamp));
  } catch {
    // Best-effort. A failure to record the time does not fail the claim itself.
  }
}

/**
 * Get whether a push was received while the app was backgrounded, requiring
 * a claim on the next launch.
 */
export async function getPushPending(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(PUSH_PENDING_KEY);
    return value === "true";
  } catch {
    return false;
  }
}

/**
 * Set the flag that a push arrived while backgrounded.
 */
export async function setPushPending(pending: boolean): Promise<void> {
  try {
    if (pending) {
      await AsyncStorage.setItem(PUSH_PENDING_KEY, "true");
    } else {
      await AsyncStorage.removeItem(PUSH_PENDING_KEY);
    }
  } catch {
    // Best-effort.
  }
}
