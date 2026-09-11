import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";
import { jsonError } from "./errors.ts";

export interface AuthedClient {
  client: SupabaseClient;
  userId: string;
}

/**
 * Builds a supabase-js client scoped to the CALLER's JWT (forwarded from the
 * Authorization header), never the service role — per ADR 0001, every
 * privileged operation acts as the calling user except the two that
 * structurally cannot (lookup's hash match, claim's self-claim), which use
 * SECURITY DEFINER SQL, not a service-role client, to cross that boundary.
 *
 * Returns a ready-to-return 401 Response on any auth failure, so callers can
 * write `const authed = await getAuthedClient(req); if (authed instanceof
 * Response) return authed;` and never fall through with a null userId.
 */
export async function getAuthedClient(req: Request): Promise<AuthedClient | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonError(401, "not_authenticated", "Missing Authorization header");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return jsonError(401, "not_authenticated", "Invalid or expired session");
  }

  return { client, userId: data.user.id };
}
