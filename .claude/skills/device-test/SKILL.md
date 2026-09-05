---
name: device-test
description: Build, deploy, and run a Maestro-driven device test session for the remindme mobile app on a connected Android device. Use when asked to run device tests, verify a change on-device, or execute items from device-tests/.
---

# Device test

Runs the standard local Android device-testing loop for this repo: build/install
(if needed) → device/Metro preflight → Maestro flows → report.

## Steps

1. **Check device state first.** `adb devices` — if a device shows
   `unauthorized`/`offline`, stop and tell the user to re-approve the prompt on
   the device; don't retry blindly.
2. **Build + install, if the APK isn't already current.** From the repo root:
   `.\build-and-install-android.ps1 -Device <serial>` (add `-Variant release`
   for a build that doesn't need Metro). Skip this step if the user says the
   app is already installed and current.
3. **Preflight adb reverse + Metro** (debug variant only): `.\scripts\dev-device.ps1 -Device <serial>`
   handles the adb-reverse-drops-on-reconnect gotcha and reports if the Metro
   port is already held by something stale. Run this in the background if you
   still need the foreground for Maestro commands.
4. **Run the relevant Maestro flow(s).** See CLAUDE.md's "End-to-end tests
   (Maestro)" section for the full convention (testID selectors, token-efficient
   flows, the Unicode/`inputText` limitation and ADBKeyboard workaround). Run
   flows individually: `maestro test Maestro/<file>.yaml`. Don't reach for
   `maestro studio` or a hierarchy dump unless a flow is actually failing.
5. **Report a results table**: `test id | pass/fail/skipped | evidence`, where
   evidence is the actual Maestro output or a logcat/screenshot excerpt — not a
   restated assertion. Cross-reference `device-tests/` (the canonical list of
   what's proven on hardware vs. only green in Jest) and update the relevant
   file there per CLAUDE.md's Pointers section. Never mark an item `PASS`
   yourself if you didn't personally observe it pass this session.
