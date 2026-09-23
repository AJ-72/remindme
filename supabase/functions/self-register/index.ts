import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonOk } from "../_shared/errors.ts";
import { hmacPhoneHash } from "../_shared/phoneHash.ts";
import { getAuthedClient } from "../_shared/supabaseClient.ts";

// Self-serve first-time registration (OTP deferred - tracked separately).
// Hashes the caller's own asserted number server-side (same pepper/
// normalization as lookup) and calls self_register(), which is the only
// thing allowed to write a not-yet-existing users row for this caller.
//
// `action` also covers the two collision-recovery branches offered when
// self_register() refuses a number already owned by a different account
// (B9's second half - see reset/migratePhoneNumber.sql for the full
// rationale). All three share the same request shape and the same "hash
// server-side, then call one RPC" logic, so one function routes between
// them rather than three near-identical Edge Functions.
export interface SelfRegisterRequest {
  phoneE164: string;
  action?: "register" | "reset" | "migrate";
}

export interface SelfRegisterResponse {
  ok: true;
  appUserId: string;
}

const RPC_BY_ACTION: Record<NonNullable<SelfRegisterRequest["action"]>, string> = {
  register: "self_register",
  reset: "reset_phone_number",
  migrate: "migrate_phone_number",
};

export async function handleSelfRegister(
  client: SupabaseClient,
  body: SelfRegisterRequest
): Promise<SelfRegisterResponse> {
  const hash = await hmacPhoneHash(body.phoneE164);
  const rpcName = RPC_BY_ACTION[body.action ?? "register"];
  const { data, error } = await client.rpc(rpcName, { p_phone_hash: hash });
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
  if (body.action && !Object.hasOwn(RPC_BY_ACTION, body.action)) {
    return jsonError(400, "invalid_body", "action must be register, reset, or migrate");
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
