import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonOk } from "../_shared/errors.ts";
import { getAuthedClient } from "../_shared/supabaseClient.ts";
import { sendExpoPush, type PushResult } from "../_shared/expoPush.ts";

export interface RespondRequest {
  invitationId: string;
  response: "accepted" | "declined";
  /**
   * Only meaningful (and only sent by the client) on "accepted" - the time
   * the recipient actually chose, after their own quiet-hours prompt. Never
   * present on a decline; respond_to_invitation() ignores it there anyway.
   */
  acceptedDatetime?: string;
}

type PushSender = (
  tokens: string[],
  message: { title: string; body: string; data?: Record<string, unknown> }
) => Promise<PushResult>;

/**
 * Pure logic: call respond_to_invitation() (T5.1-T5.3's single enforcement
 * point for accept/decline), then - only on an accept that actually moved
 * the time - best-effort push the SENDER so they know the receiver chose a
 * different time than the one they sent. The pushed times are deliberately
 * left out of the push copy itself: this function has no idea what
 * timezone the sender's device will render them in, and a server-guessed
 * time here could disagree with what the app shows once opened. The exact
 * before/after travels in `data` for the app to format locally (see
 * reminder-detail.tsx / ReminderCard.tsx).
 */
export async function handleRespondInvitation(
  client: SupabaseClient,
  callerId: string,
  body: RespondRequest,
  pushSender: PushSender = sendExpoPush
) {
  const { data, error } = await client.rpc("respond_to_invitation", {
    p_invitation_id: body.invitationId,
    p_response: body.response,
    p_accepted_datetime: body.response === "accepted" ? body.acceptedDatetime ?? null : null,
  });
  if (error) throw error;

  const invitation = data?.[0];
  if (!invitation) throw new Error("respond_to_invitation returned no row");

  const moved =
    body.response === "accepted" &&
    invitation.datetime &&
    invitation.original_datetime &&
    invitation.datetime !== invitation.original_datetime;

  if (moved) {
    try {
      const { data: tokenRows } = await client.rpc("get_sender_push_tokens", {
        p_invitation_id: body.invitationId,
      });
      const tokens = (tokenRows ?? []).map((d: { expo_push_token: string }) => d.expo_push_token);

      if (tokens.length > 0) {
        // Caller here IS the recipient (users_select_self RLS covers
        // reading their own row) - same precedent as send-invitation's own
        // sender-name read, just for the other party.
        const { data: recipientRow } = await client
          .from("users")
          .select("display_name")
          .eq("id", callerId)
          .maybeSingle();
        const recipientName = recipientRow?.display_name || "Someone";

        await pushSender(tokens, {
          title: `${recipientName} moved a reminder`,
          body: "Tap to see the new time.",
          data: {
            type: "invitation_time_changed",
            invitationId: invitation.id,
            fromDatetime: invitation.original_datetime,
            toDatetime: invitation.datetime,
            recipientName,
          },
        });
      }
    } catch {
      // Best-effort, same precedent as send-invitation's own push: the
      // accept itself already succeeded and must not be undone or reported
      // as failed just because telling the sender about it didn't work.
    }
  }

  return { invitation };
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authed = await getAuthedClient(req);
  if (authed instanceof Response) return authed;

  let body: RespondRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_body", "Request body must be valid JSON");
  }
  if (!body.invitationId || !["accepted", "declined"].includes(body.response)) {
    return jsonError(400, "invalid_body", "invitationId and a valid response are required");
  }

  try {
    const result = await handleRespondInvitation(authed.client, authed.userId, body);
    return jsonOk(result);
  } catch {
    return jsonError(404, "not_found", "Invitation not found, not yours, or already responded to");
  }
});
