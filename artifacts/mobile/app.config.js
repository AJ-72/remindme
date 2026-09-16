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
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
});
