import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The single opt-out switch behind both AnalyticsService and
 * CrashReportingService.
 *
 * It lives in its own module rather than in ReminderService with the other
 * settings for one structural reason: ReminderService is instrumented (it
 * emits events), so if the consent flag lived there, the analytics module and
 * the reminder module would import each other. A three-line module breaks the
 * cycle and costs nothing.
 *
 * Default ON, with an off switch in Settings. That is a real decision, not an
 * oversight: opt-in telemetry on a small app collects so little that the
 * dashboards mislead — a 5% sample of a 1,000-user app cannot tell a broken
 * release from a quiet week. The cost of defaulting on is paid down by what is
 * NOT collected: see constants/analytics.ts (AnalyticsProps) and the scrubbing
 * in CrashReportingService.
 *
 * The cached copy exists so that `track()` stays synchronous at call sites.
 * Until initTelemetryConsent() resolves on startup, the cache holds the
 * default (true) — a handful of events at launch are therefore sent before a
 * previously-opted-out user's choice is read back. refreshTelemetryConsent()
 * is called first thing in the app's own init path to keep that window as
 * short as it can be, and an opt-out additionally wipes the vendor queues, so
 * nothing from that window survives. Accepted, and the reason the window is
 * documented rather than hidden.
 */

export const TELEMETRY_ENABLED_KEY = "@telemetry_enabled_v1";

let cached = true;

/** Synchronous read of the last known consent value. Never hits storage. */
export function isTelemetryEnabledSync(): boolean {
  return cached;
}

export async function getTelemetryEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(TELEMETRY_ENABLED_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === "boolean") {
        cached = parsed;
        return parsed;
      }
    }
  } catch {}
  cached = true;
  return true;
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  cached = enabled;
  await AsyncStorage.setItem(TELEMETRY_ENABLED_KEY, JSON.stringify(enabled));
}

/** Loads the stored value into the synchronous cache. Call once at startup. */
export async function refreshTelemetryConsent(): Promise<boolean> {
  return getTelemetryEnabled();
}

/** Test seam. Resets the cache to its default, as on a fresh install. */
export function __resetTelemetryConsentCache(): void {
  cached = true;
}
