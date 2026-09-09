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
