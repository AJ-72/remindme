import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";
import { jsonOk, jsonError } from "../_shared/errors.ts";

export async function handleExpireInvitations(client: SupabaseClient) {
  const { data, error } = await client.rpc("expire_invitations");
  if (error) throw error;
  return { expiredCount: (data ?? []).length };
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
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return jsonError(401, "not_authenticated", "Invalid cron secret");
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
