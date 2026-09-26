/**
 * Telemetry configuration and the app's complete event vocabulary.
 *
 * Two vendors, deliberately split by what they are good at:
 *   - PostHog  -> product analytics (what people do, and whether they come back)
 *   - Sentry   -> crashes and handled errors, with readable JS stack traces
 *
 * Both are configured through EXPO_PUBLIC_ env vars rather than hardcoded
 * literals. Unlike constants/supabase.ts — where the anon key is public by
 * design and RLS is the real boundary — a PostHog project key and a Sentry
 * DSN are write endpoints with no authorization behind them: anyone holding
 * one can pollute the dataset. They are not secrets worth guarding hard (they
 * ship inside the APK either way), but there is no reason to commit them, and
 * keeping them in env vars is what lets a debug build point at a throwaway
 * project instead of production data.
 *
 * With neither var set, every telemetry call in this app is a no-op. That is
 * the intended state for local development and for the test suite: nothing is
 * queued, nothing is sent, and no network call happens.
 *
 * See docs/analytics-and-crash-metrics.md for what each event is for and which
 * question it answers.
 */

export const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "";

/** EU cloud is `https://eu.i.posthog.com`. Default is PostHog US cloud. */
export const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";

/**
 * Fraction of sessions sampled for performance tracing, 0..1.
 *
 * Kept low on purpose: traces are the fastest way to burn Sentry's free
 * quota, and this app's performance questions (does the list render, does a
 * notification fire on time) are not the ones tracing answers well.
 */
export const SENTRY_TRACES_SAMPLE_RATE = Number(
  process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.05",
);

/**
 * Every event this app may send.
 *
 * A closed list, not free-form strings at call sites. Two reasons, both
 * learned from dashboards that rotted: a typo'd event name silently becomes a
 * second, near-empty series that nobody notices for months, and an event whose
 * name nobody can justify is an event nobody will ever query.
 *
 * Naming: `object_verb_past_tense`, lower snake case. Screens are NOT events —
 * PostHog's own `$screen` handles those, see AnalyticsService.trackScreen.
 *
 * Every name here has at least one real emitter, and `analytics.test.ts`
 * fails the build if one stops having one. An event in a catalogue with no
 * emitter renders a chart that reads zero forever and gets believed, which is
 * worse than no chart at all.
 */
export const EVENTS = {
  // --- Core loop: does the app do its one job? ---
  REMINDER_CREATED: "reminder_created",
  REMINDER_COMPLETED: "reminder_completed",
  REMINDER_SNOOZED: "reminder_snoozed",
  REMINDER_DELETED: "reminder_deleted",
  REMINDER_EDITED: "reminder_edited",

  // --- Did the alert actually land, and did it work? ---
  NOTIFICATION_OPENED: "notification_opened",
  PERMISSION_RESULT: "permission_result",

  // --- Input methods: which entry path earns its complexity? ---
  DICTATION_STARTED: "dictation_started",
  DICTATION_COMPLETED: "dictation_completed",
  DICTATION_FAILED: "dictation_failed",
  NL_PARSE_RESULT: "nl_parse_result",
  SHARE_INTENT_RECEIVED: "share_intent_received",

  // --- Tier 2: remind someone else ---
  INVITATION_SENT: "invitation_sent",
  INVITATION_RESPONDED: "invitation_responded",
  NUMBER_REGISTERED: "number_registered",

  // --- Everything else worth a decision ---
  INSIGHTS_VIEWED: "insights_viewed",
  BACKUP_EXPORTED: "backup_exported",
  BACKUP_IMPORTED: "backup_imported",
  // B3 Drive backup. Counts and error codes only - never the account email
  // or the registered number that the backup file carries.
  DRIVE_SIGNIN_RESULT: "drive_signin_result",
  DRIVE_BACKUP_RESULT: "drive_backup_result",
  DRIVE_RESTORE_RESULT: "drive_restore_result",
  SETTING_CHANGED: "setting_changed",
  TELEMETRY_OPT_OUT: "telemetry_opt_out",
} as const;

export type AnalyticsEvent = (typeof EVENTS)[keyof typeof EVENTS];

/**
 * Property values are restricted to primitives on purpose.
 *
 * The rule this type enforces at compile time is the one that matters most
 * here: no reminder title, no description, no phone number, no contact name
 * ever becomes a property. Those are the user's own content, and none of the
 * questions in docs/analytics-and-crash-metrics.md need them — "a reminder was
 * created, by voice, for 6 hours out" answers the product question without
 * shipping what the reminder says. An object-valued property is the usual way
 * that discipline fails (somebody passes the whole `reminder`), so objects are
 * simply not assignable.
 */
export type AnalyticsProps = Record<string, string | number | boolean | null>;
