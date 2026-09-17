import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";
import { handleCors } from "../_shared/cors.ts";
import { jsonOk, jsonError } from "../_shared/errors.ts";

export async function handleExpireInvitations(client: SupabaseClient) {
  const { data, error } = await client.rpc("expire_invitations");
  if (error) throw error;
  return { expiredCount: (data ?? []).length };
}

// Final-review Fix 4: FAILS CLOSED. A missing/unset CRON_SECRET must refuse
// the call, not allow it - the previous `if (cronSecret && ...)` fell
// through to "allow" whenever CRON_SECRET was unset, mitigated only by
// config.toml's global verify_jwt = true, which is defense OUTSIDE this
// file and inconsistent with this codebase's own stated discipline ("an
// in-body check, or it rots into a comment"). Pure and exported so this is
// testable without spinning up Deno.serve.
export function checkCronAuth(req: Request, cronSecret: string | undefined): boolean {
  if (!cronSecret) return false;
  return req.headers.get("x-cron-secret") === cronSecret;
}

// Uses the SERVICE ROLE key deliberately - this is the one function in this
// plan meant to run on a schedule with no caller JWT at all (pg_cron /
// Supabase's scheduled functions invoke it with no Authorization header from
// a user). Per ADR 0001's warning, the service-role key bypasses RLS
// entirely - confirmed acceptable for this one maintenance sweep, whose own
// SQL function additionally refuses any role but service_role (belt and
// braces, since a leaked anon call still cannot use this key to do anything
// beyond what expire_invitations() itself allows).
Deno.serve(async (req: Request) => {
  // A cron caller never sends a CORS preflight, but every other function in
  // this codebase calls handleCors() first (Task 1's shared pattern) - kept
  // here too for consistency rather than leaving a silent, unstated gap.
  const cors = handleCors(req);
  if (cors) return cors;

  if (!checkCronAuth(req, Deno.env.get("CRON_SECRET"))) {
    return jsonError(401, "unauthorized", "Invalid or missing cron secret");
  }

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    const result = await handleExpireInvitations(client);
    return jsonOk(result);
  } catch {
    return jsonError(500, "expire_failed", "Could not expire invitations");
  }
});
