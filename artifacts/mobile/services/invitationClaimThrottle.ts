import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Throttle the polling claim to 6 hours between calls. This caps useInvitationCheck
 * (mount + foreground resume) to about 4 calls per day, and in practice 4-8 per
 * month since it must race with app opens. The push-triggered claim path stays
 * ungated and resets the cooldown, so devices with working push never wait.
 *
 * The three push-triggered paths are in:
 * - NotificationResponseHandler.tsx (addNotificationReceivedListener)
 * - notificationResponseHandler.ts (deps.checkForInvitations on tap)
 * - notificationResponseTask.ts (headless, sets pushPending)
 */
export const CLAIM_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const LAST_CLAIM_AT_KEY = "invitationClaimThrottle:lastClaimAt";
const PUSH_PENDING_KEY = "invitationClaimThrottle:pushPending";

/**
 * Pure function. No side effects, no clock, no storage. Given lastClaimAt and
 * the current time, decide whether a polling claim should proceed.
 *
 * - If pushPending is true, claim immediately. A push landed; the cooldown does
 *   not apply.
 * - If lastClaimAt is null, claim immediately. A fresh install must never wait.
 * - Otherwise, claim if we are past the cooldown window.
 */
export function shouldClaimNow(
  lastClaimAt: number | null,
  now: number,
  pushPending: boolean
): boolean {
  if (pushPending) return true;
  if (lastClaimAt === null) return true;
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
