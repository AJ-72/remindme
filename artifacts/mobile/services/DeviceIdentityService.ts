import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

/**
 * The device's local identity key (T0.2, M4 Tier 2 — "remind someone else").
 *
 * This is "having an account" in the sense the design spec uses the phrase —
 * it is NOT a bound phone number, NOT a server session, and this module
 * never sends it anywhere. Generating and holding it costs nothing and
 * involves no network call, which is what lets a user who only ever reminds
 * themselves go on never phoning home. See
 * docs/superpowers/specs/2026-08-30-remind-someone-else-tier2-design.md,
 * "An account is not a bound phone number".
 *
 * Generated once via expo-crypto's randomUUID (synchronous, local, not a
 * network call) and persisted with expo-secure-store rather than
 * AsyncStorage — it is small (a uuid) and identity-shaped, which is exactly
 * what SecureStore is for. SessionService deliberately does not thread this
 * key into anything yet; wiring it into an actual bind request is later
 * (Phase 2) work.
 */

const DEVICE_KEY_STORAGE_KEY = "remindme.deviceIdentityKey.v1";

let cached: string | null = null;
let pending: Promise<string> | null = null;

/**
 * Returns this device's identity key, generating and persisting one on first
 * call if none exists yet. Idempotent under concurrent callers: if several
 * call sites race this during app startup before the first call resolves,
 * only one key is ever generated and stored.
 */
export function getOrCreateDeviceKey(): Promise<string> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = (async () => {
      const existing = await SecureStore.getItemAsync(DEVICE_KEY_STORAGE_KEY);
      const key = existing ?? Crypto.randomUUID();
      if (!existing) {
        await SecureStore.setItemAsync(DEVICE_KEY_STORAGE_KEY, key);
      }
      cached = key;
      return key;
    })();
    // Cleared once settled (either way) so a failed attempt doesn't wedge
    // every later call behind a rejected promise forever. Chained off a
    // separate derived promise (.catch on the .finally result, not on
    // `pending` itself) so a rejection here doesn't also surface as an
    // unhandled rejection independent of whatever awaits `pending`.
    pending
      .finally(() => {
        pending = null;
      })
      .catch(() => {});
  }
  return pending;
}

/**
 * True if a device key already exists on this install, without generating
 * one. Read-only — never use this to decide whether to call
 * getOrCreateDeviceKey; it's for callers that just need to know the current
 * state (e.g. a settings screen).
 */
export async function hasDeviceKey(): Promise<boolean> {
  if (cached) return true;
  return (await SecureStore.getItemAsync(DEVICE_KEY_STORAGE_KEY)) !== null;
}
