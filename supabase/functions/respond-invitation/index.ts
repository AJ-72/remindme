import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonOk } from "../_shared/errors.ts";
import { getAuthedClient } from "../_shared/supabaseClient.ts";

export interface RespondRequest {
  invitationId: string;
  response: "accepted" | "declined";
}

export async function handleRespondInvitation(client: SupabaseClient, body: RespondRequest) {
  const { data, error } = await client.rpc("respond_to_invitation", {
    p_invitation_id: body.invitationId,
    p_response: body.response,
  });
  if (error) throw error;
  return { invitation: data?.[0] };
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
    const result = await handleRespondInvitation(authed.client, body);
    return jsonOk(result);
  } catch {
    return jsonError(404, "not_found", "Invitation not found, not yours, or already responded to");
  }
});
