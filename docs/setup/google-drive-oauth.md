# Google Drive OAuth Setup (for `@react-native-google-signin/google-signin`)

Sets up Google sign-in + Drive backup (`drive.appdata` scope — hidden per-app folder,
classified **non-sensitive** by Google, so no verification review needed to publish).
Uses the free/original Google Sign-In API, not the paid Universal/One Tap flow.

App identifiers (from `artifacts/mobile/app.json`):
- Android package: `com.curios.remindme`
- iOS bundle ID: `com.curios.remindme`
- Expo owner/slug: `anandj82` / `mobile`

## 1. Pick the Google Cloud project

An existing Firebase project, `reminders-app-3de05`, already exists for FCM. Every
Firebase project **is** a Google Cloud project — reuse it so both live in one place.
This is optional; a separate project works too, just repeat these steps there.

1. Go to https://console.cloud.google.com/
2. Top project picker → select **reminders-app-3de05** (search by name if not shown).
3. Left menu → **APIs & Services → Library**, search "Google Drive API", click it,
   click **Enable**.

## 2. OAuth consent screen (Google Auth Platform)

Google renamed "OAuth consent screen" to **Google Auth Platform**, now split into
tabs: **Branding**, **Audience**, **Data Access**, **Clients**.

1. Left menu → **APIs & Services → OAuth consent screen** (lands on Google Auth
   Platform; first-time setup may show a short wizard first).
2. **Branding** tab:
   - App name: e.g. "Reminders" (or the app's user-facing name).
   - User support email: your email.
   - App logo: optional.
   - Developer contact email: your email.
3. **Audience** tab:
   - User type: **External** (unless using a Google Workspace org — not the case here).
   - **Publishing status: Testing** to start. In Testing, only explicitly added
     "test users" (by Google account email, up to **100**) can sign in — anyone
     else gets a "not verified" block. Add your own and any teammates'/testers'
     Google accounts here under **Test users**.
   - To go to **Production**: click **Publish app**. Because the only scope
     requested (`drive.appdata`) is **non-sensitive**, Google does not require a
     verification review to publish — the app just moves out of the 100-user cap
     and the "unverified app" warning screen goes away for all users. (Sensitive/
     restricted scopes would require review; this one doesn't.)
4. **Data Access** tab:
   - Click **Add or remove scopes**.
   - Filter/search for `drive.appdata` — select the scope
     `https://www.googleapis.com/auth/drive.appdata` ("See, create, and delete its
     own configuration data in your Google Drive"). It's tagged non-sensitive.
   - Save.

## 3. Get SHA-1 fingerprints (Android)

Android OAuth clients are matched by **package name + SHA-1**, so you need one
Android OAuth client per signing key that will run the app.

**Already known (2026-09-25):** the EAS-built APK installed on the test phone
is signed with SHA-1 `88:84:88:EB:DC:E3:A3:2A:21:67:02:09:80:B7:27:D8:1D:60:EC:59`
(read with `apksigner verify --print-certs` from the pulled APK; its blank DN
matches an EAS-generated keystore, unlike the debug key's `CN=Android Debug`).
Still confirm with the command below if `production` uses a different keystore.

**EAS-managed keystore** (used by `preview`/`production` build profiles):
```powershell
cd C:\workspace\remindme\artifacts\mobile
npx eas-cli credentials -p android
```
Pick the relevant profile (e.g. `preview`, then separately `production` if they use
different keystores) → **Keystore: Manage everything needed to build your project**
→ it prints **SHA1 Fingerprint** in the output. Repeat per profile/keystore if
`preview` and `production` differ.

**Local debug keystore** (used by `npx expo run:android`):
```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -list -v `
  -keystore "C:\workspace\remindme\artifacts\mobile\android\app\debug.keystore" `
  -alias androiddebugkey -storepass android -keypass android
```
(If that path doesn't exist, try `%USERPROFILE%\.android\debug.keystore` with the
same alias/passwords.) Look for the line starting `SHA1:`.

**If ever distributed via Google Play with Play App Signing enabled**, Play
re-signs the app with its own key — that key's SHA-1 also needs an OAuth client,
or release builds installed from the Play Store will fail. Get it from:
Play Console → your app → **Release → Setup → App signing** → **App signing key
certificate → SHA-1**.

## 4. Create OAuth clients

Google Cloud Console → **APIs & Services → Credentials** → **+ Create Credentials**
→ **OAuth client ID**, repeated for each of the following:

1. **Android** — Application type: Android.
   - Package name: `com.curios.remindme`
   - SHA-1 certificate fingerprint: one from step 3.
   - Create **one Android client per SHA-1** (EAS preview, EAS production, debug
     keystore, and Play signing key if applicable) — all under the same package name.
2. **iOS** — Application type: iOS.
   - Bundle ID: `com.curios.remindme`
   - Only one needed (iOS doesn't use SHA-1 matching).
3. **Web application** — Application type: Web application.
   - No redirect URIs needed for this library's use case; leave defaults.
   - This client's **Client ID** is the `webClientId` the library needs even for
     Android sign-in (Google's server-side ID token audience) — see library docs:
     https://react-native-google-signin.github.io/docs/setting-up/get-config-file

## 5. Values to hand back to the developer

These are **not secrets** — they're public identifiers safe to put in app config /
source (unlike API keys with unrestricted scope, or client secrets, which are not
used in this mobile-only flow):

- **Web client ID** (from the Web application client, step 4.3) → used as
  `webClientId` in `GoogleSignin.configure()`.
- **iOS client ID** (from the iOS client, step 4.2) → used as `iosClientId`.
- **iOS URL scheme / "reversed client ID"** — shown on the iOS client's detail
  page as `REVERSED_CLIENT_ID` (looks like
  `com.googleusercontent.apps.<numbers>-<hash>`) → used as `iosUrlScheme` in the
  Expo config plugin (`@react-native-google-signin/google-signin`'s plugin config
  in `app.json`/`app.config.js`), so iOS can complete the sign-in redirect.

## 6. Common failure: `DEVELOPER_ERROR` (code 10)

On Android, sign-in failing immediately with `DEVELOPER_ERROR` (status code 10)
almost always means:
- The SHA-1 used to sign the **running build** doesn't match any Android OAuth
  client's registered fingerprint (e.g. testing a `preview` EAS build but only
  the debug keystore's SHA-1 was registered), or
- The package name on the OAuth client doesn't exactly match `com.curios.remindme`, or
- `webClientId` in `GoogleSignin.configure()` is wrong, missing, or copied from
  the Android/iOS client instead of the **Web application** client.

Fix by re-checking which keystore actually signed the installed build (`eas
credentials` or `keytool` per step 3), confirming that exact SHA-1 has an Android
OAuth client, and confirming `webClientId` is the Web client's ID.

## Final checklist

- [ ] Google Drive API enabled on the chosen project
- [ ] OAuth consent screen: External, Branding filled in, `drive.appdata` scope added
- [ ] Test users added (Testing) or app published (Production) as needed
- [ ] SHA-1 collected for: EAS preview, EAS production, local debug keystore (+ Play signing key if used)
- [ ] One Android OAuth client per SHA-1, package `com.curios.remindme`
- [ ] One iOS OAuth client, bundle ID `com.curios.remindme`
- [ ] One Web application OAuth client
- [ ] Sent back: web client ID, iOS client ID, iOS reversed client ID (URL scheme)

## Sources

- https://react-native-google-signin.github.io/docs/setting-up/get-config-file
- https://support.google.com/cloud/answer/15549049 (Manage OAuth App Branding)
- https://support.google.com/cloud/answer/15549945 (Manage App Audience)
- https://support.google.com/cloud/answer/15544987 (Get started with Google Auth Platform)
- https://support.google.com/cloud/answer/13463073 (OAuth app verification requirements / scope sensitivity)
- https://developers.google.com/workspace/guides/configure-oauth-consent
