import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonOk } from "../_shared/errors.ts";
import { hmacPhoneHash } from "../_shared/phoneHash.ts";
import { getAuthedClient } from "../_shared/supabaseClient.ts";

export interface LookupRequest {
  phoneE164: string;
  deviceKey: string;
}

export interface LookupResponse {
  exists: boolean;
  appUserId: string | null;
}

/**
 * Pure request-handling logic, separated from the Deno.serve wiring below so
 * it can be tested with a fake SupabaseClient (see index.test.ts).
 */
export async function handleLookup(
  client: SupabaseClient,
  body: LookupRequest,
  ip: string
): Promise<LookupResponse> {
  const { data: allowed, error: rlError } = await client.rpc("check_lookup_rate_limit", {
    p_device_key: body.deviceKey,
    p_ip: ip,
  });
  if (rlError) throw rlError;
  if (!allowed) throw new Error("rate_limited");

  const hash = await hmacPhoneHash(body.phoneE164);
  const { data, error } = await client.rpc("hash_lookup", { lookup_hash: hash });
  if (error) throw error;

  const row = data?.[0];
  return { exists: row?.exists ?? false, appUserId: row?.app_user_id ?? null };
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authed = await getAuthedClient(req);
  if (authed instanceof Response) return authed;

  let body: LookupRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_body", "Request body must be valid JSON");
  }
  if (!body.phoneE164 || !body.deviceKey) {
    return jsonError(400, "invalid_body", "phoneE164 and deviceKey are required");
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  try {
    const result = await handleLookup(authed.client, body, ip);
    return jsonOk(result);
  } catch (e) {
    if ((e as Error).message === "rate_limited") {
      return jsonError(429, "rate_limited", "Too many lookups. Try again shortly.");
    }
    return jsonError(500, "lookup_failed", "Lookup failed");
  }
});
