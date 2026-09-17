import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/constants/supabase";

/**
 * Session handling for the mobile client (T0.3, M4 Tier 2 — "remind someone
 * else").
 *
 * "Anonymous-by-default; a session exists only after binding" (design spec,
 * "An account is not a bound phone number") is a hard constraint, not a
 * preference: a user who only ever reminds themselves must make ZERO network
 * calls. This module is built so that's true by construction:
 *
 * - The supabase-js client is constructed lazily (getClient()), on first
 *   access — never at import time or app launch.
 * - getCurrentSession()/hasSession() only ever call auth.getSession(), which
 *   reads whatever is already in local storage and makes no network request
 *   when nothing is there — which is always true for a user who has never
 *   called ensureSession() below.
 * - ensureSession() is the ONLY function in this module that can make a
 *   network call (supabase.auth.signInAnonymously()). It exists to be
 *   invoked from exactly one place: the moment binding actually begins
 *   (tapping an invite link, or starting the OTP flow) — never eagerly at
 *   app launch, and nothing in this codebase calls it yet.
 *
 * The device key (DeviceIdentityService) is deliberately not threaded
 * through here — it's a separate, local-only concept (see that module's
 * header), and nothing in this file sends it anywhere.
 *
 * Per ADR 0001, this client is never used to reach PostgREST or Realtime
 * directly; every privileged operation is an Edge Function call that
 * forwards the session's JWT. Auth is the one thing supabase-js is used for
 * here.
 */

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/**
 * Whatever session is already cached locally, or null if none exists. Makes
 * no network call — see module header.
 */
export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await getClient().auth.getSession();
  if (error) return null;
  return data.session;
}

export async function hasSession(): Promise<boolean> {
  return (await getCurrentSession()) !== null;
}

/**
 * The raw supabase-js client, for the rare caller that needs something this
 * module doesn't wrap (e.g. an RPC call - see InvitationService.bindViaInviteToken).
 * Per ADR 0001 this is NOT for reaching PostgREST/Realtime tables directly;
 * it exists only for direct RPC calls to SECURITY DEFINER functions that are
 * themselves the complete interface (no Edge Function wrapper needed).
 *
 * Same lazy-singleton client as every other accessor in this module - calling
 * this does not itself make a network call or violate "zero calls until
 * binding starts" (see module header); only whatever the caller does with it
 * can.
 */
export function getSupabaseClient(): SupabaseClient {
  return getClient();
}

let pendingEnsure: Promise<Session> | null = null;

/**
 * Establishes a session if one doesn't already exist, via anonymous auth —
 * the one function in this module allowed to touch the network. Call it only
 * when binding actually starts.
 *
 * Concurrent callers share one in-flight sign-in rather than each racing
 * their own: two callers both finding no session and both calling
 * signInAnonymously() would mint two separate anonymous accounts for one
 * device, which is exactly the kind of identity bug this feature exists to
 * avoid elsewhere (see the design spec's "Known defects" #1).
 */
export function ensureSession(): Promise<Session> {
  if (!pendingEnsure) {
    pendingEnsure = (async () => {
      const existing = await getCurrentSession();
      if (existing) return existing;

      const { data, error } = await getClient().auth.signInAnonymously();
      if (error || !data.session) {
        throw error ?? new Error("Could not establish a session");
      }
      return data.session;
    })();
    // Cleared once settled either way. Chained separately from the value
    // returned to callers (via .catch on the derived promise, not the
    // original) so a rejection here doesn't become a second, unhandled
    // rejection on top of the one the caller already gets from awaiting
    // ensureSession() itself.
    pendingEnsure.finally(() => {
      pendingEnsure = null;
    }).catch(() => {});
  }
  return pendingEnsure;
}
