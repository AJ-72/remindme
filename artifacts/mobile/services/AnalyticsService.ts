import {
  POSTHOG_API_KEY,
  POSTHOG_HOST,
  type AnalyticsEvent,
  type AnalyticsProps,
} from "@/constants/analytics";
import { getOrCreateDeviceKey } from "@/services/DeviceIdentityService";
import { isTelemetryEnabledSync, setTelemetryEnabled } from "@/services/telemetryConsent";

/**
 * Product analytics (PostHog), wrapped so that no screen ever imports the SDK.
 *
 * Three properties this wrapper guarantees, which is the whole reason it
 * exists rather than calling posthog directly from call sites:
 *
 *  1. It never throws. A telemetry failure must not be able to break a
 *     reminder being saved. Every path here swallows its own errors.
 *  2. It is a no-op without a key. With EXPO_PUBLIC_POSTHOG_KEY unset — local
 *     dev and the whole Jest suite — nothing is constructed and no network
 *     call is made.
 *  3. It honours the opt-out synchronously, at the moment of the call, so
 *     turning the switch off in Settings stops the very next event.
 *
 * The SDK is loaded through a dynamic require in a try/catch, matching how
 * ReminderService loads expo-notifications: this module is imported by tests
 * and by any non-native environment, where a hard ESM import of a native
 * package fails at module-evaluation time and takes the importer down with it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PostHogCtor: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  PostHogCtor = require("posthog-react-native").PostHog;
} catch {
  PostHogCtor = null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any = null;
let initStarted = false;

/** True once a real client exists and consent still stands. */
function live(): boolean {
  return client !== null && isTelemetryEnabledSync();
}

/**
 * Builds the PostHog client and identifies this install.
 *
 * Idempotent, and safe to call before consent has been read back from storage
 * — `track` re-checks consent on every single event, so an early init cannot
 * leak anything once the user's real answer lands.
 *
 * The distinct id is the device identity key from DeviceIdentityService: a
 * random uuid generated on-device, already persisted, tied to no phone number
 * and no account. It gives per-user retention and funnels (the questions worth
 * asking) without the app ever sending an identifier it did not invent itself.
 */
export async function initAnalytics(): Promise<void> {
  if (initStarted) return;
  initStarted = true;
  if (!POSTHOG_API_KEY || !PostHogCtor) return;

  try {
    const instance = new PostHogCtor(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      // Screens are tracked explicitly via trackScreen(): expo-router's
      // autocapture would report file-based route names, which change when a
      // file is renamed and silently break every historical funnel built on
      // them.
      captureAppLifecycleEvents: true,
    });
    const deviceKey = await getOrCreateDeviceKey();
    instance.identify(deviceKey);
    client = instance;
  } catch {
    client = null;
  }
}

export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!live()) return;
  try {
    client.capture(event, props ?? {});
  } catch {}
}

/**
 * Records a screen view under a STABLE name chosen by the caller.
 *
 * Deliberately not the route path. See initAnalytics above.
 */
export function trackScreen(name: string, props?: AnalyticsProps): void {
  if (!live()) return;
  try {
    client.screen(name, props ?? {});
  } catch {}
}

/**
 * Sets a person property — a fact that describes the install rather than
 * something that just happened (dictation language, reminder count bucket).
 *
 * Use sparingly. A person property is overwritten, so it answers "how are
 * users configured today", never "what changed and when"; anything you might
 * want a trend for belongs in an event instead.
 */
export function setPersonProperties(props: AnalyticsProps): void {
  if (!live()) return;
  try {
    client.capture("$set", { $set: props });
  } catch {}
}

/**
 * Applies an opt-out/opt-in from Settings.
 *
 * Opting out does more than flip the flag: it tells the SDK to stop, which
 * drops whatever is sitting in the local queue unsent. Without that, events
 * captured seconds before the switch was flipped would still be delivered,
 * which is not what the user just asked for.
 */
export async function applyTelemetryChoice(enabled: boolean): Promise<void> {
  await setTelemetryEnabled(enabled);
  try {
    if (!client) return;
    if (enabled) client.optIn?.();
    else client.optOut?.();
  } catch {}
}

/** Best-effort flush, for the moment before the app is backgrounded. */
export async function flushAnalytics(): Promise<void> {
  if (!live()) return;
  try {
    await client.flush();
  } catch {}
}

/** Test seam: drops the client and lets initAnalytics run again. */
export function __resetAnalyticsForTests(): void {
  client = null;
  initStarted = false;
}

/** Test seam: installs a fake client without touching the real SDK. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function __setAnalyticsClientForTests(fake: any): void {
  client = fake;
  initStarted = true;
}
