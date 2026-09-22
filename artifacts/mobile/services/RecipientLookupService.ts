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
import { alternateIdentityCandidates, normalizeForIdentity } from "@/utils/phoneNumber";
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
async function lookupOne(
  e164: string,
  deviceKey: string,
  accessToken: string
): Promise<{ exists: boolean; appUserId: string | null } | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ phoneE164: e164, deviceKey }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { exists: boolean; appUserId: string | null };
  } catch {
    return null;
  }
}

/**
 * On an ambiguous miss, retries a short list of plausible alternate regions
 * (see alternateIdentityCandidates) before giving up - a bare "not
 * reachable" is otherwise indistinguishable from the recipient genuinely
 * not having the app, which is the harmful failure mode this guards.
 */
export async function checkReachability(
  recipient: Pick<ReminderRecipient, "phone">,
  region: string | null
): Promise<ReachabilityResult | null> {
  const { e164, ambiguous } = normalizeForIdentity(recipient.phone, region);
  if (!e164) return null;

  const session = await getCurrentSession();
  if (!session) return null;

  const deviceKey = await getOrCreateDeviceKey();

  const first = await lookupOne(e164, deviceKey, session.access_token);
  if (first === null) return null;
  if (first.exists) {
    return { appUserId: first.appUserId, lookedUpAt: new Date().toISOString() };
  }
  if (!ambiguous) {
    return { appUserId: null, lookedUpAt: new Date().toISOString() };
  }

  for (const candidate of alternateIdentityCandidates(recipient.phone, region)) {
    const result = await lookupOne(candidate, deviceKey, session.access_token);
    if (result?.exists) {
      return { appUserId: result.appUserId, lookedUpAt: new Date().toISOString() };
    }
  }

  // Every candidate missed. Still ambiguous - a future call may need to
  // retry again rather than trusting this as durable (see
  // recipientReachability.ts's TTL asymmetry).
  return { appUserId: null, lookedUpAt: new Date().toISOString() };
}
