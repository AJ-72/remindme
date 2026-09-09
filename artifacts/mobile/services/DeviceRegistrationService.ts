import { Platform } from "react-native";
import Constants from "expo-constants";
import { getCurrentSession, getSupabaseClient } from "./SessionService";

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
    // used yet. Uses getCurrentSession() (not hasSession()) because the
    // upsert below needs the actual user id, not just a boolean - devices.user_id
    // is NOT NULL with no default, and devices_insert_own's RLS check is
    // `user_id = auth.uid()`, so a payload without it fails RLS outright
    // rather than merely being incomplete.
    const session = await getCurrentSession();
    if (!session) return { ok: false, error: "not_authenticated" };

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

    // e) Write into `devices` via the caller's own scoped client -
    // devices_insert_own/devices_update_own RLS already grant this, no Edge
    // Function needed (same reasoning as Task 10's direct-RPC-for-bind
    // decision).
    //
    // Deliberately NOT a single upsert({ onConflict: "expo_push_token" }).
    // PostgREST implements that as INSERT ... ON CONFLICT DO UPDATE, and
    // devices_update_own's RLS is `USING (user_id = auth.uid())` - so when
    // the conflicting row belongs to a DIFFERENT account, the UPDATE half
    // matches zero rows under RLS and returns success with no error, not the
    // 23505 a plain insert would raise. That would silently swallow exactly
    // the case devices.expo_push_token's UNIQUE constraint exists to catch
    // ("forgot to clear the old row" must be an error, not a handset quietly
    // receiving two people's reminders). Insert-first, and on a genuine
    // unique_violation, resolve it explicitly instead of letting PostgREST's
    // upsert semantics decide.
    const client = getSupabaseClient();
    const insert = await client.from("devices").insert({
      user_id: session.user.id,
      expo_push_token: token,
      platform: Platform.OS,
      last_seen_at: new Date().toISOString(),
    });

    if (!insert.error) return { ok: true };

    const isUniqueViolation =
      (insert.error as { code?: string }).code === "23505" ||
      /unique constraint/i.test((insert.error as { message?: string }).message ?? "");
    if (!isUniqueViolation) return { ok: false, error: "registration_failed" };

    // A row for this token already exists. update() is scoped by RLS to rows
    // this account owns - if it's a same-account re-registration, exactly
    // one row matches and this succeeds. If the row belongs to a different
    // account, RLS filters it out: no error, but no row updated either -
    // that zero-match outcome is what actually distinguishes "mine, just
    // refresh it" from "already claimed by someone else".
    const update = await client
      .from("devices")
      .update({ platform: Platform.OS, last_seen_at: new Date().toISOString() })
      .eq("expo_push_token", token)
      .select("id");

    if (update.error) return { ok: false, error: "registration_failed" };
    if (!update.data || update.data.length === 0) return { ok: false, error: "token_conflict" };

    return { ok: true };
  } catch {
    return { ok: false, error: "registration_failed" };
  }
}
