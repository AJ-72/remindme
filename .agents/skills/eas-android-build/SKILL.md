---
name: eas-android-build
description: Build and deploy the RemindMe Android APK via Expo EAS. Use when the user asks to build, deploy, or ship the Android app, run an EAS build, or create an APK for real device testing or production.
---

# EAS Android Build

Builds a real Android APK using Expo Application Services (EAS) cloud build infrastructure. All builds run on EAS servers — no local Android SDK required.

## Prerequisites

`EXPO_TOKEN` is already configured as a Replit Secret and is available automatically.

The app is already linked to EAS:
- Project ID: `aa144058-8bff-44a8-9b12-3a9bd486cf07`
- Owner: `anandj82`
- Package: `com.curios.remindme`
- Config: `artifacts/mobile/eas.json`

## Build Profiles

| Profile | Command | Use for |
|---------|---------|---------|
| `preview` | `build:android` | Sideloaded APK — fastest, share via QR |
| `production` | `build:android:prod` | Store-ready APK |
| `development` | `build:android:dev` | Dev client — includes Expo dev menu |

## Running a Build

### Via npm scripts (from repo root)

```bash
pnpm --filter @workspace/mobile run build:android       # preview APK
pnpm --filter @workspace/mobile run build:android:prod  # production APK
pnpm --filter @workspace/mobile run build:android:dev   # dev build
```

### Via the shell script directly

```bash
cd artifacts/mobile
bash scripts/build-android.sh           # preview (default)
bash scripts/build-android.sh prod      # production
bash scripts/build-android.sh dev       # development
```

### Via EAS CLI directly

```bash
cd artifacts/mobile
npx eas-cli build --platform android --profile preview --non-interactive
```

## After Submitting

- EAS prints a build URL immediately. Track progress there.
- Build takes ~10–15 minutes on EAS free tier.
- When done, download the APK from the build page or scan the QR code to install directly on a device.

## Updating eas.json

`artifacts/mobile/eas.json` has three profiles, all set to `buildType: "apk"`. To switch to AAB (Play Store format) for a profile, change `"buildType": "apk"` to `"buildType": "app-bundle"` in that profile.

## Key Files

- `artifacts/mobile/eas.json` — build profiles
- `artifacts/mobile/app.json` — app config, plugins, package name, version
- `artifacts/mobile/scripts/build-android.sh` — wrapper script with validation
- `artifacts/mobile/package.json` — `build:android*` npm scripts

## Notes

- `eas login` via browser doesn't work in Replit (redirect to localhost fails). Always use `EXPO_TOKEN` instead.
- Native features (share intent, alarm sound, exact alarm permission) require a real EAS build — they don't work in Expo Go.
- The `development` profile builds a custom dev client. Install it on device first, then use `pnpm --filter @workspace/mobile run dev` to connect.
