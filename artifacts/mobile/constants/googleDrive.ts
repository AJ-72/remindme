// Google OAuth client IDs for Drive backup (B3). Public identifiers, not
// secrets - they ship in every APK either way. See
// docs/setup/google-drive-oauth.md for where they come from.
//
// The WEB client ID is what the sign-in library needs even on Android (it is
// the audience Google validates tokens against). Android clients are matched
// by package + signing SHA-1 on Google's side and need no value here.
//
// No iOS client exists yet (no iOS build pipeline). When one does, set
// GOOGLE_IOS_CLIENT_ID and add the library's config plugin with its
// `iosUrlScheme` (the reversed client ID) to app.json.
//
// EXPO_PUBLIC_-prefixed env vars, if set at build time, override these.

export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  "170295389343-rju31jfqspm9urv1sdogk2mn5nb00s7r.apps.googleusercontent.com";

export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";

/** The one scope: this app's hidden per-app folder. Non-sensitive per Google. */
export const DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

export const DRIVE_BACKUP_FILENAME = "reminders-backup.json";
