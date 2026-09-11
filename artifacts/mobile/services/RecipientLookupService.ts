/**
 * Reachability lookup + caching (T3.4/T3.5, M4 Tier 2).
 *
 * Reachability is DERIVED, never a durable fact. Caching `hasApp: false`
 * forever is the bug that makes the feature look permanently broken the day
 * someone installs the app - so every cached result carries a short TTL and
 * is re-checked at send time (see Task 8's send flow), never trusted past it.
 */

import { getCurrentSession } from "./SessionService";
import { getOrCreateDeviceKey } from "./DeviceIdentityService";
import { normalizeForIdentity } from "@/utils/phoneNumber";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/constants/supabase";
import type { ReminderRecipient } from "./ReminderService";

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export function isReachabilityStale(
  lookedUpAt: string | undefined,
  ttlMs: number = DEFAULT_TTL_MS
): boolean {
  if (!lookedUpAt) return true;
  const age = Date.now() - new Date(lookedUpAt).getTime();
  return age > ttlMs;
}

export interface ReachabilityResult {
  appUserId: string | null;
  lookedUpAt: string;
}

/**
 * Looks up whether `recipient` has the app, via the lookup Edge Function.
 * Returns null (not a throw) for every non-authoritative outcome - no
 * session yet, unresolvable phone number, network failure - so a calling
 * screen can treat "we don't know" uniformly rather than special-casing each
 * cause. A definitive "no" (appUserId: null with a fresh lookedUpAt) only
 * comes back when the server actually answered.
 */
export async function checkReachability(
  recipient: Pick<ReminderRecipient, "phone">,
  region: string | null
): Promise<ReachabilityResult | null> {
  const { e164 } = normalizeForIdentity(recipient.phone, region);
  if (!e164) return null;

  const session = await getCurrentSession();
  if (!session) return null;

  try {
    const deviceKey = await getOrCreateDeviceKey();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ phoneE164: e164, deviceKey }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { exists: boolean; appUserId: string | null };
    return { appUserId: data.exists ? data.appUserId : null, lookedUpAt: new Date().toISOString() };
  } catch {
    return null;
  }
}
