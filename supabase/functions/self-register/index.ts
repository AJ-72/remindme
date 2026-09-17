import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonOk } from "../_shared/errors.ts";
import { hmacPhoneHash } from "../_shared/phoneHash.ts";
import { getAuthedClient } from "../_shared/supabaseClient.ts";

// Self-serve first-time registration (OTP deferred - tracked separately).
// Hashes the caller's own asserted number server-side (same pepper/
// normalization as lookup) and calls self_register(), which is the only
// thing allowed to write a not-yet-existing users row for this caller.
export interface SelfRegisterRequest {
  phoneE164: string;
}

export interface SelfRegisterResponse {
  ok: true;
  appUserId: string;
}

export async function handleSelfRegister(
  client: SupabaseClient,
  body: SelfRegisterRequest
): Promise<SelfRegisterResponse> {
  const hash = await hmacPhoneHash(body.phoneE164);
  const { data, error } = await client.rpc("self_register", { p_phone_hash: hash });
  if (error) throw error;

  const row = data?.[0];
  if (!row?.id) throw new Error("self_register_failed");
  return { ok: true, appUserId: row.id };
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authed = await getAuthedClient(req);
  if (authed instanceof Response) return authed;

  let body: SelfRegisterRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_body", "Request body must be valid JSON");
  }
  if (!body.phoneE164) {
    return jsonError(400, "invalid_body", "phoneE164 is required");
  }

  try {
    const result = await handleSelfRegister(authed.client, body);
    return jsonOk(result);
  } catch (e) {
    const message = (e as Error).message ?? "";
    if (message.includes("already registered")) {
      return jsonError(409, "number_taken", "That number is already registered to a different account");
    }
    return jsonError(500, "self_register_failed", "Registration failed");
  }
});
