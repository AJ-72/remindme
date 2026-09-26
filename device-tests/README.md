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
| [cross-cutting.md](cross-cutting.md) | Alarm delivery mechanics — the OEM battery/Doze/AlarmManager behavior everything else depends on | D1, D7, D19-D20, D22, D25-D26 |
| [notifications.md](notifications.md) | Notification actions, channels, dedupe, recurrence re-arm | D2-D4, D15-D16, D85-D90, D102-D105 |
| [feature-e2e.md](feature-e2e.md) | Full user-facing flows | D6, D9-D13, D40-D43, D45, D47-D78, D78b, D82-D84, D91-D93, D95 |
| [visual-layout.md](visual-layout.md) | Theming, screen layout | D8, D14, D94 |
| [data-safety.md](data-safety.md) | Storage integrity, backup, re-arm-on-launch/un-complete, telemetry privacy | D17-D18, D21, D23, D79-D81, D101 |
| [malayalam-parsing.md](malayalam-parsing.md) | On-device Malayalam input/parsing (numerals, ambiguous readings, AM/PM) | D24, + 2 unnumbered checklists |
| [remind-others.md](remind-others.md) | M4 Tier 2, app-to-app delivery. **The backend shipped 2026-09-09 and the core loop passed live 2026-09-11** — the `BLOCKED` rows here predate that and are now merely untested; re-triage before running. | D27-D39, D44, D46 |

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

**Generated from the `## D##` headings in this folder's files on 2026-09-20 —
95 scenarios.** Regenerate rather than hand-editing when it drifts; the
per-file heading is the source of truth for a scenario's status, not this
table.

**6 `PARTIAL` · 54 `PENDING` · 14 `BLOCKED` · 18 `PASS` · 2 `INFO`.** (Updated
2026-09-26 for D100/D103 only — the base counts above were not independently
re-verified this session; regenerate fully before trusting them elsewhere.)

Sorted by status (most-actionable first), then by ID. `PARTIAL` rows are the
highest-value ones to finish: the setup and driving already work, only the
oracle assertion is outstanding.

Automatability (`AUTO`/`SEMI`/`MANUAL`) is recorded per item in each file
rather than here — it changes less often than status and was drifting in two
places when this table was last regenerated.

| ID | Scenario | Status | Last run | File |
| --- | --- | --- | --- | --- |
| [D2](notifications.md#d2) | Vibration setting | `PASS` | 2026-09-20 | notifications |
| [D4](notifications.md#d4) | Duplicate notifications | `INFO` | 2026-09-20 | notifications |
| [D7](cross-cutting.md#d7) | OEM battery-killer survival | `PARTIAL` | — | cross-cutting |
| [D9](feature-e2e.md#d9) | Remind-someone-else Tier 1 | `PARTIAL` | — | feature-e2e |
| [D10](feature-e2e.md#d10) | Name capture and personalization | `PASS` | 2026-09-20 | feature-e2e |
| [D11](feature-e2e.md#d11) | Quiet hours | `PASS` | 2026-09-20 | feature-e2e |
| [D14](visual-layout.md#d14) | 2026-08-24 device-feedback fixes | `PARTIAL` | — | visual-layout |
| [D16](notifications.md#d16) | Personalized snooze re-alert | `PARTIAL` | 2026-09-04 | notifications |
| [D17](data-safety.md#d17) | Corrupt-store quarantine | `PARTIAL` | 2026-09-04 | data-safety |
| [D18](data-safety.md#d18) | Backup carries the new fields | `PARTIAL` | 2026-09-04 | data-safety |
| [D101](data-safety.md#d101) | Google Drive backup and welcome-back restore (B3) | `PARTIAL` | 2026-09-25 | data-safety |
| [D22](cross-cutting.md#d22) | Alarm toggle copy and the status-bar icon explainer | `PARTIAL` | — | cross-cutting |
| [D3](notifications.md#d3) | Mark Done / Snooze with the app fully closed | `PENDING` | — | notifications |
| [D6](feature-e2e.md#d6) | Malayalam dictation end-to-end | `PASS` | 2026-09-20 | feature-e2e |
| [D13](feature-e2e.md#d13) | "Why tasks slip" explainer | `PASS` | 2026-09-20 | feature-e2e |
| [D15](notifications.md#d15) | Tap the notification body, then press Mark Done on it | `PENDING` | — | notifications |
| [D38](remind-others.md#d38) | Device key persists across restart, absent on fresh install | `PENDING` | — | remind-others |
| [D40](feature-e2e.md#d40) | "How you're doing" adherence screen | `PENDING` | — | feature-e2e |
| [D41](feature-e2e.md#d41) | Better-time suggestion on save | `PENDING` | — | feature-e2e |
| [D42](feature-e2e.md#d42) | Postponed-task intervention panel | `PENDING` | — | feature-e2e |
| [D43](feature-e2e.md#d43) | notifiedAt / openedAt stamping survives a cold-start race | `PENDING` | — | feature-e2e |
| [D45](feature-e2e.md#d45) | Country-code picker on registration | `PASS` | 2026-09-20 | feature-e2e |
| [D47](feature-e2e.md#d47) | Registration "Skip for now" actually dismisses the screen | `PENDING` | — | feature-e2e |
| [D48](feature-e2e.md#d48) | First run no longer leaves the app for exact-alarm settings | `PENDING` | — | feature-e2e |
| [D49](feature-e2e.md#d49) | A skipped name is still skipped after a relaunch | `PENDING` | — | feature-e2e |
| [D50](feature-e2e.md#d50) | The notification ask arrives on the first save | `PENDING` | — | feature-e2e |
| [D51](feature-e2e.md#d51) | A refused permission shows a live repair path | `PENDING` | — | feature-e2e |
| [D52](feature-e2e.md#d52) | The nudge names a ring the user already lost | `PENDING` | — | feature-e2e |
| [D53](feature-e2e.md#d53) | Dictation ends itself after a pause | `PENDING` | — | feature-e2e |
| [D54](feature-e2e.md#d54) | Cancel throws the words away, Done keeps them | `PENDING` | — | feature-e2e |
| [D55](feature-e2e.md#d55) | An open mic that hears nothing says so | `PENDING` | — | feature-e2e |
| [D56](feature-e2e.md#d56) | Leaving the app stops dictation | `PENDING` | — | feature-e2e |
| [D57](feature-e2e.md#d57) | The contacts ask explains itself before the OS asks | `PENDING` | — | feature-e2e |
| [D58](feature-e2e.md#d58) | A reminder for someone, with no address book | `PENDING` | — | feature-e2e |
| [D59](feature-e2e.md#d59) | The number offer arrives after a send, and stops | `PENDING` | — | feature-e2e |
| [D60](feature-e2e.md#d60) | The name sheet stays above the keyboard | `PENDING` | — | feature-e2e |
| [D61](feature-e2e.md#d61) | The notification banner's button is never dead | `PENDING` | — | feature-e2e |
| [D62](feature-e2e.md#d62) | Dictation keeps every sentence across a pause | `PENDING` | — | feature-e2e |
| [D63](feature-e2e.md#d63) | The add/edit sheet dictates like the home bar | `PENDING` | — | feature-e2e |
| [D64](feature-e2e.md#d64) | Remind someone else is always reachable | `PENDING` | — | feature-e2e |
| [D65](feature-e2e.md#d65) | A typed number carries its country code | `PENDING` | — | feature-e2e |
| [D66](feature-e2e.md#d66) | The number offer reaches the people who need it | `PENDING` | — | feature-e2e |
| [D67](feature-e2e.md#d67) | The cold open shows examples, not an empty list | `PENDING` | — | feature-e2e |
| [D68](feature-e2e.md#d68) | The send-to-a-person chip reads the name | `PENDING` | — | feature-e2e |
| [D69](feature-e2e.md#d69) | The number offer arrives on the third reminder | `PENDING` | — | feature-e2e |
| [D70](feature-e2e.md#d70) | The waveform answers the user's own voice | `PENDING` | — | feature-e2e |
| [D71](feature-e2e.md#d71) | The guessed words read as guesses | `PENDING` | — | feature-e2e |
| [D72](feature-e2e.md#d72) | The pause bar tells the truth about the clock | `PENDING` | — | feature-e2e |
| [D73](feature-e2e.md#d73) | The mic says which languages it takes, once | `PENDING` | — | feature-e2e |
| [D74](feature-e2e.md#d74) | An invited install never sees onboarding | `PENDING` | — | feature-e2e |
| [D75](feature-e2e.md#d75) | The ring ask carries the sender's stake | `PENDING` | — | feature-e2e |
| [D76](feature-e2e.md#d76) | The invited name ask lands on the home screen | `PENDING` | — | feature-e2e |
| [D77](feature-e2e.md#d77) | Nothing hides behind the tab bar | `PENDING` | — | feature-e2e |
| [D78](feature-e2e.md#d78) | First-launch feature tour (coach marks) | `PENDING` | — | feature-e2e |
| [D78b](feature-e2e.md#d78b) | Navigation is not trapped while the tour runs | `PENDING` | — | feature-e2e |
| [D79](data-safety.md#d79) | Telemetry opt-out actually stops sending | `PENDING` | — | data-safety |
| [D80](data-safety.md#d80) | Crash reports carry no reminder content | `PENDING` | — | data-safety |
| [D81](data-safety.md#d81) | Crash stack traces de-minify | `PENDING` | — | data-safety |
| [D82](feature-e2e.md#d82) | One tap clears the quick-add box | `PENDING` | — | feature-e2e |
| [D83](feature-e2e.md#d83) | The dictation language is visible on the quick-add screen | `PENDING` | — | feature-e2e |
| [D84](feature-e2e.md#d84) | Switching the dictation language while the mic is open | `PENDING` | — | feature-e2e |
| [D85](notifications.md#d85) | Daily reminder fires two days running, app killed between | `PENDING` | — | notifications |
| [D86](notifications.md#d86) | Weekly reminder's next occurrence arms without opening the app | `PENDING` | — | notifications |
| [D87](notifications.md#d87) | Recurring `alarm: true` doesn't hijack the single alarm-clock slot | `PENDING` | — | notifications |
| [D88](notifications.md#d88) | Several missed occurrences catch up to the next future one, no burst | `PENDING` | — | notifications |
| [D89](notifications.md#d89) | Marking done from the notification tray advances the series | `PENDING` | — | notifications |
| [D90](notifications.md#d90) | Daily 8am reminder survives a DST transition at 8am wall-clock | `PENDING` | — | notifications |
| [D102](notifications.md#d102) | Mark Done / Snooze from the tray while the app is open | `PENDING` | — | notifications |
| [D103](notifications.md#d103) | Delivery self-check reads real device state (B26) | `PARTIAL` | 2026-09-26 | notifications |
| [D104](notifications.md#d104) | Snooze on a notification posted before the B5 upgrade still works | `PENDING` | — | notifications |
| [D105](notifications.md#d105) | Notifications carry their buttons with permission already granted | `PENDING` | — | notifications |
| [D93](feature-e2e.md#d93) | System-wide "Remind Me" text-selection menu | `PENDING` | — | feature-e2e |
| [D94](visual-layout.md#d94) | Ink & Coral palette, on device | `PENDING` | — | visual-layout |
| [D95](feature-e2e.md#d95) | Parsed date/time/recurrence chips are editable in place | `PENDING` | — | feature-e2e |
| [D24](malayalam-parsing.md#d24) | 12-hour AM/PM time display | `BLOCKED` | — | malayalam-parsing |
| [D27](remind-others.md#d27) | Registration and the discoverability switch | `BLOCKED` | — | remind-others |
| [D28](remind-others.md#d28) | Invitation arrives with the app killed | `BLOCKED` | — | remind-others |
| [D29](remind-others.md#d29) | Accepted reminder fires locally, and survives a reboot | `BLOCKED` | — | remind-others |
| [D30](remind-others.md#d30) | Block blocks, and unblock re-delivers nothing | `BLOCKED` | — | remind-others |
| [D31](remind-others.md#d31) | Expiry at the reminder's own time | `BLOCKED` | — | remind-others |
| [D32](remind-others.md#d32) | Concurrent cancel versus reschedule | `BLOCKED` | — | remind-others |
| [D33](remind-others.md#d33) | Tier 1 fallback for an unreachable recipient | `BLOCKED` | — | remind-others |
| [D34](remind-others.md#d34) | Verification ladder: the link rung and the OTP rung | `BLOCKED` | — | remind-others |
| [D35](remind-others.md#d35) | Invite token is single-use, and survives a link preview | `BLOCKED` | — | remind-others |
| [D36](remind-others.md#d36) | Rebind on a new phone, and the 45-day cliff | `BLOCKED` | — | remind-others |
| [D37](remind-others.md#d37) | Cancel while the recipient is offline | `BLOCKED` | — | remind-others |
| [D44](remind-others.md#d44) | Receiver's own quiet hours gate the accepted reminder, not the sender's | `BLOCKED` | — | remind-others |
| [D46](remind-others.md#d46) | Sender is notified when the receiver moves the reminder's time | `BLOCKED` | — | remind-others |
| [D8](visual-layout.md#d8) | Dark mode, visually | `PASS` | 2026-08-24 | visual-layout |
| [D12](feature-e2e.md#d12) | Vague-task hint | `PASS` | 2026-08-29 | feature-e2e |
| [D19](cross-cutting.md#d19) | setAlarmClock() fixes exact delivery | `PASS` | 2026-08-24 | cross-cutting |
| [D20](cross-cutting.md#d20) | Re-verify on an EAS build after the setAlarmClock change | `PASS` | 2026-08-29 | cross-cutting |
| [D21](data-safety.md#d21) | Un-completing a reminder re-arms it | `PASS` | 2026-08-29 | data-safety |
| [D23](data-safety.md#d23) | Pre-existing reminders re-arm on launch after an app update | `PASS` | 2026-08-30 | data-safety |
| [D26](cross-cutting.md#d26) | Exact timing for non-alarm reminders | `PASS` | 2026-09-06 | cross-cutting |
| [D1](cross-cutting.md#d1) | Does Android Auto Backup actually restore reminders? | `PASS` | 2026-09-25 | cross-cutting |
| [D39](remind-others.md#d39) | Invitation push actually delivers to a real device, no reload | `PASS` | — | remind-others |
| [D91](feature-e2e.md#d91) | Recurring reminder "Next 3" preview after repeated snoozes | `PASS` | 2026-09-19 | feature-e2e |
| [D92](feature-e2e.md#d92) | Home screen: recurrence preview cards for next occurrences | `PASS` | 2026-09-20 | feature-e2e |
| [D25](cross-cutting.md#d25) | How Google Tasks actually stays punctual | `INFO` | 2026-09-05 | cross-cutting |

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

  **Check the whole folder before assigning one, not just the file you are
  editing.** This rule was broken twice before it was caught (2026-09-20):
  `D79` was both the telemetry opt-out and the text-selection menu, and `D27`
  was both the Ink & Coral palette and Tier 2 registration — in each case
  because a new item continued from the highest ID *in its own file*. The
  colliders were renumbered to `D93`/`D94`; the widely-cited meanings kept
  their numbers. The highest ID in use is now **D103** (2026-09-26: D100/D101
  collided again in notifications.md against visual-layout.md/data-safety.md's
  older D100/D101 — renumbered notifications.md's two items to D102/D103; see
  system_learnings.md). One command settles it:

  ```bash
  grep -rhoE '^#+ +D[0-9]+b? ' device-tests/*.md | grep -oE 'D[0-9]+b?' \
    | sort | uniq -d   # prints any duplicate; silence means clean
  ```

  Keep the trailing `b?` on the second pattern: `D78` and `D78b` are two
  deliberately distinct items (a check and its sub-check), and stripping the
  suffix reports them as a false collision.
- **Regenerate "All scenarios at a glance" rather than hand-editing it.** It
  drifted 21 rows stale between 2026-09-04 and 2026-09-20 because every new
  item was added to its own file's table but not the index. The `## D##`
  headings are the source of truth; the index is derived from them.
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
