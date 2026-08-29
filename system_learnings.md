# System Learnings Ledger

Running log of non-obvious fixes, config changes, and decisions made while working in this repo.
Read this before starting work — it may save you from re-debugging something already solved.

**Format rule:** one entry per change. State WHAT changed, WHY (root cause, not symptom), and WHERE.
Keep entries short and factual. Do not delete old entries — mark them SUPERSEDED if a later entry replaces them.
Newest entries at the top.

---

## 2026-08-29 — This app is absent from Android's "Alarms & reminders" screen, and that is correct: USE_EXACT_ALARM supersedes SCHEDULE_EXACT_ALARM

**Symptom:** the new status-bar-icon explainer in Settings told users the OS
escape hatch was *Settings > Apps > Reminders > Allow setting alarms and
reminders*, with a button onto that screen. On device the button opened the
right screen — but **Reminders is not in the list** (Maps, Messages, Uber,
Zomato all are). The instruction was a dead end, and D22's revoke test could
not be run at all.

**ROOT CAUSE — our own manifest, and it is right as it stands.** `app.json`
declares **both** exact-alarm permissions:

```
android.permission.SCHEDULE_EXACT_ALARM
android.permission.USE_EXACT_ALARM
```

`USE_EXACT_ALARM` is a **normal** permission: auto-granted at install,
**not user-revocable**, and reserved by Google for apps whose core function is
alarms/clocks/reminders. On **targetSdk 34+** (we target 36) it **supersedes**
`SCHEDULE_EXACT_ALARM`. The "Alarms & reminders" special-access screen is
backed by the `SCHEDULE_EXACT_ALARM` appop, so apps holding `USE_EXACT_ALARM`
are **omitted from it by design** — there is nothing there for the user to
switch. Confirms in `dumpsys package com.curios.remindme`:
`USE_EXACT_ALARM: granted=true`, with no granted line for
`SCHEDULE_EXACT_ALARM`.

**DO NOT "fix" this by removing `USE_EXACT_ALARM`.** It is what makes reminders
punctual by default. Without it, exact alarms become opt-in and every new user
is silently unpunctual until they find a settings screen — see D7/D19 for what
inexact delivery costs on ColorOS (up to an hour on a next-day reminder). Play
permits the permission for this app category. The permission model is correct;
only the copy was wrong.

**FIX (`caa3542`):** the escape-hatch paragraph and the
"Open alarms & reminders settings" button are gone from
`app/(tabs)/settings.tsx`. The explainer now states that Android offers no
per-app switch because the app registers as an alarm app, and points at **the
app's own Alarm toggle** — the real control, since a silent reminder never
routes through `setAlarmClock()` and therefore shows no icon, at the cost of
the lateness that toggle now advertises. A test asserts the old claim is
*absent*, so it cannot creep back in.

**General lesson:** Jest can prove copy *renders*; only a device can prove copy
is *true*. This one was green in the suite and wrong on the phone — which is
the whole premise of `device-tests.md`.

---

## 2026-08-28 — Two jest state leaks that break *unrelated* tests: `jest.replaceProperty` does not auto-restore, and `scheduleNotificationAsync` is a file-wide shared mock

Both hit while fixing backlog items 19/20. Same shape in each case: a test mutates
shared state, passes, and the failure surfaces in a **different test further down
the file** — so the traceback points at innocent code.

**1. `jest.replaceProperty` does NOT restore itself.**

The docs' own wording is easy to misread: replaced properties are restored *only*
if you call `jest.restoreAllMocks()`, or set `restoreMocks: true` in jest config.
We set neither. `jest.clearAllMocks()` in a `beforeEach` — which
`__tests__/screens/settings.test.tsx` does have — clears call records but restores
nothing.

Concretely: `jest.replaceProperty(Platform, "OS", "android")` in one test leaked
into every later test in the file. React Native's `Switch` picks a *different
native component* per platform, and the Android one does not expose `value` the
same way, so five unrelated assertions started failing with
`expect(switchEl.props.value).toBe(true)` → `Received: undefined`. Nothing about
that error suggests a leaked platform.

FIX: keep the handle `replaceProperty` returns and restore it in a scoped
`afterEach`:
```ts
let replaced: { restore: () => void }[] = [];
const setPlatform = (os: string) => {
  replaced.push(jest.replaceProperty(Platform, "OS", os as any));
};
afterEach(() => { replaced.forEach((r) => r.restore()); replaced = []; });
```
**Do NOT reach for `jest.restoreAllMocks()` as the fix** in that file — it would
also tear down the module-level `jest.spyOn(Share, "share")`, breaking the share
tests instead. Restore precisely what you replaced.

Related trap in the same API: `jest.replaceProperty` **throws** on a property that
is already a function (`Cannot replace the 'sendIntent' property because it is a
function. Use jest.spyOn instead`). For `Linking.sendIntent` and friends, use
`jest.spyOn(...).mockRestore()`.

**2. `scheduleNotificationAsync` from `__mocks__/expo-notifications.ts` is shared
across the whole test file.**

Calling `.mockResolvedValue("...")` on it installs a **permanent** implementation.
`mockClear()` does not undo it — that resets call records only, not the
implementation. A `mockResolvedValue("new-notif-id")` added to a new
`toggleComplete` test broke a `snoozeReminder` assertion ~600 lines away that
expected the default `"mock-notif-id"`.

FIX: use **`mockResolvedValueOnce`** for a one-off return value. Reserve
`mockResolvedValue` for a `beforeEach` that owns the default for the whole file.

**General rule for this repo's tests:** if you must mutate module-level or
platform state in one test, restore it in that describe's own `afterEach`.
Jest's `clearAllMocks`/`resetAllMocks` do not cover property replacement or mock
implementations, and this repo configures neither `restoreMocks` nor `resetMocks`.

## 2026-08-24 — EAS `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` on patchedDependencies: EAS was running a different pnpm

**Symptom:** the first EAS build carrying the exact-alarm patch died in dependency install:

```
ERR_PNPM_LOCKFILE_CONFIG_MISMATCH  Cannot proceed with the frozen installation.
The current "patchedDependencies" configuration doesn't match the value found in the lockfile
```

`pnpm install --frozen-lockfile` passes locally, so the lockfile is fine.

**ROOT CAUSE: `patchedDependencies` moved between pnpm majors** — pnpm <=9 reads
it from `package.json`, pnpm 10+ from `pnpm-workspace.yaml` (where ours lives).
The repo pinned **no** pnpm version anywhere: no `packageManager` field, no
`engines`. So EAS used whatever pnpm its build image ships, that pnpm looked for
`patchedDependencies` in `package.json`, found nothing, compared it against the
entry recorded in the lockfile, and refused. The message points at the lockfile,
which is the one thing that is not wrong.

**Fix — both halves are required:**

1. `"packageManager": "pnpm@11.17.0"` in the **root** `package.json`.
2. `"corepack": true` on every build profile in `eas.json`. **Without this EAS
   ignores `packageManager` and keeps its preinstalled pnpm**, so pinning alone
   changes nothing.

**Second failure, immediately after:** with corepack enabled, EAS *did* fetch
pnpm 11.17.0 and then died in corepack itself —

```
TypeError [ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING]: A dynamic import callback was not specified.
    at Object.<anonymous> (/home/expo/.cache/node/corepack/v1/pnpm/11.17.0/bin/pnpm.cjs:3:1)
Node.js v20.19.4
```

The corepack bundled with **Node 20** cannot load a package-manager binary that
uses dynamic import; it is fixed in the corepack shipping with Node 22. EAS
defaults to Node 20 while this repo develops on Node 24, so the pin has to cover
Node as well: `"node": "22.20.0"` on each `eas.json` build profile. Both
`corepack` and `node` are valid profile fields — `npx eas-cli config --platform
android --profile preview` validates them locally without starting a build,
which is worth doing before spending build quota.

**Generalise:** an unpinned toolchain is invisible until a config key moves
between majors — and pinning *one* layer just relocates the failure to the next.
`patchedDependencies` forced a pnpm pin; the pnpm pin forced a Node pin. Any
repo using `patchedDependencies`, pnpm workspaces, or a lockfile-sensitive CI
install should pin **both**, and validate `eas.json` with `eas-cli config`
rather than by launching a build.

**WHERE:** `package.json` (root), `artifacts/mobile/eas.json`.

---

## 2026-08-24 — setAlarmClock() is the fix for downgraded exact alarms, and it takes over the system's ONE next-alarm slot

Resolves the ColorOS downgrade recorded below. `AlarmManager.setAlarmClock()`
is honoured where `setExactAndAllowWhileIdle()` was silently converted to
inexact: `window=0`, and **delivery measured 0ms late in forced deep Doze** on a
OnePlus CPH2569, against 5m02s late on the same device minutes earlier.

**Why it works, and why `FLAG_WAKE_FROM_IDLE` is a red herring.** The alarm gets
`flags 0x9` — `FLAG_STANDALONE` set but **not** `FLAG_WAKE_FROM_IDLE (0x2)` —
and the app never appears in the dump's `Next wake from idle:` list. It is exact
anyway, because `setAlarmClock()` registers in `mNextAlarmClockForUser` and
`DeviceIdleController` pulls the device out of Doze *ahead of* the alarm.
Confirmed in the dump:

```
Next alarm clock information:
  user:0 pendingSend:false time:1787576009521 = 2026-08-24 18:23:29.521
```

**The trap: that slot holds exactly one alarm, device-wide.** It drives the
status-bar alarm icon *and the lock screen's next-alarm text*. Our 18:23
reminder displaced the OnePlus clock app's **06:00 alarm** there. A user with a
morning alarm and an evening reminder sees the reminder as their "next alarm"
and can reasonably conclude their wake-up alarm is gone. This is user harm, not
clutter.

**So route conditionally: `setAlarmClock()` ONLY for alarm-type reminders**
(`data.alarm`, which arrives in Kotlin as `request.content.body`), and keep the
exact/inexact path for silent ones. Consequences that follow:

- `ALARM_EARLY_OFFSET_MS` **stays**. It exists solely to absorb inexact drift,
  and silent reminders still drift. Zeroing it globally would only be correct
  under unconditional `setAlarmClock()`. Note several tests build their
  scenarios from that constant (`ALARM_EARLY_OFFSET_MS / 2`), so setting it to 0
  would leave them passing while asserting nothing.
- Anything scheduling *extra* notifications per reminder must force the
  non-alarm-clock route explicitly — see backlog M9 (smart re-nudge), where a
  ladder rung inheriting `alarm: true` would have every rung fight over that one
  slot and trip OEM "frequently wakes your system" heuristics.
- `setAlarmClock()` requires exact-alarm permission on S+ and **throws
  SecurityException** without it. The fallback chain is mandatory, not defensive
  padding.

**The consequence to remember: punctuality is now a property of the alarm
toggle.** Routing conditionally did not fix the downgrade — it routed around it
for one class of reminder. Verified on the shipping EAS build 2026-08-25 with
both types pending at once: the alarm reminder had `window=0`, the silent one
`window=+21m43s627ms` with `flags 0x4`. So on ColorOS an **alarm** reminder is
exact while a **silent** one can still arrive ~20 minutes late (up to an hour
for a next-day one), and nothing in the UI says so. Expect this to resurface as
a vague "some reminders are late" report; the first question is whether that
reminder had the alarm toggle on.

**The status-bar alarm icon cannot be engineered away.** It shows if *any*
`setAlarmClock()` registration is pending — one is enough. The obvious
mitigation, keeping reminders inexact and promoting them to `setAlarmClock()`
shortly before due, is **circular**: the promotion would itself have to be
triggered by an inexact alarm, which is the unreliable thing being routed
around. WorkManager and foreground services sit under the same OEM throttling.
Do not spend time designing around this — on this ROM the icon is the price of
punctuality, and the only real lever is *which* reminders pay it. Android's own
escape hatch is the per-app "Allow setting alarms and reminders" toggle, which
trades punctuality for a clean status bar. Backlog item 20 carries the research
on what other apps do.

**Testing note worth reusing:** to prove the routing rather than infer it from
flags, make the **silent** reminder the *sooner* of the two. The next-alarm slot
holds exactly one alarm, so broken routing would let the sooner reminder seize
it. Same-direction evidence (both types looking "right") does not distinguish
the two cases.

**WHERE:** `patches/expo-notifications@0.32.17.patch` (needs the
`buildFromSource` opt-out — see the AAR entry below). Evidence and the remaining
checks: D19/D20 in [`device-tests.md`](device-tests.md). Commits `df3ec64`,
`6898f25`, `ad51a0c`.

---

## 2026-08-24 — Patching an Expo module's Kotlin does NOTHING: SDK 54 links a prebuilt AAR, not your source

Chasing an alarm-precision bug (below) meant editing `expo-notifications`'
Android source via `pnpm patch`. The patch applied cleanly, the build
succeeded, the app installed — and the patched code **never ran**. No log line,
no behaviour change.

**Root cause: Expo SDK 54 ships precompiled Android modules.** The package
carries its own binary at
`expo-notifications/local-maven-repo/host/exp/exponent/expo.modules.notifications/0.32.17/expo.modules.notifications-0.32.17.aar`,
and autolinking prefers that publication over compiling `android/src/main/java`.
A source patch is silently ignored. Nothing warns you; the only symptom is that
your change has no effect, which reads exactly like "the fix didn't work" and
sends you off debugging the wrong thing.

**Fix — force that one module to build from source**, in
`artifacts/mobile/package.json`:

```json
"expo": { "autolinking": { "android": { "buildFromSource": ["expo-notifications"] } } }
```

`buildFromSource` entries are regexes **full-matched against the Gradle project
name** (`SettingsManager.kt`: `it.matches(project.name)`), so `"expo-notifications"`
hits exactly one module and everything else keeps its fast prebuilt path.
Expect that module to compile from scratch afterwards.

**Generalise:** before concluding a native patch to any Expo module failed,
confirm it was compiled at all — `find <pkg> -name "*.aar"`, and grep the build
log for `:<module>:compile*Kotlin`. Absence of your log line means "not built",
not "didn't work".

**WHERE:** `patches/expo-notifications@0.32.17.patch`, `pnpm-workspace.yaml`
(`patchedDependencies`), `artifacts/mobile/package.json`.

---

## 2026-08-24 — OxygenOS/ColorOS refuses exact alarms outright, so every reminder gets a multi-minute window

`adb shell dumpsys alarm` on a OnePlus CPH2569 (Android 15) showed reminders
registered **inexact**: `flags 0x4` (bare `FLAG_ALLOW_WHILE_IDLE`, missing
`FLAG_STANDALONE` 0x1 and `FLAG_WAKE_FROM_IDLE` 0x2) with a non-zero
`windowLength`. The window scales with distance — 43 s for a 2-minute reminder,
21.7 min for a 30-minute one, **3600000 ms for a next-morning one**. A 09:00
reminder may legally fire at 09:59.

**The ROM silently downgrades the alarm — for us, but demonstrably not for
every app.** `com.google.android.deskclock`, a non-system app with identical
exact-alarm permissions, no doze exemption and a worse standby bucket, gets
`windowLength 0` on the same device. So the cause is NOT permissions, appops,
battery standing or system privilege — all four were checked. The mechanism is
unknown; resist the tempting explanations, two of which were wrong here.
An instrumented build proved the downgrade itself, by pairing the call-site log
with the resulting alarm on a matching trigger timestamp (the only method that
actually discriminates — see the two traps below):
`canScheduleExactAlarms()` returned **true**, `setExactAndAllowWhileIdle()` was
called, **nothing threw**, and the alarm still landed with `flags 0x4` and a
21.7-minute window. `expo-notifications` is not at fault and a source patch to
it cannot help — it would force a branch already taken. Beware the tempting
wrong inference here: inexact flags do NOT prove the app chose the inexact
branch, because the platform does not honour what it is told. Only logging at
the call site distinguishes the two. Not fixable by settings either: a
user-granted Doze exemption (`RUN_ANY_IN_BACKGROUND: allow`, standby bucket 5 /
EXEMPTED) changed nothing. The ROM also strips `MANAGE_APP_OPS_MODES` from the
shell user, so `adb shell cmd appops set ... SCHEDULE_EXACT_ALARM allow` is
rejected where stock Android permits it.

**Two traps for whoever tests this next:**

- The app does **not** appear under Settings -> Special app access -> Alarms &
  reminders. That is expected, not a misconfiguration — Android only lists apps
  relying on the user-revocable `SCHEDULE_EXACT_ALARM`, and this app also holds
  the auto-granted `USE_EXACT_ALARM`.
- **"The notification arrived" is not evidence.** A 2-minute reminder fired ~42 s
  late against its own target and still felt on time, because
  `ALARM_EARLY_OFFSET_MS` had aimed 60 s early and absorbed the drift. That
  offset exists for the duplicate-notification fix, not as slack for inexact
  alarms, and it cannot cover an hour. **Record how late a delivery was, never
  just that it happened.**

**Three `dumpsys alarm` interpretation traps, all of which produced wrong
conclusions here before being caught:**

- **`exactAllowReason` does not mean the request was exact** — it reflects the
  app's entitlement. The same dump had
  `com.google.android.googlequicksearchbox` with
  `window=+1h0m0s0ms exactAllowReason=permission flags=0x4`.
- **`policyWhenElapsed` showing no delay does not mean the alarm is exact.** It
  only rules out post-registration deferral by Doze/Standby/Battery Saver. The
  window is applied at registration.
- **The logcat ring buffer holds ~4 minutes on this device** (256 KiB; ColorOS
  wrote ~22k lines in 7 minutes). A missing log line is far more likely
  eviction than absence. Capture with `adb logcat -v time > file &` started
  BEFORE the action; never conclude from `logcat -d` afterwards.

**WHERE:** tracked as D7 in [`device-tests.md`](device-tests.md), which carries
the full evidence and the remaining phases.

---

## 2026-08-24 — Local Android builds: release has never worked here, and installing debug destroys all app data

Four independent traps hit in one session while trying to get a locally-built
APK onto a device. None are in `CLAUDE.md`'s existing Windows section.

**1. `--variant release` does not build in this repo, and never has.**
`android/app/build/outputs/apk/` contains only `debug/`. Release fails in
`:app:createBundleReleaseJsAndAssets` with
`Unable to resolve module ./index.ts from <repo root>` — Metro resolves the
entry against the **repo root** instead of `artifacts/mobile`, even though
`react.root` is correctly left at its default. The same bundle succeeds
standalone via `npx expo export` from `artifacts/mobile`, so it is the
Gradle-invoked path specifically. **Release APKs come from EAS. Use
`--variant debug` locally** — unresolved, and not worth debugging unless local
release builds become necessary.

**2. `react-native-worklets` needs `CMAKE_VERSION` in the environment.**
`CLAUDE.md` notes the `:app` module needs an explicit
`externalNativeBuild.cmake.version` block; that pin does **not** reach other
native modules. Worklets failed with the documented
`ninja: error: manifest 'build.ninja' still dirty after 100 tries`. Exporting
`CMAKE_VERSION=4.1.2` alongside the `:app` pin fixed it.

**3. A locally-built debug APK cannot replace an EAS-signed install.**
`INSTALL_FAILED_UPDATE_INCOMPATIBLE: signatures do not match`. `adb install -r`
does not help — the only route is `adb uninstall` first, which **erases
AsyncStorage: every reminder, the user's name, quiet hours, all settings**.
Treat swapping an EAS build for a local one as a destructive operation and get
explicit consent.

**4. There is no way to rescue that data over adb.** `run-as` refuses on a
release build (`package not debuggable`), and the in-app backup is
`Share.share({ message: await buildBackupJson() })`
(`app/(tabs)/settings.tsx:96`) — it shares the JSON as **message text, not a
file**, so nothing lands in `/sdcard/Download` to pull. If the Settings screen
is unreachable (as it was, pre-scroll-fix), the data is simply unrecoverable.
A file-based export would be more robust.

**5. `artifacts/mobile/android/` is gitignored, prebuild-generated, and drifts
from `app.json` — so a local APK is not equivalent to an EAS build.** EAS
regenerates that folder every build; `expo run:android` reuses whatever is on
disk, however old. Observed 2026-08-24: the local manifest had no
`READ_CONTACTS` despite `app.json` declaring both the permission and the
`expo-contacts` plugin. Android returns `denied` for an undeclared permission
**without ever prompting**, so it presented as "the app stopped asking for
contacts permission" — indistinguishable from a code bug, and it cost real time
before the manifest was checked. **When a permission-dependent feature fails on
a locally-built APK, diff the generated manifest against `app.json` before
touching any code.** Repair with `npx expo prebuild --platform android`, then
reapply the CMake pin (prebuild wipes it).

**Operational notes:** `adb` is not on PATH — its full path is recorded in
`device-tests.md`. From PowerShell use `Select-String`, not `grep`. And tick
**"Always allow from this computer"** on the USB-debugging prompt: without it
every `adb kill-server` re-prompts and the device reverts to `unauthorized`
mid-operation.

---

## 2026-08-24 — Four device-only failures that no test could have caught

Seven findings from testing on a real phone. Four were invisible to the whole suite, and the pattern is worth internalising: **jsdom has no viewport, no keyboard, and no system chrome**, so anything whose failure mode is "off-screen" or "behind something" passes green forever.

**1. A screen whose root is a `View` silently clips everything past one viewport.** `app/(tabs)/settings.tsx` had never been scrollable. Nothing errors, nothing is marked overflowing, and every element is present in the render tree — so `findByTestId` finds rows a user physically cannot reach. It only became visible when a new row pushed the last control off the bottom. **When adding a row to any settings-style screen, confirm its root is a `ScrollView`.**

**2. `<StatusBar style="auto" />` resolves from the DEVICE scheme, not your app's theme.** This app paints from an in-app Appearance preference, so Light-app-on-dark-phone drew light icons on a light background: an invisible clock and battery. The fix is to drive it from the resolved app scheme (`useResolvedScheme`, now exported from `hooks/useColors.ts` rather than duplicated) and render it INSIDE `ThemeProvider`. **Any component styling itself against the app background must use `useResolvedScheme`, never `useColorScheme` directly** — the latter is the device's answer to a different question.

**3. React Native's `KeyboardAvoidingView` is unreliable inside an Android `Modal`.** The modal renders in its own window and does not reliably receive the soft-input resize, so a bottom-anchored sheet stays put and its own search keyboard covers it. `react-native-keyboard-controller` (already a dependency — see `KeyboardProvider` in `app/_layout.tsx`) exports a `KeyboardAvoidingView` that handles it. **Prefer that one for anything inside a Modal.**

**4. Nesting `<Text>` inside `<Text>` breaks every by-text query.** Building a subtitle as `<Text>{date}{" · "}{count}</Text>` collapses it into one text node, so `findByText("2 upcoming")` stops matching even though the words are on screen. Render the parts as sibling `<Text>` elements in a row `View` instead.

**Also:** an icon swap is not feedback. The quick-add contact button changed `user-plus` to `user-check` and users could not tell whether a contact had attached, because nothing named the person. State that a user must be sure of needs words, not a glyph.

**The standing list of what this affects lives in [`device-tests.md`](device-tests.md)** (added 2026-08-24, canonical — `backlog.md`'s old D1-D9 section points there now). Add a feature's device-only checks in the same change that ships it, and never mark one `PASS` from a green Jest run.

**WHERE:** `app/(tabs)/settings.tsx`, `app/(tabs)/index.tsx`, `components/{ThemedStatusBar,ContactPickerModal,QuickAddInput}.tsx`, `hooks/useColors.ts`. Commits `e93b46a`..`2f04bf9`.

---

## 2026-08-23 — Generated router types are gitignored, so every clone must regenerate them

Building the Smart Alerts foundations hit the 2026-08-17 Expo Router typed-route trap again, exactly as recorded, and the documented fix worked first try (`npx expo customize tsconfig.json`, then re-run `tsc`). Two things that entry did not say, both learned by hitting them:

**1. Do NOT commit the regenerated types — `artifacts/mobile/.expo/` is gitignored.** `git add .expo/types/router.d.ts` is refused, correctly: it is a build artefact. The consequence is that **a fresh clone or a clean CI checkout has no typed-route union at all**, so the first `tsc` after adding a route file can fail on a pathname that is perfectly valid in the committed source. Regenerating is a setup step, not a fix for a mistake. Any plan step that says to commit that file is wrong.

**2. A screen that starts navigating breaks its existing test file.** `__tests__/screens/settings.test.tsx` had no `jest.mock("expo-router", ...)` because the Settings screen had never called `router.push`. Adding one row that navigates made the mock mandatory, and the failure surfaces in a test file the change does not otherwise touch. **When adding the first navigation call to a screen, check whether its test file mocks the router.**

**WHERE:** `artifacts/mobile/.expo/types/router.d.ts` (generated, gitignored), `artifacts/mobile/.gitignore`, `__tests__/screens/settings.test.tsx`. Commits `54c4506`, `40dd5e0`.

---

## 2026-08-23 — loadReminders launders a corrupt store into data loss, and headless writers race the foreground

Both found while answering "does Smart Alerts need SQLite?" (answer: no — reasoning in `docs/superpowers/specs/2026-08-23-smart-alerts-design.md`, "Persistence"). These two are code facts rather than design opinions, and both would be expensive to re-derive from a bug report.

**1. A JSON parse failure becomes permanent data loss on the next write.** `loadReminders` catches the parse error and returns `[]`. The app then renders an empty list, and the first subsequent `saveReminders` persists that empty array over the user's real reminders. AsyncStorage is the **only** copy — no backend, manual backup — so there is no recovery. Symptom would be "all my reminders vanished" with nothing in any log. Fix planned as Task 1 of `docs/superpowers/plans/2026-08-23-smart-alerts-foundations.md`: quarantine the unreadable payload under a timestamped key before returning `[]`. **Until that lands, treat any report of mass reminder loss as this first.**

**2. Whole-array read-modify-write races between the headless task and the foreground, and a JS mutex CANNOT fix it.** `markDoneById` and `updateSnoozeById` run in the headless notification task (`tasks/notificationResponseTask.ts`) and do load-entire-array → modify → save-entire-array; `markDoneById` even `await`s `cancelNotification()` between the load and the save, widening the window with a native call. `RemindersContext` separately writes the whole array from a long-lived React state snapshot. **A module-level mutex does not help: the headless task runs in a separate JS runtime and would not share the lock.** Today this is mitigated — not eliminated — by the AppState-`active` reload in `RemindersContext`.

**Consequence for future work:** anything that adds a background writer must either write to its **own storage key** (not the reminders blob), or be **idempotent enough that a lost update is harmless**. Never add a background read-modify-write whose loss would corrupt state. Genuine atomicity here needs SQLite (`UPDATE ... WHERE id = ?`), which is the one real argument for migrating and is currently outweighed by the migration's data-loss risk.

**WHERE:** `services/ReminderService.ts` (`loadReminders`, `saveReminders`, `markDoneById`, `updateSnoozeById`), `contexts/RemindersContext.tsx`, `tasks/notificationResponseTask.ts`. Commit `da94e67`.

---

## 2026-08-23 — Backup round-trips reminder fields by spread; settings are dropped by two lists in ReminderService

Established while designing Smart Alerts (`docs/superpowers/specs/2026-08-23-smart-alerts-design.md`), by reading `utils/reminderBackup.ts` rather than assuming. All four points are counter-intuitive in the same direction — the thing you expect to break doesn't, and the thing you don't check does.

**1. New REMINDER fields survive backup/restore for free.** `parseBackup` builds each entry as `{...entry, description, completed}` and `mergeReminders` pushes `{...clean}`, so unrecognised fields pass straight through. Adding an optional field to `Reminder` needs no backup work. **Do not add per-field copying to "make sure it round-trips"** — it already does, and an explicit list is the thing that rots.

**2. New SETTINGS are silently dropped — by TWO lists in `ReminderService`, not by the type.** *(Corrected 2026-08-23 during implementation; the original wording of this point named the wrong file.)* `parseBackup` **casts** (`candidate.settings as BackupSettings`) rather than rebuilding, so unknown setting keys survive a round-trip on their own — extending the `BackupSettings` interface only satisfies `tsc`. The real drop points are two explicit per-setting lists in `services/ReminderService.ts`: **`buildBackupJson`** constructs the settings object (write side) and **`importRemindersFromJson`** applies settings one `if` at a time (restore side). A new setting must be added to **both**; missing either is silent, and a test that only round-trips through `serializeBackup`/`parseBackup` **passes without any implementation at all** — which is exactly how this was caught. Test the restore side explicitly, and validate there, since a backup file is user-editable text.

**3. Do NOT bump `BACKUP_VERSION` for additive fields.** `parseBackup` refuses any backup whose `version` exceeds its own (`unsupported-version`) — deliberately, to avoid importing a subset of a newer file. So bumping makes new backups unreadable by older installs while buying nothing, since optional additive fields are already compatible in both directions.

**4. `mergeReminders` is "local always wins", which loses history by design.** When a backup copy and a local copy are `isSameReminder` (content-equal: title case/whitespace-insensitive + same instant), the incoming one is discarded whole. A locally re-typed reminder therefore beats a backup copy carrying accumulated counters. **This is the correct trade and should not be "fixed"** — inverting it to preserve richer history would risk un-completing a reminder the user has since marked done, which is far worse than losing a counter. Document the loss; leave the rule alone.

**WHERE:** `utils/reminderBackup.ts` (`parseBackup`, `mergeReminders`, `BackupSettings`, `BACKUP_VERSION`, `isSameReminder`) and `services/ReminderService.ts` (`buildBackupJson`, `importRemindersFromJson`). Commits `a229302`, `43ec9dc`.

---

## 2026-08-23 — A notification-response dedupe key must include the ACTION, and a screen with no in-app route is a dead screen

**1. Keying response dedupe on the notification id alone silently disables every action button.** `services/handledResponses.ts` marks a response handled by `response.notification.request.identifier`, and `handleNotificationResponse` returns early on a hit. That identifier names the NOTIFICATION, not the response — so one tray notification could be acted on exactly once, ever. Tapping the body (which navigates) burned the key, and pressing **Mark Done** on that same notification afterwards was dropped before reaching `markDoneById`. Send reminders could never be completed from the tray at all, because their flow *always* opens with a body tap. Fixed by keying on `` `${notificationId}::${actionIdentifier}` `` in `services/notificationResponseHandler.ts`. **The dedupe still collapses replays of a single action, which is all it was ever for** — the cross-process (headless task vs. foreground listener) and cold-start-replay protections are unaffected, and their four existing tests passed unchanged. Reported as "mark as done doesn't work"; the in-app checkbox was never involved.

**2. A screen reachable only from a notification is effectively unreachable.** `app/send-reminder.tsx` had shipped with a working "Mark as done" button that no user had ever seen: `ReminderCard` routed every tap to `/add-reminder`, so the only route in was tapping a fired notification. **When adding a screen, check that something in the running UI navigates to it** — "the notification opens it" is not a route users can find. Send cards now route to `/send-reminder`; the trade is that tapping a send card no longer opens the editor.

**3. Reserve a trailer's length BEFORE truncating the body, not after.** `composeMessage` (`utils/inviteNudges.ts`) now appends both a `— Name` signature and the invite nudge. Appending the signature after the nudge-aware truncation would push an already-capped message back over `MAX_MESSAGE_CHARS` and fail the Android intent-URI send outright. Both trailers are short and fixed; the body is the only arbitrarily-long part, so it is the only part that may be cut. One combined `trailerCost` is subtracted up front.

**4. Do not extract a hook out of `QuickAddInput`'s mic.** `hooks/useDictation.ts` is used by `app/add-reminder.tsx` only. QuickAddInput deliberately keeps its own copy because it shares the recognizer with `expo-share-intent` audio transcription: every start/stop there must consult `micSourceRef` first and must never stop a transcription in flight (see Finding 2b in that file). Folding that branch into the shared hook would push a concern the hook's only other caller cannot reach onto every caller. **The duplication is the cheaper side of this trade.**

**5. Sequence first-launch sheets explicitly; do not race them.** The name prompt (`components/NameOnboarding.tsx`) is gated behind a `readyForNamePrompt` flag that `app/_layout.tsx` sets only after permission onboarding resolves. Rendering it unconditionally puts it *behind* the system permission dialog, where the tap dismissing that dialog also skips the name prompt — permanently, since skipping is recorded as answered. Its `@name_prompt_v1` key is deliberately separate from `PERMISSION_ONBOARDING_KEY`: sharing one key would mean anyone who granted permissions before this feature existed is never asked their name.

**6. An optional personalization must not cost the user information.** The first cut of the greeting header replaced the "N upcoming" subtitle with "tap to add your name" — making the app *less* useful to anyone who skipped onboarding. The count now always renders; the greeting line itself carries the tap target. **When a feature has a skippable setup, check that the un-set state is no worse than before the feature existed.**

**Also worth keeping:** `APP_STORE_URL` in `utils/appShare.ts` is an intentionally empty placeholder until first store publish, and `buildAppShareMessage` **omits the link line entirely** rather than emitting an empty or dead URL — an unreleased build shares clean text. Fill it in at publish; a test pins the omission.

**WHERE:** `services/{notificationResponseHandler,ReminderService}.ts`, `components/{ReminderCard,QuickAddInput,NameSheet,NameOnboarding}.tsx`, `hooks/useDictation.ts`, `utils/{inviteNudges,greeting,appShare}.ts`, `app/{_layout,send-reminder,add-reminder}.tsx`, `app/(tabs)/{index,settings}.tsx`. Commits `53bc7b9`..`7f41cf2`.

---

## 2026-08-17 — Expo Router path types are GENERATED, and splitting a list section silently breaks its header count

Two traps from building M4 Tier 1's UI. Both produce a *plausible* wrong result rather than an obvious failure.

**1. A new route file fails typecheck until Expo regenerates its types.** Adding `app/send-reminder.tsx` and pushing to it gave `TS2820: Type '"/send-reminder"' is not assignable to ... Did you mean '"/add-reminder"'?` — which reads like a typo in the pathname. It is not. Expo Router's typed-routes union lives in the **generated** `artifacts/mobile/.expo/types/router.d.ts`, which does not know about a file the CLI has not seen. Fix: run any Expo CLI command that regenerates types (`npx expo customize tsconfig.json` was enough here) and re-run `tsc`. **Do not "fix" this by casting the pathname or widening the type** — that discards the typed-route guarantee for every route, to work around a stale cache. Same family as the prebuild-generated `android/` trap: the file is a build artefact, not source.

**2. Partitioning a rendered list breaks any count derived from one half.** The home screen's subtitle read `${upcoming.length} upcoming`. Adding a "Sending" section split the incomplete reminders into `sending` + `upcoming`, so creating a send reminder made the visible count **go down**. Nothing errored; the number was simply wrong. **Rule: when splitting one collection into N rendered sections, grep for every consumer of the original variable — headers, counts, empty-state conditions — because each one silently keeps measuring a now-smaller set.** There is a regression test pinning that the subtitle counts both.

**3. A plan's prose can hold tasks its task-table doesn't.** `docs/superpowers/plans/2026-08-09-remind-someone-else-tier1.md` specifies widening `scheduleNotification`'s `Pick` to carry `recipient` (so the lock screen reads "Message Priya", not "Reminder!") in its **Data model** section — there is no task for it in the table at the bottom. Working the table alone ships without it. Same shape as the 2026-08-09 header-date gap, where the behaviour was named in a task *title* and absent from its steps. **When executing a plan, read its design sections for requirements, not just its task list.**

**Also worth keeping:** the send screen's invite-nudge toggle appends/removes only the **exact** stored line and **disables itself** when that line is no longer present verbatim. Attempting a fuzzy removal on text the user has edited themselves risks mangling their message — a disabled control is the better failure.

**WHERE:** `app/send-reminder.tsx`, `app/(tabs)/index.tsx`, `components/{ContactPickerModal,ReminderCard}.tsx`, `services/{notificationResponseHandler,ReminderService}.ts`, `.expo/types/router.d.ts` (generated). Commits `32b198d`..`bc31e19`.

---

## 2026-08-16 — A manual Jest mock does NOT satisfy `tsc`; install the package before the module that imports it

**WHAT:** building M4 Tier 1 (`docs/superpowers/plans/2026-08-09-remind-someone-else-tier1.md`). The plan deliberately sequenced T10 (`pnpm add expo-contacts`) **last**, "so it doesn't block T1–T9's testable work". That ordering is wrong: T7 (`services/ContactsService.ts`) does `import * as Contacts from "expo-contacts"`, and while `__mocks__/expo-contacts.ts` makes **Jest** pass, `pnpm run typecheck` still fails on the unresolved module. Had to install `expo-contacts ~15.0.11` before T7.

**GENERAL RULE:** a manual mock in `__mocks__/` satisfies the *test runner* only. Any task that adds a module importing a not-yet-installed package must be sequenced **after** the install, no matter how pure and unit-testable its own logic is. When writing a plan, look at which tasks introduce a new `import` of a third-party package — that, not the task's testability, sets the ordering constraint.

**Three product decisions worth keeping (all deliberate, all look wrong at a glance):**

1. **Phone numbers are normalized at SEND time, never on save.** Contact strings vary wildly (`+91 98765 43210`, `098765 43210`, `9876543210`). Normalizing on save bakes the heuristic into stored data permanently; normalizing at send means fixing `utils/phoneNumber.ts` repairs every existing reminder with **no migration**.
2. **An explicit `+` prefix must beat the device region**, and the calling code comes from `getLocales()[0].regionCode`, never a hardcoded `91`. An NRI on a US phone storing a `+91` contact is the exact case a hardcoded country code breaks — and this app's Malayalam support means that cohort is real, not hypothetical.
3. **No automatic WhatsApp → SMS fallback chain.** `Linking.openURL` resolving means *an app opened*, not that a message was composed, so an automatic chain fires for cases that actually worked. Both buttons are shown instead, with emphasis swapping when normalization fails. Related: use the **`wa.me` universal link, not `whatsapp://`** — the scheme needs an iOS `LSApplicationQueriesSchemes` entry and hard-fails without one, while `wa.me` degrades to a browser install page.

**FIFO-eviction trap:** capping the `@invite_nudge_count_v1` map by deleting the oldest keys evicts the entry you *just wrote* whenever it was already present (JS objects preserve insertion order, and re-assigning an existing key does **not** move it to the end). The write must `delete` then re-add its own key after trimming, or the counter silently resets for the most active contact.

**WHERE:** `services/ReminderService.ts` (`ReminderRecipient`, `isSendReminder`, nudge-count persistence), `utils/phoneNumber.ts`, `utils/inviteNudges.ts`, `services/messageLinks.ts`, `services/ContactsService.ts`, `app.json`. Commits `7aadc29`..`6b7921a`.
## 2026-08-15 — Notification spam after a snooze: `getLastNotificationResponseAsync()` is not a queue drain

**Symptom:** one Snooze press on a reminder that had already fired produced six identical notifications, all showing "Now".

**ROOT CAUSE — three faults that only spam when combined:**

1. **The snooze branch of `handleNotificationResponse` never cancelled anything.** It scheduled a new notification and called `updateSnoozeById`, which *overwrites* the stored `notificationId`. Whatever that field pointed at before became an orphan — the same orphan class as the 2026-08-09 entry, created on a different path.
2. **Two handlers, two independent dedupe refs.** The headless TaskManager task (`tasks/notificationResponseTask.ts`, which Android runs whenever the app is not foregrounded) and the React listener (`components/NotificationResponseHandler.tsx`) both receive the same response. Each had its own in-memory `lastHandledId`, so neither could see the other's work — one press, two snoozes.
3. **`getLastNotificationResponseAsync()` replays.** It is not a drain: it keeps resolving with the *same* response on every launch until a newer response replaces it (expo's own docs describe `clearLastNotificationResponse` as the fix for "it is undesirable to continue selecting the route after the response has already been handled"). The guarding ref is `useRef(null)` recreated on every mount, so each cold start snoozed again. Nothing capped this.

Fault 3 is the multiplier, faults 1+2 turn each replay into a permanently armed extra alarm. `rescheduleAllFutureReminders`' orphan sweep cannot clean these up: it skips any reminder whose delivery time has passed, which is every reminder that has already fired — i.e. exactly the ones being snoozed.

**Why they landed in the same minute:** the copies were staggered across the replays, but expo falls back to inexact `setAndAllowWhileIdle` without the exact-alarm permission (the reason `ExactAlarmBanner` exists), and Android batches deferred inexact alarms into one wake.

**FIX (four parts):**
1. `services/handledResponses.ts` — AsyncStorage-backed capped ring of handled response identifiers, checked and written inside `handleNotificationResponse`. This is the only dedupe that crosses both the process boundary and app restarts. **Marked before the action runs, deliberately at-most-once**: a crash between the two loses one snooze, which beats unbounded spam.
2. The snooze branch now calls `cancelScheduledForReminder(reminderId)` **and** `cancelNotification(reminder.notificationId)` before scheduling. Order matters — sweeping after scheduling would cancel the new notification.
3. The component clears the cold-start response after handling it, so the native side stops re-offering it.
4. `scheduleSnoozeNotification` clamps its trigger to `max(now, target - offset)`, matching `scheduleNotification`. A DATE trigger in the past is delivered *immediately*, so an unclamped target inside the 60s offset window turned a snooze into an instant re-alert.

**Generalizable rule:** an in-memory dedupe ref is worthless against a replayed OS callback. If the OS can hand you the same event in a fresh JS context — headless task, cold start, process restart — the dedupe has to live in storage, and any handler that *replaces* a scheduled resource must cancel by payload before it creates the replacement.

**Related:** `SUPERSEDES` nothing; the 2026-08-09 duplicate-notification fix was correct but only covered the `rescheduleAllFutureReminders` path.

---

## 2026-08-15 — A hand-written timestamp in a state file that drives `git log --since` fails SILENTLY

**WHAT:** the `/catchup` skill writes `.claude/catchup-state.md` with a `last_run`
timestamp, which the next run feeds to `git log --since=…`. The first end-to-end run
wrote that timestamp by hand and landed **10 minutes in the future** (`03:20:00Z`
guessed vs `03:09:43Z` actual).

**WHY IT MATTERS:** a future-dated `--since` is not an error. `git log` returns **zero
commits and exit 0**, so the next briefing would confidently report "nothing changed"
while real work sat in the window. The failure is invisible from the output alone —
the only tell was an explicit gap computation coming out **negative**.

**FIX:** generate the value, never author it —
`date -u +%Y-%m-%dT%H:%M:%SZ` — and sanity-check afterwards that
`git log --since=<written value>` still returns something plausible.

**GENERAL RULE:** never hand-write a timestamp that will later be used as a query
bound. A model has no reliable clock, and every "no results" answer downstream looks
identical to a legitimately empty result. This is the same shape as the mis-named test
entry (2026-08-09): the artefact reads as working precisely because the failure mode
produces a plausible-looking success.

**WHERE:** `.claude/skills/catchup/SKILL.md` Step 4, commit `47b0689`.

---

## 2026-08-14 — Claude Code transcript mtimes on this machine are bulk-touched; never use mtime to pick "the latest session"

**WHAT:** while designing the `/catchup` skill (spec: `docs/superpowers/specs/2026-08-14-catchup-skill-design.md`), found that four of the seven `*.jsonl` transcripts in `C:\Users\anand\.claude\projects\c--workspace-remindme\` share the identical mtime `Aug 5 11:17` — something touched them in bulk, so file mtime does not order sessions by recency.

**WHY IT MATTERS:** any tooling that selects "the most recent session" by mtime can pick an arbitrary file. The reliable ordering signal is the timestamp on each file's **last JSONL line** (`tail -1`, no full read needed — these files reach 14 MB). The same tail timestamp identifies the *currently running* session's transcript when it must be excluded.

**THREE MORE TRANSCRIPT-PARSING TRAPS**, all verified against the real files while planning the extractor — anything reading these transcripts hits all of them:

1. **`tail -1` does not give you the last timestamp.** The final JSONL line is frequently `{"type":"custom-title"}` or a `queue-operation`, neither of which carries a `timestamp`. Scan backwards for the last line that has one. Reading the trailing 64 KB is enough and keeps this fast on a 14 MB file.
2. **`type:"user"` is mostly NOT human turns.** The same type carries `tool_result` blocks, `isMeta` injections (skill preambles, `<local-command-caveat>`), IDE tags (`<ide_selection>`, `<ide_opened_file>`), and sidechain/subagent turns. In one sampled session only 1 of the first 15 `user` entries was real human intent. Filter on `!isMeta && !isSidechain`, keep only `text` blocks, then strip the wrapper tags.
3. **Keep the FINAL assistant text block.** Dropping all assistant prose looks right for token cost but destroys the "did this session end cleanly" signal — the last *human* turn is often just "yes". The final assistant message is 800–1,900 chars and routinely states "Next: …" outright.

**Measured result:** 14,445,710 bytes → 19,523 chars (~740:1). `jq` is unavailable in this Git Bash env (as noted elsewhere in this ledger) but Node v24 is, and `node:test` is built in — no new dependency needed, which also avoids the `minimumReleaseAge` wait.

**WHERE:** implemented in `.claude/skills/catchup/transcript.js` (`lastActivityTs`, `selectSession`, `extract`), with regression tests pinning all three traps in `transcript.test.js` — including one asserting that content-timestamp ordering beats a deliberately newer mtime.

---

## 2026-08-10 — A context read by `ErrorFallback` must not throw when its provider is missing

**WHAT:** added the in-app Light/Dark/System override (Settings → Appearance, `@theme_preference_v1`, default `"system"`). New `contexts/ThemeContext.tsx`; `useColors()` now resolves `preference === "system" ? systemScheme : preference`.

**WHY IT IS ITS OWN CONTEXT AND NOT A FIELD ON `RemindersContext`:** `ErrorFallback` calls `useColors()`, and it renders **inside** `ErrorBoundary`, which in `app/_layout.tsx` **wraps** all the providers. So `useColors()` can legitimately run with no provider above it. The house style — `useReminders()` throws `"must be used within RemindersProvider"` — is exactly wrong here: it would turn *any* caught error into a **crash while rendering the crash screen**, replacing a readable error page with a hard failure. `useThemePreference()` therefore returns the `"system"` default when the context is null instead of throwing, and there is a test asserting `useColors()` works bare.

**Placement matters too:** `ThemeProvider` goes **outside** `ErrorBoundary`, so a crash screen still honours the user's chosen theme rather than snapping back to the system one.

**GENERAL RULE:** before writing the standard throw-if-missing context hook, ask *what renders above this provider*. Anything reachable from an error boundary, a splash screen, or a suspense fallback needs a safe default rather than a throw. The throw is right for feature contexts; it is wrong for anything the failure path itself depends on.

**Also note:** `setPreference` sets state *before* awaiting `AsyncStorage.setItem`, so the repaint is immediate rather than waiting on a disk write. Verified by a test that presses the pill and asserts the new colour without any explicit flush. No other test file needed a `ThemeProvider` added — the null-fallback keeps all 25 suites green, which is itself evidence the fallback works.

**WHERE:** `contexts/ThemeContext.tsx` (+ test), `hooks/useColors.ts`, `app/_layout.tsx`, `app/(tabs)/settings.tsx`, `__tests__/screens/settings.test.tsx`.

---

## 2026-08-10 — Dark mode: `app.json` and the StatusBar are separate blockers, and asserting a colour against its own token proves nothing

**WHAT:** implemented dark mode (M1). Added a `dark` palette to `constants/colors.ts`, flipped `app.json`'s `userInterfaceStyle` from `"light"` to `"automatic"`, changed `<StatusBar style="dark" />` to `style="auto"`, and replaced all 15 hardcoded hex colours in UI files with tokens.

**FOUR SEPARATE THINGS ALL HAD TO CHANGE** — fixing any one alone leaves the app in light mode, which is why this looked bigger than "just add a palette":
1. `constants/colors.ts` had no `dark` key, and `useColors()` was written to fall back to light when it was absent (documented as intended for the scaffold).
2. **`app.json` pinned `"userInterfaceStyle": "light"`**, which forces the OS to report light to the app no matter what the user set. Easy to miss because it is nowhere near the colour code.
3. **`<StatusBar style="dark" />` was hardcoded** in `app/_layout.tsx` — dark icons on a dark bar means an invisible clock and battery. `"auto"` follows the scheme.
4. Hardcoded hex literals scattered across 7 files bypassed the tokens entirely and would have stayed light-mode colours.

**THE TEST TRAP, worth internalising:** the first version of the dark-mode screen test asserted `expect(flat.color).toBe(colors.dark.foreground)`. That **passes even when the dark palette contains light-mode values**, because the assertion follows the token wherever it goes — it only proves "the dark palette was used", never "the dark palette is dark". Verified by temporarily setting `dark.foreground` to the light value: the token-comparison test still passed while the screen was unreadable. Fixed by asserting the **literal** expected value plus `not.toBe(theOtherPalette)`. **Generalizable: a test that compares a rendered value against the same constant the code reads is a tautology.** Same family as the 2026-08-09 "test named for a behavior it never asserts" entry.

**Palette design notes (not arbitrary):** derived from the light tokens, not inverted. The brand indigo is *lightened* (`#6366f1` → `#818cf8`) because the original is too low-contrast on near-black. Surfaces step **up** in lightness with elevation (background `#121218` < card `#1c1c25` < muted `#25252f`) since shadows are invisible against a dark ground. Two token pairs were added for cases that had none rather than reusing a near-miss: `destructiveBorder` (overdue card border) and `warningSurface`/`warningSurfaceForeground` (exact-alarm banner, a tinted surface — distinct from `warning`/`warningForeground`, which are for a solid warning-coloured control).

**Guard added:** `hooks/useColors.test.ts` asserts the two palettes define **exactly the same token names**. A key present in light but missing in dark resolves to `undefined`, which React Native renders as no colour — usually black on black, and *only on dark-mode devices*, so it would never show up in normal testing.

**Legitimately left alone:** `shadowColor: "#000"` in `ErrorFallback` — shadows are cast in black in both schemes.

**WHERE:** `constants/colors.ts`, `hooks/useColors.ts` (+ new test), `app.json`, `app/_layout.tsx`, `app/reminder-detail.tsx`, `components/{ReminderCard,QuickAddInput,ConfirmSheet,ExactAlarmBanner}.tsx`, `__tests__/screens/settings.test.tsx`.

---

## 2026-08-10 — `now.getDate() + 1` is wrong on the last day of every month

**WHAT:** `utils/formatDatetime.ts` had **no test at all** (found by auditing logic files against test files). Writing one exposed a real bug: the "Tomorrow" check compared `d.getDate() === now.getDate() + 1`, so on 31 August it looked for date 32 and never matched. Every "Tomorrow" label on the 28th–31st silently rendered as a date instead, and the same broke across year end.

**FIX:** build tomorrow as a real `Date` (`setDate(getDate() + 1)`, which normalises the rollover) and compare day/month/year via a shared `isSameDay` helper.

**RULE:** never do calendar arithmetic on the *component parts* of a date. Add to a `Date` and let it normalise. Any `getDate() + n`, `getMonth() + n`, or `getFullYear() + n` in a comparison is a boundary bug waiting for the end of the month.

**PROCESS NOTE:** this was found by a coverage audit, not by a bug report — comparing every file in `services/`, `utils/`, `contexts/` against its test file. That audit found exactly one genuine gap and it contained a real bug, which is a good argument for repeating it after adding files.

**WHERE:** `utils/formatDatetime.ts`, `utils/formatDatetime.test.ts` (new).

---

## 2026-08-10 — AsyncStorage is SQLite (`RKStorage`), so Android Auto Backup already covers it — and `allowBackup` is on by default

**WHAT:** researched whether Android Auto Backup can replace Google Drive sync (backlog item 1). Not implemented — findings recorded because the test is deferred (backlog D1) and this is expensive to re-derive.

**THE KEY FACT, verified from source not docs:** AsyncStorage on Android is **not** shared preferences — it is SQLite. `ReactDatabaseSupplier extends SQLiteOpenHelper` with `DATABASE_NAME = "RKStorage"`, so it lands in `getDatabasePath()`. Android documents **database files as included in Auto Backup by default**, and `android:allowBackup="true"` is **already in our generated manifest** (Expo emits it; nothing was configured). So the app may already have silent cloud backup — worth knowing before building anything Drive-shaped.

**Why Auto Backup beats a Drive integration for this app:** data goes to the user's own Drive via the *device's* Google account — no OAuth, no Cloud project, no sensitive-scope review, no account model, no server. 25 MB/app, doesn't count against the user's quota, restores automatically at install. A Drive API integration buys the same outcome and breaks the "no sign-up" property.

**TWO TRAPS THAT PRODUCE FALSE NEGATIVES** (both cost someone in the async-storage repo a long debugging session):
1. **Uninstalling does not trigger a backup.** Android backs up on its own schedule (idle + Wi-Fi + 24h). It never captures the state right before an uninstall. Force it with `adb shell bmgr backupnow <pkg>` or you are restoring stale data.
2. **Restore lands after install and BEFORE first launch.** Opening the app early makes a working restore look broken.
   (Third, from that same report: a package-name mismatch between manifest and installed app silently breaks it.)

**LIMITS worth remembering:** backup, not sync — one device, restored at install time; only the most recent backup is kept; Android-only; silent whenever any precondition fails (backup disabled, no Google account, never idle/Wi-Fi). On a battery-aggressive OEM ROM the preconditions may simply never be met, so **it is a bonus, never a promise** — do not ship copy claiming automatic backup without testing on a mid-range OEM device. Manual export stays primary: it is the only path identical across devices and the only one that works on iOS.

**Future gotcha:** if `expo-secure-store` is ever added (likely for M4 Tier 2 auth) it **must** be excluded from Auto Backup — its keys are destroyed on uninstall and cannot be decrypted after a restore. The library auto-configures this *unless* custom backup rules exist, which they would by then.

**WHERE:** `backlog.md` (D1 has the full adb procedure), `artifacts/mobile/app.json` / generated `AndroidManifest.xml`. No source change.

---

## 2026-08-10 — De-duplicate by CONTENT, not id; and an `a.id === b.id` fast path silently swallows the collision case

**WHAT:** added manual backup/restore (backlog item 1). `utils/reminderBackup.ts` holds pure serialize/parse/merge; `buildBackupJson`/`importRemindersFromJson` in `ReminderService.ts` wrap it with storage and scheduling.

**THE MERGE RULE AND WHY:** identity is **content** — same title (trimmed, lowercased) at the same *instant* (`Date.parse`, so `...:00Z` and `...:00.000Z` match) — never id. Matching on id alone misses the most common restore path: export → reinstall → re-type a few reminders from memory → import, where the re-typed copy is the same reminder to the user but has a fresh id. Local always wins on conflict, so a restore can never un-complete a reminder the user has since ticked off.

**THE TRAP (caught by a test, and it is subtle):** `isSameReminder` originally opened with `if (a.id === b.id) return true;` as an obvious fast path. It is not a fast path, it is a **behaviour change** — it makes two *genuinely different* reminders that happen to share an id compare as equal, so one gets silently dropped as a "duplicate" instead of being re-id'd. The id-collision test failed on exactly this. **Generalizes: in an equality predicate, a short-circuit on a field that is not part of the equality definition is a bug, not an optimization.** Verified by restoring the line and confirming that one test — and only that one — failed.

**Other decisions worth keeping:**
- `notificationId` is stripped on export and on merge. It refers to a notification scheduled on the *exporting* device and is meaningless on the importing one.
- Import calls `rescheduleAllFutureReminders()` rather than scheduling inline — it already skips completed and past reminders and handles the `ALARM_EARLY_OFFSET_MS` window correctly (see the 2026-08-09 duplicate-notification entry). Imported reminders arrive with no `notificationId`, so there is nothing to cancel first.
- `parseBackup` requires a `format` sentinel (`curiousmind.reminders.backup`), not just a `reminders` array — plenty of unrelated JSON would match the latter. A bad file touches storage **not at all**; picking the wrong document must be a no-op, not a partial import.
- A backup from a *newer* version is rejected outright rather than imported minus the fields this build doesn't know about.
- **No new dependency on purpose.** Export uses `Share.share`, import is paste-into-a-TextInput. `expo-document-picker` would have meant a native build, and this was a ship-blocker that needed to go out over-the-air.

**Context gotcha:** `RemindersProvider` loads reminders once at mount, so a restore writing straight to AsyncStorage left the list stale on screen. Added `refreshFromStorage()` to the context and extracted the mount load into a shared `loadFromStorage` callback so the two paths can't drift.

**WHERE:** `utils/reminderBackup.ts` (+ test), `services/ReminderService.ts` (`buildBackupJson`, `importRemindersFromJson`), `contexts/RemindersContext.tsx` (`refreshFromStorage`), `app/(tabs)/settings.tsx` (backup/restore rows + restore modal).

---

## 2026-08-09 — India's booking platforms are all closed to consumer apps; MCP does not route around an approval gate

**WHAT:** investigated integrating ride/turf/movie booking into reminders (M5 sub-item and M7 in `backlog.md`). All three targets are closed. Recording the findings so nobody re-runs this research.

**WHAT WAS VERIFIED (2026-08-09):**
- **BookMyShow** — no official public API, no partner program. Everything available is scraping (Apify, Parse.bot) or reverse-engineered GitHub projects. ToS-violating and breaks without notice. **Not viable.**
- **Hudle / Playo** (turf) — document integration for *venue partners* only, not consumer apps. No public API spec.
- **Uber** — requesting a ride is a **privileged scope requiring approval** through a business-development contact. Not self-serve.

**THE NON-OBVIOUS PART — "just use the Uber MCP server" does not work.** The community MCP servers on GitHub are **unofficial wrappers over that same gated REST API**; one of them ships a *mock* interface with deep-link fallback precisely because real access usually isn't granted. **MCP is a protocol for calling APIs, not for being authorized to call them** — it cannot grant a scope the developer doesn't have. It also requires a model in the loop (server + per-call cost), which would spend this app's "on-device, no account, no network" property to buy a commodity feature. Generalizes: whenever an integration is blocked by *permission* rather than *plumbing*, no protocol or wrapper fixes it — check the scope/approval model before designing anything on top.

**ARCHITECTURAL CONSEQUENCE (and it's the right design anyway):** own the coordination, deep-link the transaction — `Linking.openURL`, the same pattern M4 Tier 1 uses for `wa.me`. Do **not** build a booking integration.

**Market note worth keeping:** Uber is not India's default — Ola, Rapido and Namma Yatri hold serious share, and Rapido's bike taxis cover exactly the short hops a reminder would trigger. Any single-provider ride integration addresses a minority of users.

**WHERE:** `backlog.md` (M5 sub-item, M7). No source change.

---

## 2026-08-09 — "Two different types with this name exist" means two copies of @types/react, and the culprit is pnpm's *hoisted* copy

**WHAT:** `pnpm run typecheck` failed in `artifacts/mockup-sandbox` (2 errors in `calendar.tsx` and `spinner.tsx`) with `TS2322: ... Two different types with this name exist, but they are unrelated` on `Ref` / `VoidOrUndefinedOnly`. Fixed by pinning **one** `@types/react` for the whole workspace via `overrides` in `pnpm-workspace.yaml`.

**ROOT CAUSE:** two copies coexisted — `19.1.17` (because `artifacts/mobile` pins `~19.1.10` for Expo SDK 54) and `19.2.14` (because the catalog asks `^19.2.0`). The non-obvious part is *how the old one reached the sandbox*: `recharts`, `react-day-picker`, `react-hook-form` and `react-resizable-panels` declare **no `@types/react` of their own**, so they resolve nothing locally and walk up to pnpm's hoisted copy at `node_modules/.pnpm/node_modules/@types/react` → `19.1.17`. The sandbox's own source resolved `19.2.14`. Any type crossing that boundary (`react-day-picker`'s `rootRef`; svg props spread into a `lucide-react` icon) compares two structurally identical but nominally unrelated types. **The source code was never wrong.**

**HOW TO DIAGNOSE THIS CLASS FAST:** `tsc --traceResolution` and count the copies — `npx tsc -p tsconfig.json --noEmit --traceResolution | grep -oE "@types\+react@[0-9.]+" | sort | uniq -c`. Two lines means two copies; then `grep -B8` the old version and read the `======== Resolving` lines to see which packages pull it. This turns a wall of unreadable type text into a package list in one command.

**FIX:** `overrides: "@types/react": "19.1.17"` (+ `@types/react-dom": "19.1.11"`). Pinned to the **19.1 line, not 19.2** — the React Native app is the higher-risk consumer and Expo expects that line; the sandbox compiles fine against it. Collapsing the duplicate graph removed ~700 lines from `pnpm-lock.yaml`.

**RULE:** in a pnpm workspace, any type-only package consumed by more than one workspace member (`@types/react`, `@types/node`) needs a single pinned version in `overrides`, not per-package pins plus a catalog — those two mechanisms disagree silently and the resulting error names neither package. If you raise this pin, raise `artifacts/mobile`'s in the same commit.

**WHERE:** `pnpm-workspace.yaml` (`overrides`, with the full explanation inline), `pnpm-lock.yaml`.

---

## 2026-08-09 — The Bash tool is Git Bash, so PowerShell here-strings silently corrupt commit messages

**WHAT:** a `git commit -m @'...'@` through the **Bash** tool produced a commit whose subject line began with a literal `@`. Fixed with `git commit --amend -F - <<'EOF' ... EOF`.

**ROOT CAUSE:** this environment offers two shells with different syntax, and the repo's own docs describe the PowerShell one. PowerShell's here-string (`@'...'@`) is the correct way to pass a multi-line commit message *via the PowerShell tool*. The Bash tool runs Git Bash (POSIX sh), where `@'` is not syntax at all — it's just an at-sign followed by a quoted string, so the `@` becomes the first character of the message and the closing `'@` is swallowed as trailing text. **Nothing errors.** The commit succeeds and looks fine until you read `git log`.

**FIX / RULE:** match the heredoc form to the tool. Bash tool → `-F - <<'EOF'`. PowerShell tool → `@'...'@` with the closing delimiter at column 0. When a commit message is multi-line, read back `git log -1 --format=%s` before moving on — a mangled subject is invisible from the commit's own success output, which prints only the truncated first line.

**Related trap in the same session:** the working directory persists between Bash calls, so an earlier `cd artifacts/mobile` made a later bare `ls -a` report the *mobile* directory while it read as a repo-root listing. Prefer absolute paths (or a leading `cd /c/workspace/remindme`) in any command whose output you intend to interpret as "the repo root".

**WHERE:** commit `d85ce5e` (amended). No source change.

---

## 2026-08-09 — Independent settings need one channel per COMBINATION, and `useState(prop)` never resyncs

Three device-reported bugs from the same build, two sharing a root cause worth generalizing.

**1. Vibration setting did nothing while sound was on.** `channelIdForAlarm(alarm, vibrate)` returned `"reminders-alarm"` whenever `alarm` was true, discarding the `vibrate` argument — on the theory that "the alarm channel's vibration is part of its own immutable config." That theory made the setting a **no-op in its most common state**: sound defaults on, so the ordinary user toggling vibration off saw no change. Android channel config is immutable by ID, so N independent notification settings need **2^N channels**, one per combination — there is no way to express a combination by editing a channel at runtime. Now four: `reminders-alarm`, `reminders-alarm-novibrate`, `reminders-vibrate`, `reminders-silent`. Also note `vibrationPattern` alone does not enable vibration — set `enableVibrate: true` explicitly (the alarm channel was missing it; existing installs keep the old config forever, so this only helps new ones).

**2. `useState(someProp)` seeds once and never updates.** `QuickAddInput` did `useState(defaultAlarmEnabled)`. It lives on the home screen and **never unmounts**, and the setting loads asynchronously *after* mount — so the initial load and every later Settings change were both invisible to it. Fix: a `useEffect` syncing on change, guarded by a `useRef` "user has touched this" flag so a deliberate per-reminder override isn't clobbered. **Any `useState(x)` where `x` is a prop or context value is a resync bug waiting to happen unless the component remounts.**

**3. Hardcoded reset after save.** The same screen did `setAlarm(true)` after saving, ignoring the user's default — a lit bell with sound off. Trivial once seen, invisible for weeks because **the component had zero alarm-state tests**.

**Layout note (same build):** the multiline-input change set `alignItems: "flex-end"` on the quick-add row, which is right for the growing TextInput but pushed the mic/notes/alarm/save icons to the bottom of a tall capsule. Fix: wrap the buttons in their own `flexDirection: "row"` + `alignItems: "center"` group with a `minHeight` matching the button size, so they align to *each other* rather than the row baseline.

**WHERE:** `services/ReminderService.ts` (`channelIdForAlarm`, `setupNotificationChannel`), `components/QuickAddInput.tsx` (alarm state + `actionRow`), tests in `services/ReminderService.test.ts` and `__tests__/components/QuickAddInput.test.tsx`.

---

## 2026-08-09 — A test named for a behavior it never asserts is how the header date shipped missing

**WHAT:** the home screen header was meant to show the current date beside "Today" (mockup 2a). It shipped without one and stayed that way until a user asked. Added `utils/formatHeaderDate.ts` and wired it into `app/(tabs)/index.tsx`.

**ROOT CAUSE — the gap was in the plan, not the implementation.** Task 3 of `docs/superpowers/plans/2026-08-03-mockup-2a-restyle.md` is titled *"Today title + date/count subtitle"*, but the markup it specifies in Step 3 reuses the previous subtitle logic verbatim (`"N upcoming"` / `"All caught up!"`). The date exists in the task's title and nowhere in its code. An implementer following the steps exactly — correct behavior — produces a header with no date.

**Why nothing caught it:** the accompanying test was named `"shows a 'Today' header with a date and upcoming-count subtitle"` and asserted only `"Today"` and `"2 upcoming"`. **A test named for a behavior it doesn't check is worse than no test — it reads as coverage in every later audit.** When a test name mentions something, grep the body for an assertion on it.

**Also note:** the rest of that restyle (`headerRow`, `headerAvatar`) *was* applied to `index.tsx`, yet the plan file itself is still untracked and uncommitted — so don't assume an uncommitted plan is unimplemented, or that a committed screen matches its plan.

**Formatting decision:** month names are spelled out in the util rather than using `toLocaleDateString`. The required shape ("08, August 2026" — padded day, comma, full month, year) isn't reachable from one locale format, and `Intl` month names follow the *device* locale, which would silently render the header in Malayalam on a Malayalam-set phone.

---

## 2026-08-09 — Duplicate notifications: the early-trigger offset opens a 60s window where a delivered reminder still looks "pending"

**Symptom:** two identical notifications for the same reminder, both showing "Now".

**ROOT CAUSE:** `scheduleNotification` fires the trigger `ALARM_EARLY_OFFSET_MS` (60s) *before* the reminder's `datetime`, to counter Doze delivery lag. So for that final minute the notification has **already been delivered** while `datetime > now` is still true. `rescheduleAllFutureReminders` (BackgroundFetch, every 15 min) guarded only on `datetime <= now`, so inside that window it treated the reminder as pending, "cancelled" it — a no-op, since `cancelScheduledNotificationAsync` only stops a *pending trigger* and cannot un-deliver a notification already in the tray — and scheduled a second copy, which fired immediately.

**The compounding failure:** the new id then overwrote `notificationId` in AsyncStorage. Every cancel path in this service keys off that single stored id, so the first notification became an **orphan nothing could ever cancel** — it would keep being re-armed on later reschedules.

**FIX (two parts, both needed):**
1. The reschedule guard subtracts the offset: `datetime - ALARM_EARLY_OFFSET_MS <= now` → skip.
2. `cancelScheduledForReminder(reminderId)` sweeps `getAllScheduledNotificationsAsync()` and cancels every request whose `content.data.reminderId` matches, instead of trusting the stored id. This makes orphans already on users' devices self-healing.

**Generalizable rule:** whenever a scheduled time is deliberately offset from a logical time, **every guard comparing "has this happened yet" must use the same offset**. Comparing against the logical time is off by exactly the offset window.

**Testing note:** `getAllScheduledNotificationsAsync` was missing from `__mocks__/expo-notifications.ts`, so the sweep would have silently no-opped in tests while looking correct. When adding a code path that calls a new notification API, check the mock exports it — an absent mock function fails as `undefined`, not as a visible error.

---

## 2026-08-09 — Notification action buttons need a TaskManager task; a React listener alone is a no-op when the app is closed

**Symptom:** "Mark Done" on a fired reminder's notification did nothing. Tapping it dismissed the notification but the reminder stayed incomplete — though it often *did* apply later, once the app was next opened, which made it look intermittent.

**ROOT CAUSE:** `MARK_DONE_ACTION_ID` sets `opensAppToForeground: false`, so Android delivers the action without launching the app. The only response handler was `addNotificationResponseReceivedListener` registered inside a React `useEffect` (`components/NotificationResponseHandler.tsx`) — which by definition only exists while the app is running. No JS ran at all.

expo-notifications' own Android source says this explicitly, in `ExpoHandlingDelegate.handleNotificationResponse`:
> "NOTE the listeners are not set up when the app is killed and is launched in response to tapping a notification button — this code is a noop in that case"

and in the same function: `if (!isAppInForeground()) { runTaskManagerTasks(...) }`. **A TaskManager task is the supported path for headless action buttons on Android** — not only for remote push, which is how the docs read at first glance.

**Why it looked intermittent:** the native side queues unhandled responses in `sPendingNotificationResponses`, and `getLastNotificationResponseAsync()` drains that queue on next launch. So the action was applied eventually — at next app open — rather than lost.

**FIX:** `tasks/notificationResponseTask.ts` — `TaskManager.defineTask` at module load (imported from `index.ts`, same pattern as `rescheduleTask.ts`), registered via `Notifications.registerTaskAsync`. Reuses the existing pure `handleNotificationResponse` with headless deps: no navigator, and a per-invocation dedupe ref since each wake gets a fresh JS context.

**Testing note:** `expo-task-manager` has no native module under Jest — importing anything that loads it throws `Cannot find native module 'ExpoTaskManager'`. Added `__mocks__/expo-task-manager.ts`, which also records defined tasks so the task body itself can be invoked in a test. iOS does not run background tasks for notification responses at all (expo matches that deliberately); there the foreground listener still handles them.

---

## 2026-08-09 — Android's large notification icon is only reachable from a config plugin, not from JS

**WHAT:** to show the app icon in the expanded notification, added `plugins/withLargeNotificationIcon.js` (registered in `app.json`).

**WHY NOT JS:** `ExpoNotificationBuilder.kt` sets the large icon from either (a) manifest meta-data `expo.modules.notifications.large_notification_icon`, or (b) `notificationContent.containsImage()`. Path (b) looks like a JS route but **`containsImage()` is implemented only by `RemoteNotificationContent`** (remote push, resolved from a download URL) — locally scheduled notifications never take that branch. So (a) is the only option, and `expo-notifications`' own config plugin exposes no setting for it.

**WHY NOT A MANUAL MANIFEST EDIT:** `artifacts/mobile/android/` is prebuild-generated and gitignored — a hand-edit is wiped by the next `expo prebuild` and can't be committed. Same class of trap as the CMake pin in CLAUDE.md.

**Don't confuse the two icons:** the small status-bar icon (`notification-icon.png`, set via the expo-notifications plugin's `icon` option) is **silhouetted by Android** — every non-transparent pixel becomes one flat tinted shape. A full-color app icon there renders as a solid square. That is platform behavior, not a bug, and it's why the large icon is a separate mechanism.

**Verify with:** `npx expo prebuild --platform android --no-install`, then check the meta-data line in `android/app/src/main/AndroidManifest.xml` and that `android/app/src/main/res/drawable-{m,h,xh,xxh,xxxh}dpi/large_notification_icon.png` all exist at 64/96/128/192/256px.

---

## 2026-08-09 — Malayalam agglutination, round 2: duration units, the -ഇൽ locative, and fused fraction hours

**WHAT:** three device-reported parser gaps, all the same underlying shape as the earlier `മണി` suffix issue.

1. **`മിനുട്ട്` (loanword) vs `മിനിറ്റ്` (native)** — `resolveDuration` only matched the latter. Speech recognizers emit both.
2. **The `-ഇൽ` locative** ("in five minutes") — only `കഴിഞ്ഞ്` was matched. **Bind `-ഇൽ` to the time unit, never treat it standalone**: it is an ordinary locative that appears on unrelated title words (`ഓഫീസിൽ` = "at the office"). There is a regression test pinning this.
3. **Fused fraction hours** — `അഞ്ചര` (5:30) is one token (`അഞ്ച്` + `അര`), so the two-token "അര + മണി" patterns never saw it. Likewise `നാലേ മുക്കാല്` (4:45), `അഞ്ചേ കാൽ` (5:15). These branches **must run before the bare-hour branch** or `അഞ്ചര` is partially eaten as `അഞ്ച്` (5:00), silently dropping the `ര`.

**Compounding symptom worth knowing:** `ഇന്ന് അഞ്ചു മിനുട്ടിൽ` resolved to *today 9:00 AM*. Not a separate bug — `ഇന്ന്` matched as a day, the duration didn't match, no clock time was found, so the `setHours(9,0,0,0)` day-default fired. **A wrong-looking time is often a missing match plus the 9 AM default, not a bad time calculation.**

**The chillu trap:** `ർ` is its own character, not `റ` + a sign. Writing `മണിക്കൂറ?` to make the ending optional matches `മണിക്കൂ` and strands a bare `ർ` in the title. Alternate whole endings instead: `മണിക്കൂ(?:ർ|റിൽ)`.

**A green test suite hid a real defect here.** The period-biased fraction branch built `matchedText` by joining `"<period> <fraction>"`, which `stripMatch` then couldn't find when the two words weren't adjacent (`രാവിലെ ഓഫീസിൽ അഞ്ചര`) — the replace silently no-opped and the whole phrase stayed in the title while the *time* resolved correctly. Every test passed because none used a non-adjacent phrase. `stripMatch` now takes several parts. **When a match spans words that need not be contiguous, strip each part independently rather than fabricating a span.**

---

## 2026-08-09 — `flex: 1` on a `Text` inside a nested column `View` makes the label invisible on device

**Symptom:** on the Settings screen, the row titles ("Play alarm sound by default", "Show description in notifications") were invisible on a real Android device — only the grey sub-label under each one rendered. Every test passed and the text was present in the rendered tree.

**ROOT CAUSE:** the shared `alarmLabel` style carried `flex: 1`. That was correct when the label was a direct child of the card's `flexDirection: "row"` container, but the markup had since moved it inside a nested `<View style={{ flex: 1 }}>` alongside its sub-label. In a **column** (RN's default `flexDirection`), `flex: 1` makes the title compete with the sub-label for *vertical* space and collapse to zero height. Rule: row-level flex belongs on the wrapping `View`, never on the `Text` that ends up nested inside it.

**Why it was invisible to the test suite:** Jest renders a tree, not pixels — `findByText` finds a zero-height element just fine. The existing settings tests only asserted the *sub*-labels, so nothing failed. The regression test added for this asserts `StyleSheet.flatten(label.props.style).flex` is `undefined`; a text query alone cannot catch a layout collapse.

**WHERE:** `artifacts/mobile/app/(tabs)/settings.tsx` (`alarmLabel` style + the three rows using it), test at `artifacts/mobile/__tests__/screens/settings.test.tsx`.

---

## 2026-08-07 — `artifacts/mockup-sandbox` typecheck fails on duplicate `@types/react`; it is NOT caused by your change

**Symptom:** `pnpm run typecheck` (repo root) exits 1 with `TS2322` in `artifacts/mockup-sandbox/src/components/ui/calendar.tsx` and `spinner.tsx`, complaining `Type 'VoidOrUndefinedOnly' is not assignable to type 'VoidOrUndefinedOnly'. Two different types with this name exist, but they are unrelated.` Output above it shows `artifacts/mobile typecheck: Done` — the mobile package is clean.

**ROOT CAUSE:** two copies of `@types/react` resolve in the pnpm store, so `React.Ref<T>` from one is structurally identical to but nominally distinct from the other. `mockup-sandbox` has not been touched since `316333b` ("Initial commit"); the failure is environmental/dependency-graph, not code.

**HOW TO CONFIRM IT'S PRE-EXISTING (do this rather than assuming either way):** `git stash push -u`, `git checkout <commit-before-your-work>`, run `pnpm --filter @workspace/mockup-sandbox run typecheck`, then `git checkout main && git stash pop`. If it fails there too, it is not yours. **Do not skip the `stash pop`** — checking out a detached HEAD mid-verification leaves your working tree behind if you forget.

**Note on an earlier misjudgment:** this failure was once dismissed in-session as "files don't exist / not reproducible" after a `git ls-files` + `ls` check appeared to come up empty. The files do exist and the error is real and reproducible. Verify with the checkout-and-compare procedure above, not by a single spot check.

**Lesson:** a root-level `pnpm run typecheck` covers every workspace package. Read the per-package lines — `<pkg> typecheck: Done` vs `Failed` — before concluding your change broke the build. Scope the check to the package you touched (`npx tsc -p tsconfig.json --noEmit` from `artifacts/mobile`) for a fast, unambiguous answer.

---

## 2026-08-07 — `AppState.addEventListener` cleanup in `RemindersContext` needed optional chaining

**Symptom:** three newly added tests in `RemindersContext.test.tsx` failed with `TypeError: Cannot read properties of undefined (reading 'remove')` at the provider's unmount, even though the tests had nothing to do with `AppState`. The failure appeared only in tests positioned *after* the foreground-reload test.

**ROOT CAUSE:** that earlier test does `jest.spyOn(AppState, "addEventListener").mockImplementation(...)` and calls `mockRestore()` at the end of its body. Combined with the suite's `jest.clearAllMocks()` in `beforeEach`, later tests can see an `addEventListener` that is still a mock and returns `undefined`. The provider then did `return () => sub.remove()` with no guard, so React's unmount teardown threw.

**FIX:** `return () => sub?.remove?.();` in `contexts/RemindersContext.tsx`. This matches the defensive style used everywhere else in the codebase for native handles (`subscription?.remove()` in `NotificationResponseHandler.tsx`, `try/catch` around every `expo-notifications` call).

**Lesson:** `mockRestore()` at the end of a test body is not cleanup — it doesn't run if anything above it throws, and it interacts badly with a global `clearAllMocks`. Prefer `afterEach`/`restoreMocks`. More importantly: an unsubscribe callback that assumes a native API returned a valid handle will take down the entire unmount path. Guard every teardown handle.

---

## 2026-08-07 — `SNOOZE_ACTION_ID` must keep the value `"SNOOZE_10"` even though snooze is no longer 10 minutes

**Context:** designing user-selectable snooze presets (5/15/30/60 min + "tomorrow same time"), which makes the constant name `SNOOZE_10` inaccurate and an obvious-looking cleanup target.

**WHY IT MUST NOT BE RENAMED:** the *value* of `SNOOZE_ACTION_ID` (`services/ReminderService.ts`) is not internal — it is written into the `categoryIdentifier` of every notification handed to `expo-notifications`, so it lives inside notifications already scheduled on users' devices. `handleNotificationResponse` matches incoming `response.actionIdentifier` against it. Changing the string means any notification sitting in a tray across an app upgrade carries the old ID, matches nothing, and its Snooze button silently does nothing. Renaming needs a migration (register both IDs for one release, then drop the old), tracked as backlog item 17.

**Related decision, same commit:** `SNOOZE_MINUTES` *is* deleted rather than kept as a dead export. It was the expected value in three arithmetic test assertions (`ReminderService.test.ts:256`, `:583`, `notificationResponseHandler.test.ts:77`); leaving it while production code stopped reading it would have left tests passing without proving anything.

**Lesson:** before renaming a constant in this codebase, check whether its value crosses a persistence or OS boundary (AsyncStorage keys, notification category/action IDs, Android channel IDs). Those are wire formats with data already in the field, not just identifiers — the same reason `setupNotificationChannel()` carries a legacy-channel migration.

---

## 2026-08-06 — Malayalam hour word `മണി` needed a case-suffix-aware pattern, with a lookahead-guard trap against `മണിക്കൂർ`

**Symptom:** user reported dictated/typed times being ignored — "9 മണിക്ക്" sometimes not recognized, and times silently defaulting to a period word's default hour (e.g. "വൈകിട്ട് 5 മണി" → 18:00 instead of 17:00) whenever the hour lacked the exact literal suffix the parser hardcoded.

**ROOT CAUSE:** `utils/malayalamDateParser.ts` hardcoded the single surface form `മണിക്ക്` in ~6 regexes. Malayalam is agglutinative — the hour word `മണി` legitimately appears bare, or with dative-case suffixes speech recognizers spell inconsistently (`മണിക്ക്` / `മണിയ്ക്ക്` / `മണിക്ക`). Any form other than the one hardcoded literal was invisible to the parser, so the period-word fallback's default hour silently won instead.

**FIX:** added one shared `HOUR_UNIT` pattern and used it everywhere. **Non-obvious trap:** `മണിക്ക` is a strict prefix of `മണിക്കൂർ` (the *duration* unit, "N hours from now", used by `resolveDuration`) — a naive pattern matches inside it and misreads "2 മണിക്കൂർ കഴിഞ്ഞ്" (2 hours from now) as "2 o'clock". The obvious fix — a trailing negative lookahead `മണി(?:യ്)?(?:ക്ക്?)?(?!ൂ)` — is **silently broken**: the optional suffix groups backtrack, the regex engine settles for matching bare `മണി`, and the lookahead then sees `ക` (not `ൂ`) right after and passes anyway. Verified empirically with a standalone Node repro before trusting it. The guard must sit immediately after `മണി`, *before* the optional groups: `മണി(?!ക്കൂ)(?:യ്)?(?:ക്ക്?)?`. A word-boundary guard was also considered and rejected — it blocks `മണിക്കൂർ` correctly but also breaks realistic no-space speech output like `"9 മണിക്ക്മീറ്റിംഗ്"`.

**Lesson:** when one Unicode/script token is a literal prefix of another, negative-lookahead placement relative to optional groups is not interchangeable — test the guard against the collision case directly (e.g. in a throwaway Node script) rather than trusting that "it has a lookahead" is sufficient.

---

## 2026-08-06 — Fire-and-forget async handler raced a test's `waitFor` under parallel jest workers

**Symptom:** `index.test.tsx`'s delete-confirm test failed nondeterministically — reliably green with `jest --runInBand`, reliably red in default parallel mode. Looked like cross-suite pollution at first but reproduced identically on an unmodified checkout via `git stash`, ruling that out.

**ROOT CAUSE:** `HomeScreen`'s `handleConfirmDelete` called `deleteReminder(id)` (async: awaits an AsyncStorage write via `serviceDelete`, then `setReminders`) without `await`, then immediately called `setPendingDeleteId(null)` to close the sheet. This left the delete as a detached fire-and-forget promise, racing the test's `waitFor` default 1000ms timeout. Under jest's default parallel-worker mode, CPU contention from concurrently-running suites was enough to occasionally push that promise chain past the timeout window — a genuine race, not flake noise or pollution.

**FIX:** made `handleConfirmDelete` (`app/(tabs)/index.tsx`) properly `async`/await the delete before clearing `pendingDeleteId`. Also widened `ConfirmSheet`'s `onConfirm` prop type to `() => void | Promise<void>`. Test fix: wrap the confirm `fireEvent.press` in `act(async () => {...})` and give `waitFor` an explicit longer timeout, so the assertion follows real completion instead of racing a fixed clock. Verified with 5 consecutive full parallel `jest` runs, all green — don't conclude "flaky, ignore" from a single red run; rerun with `--runInBand` vs default parallel and diff the behavior before writing something off as pre-existing noise.

---

## 2026-08-06 — expo-speech-recognition needs `continuous: true` or dictation stops at the first pause in speech

**Symptom:** live mic dictation (`QuickAddInput`'s mic button) would stop listening as soon as the user paused mid-sentence, well before they were done speaking.

**ROOT CAUSE:** `SpeechService.ts`'s `startListening()` called `ExpoSpeechRecognitionModule.start()` without `continuous: true` (default `false`). Per the library's own docs: without it, iOS 17- ends the session after 3s of silence, and iOS 18+/Android end it as soon as any `isFinal` result comes in — either way, a natural speaking pause gets treated as "done talking," firing the `end` event, which our listener reads as a user-initiated stop.

**FIX:** pass `continuous: true` in the `ExpoSpeechRecognitionModule.start()` call inside `startListening()` (`services/SpeechService.ts`). Session now stays open through pauses and only ends via our own `stopListening()`/`.stop()` call or a real error.

---

## 2026-08-06 — `Alert.alert` cannot be styled — use a custom Modal sheet for any confirm dialog that needs app styling

**Symptom:** delete-confirmation dialog looked visually out of place (plain OS system alert) next to the rest of the app's themed UI.

**ROOT CAUSE:** `Alert.alert` (React Native's `react-native` module) renders the platform's native OS dialog — it has no style/theme props and cannot be customized. This is inherent to the API, not a bug.

**FIX:** replaced both delete-confirmation call sites (`app/(tabs)/index.tsx`, `app/reminder-detail.tsx`) with a shared `components/ConfirmSheet.tsx` — a transparent `Modal` + `Pressable` overlay bottom sheet, matching the existing bottom-sheet pattern already used elsewhere (e.g. QuickAddInput's "no time found" sheet, Settings' debug-logs sheet). Any future confirm/destructive-action prompt should use `ConfirmSheet` (or the same Modal+Pressable sheet pattern), never `Alert.alert`, if it needs to match app styling.

---

## 2026-08-04 — EAS cloud build failing: local `android/` dir leaking into the upload

**Symptom:** `eas build` from `artifacts/mobile` failed with two errors: (1) `android/local.properties` (Windows-specific SDK path) flagged as leaking into the EAS upload, and (2) Gradle "No matching variant" / "No variants exist" errors for `react-native-community/datetimepicker`, `async-storage`, `gesture-handler`, `keyboard-controller` — as if the build was resolving against stale cached autolinking metadata instead of a fresh one.

**ROOT CAUSE:** this project uses Continuous Native Generation — `artifacts/mobile/android/` is never committed (gitignored) and is meant to be regenerated fresh by `expo prebuild` on EAS's servers every build. But local Windows native builds (`npx expo run:android`, see 2026-08-02/03 entries below) leave a real `android/` dir on disk, including machine-specific `local.properties` and stale `android/build`, `android/app/build` Gradle output from earlier CMake/library versions. With no `.easignore` present, eas-cli's upload step included this local directory, so EAS built against a stale, Windows-specific native tree instead of generating its own — hence both the leaked-path warning and the bogus variant-resolution failures (cached metadata not matching what's actually in `node_modules` on EAS's build server).

**FIX:** added `artifacts/mobile/.easignore`:
```
/android
/ios
```
This forces EAS to always ignore any locally-generated native folders and prebuild fresh, regardless of what's sitting on disk from local Windows builds.

**UPDATE — `.easignore` alone did NOT fix it; real root cause found (see next entry below, 2026-08-05).** Do not stop at this entry's fix.

---

## 2026-08-05 — SUPERSEDES entry above: real root cause was a stray root-level `eas.json` shadowing the mobile one

**Symptom:** identical `android/local.properties` leak warning kept recurring on `eas-cli build` even after `artifacts/mobile/.easignore` (previous entry) was committed and pushed. Repo-side static checks all looked correct (git tracking, `.gitignore`, `.easignore` placement, eas-cli 21.5.0, no `EAS_NO_VCS`) — the `.easignore` fix was real but insufficient, which is what made this confusing.

**ROOT CAUSE:** `git log` on `eas.json`/`.gitignore`/`app.json` history found a **duplicate `eas.json` accidentally committed at the repo root** (`c:\workspace\remindme\eas.json`, commit `ad8e945`, 2026-08-03, bundled into an unrelated design-doc commit) — almost certainly created by running an `eas`/`expo` command from the repo root instead of `cd`-ing into `artifacts/mobile` first. Confirmed it was debris, not intentional: no `app.json` exists at the repo root and no `extra.eas.projectId` in the root `eas.json` — it can't build anything standalone. eas-cli resolves the project root by walking up from cwd to the nearest `eas.json`; with this stray file present, any build invocation risked resolving the whole monorepo as the build root instead of `artifacts/mobile`, uploading the entire repo (including the local, machine-specific `artifacts/mobile/android/` dir with `local.properties`) and never applying `artifacts/mobile/.easignore`, which is scoped to the wrong directory once the root is misresolved.

**TIMING MATCH:** the stray root `eas.json` first appeared 2026-08-03, right around when local Android build support (CMake/Ninja fixes, `npx expo run:android`) was being set up — consistent with the user's report "this worked before we made changes to support android build locally." The local-build work itself didn't break anything; a one-off misplaced `eas` CLI invocation during that same work session did.

**FIX:** `git rm eas.json` at the repo root (commit `b9e9339`). `artifacts/mobile/eas.json` remains the sole authoritative EAS config, matching the documented invocation in CLAUDE.md (`cd artifacts/mobile && npx eas-cli build ...`).

**LESSON:** when EAS Build behavior looks wrong despite correct-looking config in the expected location, check for a **second, shadowing config file higher up the directory tree** — `eas.json`/`.easignore` resolution walks upward from cwd, so a stray file anywhere above the real project root can silently override or bypass the real one. Don't just verify the config you expect is correct; verify no other copy exists that could be found first.

---

## 2026-08-03 — CMake/Ninja Windows fix (see 2026-08-02 entry below) was INCOMPLETE — corrected here

**SUPERSEDES:** the "FIX" in the 2026-08-02 entry below (pinning `externalNativeBuild.cmake.version "4.1.2"` only in `artifacts/mobile/android/app/build.gradle`) is necessary but NOT sufficient. That only fixes the `:app` module's own native build. It does nothing for other native modules (`expo-modules-core`, `react-native-screens`, `react-native-keyboard-controller`, etc.) — each Android Gradle Plugin subproject resolves its own CMake version independently; there is no inheritance from `:app` or from a project-wide default.

**Confirmed root cause of "it worked on the emulator but failed on my physical OnePlus phone" (same repo, no other changes):** the emulator build used architectures `x86_64,arm64-v8a`; the phone build used `arm64-v8a,armeabi-v7a` — a different, previously-uncached architecture combo forced a fresh CMake reconfigure for modules that hadn't been rebuilt before, and those modules were still silently using the broken default CMake 3.22.1/Ninja 1.10, even with the `:app`-only pin already in place.

**THE ACTUAL COMPLETE FIX — three things must ALL be present:**
1. `artifacts/mobile/android/app/build.gradle` — pin for the `:app` module itself (from 2026-08-02 entry):
   ```gradle
   android { externalNativeBuild { cmake { version "4.1.2" } } }
   ```
2. `artifacts/mobile/android/build.gradle` (root, top-level, NOT app/build.gradle) — a project-wide hook that catches every OTHER native module automatically, since most don't have `CMAKE_VERSION` env var support and can't be edited durably (they live in `node_modules`):
   ```gradle
   allprojects {
     // ... existing repositories block ...
     plugins.withId("com.android.library") {
       android {
         externalNativeBuild {
           cmake {
             version "4.1.2"
           }
         }
       }
     }
   }
   ```
   CRITICAL TIMING GOTCHA: this must be set directly inside `plugins.withId { android { ... } }`, evaluated immediately when the plugin applies — NOT wrapped in `afterEvaluate { }`. `afterEvaluate` fires too late: AGP/RNGP has already read and locked the CMake version by then, causing `A problem occurred configuring project ':expo-modules-core' > It is too late to set version`. This cost a full failed build cycle to discover.
3. `$env:CMAKE_VERSION = "4.1.2"` still needed too, for the couple of modules (react-native-worklets, react-native-reanimated) that read `System.getenv("CMAKE_VERSION")` directly in their own `build.gradle` rather than relying on the root project's `externalNativeBuild` block.

**DEAD END — do not retry:** setting `cmake.dir=<path>` in `artifacts/mobile/android/local.properties` does NOT work. This is not a real Android Gradle Plugin / RNGP property for overriding the CMake *version* used per-module; the build silently ignored it and modules kept using the old broken CMake anyway. (Possibly confused with a different, unrelated legacy `ndk.dir`/`cmake.dir` convention from very old Android tooling — doesn't apply here.)

**Always clean stale caches before retrying any CMake version change**, at ALL these levels (missing any one leaves a stale/broken `build.ninja` manifest that fails even with the correct version now configured):
- `artifacts/mobile/android/app/.cxx`, `android/app/build`, `android/build`, `android/.gradle`
- Every native module's own `.cxx` dir under `node_modules/.pnpm/<pkg>/android/.cxx` (find via `find node_modules/.pnpm -maxdepth 4 -iname ".cxx" -type d`)

---

## 2026-08-03 — Black screen on app launch was emulator memory exhaustion, not an app bug

**Symptom:** app installed and launched fine (confirmed via `adb shell dumpsys window | grep mCurrentFocus` showing `com.reminders/.MainActivity` focused, and logcat showing `ReactNativeJS: Running "main"` with no errors/crashes), but the screen rendered solid black — no UI, no status bar icons in the worst case. Persisted across: force-stop + cold relaunch, Metro restart, full `adb reboot` of the emulator (temporarily improved status-bar rendering but app content stayed black, then hit a "System UI isn't responding" ANR on next attempt).

**ROOT CAUSE:** the emulator had run out of memory — `adb shell top` showed only 124MB free out of ~4GB, with `surfaceflinger` and `system_server` both under heavy CPU load (245% sys, 123% irq). This happened gradually from the session's repeated builds/process kills/relaunches. Once RAM is that tight, `surfaceflinger` can't composite frames properly — app logic runs fine (hence no crash/error in logs) but nothing paints, which looks exactly like a broken UI/render bug even though it isn't one.

**FIX:** free host machine RAM (close other heavy apps/processes), which frees emulator RAM too. Confirmed the emulator's `MemFree` jumped from 124MB to 580MB+ (2.6GB available) after freeing host memory, and the app rendered correctly on the very next launch — no code, config, or emulator settings changed.

**DIAGNOSTIC TAKEAWAY:** if an RN/Expo app shows a persistent black screen with NO errors anywhere in logcat, NO bundling failure, and the activity is confirmed focused — suspect emulator resource exhaustion before suspecting app code. Check with `adb shell top -n 1 -m 5` (look at `Mem: ... free` and `surfaceflinger`/`system_server` CPU%) before spending time on font-loading/splash-screen/Fabric-surface theories. A "System UI isn't responding" ANR appearing on an otherwise-idle emulator is a strong tell.

---

## 2026-08-03 — Added Stop hook to enforce this ledger gets updated after commits

**Context:** user wants this file kept current automatically, specifically for a smaller/less capable model reading it later — so entries in this file must stay short, imperative, and scannable (WHAT/WHY/WHERE per entry), not prose.

**WHAT:** added `.claude/settings.json` with a `Stop` hook running `.claude/check-learnings-updated.sh`. On every Claude Code stop, the script compares current git `HEAD` against a marker file (`.claude/.last-learnings-commit`, gitignored — local session state, not committed). If new commits landed since the marker and none of them touched `system_learnings.md`, the hook blocks stop and injects a reason listing the unlogged commits, prompting Claude to add an entry before finishing. If `system_learnings.md` was already touched, or there's nothing new, it's a silent no-op (exit 0).

**WHY:** a static git `post-commit` hook can only run a fixed script — it can't reason about *why* a change mattered, so it can't write a good ledger entry. A Claude Code `Stop` hook fires in-session, after Claude (which has full context on what it just did) would otherwise finish, so it can actually produce a reasoned entry rather than a mechanical commit-hash dump.

**LIMITATION:** this only fires when Claude Code itself is the one committing and then stopping. It does NOT catch manual `git commit` runs from a plain terminal outside a Claude Code session — that would need a separate real git `post-commit` hook (a mechanical stub log, not a reasoned entry) layered on top if ever wanted. Not implemented as of this entry.

**GOTCHA:** the hook's JSON output must be built carefully — the `reason` field can contain a multi-line git log, and naive `cat <<EOF` embedding of raw newlines into a JSON string produces invalid JSON. `jq` was unavailable in this repo's Git Bash environment, so the script manually escapes backslashes/quotes and converts real newlines to `\n` via `sed`+`awk` before printing the JSON line. Validated with `node -e "JSON.parse(...)"` since `jq`/`python` weren't reliably available either.

**GOTCHA:** a newly-created `.claude/settings.json` is not picked up by the running session's file watcher automatically — needs `/hooks` (reload) or a session restart to activate for hooks created mid-session.

---

## 2026-08-03 — Existing junctions already solve Windows path-length for this repo: C:\p and C:\n

**Context:** while cleaning up temp folders from the local-build troubleshooting session, found C:\p, C:\n, C:\g, C:\m, C:\r, C:\w at the drive root, all dated 2026-07-27 (predate that session, not created by Claude).
- `C:\p` is an NTFS junction → `C:\workspace\remindme` (confirmed via `fsutil reparsepoint query`, matching inode with the real repo's files).
- `C:\n` is an NTFS junction → `C:\workspace\remindme\node_modules`.
- `C:\g` is a real directory, a Gradle cache (`.tmp`, `caches`, `daemon`, `jdks`, `kotlin-profile`) — legitimate, do not touch.
- `C:\m`, `C:\r`, `C:\w` are real standalone directories, NOT junctions, each containing what looks like another full repo copy (`.claude`, `artifacts`, `.android`, etc.) — purpose/ownership unconfirmed, left untouched.

IMPLICATION: **`C:\p` already gives a short-path alias to this exact repo** — likely set up by a prior session/user specifically to work around the CMake/Ninja Windows long-path bug (see entry below). Building from `C:\p\artifacts\mobile` (junction) should get the same path-length benefit as physically copying the repo to `C:\dev\remindme`, without duplicating the checkout or needing a separate `pnpm install`.
FIX FOR NEXT TIME: try building from `C:\p\artifacts\mobile` first before copying the repo elsewhere. Only fall back to a physical copy + separate pnpm store if the junction alone isn't short enough.

**Do not delete C:\p, C:\n, C:\g, C:\m, C:\r, C:\w without explicit user confirmation per-folder** — p/n are load-bearing junctions to this repo, and m/r/w are unidentified but structurally look like other real project copies (found via git status showing meaningful uncommitted work in at least one of them).

---

## 2026-08-02/03 — Local Android build on Windows: confirmed working end-to-end

**Outcome:** after fixes #1 and #2 below, `npx expo run:android` completed with `BUILD SUCCESSFUL`, APK installed, and `com.reminders/.MainActivity` was confirmed as the foreground focused activity on the Pixel 10 emulator via `adb shell dumpsys window | grep mCurrentFocus`. The local-build path is fully validated, not just theoretically fixed.

**One extra transient failure encountered along the way (not a real bug, no fix needed):** after the native build succeeded the first time, Metro failed to bundle with `Unable to resolve "expo-router/entry" from "artifacts\mobile\index.ts"` — looked like Metro's projectRoot got confused (import stack showed paths resolving as if relative to repo root instead of `artifacts/mobile`). `metro.config.js` and the `expo-router` symlink were both verified correct. Simply re-running `npx expo run:android` from the correct cwd fixed it on the next attempt (build was mostly cached, finished in 24s). Conclusion: if you hit `expo-router/entry` unresolved right after a successful native build, just retry before assuming a real config problem.

**Process note — background task interruption:** a background build task can show status "stopped" with "No completion record found" if the Claude Code process/session ends while it's still running (not a build failure). Always check the task's `.output` log file directly for actual progress/result before assuming the build failed — in this case the log showed `BUILD SUCCESSFUL` had already happened before the interruption.

---

## 2026-08-02 — Local Android build on Windows: fixed three separate blockers

**PARTIALLY SUPERSEDED by the 2026-08-03 "CMake/Ninja Windows fix ... was INCOMPLETE" entry above** — item #2's fix below (CMake pin in `app/build.gradle` only) is necessary but not sufficient; see that entry for the complete fix covering all native modules, not just `:app`.

**Context:** user wanted `npx expo run:android` to work locally (avoid burning EAS free-tier build quota). Hit three unrelated failures in sequence. All three must be fixed together for a clean Windows build.

1. **JDK version.** System `java` on PATH was JDK 26. RN/Kotlin Gradle plugin does not support it — fails with misleading error `Error resolving plugin [id: 'com.facebook.react.settings'] > 26.0.2` (that "26.0.2" is the Java version, not a plugin version — Kotlin's `JavaVersion.parse` chokes on it).
   FIX: set `JAVA_HOME` to Android Studio's bundled JBR (`C:\Program Files\Android\Android Studio\jbr`, JDK 21) before running any gradle/expo build command.

2. **CMake/Ninja Windows long-path bug.** AGP defaults to CMake 3.22.1, which bundles Ninja 1.10. Ninja 1.10 has a real bug in Windows long-path handling, fixed only in Ninja 1.12+ (see ninja-build/ninja#1900). Windows registry `LongPathsEnabled=1` does NOT fix this — it's Ninja's own internal 260-char check, unrelated to the OS long-path opt-in.
   Symptom: build runs for minutes, gets deep into native module compilation, then fails with `ninja: error: Stat(...): Filename longer than 260 characters` or `manifest 'build.ninja' still dirty after 100 tries`, usually on modules with long file trees (react-native-keyboard-controller, react-native-worklets, expo-modules-core).
   FIX: install newer CMake (4.1.2 used here) via Android Studio SDK Manager, then explicitly pin it in `artifacts/mobile/android/app/build.gradle`:
   ```
   android { externalNativeBuild { cmake { version "4.1.2" } } }
   ```
   IMPORTANT: setting the `CMAKE_VERSION` env var alone is NOT enough — some individual native modules (e.g. react-native-worklets) read `CMAKE_VERSION` from their own `android/build.gradle`, but the top-level `:app` module does NOT read this env var and silently keeps using CMake 3.22.1 unless the version is set explicitly in `app/build.gradle` as above.
   `android/` is prebuild-generated — this edit may be wiped by a future `expo prebuild` and need reapplying.
   After any CMake version change, delete stale build caches or old absolute paths / broken ninja manifests persist and cause confusing failures: delete `android/app/.cxx`, `android/app/build`, `android/build`, `android/.gradle`.

3. **pnpm store path nesting.** Not a root cause on its own, but pnpm's `.pnpm/<pkg>@<version>_<hash>/node_modules/<pkg>` layout adds ~40-60 extra characters versus npm/yarn's flatter layout. This can tip a marginal path over Ninja's 260-char limit when the underlying Ninja bug (see #2) is present. Once CMake/Ninja is upgraded past 1.12, this stops mattering — do not try to "fix" pnpm nesting as a primary solution; it is a red herring if #2 isn't fixed first.
   (We tried relocating the pnpm virtual-store-dir to a short path `C:/ps` via `.npmrc` `virtual-store-dir=C:/ps` as a workaround before finding the real fix in #2 — this bought some headroom but did not fully solve it. Not necessary once CMake is upgraded.)

**Correct order of operations for a clean Windows local build:** fix JDK (#1) → fix CMake/Ninja version (#2) → delete stale `.cxx`/`build` caches → run `npx expo run:android`.

**Do NOT conclude pnpm itself is broken or unsupported on Windows** — this was raised and correctly pushed back on. The actual bug is in the bundled Ninja version, which affects npm/yarn users too; pnpm just makes marginal cases fail slightly more often.
