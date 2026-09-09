import { Platform } from "react-native";
import Constants from "expo-constants";
import { hasSession, getSupabaseClient } from "./SessionService";

/**
 * Writes this handset's Expo push token to `devices` (Task 16 final-review
 * Fix 2). Nothing in this codebase called `getExpoPushTokenAsync()` before
 * this - `get_push_tokens_for_user()` (Task 7) always returned an empty set
 * in production as a result, so push delivery was structurally dead.
 *
 * Matches the established "never throw" pattern from InvitationService.ts /
 * RecipientLookupService.ts: every failure path returns
 * `{ ok: false, error: string }` rather than throwing, so a fire-and-forget
 * caller never needs a try/catch of its own.
 *
 * Deliberately does NOT reuse ReminderService's requestNotificationPermissions()
 * - that function unconditionally calls requestPermissionsAsync() (it also
 * sets up the notification channel/snooze category as a side effect, which
 * this call site has no business doing), where this needs a check-then-request
 * split so a caller who already denied permission doesn't get re-prompted on
 * every bind. Requesting is still fine here since bind-invite.tsx only calls
 * this once, right after a fresh bind succeeds.
 */

export type RegisterDeviceResult = { ok: true } | { ok: false; error: string };

// eslint-disable-next-line
let Notifications: any = null;
try {
  // @ts-ignore
  Notifications = require("expo-notifications");
} catch {
  Notifications = null;
}

function projectIdFromConfig(): string | undefined {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ??
    // @ts-ignore - present on some SDK versions' easConfig shape
    Constants?.easConfig?.projectId
  );
}

export async function registerDeviceForPush(): Promise<RegisterDeviceResult> {
  try {
    // a) No session -> no `users` row yet -> devices.user_id has nothing to
    // point at. Do NOT request OS permissions for a capability that can't be
    // used yet.
    const authenticated = await hasSession();
    if (!authenticated) return { ok: false, error: "not_authenticated" };

    if (!Notifications) return { ok: false, error: "unsupported_environment" };

    // b) Check, then request only if not already granted.
    let status: string | undefined;
    try {
      const current = await Notifications.getPermissionsAsync();
      status = current?.status;
      if (status !== "granted") {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested?.status;
      }
    } catch {
      return { ok: false, error: "permission_denied" };
    }

    // c) Soft, best-effort registration - never block anything else.
    if (status !== "granted") return { ok: false, error: "permission_denied" };

    // d) getExpoPushTokenAsync can throw, e.g. in an unsupported
    // environment/simulator.
    let token: string;
    try {
      const projectId = projectIdFromConfig();
      const result = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );
      token = result?.data;
      if (!token) return { ok: false, error: "push_token_error" };
    } catch {
      return { ok: false, error: "push_token_error" };
    }

    // e) Upsert into `devices` via the caller's own scoped client -
    // devices_insert_own/devices_update_own RLS already grant this, no Edge
    // Function needed (same reasoning as Task 10's direct-RPC-for-bind
    // decision). expo_push_token is UNIQUE across ALL accounts, so a
    // conflict on a DIFFERENT account's row must surface as a real error,
    // never be silently swallowed.
    const client = getSupabaseClient();
    const { error } = await client.from("devices").upsert(
      {
        expo_push_token: token,
        platform: Platform.OS,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "expo_push_token" }
    );

    if (error) {
      // Postgres unique_violation. RLS means this device's own upsert only
      // hits this path when the token row belongs to a different account's
      // user_id (a same-account re-registration is an ordinary update, not
      // a conflict) - surface it distinctly so a caller can tell "not
      // registered" apart from "registered to someone else's account".
      if (
        (error as { code?: string }).code === "23505" ||
        /unique constraint/i.test((error as { message?: string }).message ?? "")
      ) {
        return { ok: false, error: "token_conflict" };
      }
      return { ok: false, error: "registration_failed" };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "registration_failed" };
  }
}
