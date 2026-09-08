import { getCurrentSession } from "./SessionService";
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
