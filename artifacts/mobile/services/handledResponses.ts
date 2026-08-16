/**
 * Persisted "already handled" set for notification responses.
 *
 * THE BUG THIS FIXES: a single Snooze press could schedule an unbounded number
 * of notifications. Two things conspire:
 *
 *  1. The same response is delivered to two independent handlers — the headless
 *     TaskManager task (tasks/notificationResponseTask.ts, which Android runs
 *     whenever the app is not in the foreground) and the React listener
 *     (components/NotificationResponseHandler.tsx). Each carried its own
 *     in-memory dedupe ref, so neither could see the other's work.
 *  2. `getLastNotificationResponseAsync()` is not a queue drain — it keeps
 *     resolving with the SAME response on every launch until a newer response
 *     replaces it, and the React ref that guards it is recreated on every
 *     mount. So each cold start replayed the last response again.
 *
 * Marking a response identifier here makes the dedupe survive both the process
 * boundary and app restarts. Storage is a capped ring so it can never grow
 * without bound; the cap only has to cover "responses that might still be
 * replayed", which in practice is one.
 *
 * At-most-once, deliberately: the mark is written BEFORE the action runs. A
 * crash between the two loses one snooze, which is a far smaller failure than
 * the spam it replaces.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export const HANDLED_RESPONSES_KEY = "@handled_notification_responses_v1";

/**
 * Newest-first ring size. Only replays of the most recent response are
 * possible, so this is generous — it exists to bound storage, not to be tuned.
 */
export const HANDLED_RESPONSES_LIMIT = 50;

async function readHandled(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HANDLED_RESPONSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

export async function hasHandledResponse(identifier: string): Promise<boolean> {
  return (await readHandled()).includes(identifier);
}

export async function markResponseHandled(identifier: string): Promise<void> {
  try {
    const handled = await readHandled();
    if (handled[0] === identifier) return;
    const next = [identifier, ...handled.filter((id) => id !== identifier)].slice(
      0,
      HANDLED_RESPONSES_LIMIT
    );
    await AsyncStorage.setItem(HANDLED_RESPONSES_KEY, JSON.stringify(next));
  } catch {
    // A failed write means the response may be handled twice — the snooze path
    // cancels before it schedules, so that degrades to one extra notification
    // rather than a duplicate.
  }
}
