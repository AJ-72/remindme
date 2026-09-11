import { getCurrentSession, ensureSession, getSupabaseClient } from "./SessionService";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/constants/supabase";

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
  if (!session) return { ok: false, error: "not_authenticated" };

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
      return { ok: false, error: json?.error?.code ?? "send_failed" };
    }
    return { ok: true, invitationId: json.invitation.id };
  } catch {
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
 * Collects every pending invitation addressed to this account's bound
 * number (T4.4). Call this right after a successful bind - that is why no
 * deferred deep-linking is needed anywhere in this feature: the invitation
 * is addressed to a number, not a device or install session, so it finds
 * the recipient the moment binding proves ownership of that number.
 */
export async function claimPendingInvitations(): Promise<ClaimedInvitation[]> {
  const session = await getCurrentSession();
  if (!session) return [];

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/claim-invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.claimed ?? [];
  } catch {
    return [];
  }
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
  response: "accepted" | "declined"
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
      body: JSON.stringify({ invitationId, response }),
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json?.error?.code ?? "respond_failed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/**
 * Shared "go check for invitations, and if there's exactly one, jump
 * straight to it" logic - previously duplicated between bind-invite.tsx and
 * register-number.tsx (each with its own local navigateToInvitationPreview
 * + claimPendingInvitations().then(...) call). Pulled out so the same check
 * can also run from app-foreground/launch and from a received push,
 * without a third copy of the "exactly one vs. more than one" rule.
 *
 * More than one claimed invitation deliberately does NOT navigate here -
 * same precedent as bind-invite.tsx: a multi-invitation list is a separate,
 * still-unbuilt screen (Task 11/Phase 5's scope boundary), not something
 * this helper should improvise.
 *
 * Never throws - claimPendingInvitations() already swallows its own
 * failures (missing session, network error) and returns [], which this
 * simply passes through with no navigation.
 */
export async function checkForInvitations(
  navigate: (invitation: ClaimedInvitation) => void
): Promise<ClaimedInvitation[]> {
  const claimed = await claimPendingInvitations();
  if (claimed.length === 1) {
    navigate(claimed[0]);
  }
  return claimed;
}
