/**
 * Thin override on top of app.json, for the one value that can't live in
 * static JSON: which google-services.json to use.
 *
 * Locally, app.json's own path ("./google-services.json") is correct — the
 * real file sits there, gitignored (see .gitignore and CLAUDE.md).
 *
 * On EAS Build, that path is never checked into git, so the builder has
 * nothing at it. GOOGLE_SERVICES_JSON is an EAS "file" environment variable
 * (Expo dashboard -> Environment variables) holding the real file; EAS
 * resolves it to a real path on the build runner and injects that into
 * process.env at build time, which is what this override picks up.
 */
/**
 * Sentry's Expo plugin is added only when the build actually has Sentry
 * credentials.
 *
 * Its whole job is uploading source maps at build time, which needs
 * SENTRY_ORG, SENTRY_PROJECT and a SENTRY_AUTH_TOKEN (an EAS secret, never
 * committed - it is a write credential for your Sentry org, unlike the DSN).
 * Added unconditionally it would fail every build that lacks them, including
 * a contributor's local `expo run:android`. Absent, the app still reports
 * crashes; the stack traces are just minified.
 */
const sentryPlugin = () =>
  process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? [
        [
          "@sentry/react-native/expo",
          {
            organization: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
          },
        ],
      ]
    : [];

module.exports = ({ config }) => ({
  ...config,
  plugins: [...(config.plugins ?? []), ...sentryPlugin()],
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
});
