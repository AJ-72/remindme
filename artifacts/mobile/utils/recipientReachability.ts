/**
 * Whether a cached "does this contact have the app" answer may still be used.
 *
 * Reachability is DERIVED, never a durable fact about a person. Persisting
 * "Amma has no app" is the bug that makes the feature look permanently broken
 * the day Amma installs it - the app would never look again.
 */

/**
 * A hit may be reused for a while: if the recipient deleted their account since,
 * the send degrades gracefully rather than misleading anyone.
 */
export const REACHABLE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * A miss expires far sooner, and the asymmetry is the whole point. "They don't
 * have the app" is the answer that silently stops the feature ever working, so
 * it is the one that must be re-asked.
 */
export const UNREACHABLE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface ReachabilityRecord {
  /** ISO timestamp of the lookup. */
  lookedUpAt?: string | null;
  /** What the lookup answered. */
  reachable?: boolean;
  /**
   * Whether the number had to be resolved using a region (see
   * `normalizeForIdentity`). An ambiguous number may have been hashed as a
   * different country's entirely.
   */
  ambiguous?: boolean;
}

export function isReachabilityFresh(
  record: ReachabilityRecord | null | undefined,
  now: number
): boolean {
  const at = Date.parse(record?.lookedUpAt ?? "");
  if (Number.isNaN(at)) return false;

  // A miss on an ambiguous number proves nothing - the lookup may have asked
  // about a different country's number. Caching it would bake in the very
  // mismatch normalizeForIdentity exists to surface.
  if (!record?.reachable && record?.ambiguous) return false;

  const age = now - at;

  // A lookup dated in the future is a skewed clock, not a fresh answer. Without
  // this it would stay "fresh" until the clock caught up, pinning a stale
  // result for as long as the skew lasts.
  if (age < 0) return false;

  const ttl = record?.reachable ? REACHABLE_TTL_MS : UNREACHABLE_TTL_MS;
  return age < ttl;
}
