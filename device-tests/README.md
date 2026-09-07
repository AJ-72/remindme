# Device Test Checklist — index

Everything that is **written and green in Jest but unproven on hardware**.

Jest runs in jsdom: no viewport, no keyboard, no system chrome, no
notification tray, no OEM power manager. Anything whose failure mode is
"off-screen", "behind something", "never fired", or "wrong colour against a
real background" passes green forever and can only be caught here.

`backlog.md` links into this folder rather than keeping its own copy of any
of this. **Add a feature's device-only checks here in the same change that
ships it.**

## Files in this folder

| File | Covers | IDs |
| --- | --- | --- |
| [cross-cutting.md](cross-cutting.md) | Alarm delivery mechanics — the OEM battery/Doze/AlarmManager behavior everything else depends on | D1, D7, D19, D20, D22, D25, D26 |
| [notifications.md](notifications.md) | Notification actions, channels, dedupe | D2, D3, D4, D15, D16 |
| [feature-e2e.md](feature-e2e.md) | Full user-facing flows | D6, D9, D10, D11, D12, D13 |
| [visual-layout.md](visual-layout.md) | Theming, screen layout | D8, D14 |
| [data-safety.md](data-safety.md) | Storage integrity, backup, re-arm-on-launch/un-complete | D17, D18, D21, D23 |
| [malayalam-parsing.md](malayalam-parsing.md) | On-device Malayalam input/parsing (numerals, ambiguous readings, AM/PM) | D24, + 2 unnumbered checklists |
| [remind-others.md](remind-others.md) | M4 Tier 2, app-to-app delivery — all `BLOCKED` on a backend that does not exist yet | D27-D37 |

## Status legend

| Mark | Meaning |
| --- | --- |
| `PENDING` | Not yet tested on a device. |
| `PASS` | Verified working on hardware. Date + device recorded. |
| `FAIL` | Tested and broken. Link the bug or fix commit. |
| `BLOCKED` | Cannot be tested yet — needs a native build, a fresh install, etc. |
| `PARTIAL` | Some sub-checks pass, others outstanding. Say which. |
| `INFO` | Not a pass/fail check — a measurement or comparison recorded because it settles (or corrects) an assumption others depend on. |

**Automatability:**

| Mark | Meaning |
| --- | --- |
| `AUTO` | Fully scriptable. Driving *and* the pass/fail assertion are machine-readable. |
| `SEMI` | Driving and setup scriptable; the final judgement needs a human sense (sight, sound, touch) or a second party. |
| `MANUAL` | Needs a human. No machine-readable oracle exists. |

## All scenarios at a glance

Last updated after the automated run of **2026-09-04** (OnePlus CPH2569,
local debug build via `expo run:android`) unless noted. **9 `AUTO` · 24
`SEMI` · 2 `MANUAL`.**

The 11 `BLOCKED` Tier 2 rows at the bottom are not runnable at all yet — no
Supabase project, no Edge Functions. **Six of them need two handsets with two
real phone numbers**, which is a setup cost worth planning for rather than
discovering.

| ID | Scenario | Status | Last run | Auto? | Blocks backlog | File |
| --- | --- | --- | --- | --- | --- | --- |
| D26 | Exact timing for non-alarm reminders | `PASS` | 2026-09-06 | SEMI | — | [cross-cutting](cross-cutting.md#d26) |
| D25 | How Google Tasks actually stays punctual (comparison) | `INFO` | 2026-09-05 | AUTO | — | [cross-cutting](cross-cutting.md#d25) |
| D19 | `setAlarmClock()` exact delivery | `PASS` | 2026-08-24 | AUTO | — | [cross-cutting](cross-cutting.md#d19) |
| D20 | EAS re-verify after setAlarmClock | `PASS` | 2026-08-29 | SEMI | — | [cross-cutting](cross-cutting.md#d20) |
| D7 | OEM battery-killer survival | `PARTIAL` | 2026-08-24 | SEMI | — | [cross-cutting](cross-cutting.md#d7) |
| D22 | Alarm copy + status-bar explainer | `PARTIAL` | 2026-08-29 | SEMI | — | [cross-cutting](cross-cutting.md#d22) |
| D1 | Android Auto Backup restores reminders | `PENDING` | — | AUTO | **B3** Google Drive sync | [cross-cutting](cross-cutting.md#d1) |
| D2 | Vibration setting, 4 combinations | `PARTIAL` | 2026-08-29 | SEMI | — | [notifications](notifications.md#d2) |
| D3 | Mark Done / Snooze, app fully closed | `PENDING` | 2026-08-29 (inconclusive) | SEMI | — | [notifications](notifications.md#d3) |
| D4 | Duplicate notifications | `PARTIAL` | 2026-09-04 | AUTO (partial) | — | [notifications](notifications.md#d4) |
| D15 | Body tap, then Mark Done | `PENDING` | — | SEMI | — | [notifications](notifications.md#d15) |
| D16 | Personalized snooze re-alert | `PARTIAL` | 2026-09-04 | AUTO (partial) | — | [notifications](notifications.md#d16) |
| D12 | Vague-task hint | `PASS` | 2026-09-04 | AUTO | — | [feature-e2e](feature-e2e.md#d12) |
| D9 | Remind-someone-else Tier 1 | `PARTIAL` (core loop `PASS`) | 2026-08-30 | SEMI | **B8** M4 Tier 1 sign-off | [feature-e2e](feature-e2e.md#d9) |
| D10 | Name capture and personalization | `PARTIAL` | 2026-08-24 | SEMI | — | [feature-e2e](feature-e2e.md#d10) |
| D6 | Malayalam dictation end to end | `PENDING` | — | MANUAL | — | [feature-e2e](feature-e2e.md#d6) |
| D11 | Quiet hours incl. midnight wrap | `PARTIAL` | 2026-09-04 | AUTO (partial) | — | [feature-e2e](feature-e2e.md#d11) |
| D13 | "Why tasks slip" explainer | `PENDING` | — | SEMI | — | [feature-e2e](feature-e2e.md#d13) |
| D8 | Dark mode, visually | `PASS` | 2026-08-24 | SEMI | — | [visual-layout](visual-layout.md#d8) |
| D14 | Seven 2026-08-24 device fixes | `PARTIAL` | 2026-08-29 | SEMI | — | [visual-layout](visual-layout.md#d14) |
| D17 | Corrupt-store quarantine | `PARTIAL` | 2026-09-04 | AUTO (partial) | — | [data-safety](data-safety.md#d17) |
| D18 | Backup carries the new fields | `PARTIAL` | 2026-09-04 | AUTO (partial) | — | [data-safety](data-safety.md#d18) |
| D21 | Un-completing re-arms the reminder | `PASS` | 2026-08-29 | AUTO | — | [data-safety](data-safety.md#d21) |
| D23 | Pre-existing reminders re-arm on launch after update | `PASS` | 2026-08-30 | AUTO | — | [data-safety](data-safety.md#d23) |
| D24 | 12-hour AM/PM time display | `BLOCKED` | 2026-09-03 (attempted) | AUTO | — | [malayalam-parsing](malayalam-parsing.md#d24) |
| — | Malayalam numeral clock times (dot separator + am/pm) | `PENDING` | — | MANUAL | — | [malayalam-parsing](malayalam-parsing.md#numeral-clock-times) |
| — | Ambiguous-numeral confirmation sheet | `PENDING` | — | SEMI | — | [malayalam-parsing](malayalam-parsing.md#ambiguous-numeral-sheet) |
| D29 | Tier 2: accepted reminder fires locally, survives reboot | `BLOCKED` | — | SEMI | **M4-T2** | [remind-others](remind-others.md#d29) |
| D34 | Tier 2: verification ladder, link rung and OTP rung | `BLOCKED` | — | SEMI | **M4-T2** | [remind-others](remind-others.md#d34) |
| D35 | Tier 2: invite token single-use, survives link preview | `BLOCKED` | — | SEMI | **M4-T2** | [remind-others](remind-others.md#d35) |
| D28 | Tier 2: invitation arrives with the app killed | `BLOCKED` | — | SEMI | **M4-T2** | [remind-others](remind-others.md#d28) |
| D27 | Tier 2: registration and the discoverability switch | `BLOCKED` | — | SEMI | **M4-T2** | [remind-others](remind-others.md#d27) |
| D30 | Tier 2: block blocks, and unblock re-delivers nothing | `BLOCKED` | — | SEMI | **M4-T2** | [remind-others](remind-others.md#d30) |
| D31 | Tier 2: expiry at the reminder's own time | `BLOCKED` | — | SEMI | **M4-T2** | [remind-others](remind-others.md#d31) |
| D32 | Tier 2: concurrent cancel versus reschedule | `BLOCKED` | — | MANUAL | **M4-T2** | [remind-others](remind-others.md#d32) |
| D33 | Tier 2: Tier 1 fallback for an unreachable recipient | `BLOCKED` | — | SEMI | **M4-T2** | [remind-others](remind-others.md#d33) |
| D36 | Tier 2: rebind on a new phone, and the 45-day cliff | `BLOCKED` | — | SEMI | **M4-T2** | [remind-others](remind-others.md#d36) |
| D37 | Tier 2: cancel while the recipient is offline | `BLOCKED` | — | SEMI | **M4-T2** | [remind-others](remind-others.md#d37) |

**2026-09-04 note:** D4, D11, D16, D17, D18 moved from `PENDING` to
`PARTIAL` — new Maestro flows (`Maestro/d4_*`, `d11_*`, `d16_*`, `d17_*`,
`d18_*`) now cover the UI-driving/setup half of each (creating the
reminder, navigating to the right screen, saving) and run green
repeatably, but none of their real oracle assertions (`dumpsys
alarm`/`dumpsys notification` counts, corrupting the store, reading a
restored backup's JSON fields, the actual midnight-wrap sheet behavior)
ran this session — see each file's Result section for exactly what did and
didn't run. D12 was re-verified green on the current build.

## What blocks what, right now

- **`clearState: true` fails on this device** with `SecurityException: ...
  does not have permission android.permission.CLEAR_APP_USER_DATA` — found
  2026-09-04 while building the new flows above. Every Maestro flow that
  wants a clean install must instead run against accumulated state (the
  reminder list only grows across a session) and use `scrollUntilVisible`
  rather than a fixed scroll count or an unscrolled `assertVisible`, since
  the list is sorted by upcoming time and a freshly saved item is not
  guaranteed to be in the initial viewport. Same applies to `pm clear` run
  directly over adb — same permission error, not Maestro-specific.
- **A plain `tapOn: text: "Home"` is ambiguous** on this device — it can
  match the Android system nav bar's own Home button
  (`resource-id=com.android.systemui:id/home`) instead of the app's Home
  tab, backgrounding the whole app to the launcher. Relaunching the app is
  the reliable way back to its Home tab from a pushed route instead.
- **Needs a new build** (carrying the uncommitted 2026-08-28 fixes): D21, D22 — both since closed by later runs.
- **Needs a debuggable build**: **D17 only.** Build with
  `pnpm --filter @workspace/mobile run build:android:dev` (the `development`
  profile — `developmentClient: true`, so the Gradle *debug* variant, hence
  `android:debuggable="true"` and a working `run-as`). A dev client carries no
  JS bundle: it needs Metro (`npx expo start --dev-client`) or an EAS Update,
  so it is not an unattended artifact and not the shipping one.
  D1 and D18 are runnable on the release build (D1's oracle is on screen,
  D18's export goes through the share sheet) — `run-as` is only a convenience
  there, not a requirement. (2026-09-04: `run-as` confirmed working against
  the local `expo run:android` debug build used this session — pulled
  `databases/RKStorage` successfully, though `sqlite3` itself is absent from
  this device's shell, so a full corrupt/inspect cycle still needs a pull
  round-trip.)
- **Needs a human present**: D2 (buzz), D3/D15 (tray press), D5 (removed — see
  note below), D6, D8, D13, and most of D14.
- **Nothing blocking, just not run yet**: D4, D11, D16's real oracle
  assertions (UI-driving half done, see 2026-09-04 note above).

> **Note:** D5 (large notification icon) was tracked here previously but the
> underlying `withLargeNotificationIcon` plugin work was folded into general
> notification polish and is no longer separately blocking anything; if it
> resurfaces, re-add it with a fresh ID rather than reusing D5.

## Test environment

**Use a mid-range OEM device (Xiaomi / Oppo / Vivo / Realme), not a Pixel or
an emulator.** Aggressive OEM power management has independently caused two
separate problems here already, and it is the cross-cutting risk behind D1,
D4 and D7.

Package: `com.curios.remindme` · adb:
`C:\Users\anand\AppData\Local\Android\Sdk\platform-tools\adb.exe`

Some items need a **native build** (not OTA): anything touching a new native
module or a config plugin. Marked per item.

**A locally-built APK is NOT equivalent to an EAS build — do not accept
results from one as results for the other.** `artifacts/mobile/android/` is
prebuild-generated and **gitignored**, so it is a stale local artifact that
drifts from `app.json`. EAS regenerates it every build; a local
`expo run:android` does not. Observed 2026-08-24: the local debug APK's
manifest had **no `READ_CONTACTS`** even though `app.json` declares both the
permission and the `expo-contacts` plugin — so the contacts prompt never
appeared and the picker was empty. Android returns `denied` for an undeclared
permission **without prompting**, which looks exactly like a code bug.

Before trusting any local build, check the generated manifest against
`app.json`:

```
grep -o 'android:name="android.permission.[A-Z_]*"'   artifacts/mobile/android/app/src/main/AndroidManifest.xml | sort -u
```

To repair: `npx expo prebuild --platform android`, then **reapply the CMake
pin** in `android/app/build.gradle` (see CLAUDE.md) — prebuild wipes it and
local builds then fail with the Ninja long-path error.

## Machine-readable oracles

How each item would be asserted without a person, kept here so the per-file
tables stay about status:

| ID | Oracle |
| --- | --- |
| D1 | `bmgr backupnow`, reinstall, read `RKStorage` via `run-as` |
| D2 | Channel config from `dumpsys notification`; buzz events from `dumpsys vibrator_manager` |
| D3 / D15 | `pidof` for the kill, storage read for the result (the *press* is the un-automatable part) |
| D4 | Posted-notification count == 1; `dumpsys alarm` registration count |
| D7 | `AlarmManager` delivery log gives lateness to the ms |
| D8 / D13 / D14 | Navigation + `screencap`; `uiautomator` bounds for overlap and ellipsis |
| D9 | `pm get-app-links`, permission grant/revoke, notification body text |
| D10 | `pm clear`, then `uiautomator` for sheet ordering and skip-persistence |
| D11 | Stored datetime after each choice; sheet presence via `uiautomator` |
| D12 | Hint node present/absent; save succeeds |
| D16 | Notification **title string** from `dumpsys notification` |
| D17 | sqlite write, relaunch, key list |
| D18 | JSON field assertions |
| D19 / D20 / D21 / D23 | `dumpsys alarm` `windowLength`/`flags`, `Next alarm clock` slot, `AlarmManager` delivery log |
| D22 | Label strings via `uiautomator`; delivery lateness with the permission revoked |
| D25 | `dumpsys deviceidle whitelist`, `dumpsys alarm` history/`policyWhenElapsed`, `am get-standby-bucket` |
| D26 | `dumpsys alarm` `windowLength`/`flags` + the `remindme-patch` logcat line; status-bar icon needs a human |

**None of this exists as a harness today.** `pnpm test` is Jest only, which is
why this folder exists. Read the column above as "could be automated", not
"is". The gap is narrower than it looks — D17/D18 need no UI driving at all
(pure sqlite / JSON), and D19/D21/D23 are `dumpsys alarm` + `logcat`. What
genuinely needs a UI-driving harness (Maestro is the fit for Expo — see
CLAUDE.md's Testing section) is anything that must *create a reminder through
the UI* or *press a notification action*: D3, D11, D12, D15.

**Two limits worth being honest about.**

1. **A machine cannot tell you the app feels right.** Every `SEMI` row bottoms
   out in a human sense, and the four that matter most — D8 contrast, D14's
   status bar, D2's buzz, D9's tray behavior — are exactly the ones that
   shipped broken before, because Jest could not see them either. Automating
   the other rows buys time to look harder at these; it does not replace them.
2. **This folder's `PASS` rule still stands.** "A `PASS` must come from a
   human who actually watched it happen" was written against the failure mode
   of trusting green tests. An automated device check is much stronger
   evidence than a Jest run — it exercises the real OS — but it is still a
   script asserting what someone *expected* to matter. Suggested convention if
   a real harness gets built: automated runs report `AUTO-PASS`/`FAIL` and are
   excellent regression alarms, but promoting an item to `PASS` stays a human
   act.

## How this folder is maintained

- **After any feature lands, add its device-only checks here** in the same
  change. A feature is not "done" merely because its tests are green.
- **Ask the user for results** rather than assuming — a `PASS` must come from
  a human who actually watched it happen.
- **Cadence: ask whenever a feature lands.** Add its items, then ask whether
  to test now, before moving on to the next piece of work.
- **Prefer per-sub-check status over a blanket `PASS`.** "The send screen
  worked" is not the same as "D9 passes"; marking the whole item hides the
  parts nobody exercised.
- **Never mark `PASS` from a passing Jest run.** That is the exact mistake
  this folder exists to prevent.
- **Keep IDs stable across the whole project**, even across files. New items
  continue from the highest number used anywhere in this folder. IDs are
  referenced from `backlog.md`, `system_learnings.md`, and code comments —
  never reuse or renumber one.
- When an item passes, keep the row and record the date and device. A `PASS`
  on a Pixel does not carry over to a Xiaomi (see the OEM note above).

## How each item is written

Every item gives **Setup → Steps → Pass → Fails if**, so it can be run by
someone who did not write the feature and without reading the source.

- **Setup** — build type, install state and any settings that must be set
  *before* step 1. Getting this wrong is the most common cause of a false
  negative.
- **Steps** — numbered and literal. Tap targets by their on-screen label, adb
  commands in full. If a step needs a wait, say how long.
- **Pass** — what you must *observe*. Written so the answer is yes or no,
  never "looks fine".
- **Fails if** — the specific failure signatures worth naming, especially
  ones that look like something else. A test you cannot fail is not a test.

Prose beyond those headings in each file is the *why* — the root cause, the
prior bug, the reason the check exists. Keep it; it is what stops a future
reader from "simplifying" a step that is load-bearing.
