import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonOk } from "../_shared/errors.ts";
import { getAuthedClient } from "../_shared/supabaseClient.ts";
import { sendExpoPush, type PushResult } from "../_shared/expoPush.ts";

export interface SendInvitationRequest {
  recipientAppUserId: string;
  title: string;
  description: string;
  datetime: string;
}

type PushSender = (
  tokens: string[],
  message: { title: string; body: string; data?: Record<string, unknown> }
) => Promise<PushResult>;

/**
 * Pure logic: create the invitation via the DB's send_invitation() RPC (the
 * single enforcement point for the block-list check and 30-day content cap,
 * per Task 6), then best-effort push every registered device for that
 * recipient. A missing/dead device never fails the send - the invitation
 * itself is created either way, since T4.4 (self-claiming registration)
 * means it's collected the moment the recipient's own device authenticates,
 * push or no push.
 */
export async function handleSendInvitation(
  client: SupabaseClient,
  body: SendInvitationRequest,
  pushSender: PushSender = sendExpoPush
) {
  const { data, error } = await client.rpc("send_invitation", {
    p_recipient_app_user_id: body.recipientAppUserId,
    p_title: body.title,
    p_description: body.description,
    p_datetime: body.datetime,
  });
  if (error) throw error;

  const invitation = data?.[0];
  if (!invitation) throw new Error("send_invitation returned no row");

  const { data: deviceRows } = await client.rpc("get_push_tokens_for_user", {
    p_user_id: body.recipientAppUserId,
  });

  const tokens = (deviceRows ?? []).map((d: { expo_push_token: string }) => d.expo_push_token);
  if (tokens.length > 0) {
    try {
      // data.type lets the client tell an invitation push apart from any
      // other kind (e.g. a locally-scheduled reminder notification, which
      // carries its own differently-shaped NotificationData) without
      // guessing from title/body text - see
      // hooks/useInvitationCheck.ts and notificationResponseHandler.ts.
      await pushSender(tokens, {
        title: "New reminder",
        body: body.title,
        data: { type: "invitation", invitationId: invitation.id },
      });
    } catch {
      // A push-delivery failure (e.g. fetch itself throwing on a network
      // error inside sendExpoPush, which its own !res.ok check does not
      // catch) must never fail the invitation send - the invitation is
      // already created by this point via send_invitation() above, and
      // T4.4's self-claiming registration means the recipient picks it up
      // on next auth regardless of push.
    }
  }

  return { invitation };
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authed = await getAuthedClient(req);
  if (authed instanceof Response) return authed;

  let body: SendInvitationRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_body", "Request body must be valid JSON");
  }
  if (!body.recipientAppUserId || !body.title || !body.datetime) {
    return jsonError(400, "invalid_body", "recipientAppUserId, title, and datetime are required");
  }

  try {
    const result = await handleSendInvitation(authed.client, body);
    return jsonOk(result);
  } catch (e) {
    const message = (e as Error).message ?? "";
    if (message.includes("not accepting reminders")) {
      return jsonError(403, "blocked", "Recipient is not accepting reminders from you");
    }
    if (message.includes("recipient not found")) {
      return jsonError(404, "recipient_not_found", "Recipient not found");
    }
    return jsonError(500, "send_failed", "Could not send invitation");
  }
});
