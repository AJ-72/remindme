import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonOk } from "../_shared/errors.ts";
import { getAuthedClient } from "../_shared/supabaseClient.ts";

/**
 * Pure logic: collect every pending invitation for the authenticated
 * caller via the claim_invitations() RPC (T1.8) - all the security logic
 * (matching on the caller's own bound phone_hash via auth.uid(), never a
 * caller-supplied value) already lives there. This is why no deferred deep
 * linking is needed anywhere in T4.4: the invitation is addressed to a
 * number, not a device or install session, so calling this right after a
 * successful bind finds every invitation waiting for that number.
 */
export async function handleClaimInvitations(client: SupabaseClient) {
  const { data, error } = await client.rpc("claim_invitations");
  if (error) throw error;

  const claimed = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    datetime: row.datetime,
    senderId: row.sender_id,
  }));

  return { claimed };
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authed = await getAuthedClient(req);
  if (authed instanceof Response) return authed;

  try {
    const result = await handleClaimInvitations(authed.client);
    return jsonOk(result);
  } catch {
    return jsonError(500, "claim_failed", "Could not claim invitations");
  }
});
