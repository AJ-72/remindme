import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonOk } from "../_shared/errors.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface JoinWaitlistRequest {
  email: string;
  /** Invisible honeypot: a real visitor never fills this. */
  website?: string;
}

export interface JoinWaitlistResponse {
  ok: true;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

/**
 * Public write path for landing-page signups. `ignoreDuplicates` means the
 * same confirmation is returned for a repeat submission without revealing
 * whether that email had joined before.
 */
export async function handleJoinWaitlist(
  client: SupabaseClient,
  body: JoinWaitlistRequest
): Promise<JoinWaitlistResponse> {
  if (body.website?.trim()) return { ok: true };

  const email = normalizeEmail(body.email);
  if (!email) throw new Error("invalid_email");

  const { error } = await client.from("waitlist_signups").upsert(
    { email, source: "landing-page", platform: "android", status: "pending" },
    { onConflict: "email", ignoreDuplicates: true }
  );
  if (error) throw error;

  return { ok: true };
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") {
    return jsonError(405, "method_not_allowed", "Use POST to join the waitlist");
  }

  let body: JoinWaitlistRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_body", "Request body must be valid JSON");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError(500, "server_not_configured", "Waitlist is not configured yet");
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    return jsonOk(await handleJoinWaitlist(client, body), 201);
  } catch (error) {
    if ((error as Error).message === "invalid_email") {
      return jsonError(400, "invalid_email", "Enter a valid email address");
    }
    return jsonError(500, "waitlist_unavailable", "Could not join the waitlist. Please try again.");
  }
});
