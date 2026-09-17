import { getCurrentSession, ensureSession, getSupabaseClient } from "./SessionService";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/constants/supabase";
import { EVENTS } from "@/constants/analytics";
import { track } from "@/services/AnalyticsService";

export type SendInvitationResult =
  | { ok: true; invitationId: string }
  | { ok: false; error: string };

/**
 * Calls the send-invitation Edge Function (T4.1-T4.3). Never throws - every
 * failure mode (no session, network error, server-side refusal) comes back
 * as ok:false with an error code the caller can show copy for, since a
 * sender tapping "Send" needs a definite outcome either way.
 */
export async function sendInvitation(
  recipientAppUserId: string,
  title: string,
  description: string,
  datetime: string
): Promise<SendInvitationResult> {
  const session = await getCurrentSession();
  if (!session) {
    track(EVENTS.INVITATION_SENT, { ok: false, error: "not_authenticated" });
    return { ok: false, error: "not_authenticated" };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-invitation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ recipientAppUserId, title, description, datetime }),
    });

    const json = await res.json();
    if (!res.ok) {
      // The error CODE only - the server's own enum, never its message, which
      // can quote the title that was rejected.
      track(EVENTS.INVITATION_SENT, {
        ok: false,
        error: String(json?.error?.code ?? "send_failed"),
      });
      return { ok: false, error: json?.error?.code ?? "send_failed" };
    }
    track(EVENTS.INVITATION_SENT, { ok: true, error: null });
    return { ok: true, invitationId: json.invitation.id };
  } catch {
    track(EVENTS.INVITATION_SENT, { ok: false, error: "network_error" });
    return { ok: false, error: "network_error" };
  }
}

/**
 * Syncs the local "Your name" setting to `users.display_name` (B11), so
 * send-invitation's push notification and get_sender_display_name() (read
 * by invitation-preview.tsx) have something real to show instead of always
 * falling back to "Someone". Direct client update, not an Edge Function -
 * `display_name` is already both RLS- and column-grant writable by the
 * owning row's own auth.uid() (users_update_self, privileges.sql), the same
 * shape as invitation-preview.tsx's direct `blocks` insert.
 *
 * Deliberately does NOT call ensureSession() - syncing a name must never be
 * the thing that first creates a network identity for an anonymous-by-
 * default user (SessionService.ts header). No session yet means nothing to
 * sync to, so this silently no-ops rather than establishing one.
 */
export async function syncDisplayName(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;

  const session = await getCurrentSession();
  if (!session) return;

  try {
    await getSupabaseClient()
      .from("users")
      .update({ display_name: trimmed })
      .eq("id", session.user.id);
  } catch {
    // Best-effort - a failed sync must never block the name setting itself
    // from saving locally, and there is nothing actionable to show the user
    // for a background sync failure.
  }
}

export type SelfRegisterResult = { ok: true; appUserId: string } | { ok: false; error: string };

/**
 * Self-serve first-time registration: a number with no invitation and no
 * existing account asserts itself directly. OTP verification is explicitly
 * deferred (tracked separately) — this trusts the number the caller typed.
 * Establishes a session first via ensureSession(), same as
 * bindViaInviteToken() below, since a not-yet-registered caller has none yet.
 * Goes through the self-register Edge Function (not a direct RPC like
 * bindViaInviteToken) because hashing the phone number requires the
 * server-side pepper, which the client never has.
 */
export async function selfRegister(phoneE164: string): Promise<SelfRegisterResult> {
  let session;
  try {
    session = await ensureSession();
  } catch {
    return { ok: false, error: "network_error" };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/self-register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ phoneE164 }),
    });

    const json = await res.json();
    if (!res.ok) {
      return { ok: false, error: json?.error?.code ?? "self_register_failed" };
    }
    return { ok: true, appUserId: json.appUserId };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export interface ClaimedInvitation {
  id: string;
  title: string | null;
  description: string | null;
  datetime: string;
  senderId: string;
}

/**
 * The result of one claim attempt.
 *
 * `ok` exists because "the server said there is nothing waiting" and "we
 * never reached the server" are the same empty array, and the claim throttle
 * (services/invitationClaimThrottle.ts) must tell them apart. Starting a
 * cooldown on a failed call would let one offline app-open blind the app for
 * the whole window - the exact regression this type prevents.
 *
 * A caller with no session gets ok:false too. That costs nothing: the
 * no-session path makes no network call at all, so re-checking on every
 * foreground stays free, and a user who binds mid-session is not locked out
 * by a cooldown started before they had an account.
 */
export interface ClaimOutcome {
  ok: boolean;
  claimed: ClaimedInvitation[];
}

/**
 * Collects every pending invitation addressed to this account's bound
 * number (T4.4), reporting whether the server was actually reached.
 *
 * Call this right after a successful bind - that is why no deferred
 * deep-linking is needed anywhere in this feature: the invitation is
 * addressed to a number, not a device or install session, so it finds the
 * recipient the moment binding proves ownership of that number.
 */
export async function claimPendingInvitationsOutcome(): Promise<ClaimOutcome> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, claimed: [] };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/claim-invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) return { ok: false, claimed: [] };
    const json = await res.json();
    return { ok: true, claimed: json.claimed ?? [] };
  } catch {
    return { ok: false, claimed: [] };
  }
}

/**
 * Array-only view of the above, for callers that act on a successful bind
 * and have no cooldown to protect (bind-invite.tsx, register-number.tsx).
 * Both treat "failed" and "nothing waiting" identically, so neither needs
 * the outcome shape.
 */
export async function claimPendingInvitations(): Promise<ClaimedInvitation[]> {
  return (await claimPendingInvitationsOutcome()).claimed;
}

/**
 * Resolves display names for several senders at once (B15's pending-list
 * screen shows one row per invitation, potentially from several different
 * senders, and firing get_sender_display_name() once per row serially would
 * be N round trips on a screen that's already a "several things happened at
 * once" moment). De-dupes ids first, since the same sender commonly appears
 * on more than one pending row. Callers still need their own "Someone"
 * fallback per id - matches invitation-preview.tsx's existing precedent
 * rather than baking a copy-string into a service function.
 *
 * Never throws - a lookup failure for one id resolves to null in the map
 * (same as invitation-preview.tsx's own null-on-error handling) rather than
 * failing every other row on the screen.
 */
export async function resolveSenderNames(
  senderIds: string[]
): Promise<Record<string, string | null>> {
  const uniqueIds = Array.from(new Set(senderIds));
  const client = getSupabaseClient();

  const results = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const { data, error } = await client.rpc("get_sender_display_name", {
          p_sender_id: id,
        });
        return [id, error || !data ? null : data] as const;
      } catch {
        return [id, null] as const;
      }
    })
  );

  return Object.fromEntries(results);
}

export type BindResult = { ok: true } | { ok: false; error: string };

/**
 * Rung 1 of the verification ladder (T2.4/T2.5, done at the DB layer; this
 * wires it to the client for the first time). Establishes a session via
 * ensureSession() - the ONE place in this codebase that call was always
 * meant to run from, per SessionService's own header - then calls
 * bind_via_invite_token() directly as an RPC. No Edge Function wrapper: the
 * SQL function alone is the complete interface (no extra request-shaping,
 * rate limiting, or push delivery needed here, unlike send-invitation).
 */
export async function bindViaInviteToken(token: string): Promise<BindResult> {
  try {
    await ensureSession();
  } catch {
    return { ok: false, error: "network_error" };
  }

  const client = getSupabaseClient();
  const { data, error } = await client.rpc("bind_via_invite_token", { token });
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "bind_failed" };
  return { ok: true };
}

/**
 * Calls the respond-invitation Edge Function (T5.1/T5.2) to accept or
 * decline a claimed invitation server-side. Never returns the invitation's
 * title/description to the caller by design: on a successful accept, Task
 * 12's respond_to_invitation() SQL function nulls those columns as part of
 * the same transaction (T5.2), so the RPC response for a just-accepted
 * invitation has null content. Callers that need to schedule a local
 * reminder on accept MUST use the title/description they already hold
 * locally from claimPendingInvitations() (the ClaimedInvitation captured at
 * claim time), never anything read off this function's response.
 */
export async function respondToInvitation(
  invitationId: string,
  response: "accepted" | "declined",
  /**
   * The time the recipient actually chose, after their own quiet-hours
   * prompt (invitation-preview.tsx) - only meaningful on "accepted".
   * respond-invitation compares this to the invitation's original time and
   * pushes the sender when it differs, so the sender knows their reminder's
   * time was moved on this device, not just accepted.
   */
  acceptedDatetime?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/respond-invitation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ invitationId, response, acceptedDatetime }),
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json?.error?.code ?? "respond_failed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/**
 * Shared "go check for invitations, and route appropriately" logic -
 * previously duplicated between bind-invite.tsx and register-number.tsx
 * (each with its own local navigateToInvitationPreview +
 * claimPendingInvitations().then(...) call). Pulled out so the same check
 * can also run from app-foreground/launch and from a received push, without
 * a third copy of the "one vs. more than one" rule.
 *
 * B15: more than one claimed invitation now navigates to the pending-list
 * screen (navigateToList) instead of being dropped on the floor - the
 * previous behavior (claim silently, show nothing) is the exact gap B15
 * exists to close. navigateToList is optional so an existing caller that
 * hasn't been updated yet still compiles and keeps its old "do nothing for
 * 2+" behavior rather than crashing on a missing callback.
 *
 * Never throws - claimPendingInvitationsOutcome() already swallows its own
 * failures (missing session, network error) and reports them as ok:false,
 * which this passes through with no navigation.
 *
 * Returns the whole ClaimOutcome, not just the array: the throttle caller
 * needs `ok` to decide whether a cooldown may start at all.
 */
export async function checkForInvitations(
  navigate: (invitation: ClaimedInvitation) => void,
  navigateToList?: (invitations: ClaimedInvitation[]) => void
): Promise<ClaimOutcome> {
  const outcome = await claimPendingInvitationsOutcome();
  const claimed = outcome.claimed;
  if (claimed.length === 1) {
    navigate(claimed[0]);
  } else if (claimed.length > 1) {
    navigateToList?.(claimed);
  }
  return outcome;
}
