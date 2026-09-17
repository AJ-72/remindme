import {
  SENTRY_DSN,
  SENTRY_TRACES_SAMPLE_RATE,
  type AnalyticsProps,
} from "@/constants/analytics";
import { isTelemetryEnabledSync } from "@/services/telemetryConsent";

/**
 * Crash and error reporting (Sentry), wrapped on the same terms as
 * AnalyticsService: never throws, no-op without a DSN, consent checked at the
 * moment of the call.
 *
 * Why Sentry and not Crashlytics, given a Firebase project already exists for
 * push: this is a React Native app, so most of its defects are JavaScript
 * defects, and Crashlytics reports a JS error as a minified, effectively
 * unreadable frame. Sentry's Expo integration uploads the source maps with
 * each EAS build, so a crash report names the real file and line. See
 * docs/analytics-and-crash-metrics.md.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Sentry: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Sentry = require("@sentry/react-native");
} catch {
  Sentry = null;
}

let started = false;

/**
 * Strips anything that could carry the user's own words or contacts before a
 * report leaves the device.
 *
 * Reminder titles and descriptions are the sensitive payload in this app, and
 * the realistic way they escape is not a deliberate `captureMessage` — it is
 * an exception message that interpolated one, or a breadcrumb from a network
 * call. So: request bodies are dropped wholesale, and any string field is
 * refused if it holds Malayalam script (only user content is Malayalam here —
 * every string this app's own code produces is English) or something shaped
 * like a phone number.
 */
const PHONE_LIKE = /\+?\d[\d\s\-().]{7,}\d/;
const MALAYALAM = /[ഀ-ൿ]/;

function looksLikeUserContent(value: string): boolean {
  return MALAYALAM.test(value) || PHONE_LIKE.test(value);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scrubEvent(event: any): any {
  if (!event || typeof event !== "object") return event;

  // A crash report never needs the user's identity beyond the anonymous
  // install id Sentry assigns itself.
  delete event.user;
  if (event.request) delete event.request.data;

  const redactStrings = (node: unknown): unknown => {
    if (typeof node === "string") {
      return looksLikeUserContent(node) ? "[redacted]" : node;
    }
    if (Array.isArray(node)) return node.map(redactStrings);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = redactStrings(v);
      }
      return out;
    }
    return node;
  };

  if (typeof event.message === "string") {
    event.message = redactStrings(event.message);
  }
  if (event.extra) event.extra = redactStrings(event.extra);
  if (event.breadcrumbs) event.breadcrumbs = redactStrings(event.breadcrumbs);
  if (event.exception?.values) {
    for (const value of event.exception.values) {
      if (typeof value?.value === "string") {
        value.value = redactStrings(value.value);
      }
    }
  }
  return event;
}

export function initCrashReporting(): void {
  if (started) return;
  started = true;
  if (!SENTRY_DSN || !Sentry) return;

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: Number.isFinite(SENTRY_TRACES_SAMPLE_RATE)
        ? SENTRY_TRACES_SAMPLE_RATE
        : 0,
      // Session replay and screenshots would photograph the user's own
      // reminders. Off, and not a setting.
      attachScreenshot: false,
      attachViewHierarchy: false,
      sendDefaultPii: false,
      // The last gate before anything is sent. It returns null — dropping the
      // report entirely — when the user has opted out, which covers reports
      // captured by Sentry's own global handlers rather than through this
      // module's functions.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      beforeSend: (event: any) =>
        isTelemetryEnabledSync() ? scrubEvent(event) : null,
    });
  } catch {}
}

/**
 * Reports an error the app caught and handled.
 *
 * This is the more valuable half of crash reporting for this app. A hard crash
 * is loud and users report it; a swallowed failure — a notification that never
 * scheduled, a transcription that silently returned nothing — is invisible
 * without this, and those are exactly the defects that quietly lose users.
 */
export function captureHandledError(
  error: unknown,
  context?: AnalyticsProps,
): void {
  if (!Sentry || !isTelemetryEnabledSync()) return;
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {}
}

/** Leaves a trail of what happened before a crash. Kept short and English. */
export function addBreadcrumb(message: string, data?: AnalyticsProps): void {
  if (!Sentry || !isTelemetryEnabledSync()) return;
  try {
    Sentry.addBreadcrumb({ message, data, level: "info" });
  } catch {}
}

/**
 * Tags every later report with the app's release channel and this install's
 * dictation language — the two facts that most often explain why a defect
 * shows up for some users and not others.
 */
export function setCrashContext(props: AnalyticsProps): void {
  if (!Sentry || !isTelemetryEnabledSync()) return;
  try {
    for (const [key, value] of Object.entries(props)) {
      Sentry.setTag(key, value === null ? "null" : String(value));
    }
  } catch {}
}

/** Test seam. */
export function __resetCrashReportingForTests(): void {
  started = false;
}
