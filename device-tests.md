# Device Test Checklist

Everything that is **written and green in Jest but unproven on hardware**.

This file is the canonical list — `backlog.md` points here rather than keeping
its own copy. Jest runs in jsdom, which has **no viewport, no keyboard, no
system chrome, no notification tray, and no OEM power manager**. Anything whose
failure mode is "off-screen", "behind something", "never fired", or "wrong
colour against a real background" passes green forever and can only be caught
here.

## Status legend

| Mark | Meaning |
| --- | --- |
| `PENDING` | Not yet tested on a device. |
| `PASS` | Verified working on hardware. Date + device recorded. |
| `FAIL` | Tested and broken. Link the bug or fix commit. |
| `BLOCKED` | Cannot be tested yet — needs a native build, a fresh install, etc. |
| `PARTIAL` | Some sub-checks pass, others outstanding. Say which. |

## How this file is maintained

- **After any feature lands, add its device-only checks here** in the same
  change. A feature is not "done" merely because its tests are green.
- **Ask the user for results** rather than assuming — a `PASS` must come from a
  human who actually watched it happen.
- **Cadence: ask whenever a feature lands.** Add its items, then ask whether to
  test now, before moving on to the next piece of work.
- **Prefer per-sub-check status over a blanket `PASS`.** "The send screen
  worked" is not the same as "D9 passes"; marking the whole item hides the
  parts nobody exercised.
- **Never mark `PASS` from a passing Jest run.** That is the exact mistake this
  file exists to prevent.
- Keep IDs stable. `D1`–`D9` are referenced from `backlog.md` and
  `system_learnings.md`; new items continue from the highest number.
- When an item passes, keep the row and record the date and device. A `PASS` on
  a Pixel does not carry over to a Xiaomi (see the OEM note below).

## Test environment

**Use a mid-range OEM device (Xiaomi / Oppo / Vivo / Realme), not a Pixel or an
emulator.** Aggressive OEM power management has independently caused two
separate problems here already, and it is the cross-cutting risk behind D1, D4
and D7.

Package: `com.curios.remindme` · adb:
`C:\Users\anand\AppData\Local\Android\Sdk\platform-tools\adb.exe`

Some items need a **native build** (not OTA): anything touching a new native
module or a config plugin. Marked per item.

**A locally-built APK is NOT equivalent to an EAS build — do not accept results
from one as results for the other.** `artifacts/mobile/android/` is
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

---

## A. Cross-cutting risks

### D20 — Re-verify on an EAS build after the setAlarmClock change · `PENDING`
*Added 2026-08-24.* Everything measured for D19 was on a **local debug APK**,
which is not the shipping artifact. Re-run on an EAS build
(`eas build --platform android --profile preview`, see CLAUDE.md):

- **Contacts** — `PASS` (2026-08-25, EAS preview build): permission prompt and
  contact list both working, confirming the regression was confined to the
  local APK's stale manifest (missing `READ_CONTACTS`, see Test environment
  above) and never reached the shipping artifact. Recipient chip and the full
  send flow are covered by D9, not re-checked here.
- **Conditional routing** — `PASS` (2026-08-25, EAS preview build, OnePlus
  CPH2569). Both reminder types pending simultaneously:

  | reminder | window | flags | route |
  | --- | --- | --- | --- |
  | silent, today 09:22 | `+21m43s627ms` | `0x4` | inexact |
  | alarm, tomorrow 15:59 | `0` | `0x9` | setAlarmClock |

  ```
  Next alarm clock information:
    user:0 pendingSend:false time:1787740140000 = 2026-08-26 15:59:00.000
  ```

  The slot held the **alarm** reminder even though the silent one fires ~31h
  sooner — so a silent reminder cannot displace it. Designed as a discriminating
  test: broken routing would have let the sooner reminder seize the slot.
  This also clears the "uncompiled" risk — the EAS build compiling proves
  `request.content?.body?.optBoolean("alarm", false)` typechecks.

  Still to observe: **actual delivery** of an alarm reminder on the EAS build
  (registration is correct; a firing has not been watched), and the lock screen
  with a **real clock alarm set alongside** a pending silent reminder — the slot
  logic implies it is safe, but it has not been seen.

**LIMITATION this makes explicit — silent reminders stay inexact on ColorOS.**
The 21m43s window above is the D7 downgrade, still fully in force for anything
not routed through `setAlarmClock()`. On this ROM only alarm-type reminders are
punctual; a silent reminder can arrive ~20 minutes late, and up to an hour for a
next-day one. `ALARM_EARLY_OFFSET_MS` covers only the first 60s of that. This is
the accepted cost of not hijacking the system alarm slot — but it is a real
product decision, not a technicality, and it deserves revisiting (default the
alarm toggle on? say so in the UI?).
- Confirm the release build still shows `window=0` — release and debug can
  differ in OEM battery treatment.

### D19 — setAlarmClock() fixes exact delivery · `PASS` (2026-08-24, OnePlus CPH2569, Android 15)
*Added 2026-08-24. Read D7 first — this is the fix for it.* Measured on a
**local debug APK**, not the shipping artifact — see D20 for the EAS re-verify.
The alarm-timing result itself is solid (AlarmManager's own delivery log), but
do not read it as clearance for the whole feature.

`AlarmManager.setAlarmClock()` produces exact, Doze-proof delivery where
`setExactAndAllowWhileIdle()` was silently converted to inexact. Same device,
same conditions, forced Doze both times:

| | setExactAndAllowWhileIdle | setAlarmClock |
| --- | --- | --- |
| `windowLength` | 1303905 ms (21m43s) | **0** |
| `flags` | `0x4` (no FLAG_STANDALONE) | `0x9` (FLAG_STANDALONE set) |
| Doze rewrites `whenElapsed`? | yes, onto a 5-min boundary | **no** |
| delivery under forced Doze | **5m02s / 2m19.8s late** | **0 ms late** |

```
08-24 17:57:45.581 AlarmManager: sending alarm ... origWhen 1787574465581
```
Target 17:57:45.581, delivered 17:57:45.581, while `deep=IDLE`.

Implemented in `patches/expo-notifications@0.32.17.patch` (requires the
`buildFromSource` opt-out in `artifacts/mobile/package.json` — see
system_learnings.md). Three-tier fallback with distinct log lines:
`setAlarmClock` -> `setExactAndAllowWhileIdle` -> `setAndAllowWhileIdle`.

**Still to verify before this can be called done:**

- **`FLAG_WAKE_FROM_IDLE` (0x2) is NOT set** and the app does not appear in the
  dump's `Next wake from idle:` list, yet delivery was exact anyway. Not
  understood. Re-check after a longer Doze period, where maintenance windows
  are further apart than under `force-idle`.
- **`ALARM_EARLY_OFFSET_MS = 60000` must now be revisited.** It exists ONLY to
  absorb inexact-alarm drift (see its comment in `ReminderService.ts`). With
  exact delivery it makes every reminder fire a minute early. Removing it also
  needs the duplicate-delivery guard at `ReminderService.ts:857-864` revisited
  (see system_learnings.md 2026-08-09).
- **The status-bar alarm icon.** Every scheduled reminder now registers as a
  system alarm clock. Confirm what the user actually sees with several
  reminders pending, and decide whether this should apply to all reminders or
  only ones the user marks as alarms.
- **OEM frequency heuristics.** Some ROMs flag apps calling `setAlarmClock()`
  often as "frequently wakes your system". Unverified; watch for it.
- **Other OEMs** — MIUI/HyperOS, OneUI, Funtouch all still untested.
- Overnight unplugged run, and after-reboot re-arm (the boot path goes through
  the same `setupAlarm`, so it should inherit the fix).

### D7 — OEM battery-killer survival · `PARTIAL`
Do scheduled alarms fire at all with battery optimization at its default
aggressive setting? Flagged as a listing blocker in the 2026-08-09 adoption
assessment, and the blind spot behind D1 and D4. **Test this first** — several
other items are meaningless if alarms do not fire.

**Passing** (2026-08-24, OnePlus `CPH2569`, Android 15 / SDK 35, battery
optimization on, app *not* doze-whitelisted): Phase 0 (app open), Phase 1
(backgrounded, screen off), Phase 2 (swiped from recents) and Phase 4
(overnight, unplugged) all delivered.

**Open defect — alarms are registered INEXACT with a one-hour window.**
`adb shell dumpsys alarm` on that device shows the pending reminder as:

```
RTC_WAKEUP #160: Alarm{... com.curios.remindme} type 0
  windowLength 3600000 ... flags 0x4
  action expo.modules.notifications.NOTIFICATION_EVENT
```

`windowLength 3600000` means Android may fire it up to **an hour late**; an
exact alarm has `windowLength 0`. `flags 0x4` is `FLAG_ALLOW_WHILE_IDLE`
alone — `setExactAndAllowWhileIdle` would also set `FLAG_STANDALONE` (0x1)
and `FLAG_WAKE_FROM_IDLE` (0x2), i.e. `0x7`. So this took the *inexact*
branch of `setupAlarm` in expo-notifications
(`ExpoSchedulingDelegate.kt:105`), which is only reached when
`alarmManager.canScheduleExactAlarms()` returns false.

That is surprising, because `USE_EXACT_ALARM` is `granted=true` on this
device (auto-granted on Android 13+).

**Confirmed 2026-08-24 as a live ColorOS behaviour, not a stale alarm.** A
freshly created 2-minute reminder registered on the current build came back
inexact too — `windowLength 43509 ... flags 0x4`. (The window scales with how
far out the reminder is, roughly futurity/4, which is why a next-morning
reminder gets a full hour and a 2-minute one gets 43 s.) Caught mid-flight:

```
nowELAPSED       214428005
whenElapsed      214411527   <- 16.5 s overdue, still unfired
maxWhenElapsed   214455036   <- OS may hold it 27 s longer
```

So `canScheduleExactAlarms()` returns false on OxygenOS/ColorOS despite the
granted permission. Corroborating signal: this ROM also strips
`MANAGE_APP_OPS_MODES` from the shell user, so
`adb shell cmd appops set ... SCHEDULE_EXACT_ALARM allow` is rejected —
stock Android permits it.

**Consequence:** reminders are silently allowed to fire late, and the further
out the reminder, the later. For an alarm-style app this is a correctness bug,
not a polish item.

**Measured on device.** The 2-minute reminder fired at ~15:07:00 against an
alarm target of 15:06:17.9 — about 42 s late, i.e. at the very end of its
43.5 s window. The user perceived it as on time only because
`ALARM_EARLY_OFFSET_MS` had aimed 60 s early, so it still landed ~18 s before
the requested 15:07:18. **That offset is masking the drift at short horizons.**
It exists for the duplicate-notification fix (D4), not as slack for inexact
alarms, and it cannot cover a one-hour window: the pending 09:00 reminder is
set for 08:59 and may legally fire as late as 09:59.

This is why "Phase 4 passed overnight" was weak evidence — it recorded that a
notification *arrived*, not *when*. Always record lateness, not arrival.

**Methodological trap: USB charging suppresses Doze entirely.** Every timing
observation on 2026-08-24 was taken with the phone plugged in for adb, i.e. in
Android's best case, where inexact alarms usually fire near their target. A
16:59 reminder with a 16.8-minute window landed on time under exactly those
conditions — which proves nothing, since a window is *permission* to be late,
spent mainly when the device is idle and batching wakeups. Note that even so, a
2-minute reminder still drifted 42 s to the edge of its window while plugged in
and awake.

**Any timing measurement for D7 must be taken UNPLUGGED**, screen off, phone
left alone. A reminder set for the next morning, with the actual delivery time
noted to the minute, is the single measurement that settles this.

**Phase 3 (forced Doze) — RUN 2026-08-24, and it reproduces deterministically.**
You do not need to unplug: `dumpsys battery unplug` makes the OS believe it is
on battery while USB stays connected, so adb and Metro keep working.

```
adb shell dumpsys battery unplug          # OS now sees no charger
adb shell input keyevent 26               # screen off
adb shell dumpsys deviceidle force-idle
adb shell dumpsys deviceidle get deep     # must print IDLE
...
adb shell dumpsys deviceidle unforce      # ALWAYS restore
adb shell dumpsys battery reset
```

**Doze does not merely permit lateness — it rewrites the alarm.** On entering
IDLE, both pending reminders had `whenElapsed` moved forward onto an exact
multiple of 300000 (a 5-minute maintenance-window boundary), with
`maxWhenElapsed` collapsed to equal it:

```
#29  whenElapsed 221860231 -> 222000000   (+139769 ms)
#8   whenElapsed 221398059 -> 221700000   (+301941 ms)
```

Delivery matched those rewritten times to the second, per AlarmManager's own
`sending alarm` log lines:

| asked for   | delivered   | late by      |
| ----------- | ----------- | ------------ |
| 17:02:44.49 | 17:07:46.49 | **5m 02.0s** |
| 17:10:26.66 | 17:12:46.47 | **2m 19.8s** |

**Treat this as a FLOOR, not the worst case.** Forced Doze still runs
maintenance windows every ~5 minutes; real overnight Doze stretches them
progressively further apart, up to an hour. The 3600000 ms window observed on a
next-morning reminder is the honest upper bound. An overnight unplugged run is
still worth doing, but the mechanism is now proven and no longer in doubt.

Caveat: this exercises **AOSP** Doze. ColorOS's own battery layer sits on top
and may defer further; a pass here would be necessary, not sufficient.

**Not fixable by settings — established 2026-08-24.** Enabling ColorOS's
"Allow background activity" / Auto-launch moved the app into the Doze
whitelist (`user,com.curios.remindme,10210`), promoted it to standby bucket
`5` (EXEMPTED) and set `RUN_ANY_IN_BACKGROUND: allow`. A 30-minute reminder
created in that state was **still inexact**:

```
RTC_WAKEUP #38 ... windowLength 1302875  maxWhenElapsed 217853424  flags 0x8
```

21.7 minutes of slack — a 15:42 reminder could fire as late as 16:03. The flag
moved 0x4 -> 0x8 (a different allow-while-idle variant, presumably a quota
class change from the exemption), but `FLAG_STANDALONE` (0x1) and
`FLAG_WAKE_FROM_IDLE` (0x2) are still absent and the window is still non-zero.

Note the app does **not** appear under Settings -> Special app access ->
Alarms & reminders. That is expected, not a misconfiguration: Android hides
apps holding the auto-granted `USE_EXACT_ALARM` from that screen, since it
only lists the user-revocable `SCHEDULE_EXACT_ALARM`. So no user-facing
setting remains to enable.

**CONFIRMED by same-alarm pairing (2026-08-24, second run).** The earlier
evidence was circumstantial; this is not. Call-site log and resulting alarm,
matched on the trigger timestamp:

```
17:28:47.044 I ExpoSchedulingDelegate: remindme-patch: EXACT alarm set for
                                       1787574465581 (canScheduleExactAlarms=true)
dumpsys:  origWhen=2026-08-24 17:57:45.581   (= 1787574465581)
          window=+21m43s905ms  flags 0x4  exactAllowReason=policy_permission
```

`setExactAndAllowWhileIdle()` called, no SecurityException, inexact alarm
registered. The window is applied **at registration**, not by a later policy:
`policyWhenElapsed` shows `requester` as the binding value with every policy
offset negative (`app_standby=-24s815ms`, `device_idle=--`,
`battery_saver=-24s815ms`), i.e. nothing deferred it afterwards.

**Two interpretation traps, both of which caught me:**

- **`exactAllowReason` does NOT mean the request was exact.** It reflects the
  app's entitlement. The same dump shows
  `com.google.android.googlequicksearchbox` with
  `window=+1h0m0s0ms exactAllowReason=permission flags=0x4` — an inexact alarm
  carrying a reason. Never argue exactness from this field.
- **`policyWhenElapsed` showing no delay does NOT mean the alarm is exact.** It
  only rules out post-registration deferral by Doze/Standby/Battery Saver.
- **The logcat ring buffer holds ~4 minutes on this device** (256 KiB, ~22k
  lines in 7 min). A missing log line is very likely eviction, not absence.
  Capture with `adb logcat -v time > file &` before the action, never
  `logcat -d` after.

**ROOT CAUSE, established 2026-08-24 — ColorOS silently DOWNGRADES exact
alarms.** An instrumented build of `expo-notifications` (forced to compile from
source, see system_learnings.md) logged, for the very alarm below:

```
remindme-patch: EXACT alarm set for 1787571626662 (canScheduleExactAlarms=true)
RTC_WAKEUP #56 ... origWhen 1787571626662  windowLength 1302623  flags 0x4
```

`canScheduleExactAlarms()` returned **true**, `setExactAndAllowWhileIdle()` was
called, **no SecurityException was thrown** — and the OS registered an inexact
alarm with a 21.7-minute window regardless.

**This corrects an earlier reading in this file.** The inexact flags were first
attributed to `canScheduleExactAlarms()` returning false and expo taking its
inexact branch. That inference assumed the platform honours the call. It does
not. `expo-notifications` was scheduling correctly all along; neither it nor
the app is at fault.

**The same phone DOES grant exact alarms — to its clock app.** Dumped at the
same moment as ours:

```
com.oneplus.deskclock  windowLength 0  maxWhenElapsed == whenElapsed  flags 0x3 / 0x9
com.curios.remindme    windowLength 1302623                            flags 0x4
```

`windowLength 0` is a true exact alarm. The dump also carries a dedicated
`Next wake from idle:` entry naming the clock app (flags `0x3` =
`FLAG_STANDALONE` | `FLAG_WAKE_FROM_IDLE`) — the list of alarms permitted to
punch through Doze. Our reminder is absent from it. So the capability exists on
this ROM and is simply not being extended to us; the difference is the API,
not battery settings or permissions.

**And it is not about privilege.** `com.google.android.deskclock` — an
ordinary user-space app in `/data/app`, `flags=0x0`, **not** doze-whitelisted,
standby bucket 20 (WORSE than our 10) — also gets `windowLength 0`, with
`flags 0x5` (`FLAG_STANDALONE` | `FLAG_ALLOW_WHILE_IDLE`), the signature of
`setExactAndAllowWhileIdle` — the same API we call. Permission state is
identical to ours: both hold `USE_EXACT_ALARM: granted=true`, both have the
`SCHEDULE_EXACT_ALARM` appop at `MODE_DEFAULT`.

Note what our alarm is *missing*: `FLAG_STANDALONE` (0x1), which marks an alarm
as unbatched. Its absence plus a window appearing is the fingerprint of a
request demoted after the fact.

**So the mechanism is UNKNOWN.** Permissions, appops, doze whitelist, standby
bucket and system-app status were each checked and either match ours or favour
us. The likeliest remaining explanation is a ColorOS-internal classification of
clock/alarm packages not exposed via `dumpsys`/`appops` — but that is a guess,
not a finding. Do not record it as a cause without evidence.

**What this DOES establish:** a normal third-party app can obtain exact alarms
on this ROM. The capability is reachable; the key has not been found.

`setAlarmClock()` remains the one untried API. The case for it is not the OEM
clock app (that comparison was over-read initially — the OnePlus clock is a
whitelisted system app and proves nothing on its own) but that it is the only
alarm API carrying a user-visible commitment: a status-bar icon and a
`getNextAlarmClock()` entry. One dump after one call would settle it.

**Therefore a source patch to expo-notifications cannot help** — it forces a
branch already being taken. The remaining candidate is
`AlarmManager.setAlarmClock()`, a different alarm type OEMs generally honour
because it backs alarm-clock apps (it surfaces in the status bar and the
next-alarm API, which is likely why it survives). Unproven here.
**Design decision — not yet agreed.**

**Also outstanding:** the Doze exemption above is still enabled on the test
device, so it is no longer representative of a fresh install. Turn it back off
before re-running any other D7 phase.

This also explains why the Phase 0/1/2/4 passes are weaker evidence than they
look: a one-hour window can be satisfied by a Doze maintenance window, so
"the notification arrived" does not prove "it arrived on time". **Record how
late each delivery was, not just that it happened.**

**Still outstanding:**

- Phase 3 — forced Doze:
  `adb shell dumpsys battery unplug` +
  `adb shell dumpsys deviceidle force-idle`, then
  `adb shell dumpsys alarm | grep -A 15 com.curios.remindme`.
  Restore with `dumpsys battery reset` / `deviceidle unforce`.
- Phase 5 — after a reboot, **without opening the app** (exercises
  `RECEIVE_BOOT_COMPLETED` and `tasks/rescheduleTask.ts`).
- **App Standby Buckets.** Every run so far was on a freshly-used app, i.e.
  bucket 10 (`ACTIVE`) — the best case, and not how a reminder app is used.
  Simulate the real case:
  ```
  adb shell am set-standby-bucket com.curios.remindme restricted
  adb shell am get-standby-bucket com.curios.remindme
  # set a reminder ~10 min out, unplug, screen off
  adb shell am set-standby-bucket com.curios.remindme active   # reset after
  ```
- **Other OEMs.** OxygenOS has shared the ColorOS codebase since OxygenOS 12,
  so this pass is reasonable evidence for Oppo and Realme too. Still
  uncovered, in priority order: **Xiaomi (MIUI/HyperOS)** — most aggressive,
  and its Autostart has no equivalent elsewhere; **Samsung (OneUI)** — its
  "Deep sleeping apps" demotes by usage over days; **Vivo/iQOO (Funtouch)**.

Note for Windows: `adb` is not on PATH; use the full path recorded above, and
`Select-String` in place of `grep` when running from PowerShell.

### D1 — Does Android Auto Backup actually restore reminders? · `PENDING`
*Highest value: could close backlog item 1 on Android.*

Evidence so far (2026-08-10, user's OEM device): Settings → Back up other data
lists Reminders at 11 MB with the toggle on, so Auto Backup is enabled and has
run. That does **not** prove our data is in the set — 11 MB is far larger than
our few KB of JSON and is almost certainly the JS bundle/image cache (sitting
next to Expo Go at 12 MB is the tell). What matters is whether `RKStorage` (the
SQLite DB behind AsyncStorage) is included, and a settings screen only shows
the sending half.

1. **Export first** via Settings → Back up reminders. If the restore fails, the
   reminders on that phone are gone.
2. `adb shell pm list packages | grep curios` → must print
   `com.curios.remindme`. A package-name mismatch produced a false negative in
   async-storage's own bug report.
3. `adb shell bmgr backupnow com.curios.remindme` → wait for
   `Backup finished with result: Success`.
4. `adb uninstall com.curios.remindme` — via adb, **not** the launcher; some OEM
   launchers offer "keep app data" and would invalidate the test.
5. Reinstall and **DO NOT LAUNCH THE APP**. Restore lands after install and
   before first launch; opening it early is the most common false negative.
6. `adb shell dumpsys backup | grep -i "restore\|com.curios"`, then open the app.

Reminders present → Auto Backup works end to end. App empty → the 11 MB is
cache; confirm with `adb shell run-as com.curios.remindme ls -la databases/`
(debuggable builds only). Must be the standalone build, **not Expo Go**.
**Do not ship Settings copy claiming automatic backup until this passes** — a
wrong promise about data safety is worse than saying nothing.

---

## B. Notifications

### D3 — Mark Done / Snooze with the app fully closed · `PENDING`
The headless TaskManager path (`tasks/notificationResponseTask.ts`). Jest
covers the foreground listener only. Kill the app from recents, wait for a
reminder to fire, press the action from the tray.

### D15 — Tap the notification body, then press Mark Done on it · `PENDING`
*Added 2026-08-23 for the `53bc7b9` fix.* The dedupe key used to be the
notification id alone, so one notification could be acted on **once ever** —
tapping the body burned the key and the action button was then silently
dropped. Send reminders could never be completed from the tray at all.

Sequence that must now work: notification fires → tap the **body** (app opens)
→ go back → pull down the tray → press **Mark Done** on that same
notification → reminder is completed. Repeat for **Snooze**.

### D4 — Duplicate notifications · `PENDING`
The `ALARM_EARLY_OFFSET_MS` fix. Needs a reminder left to fire naturally,
ideally across a background-fetch cycle.

### D2 — Vibration setting · `BLOCKED` — needs a fresh install or cleared app data
Android creates a notification channel once and never updates it, so the
`reminders-alarm-novibrate` channel will not exist on an existing install and
the fix will look like it failed. See the 2026-08-09 ledger entry.

### D5 — Large notification icon · `BLOCKED` — needs a native build
The `withLargeNotificationIcon` config plugin.

### D16 — Personalized snooze re-alert · `PENDING`
*Added 2026-08-23.* With a name set, snoozing a reminder should produce a
notification titled "Still waiting, <name> — <title>". With no name set it must
read as the plain title, with no dangling greeting.

---

## C. Feature end-to-end

### D9 — Remind-someone-else Tier 1 · `PARTIAL`
**Passing** (2026-08-24, user's OEM device): the send screen opens with the
message pre-filled, the signature and invite line render, and WhatsApp receives
the pre-filled text.

**Still outstanding** (needs a native build — `expo-contacts` has no OTA path):
the full loop end to end. Create a reminder with a recipient a minute
out → lock the phone → tap the notification when it fires (body must read
"Message &lt;name&gt;", not "Reminder!") → send screen opens with the message and
invite line → toggle the invite off and watch the preview update → send on
WhatsApp → return → reminder still under "Remind Someone" → mark done → moves
to Completed.

Specifically unproven: `wa.me` opening WhatsApp rather than a browser **on a
device where WhatsApp was installed after this app** — App Links verification
is a real failure mode, and the confirmed pass above does not cover it; the
"number not on WhatsApp" path; `sms:` pre-fill across Samsung Messages,
Google Messages and iOS Messages; the contacts permission dialog and the
denied-then-re-granted path; contacts list scrolling at 1000+ contacts; and the
notification tap from a **cold start**. Also confirm READ_CONTACTS does not
trip Play Store review.

### D6 — Malayalam dictation end-to-end · `PENDING`
Parser tests use *typed* text; the speech recognizer's actual output is
unverified. Settings → Debug logs shows the raw transcription.

### D10 — Name capture and personalization · `PARTIAL`
*Added 2026-08-23.*

**Passing** (2026-08-24, user's OEM device): the first-launch prompt appeared
and stored the name, the header greets by name, the avatar shows initials, and
outgoing messages carry the "— &lt;name&gt;" signature.

One defect found and fixed during this pass: a full name truncated the header
to "Good morn.." (`4a2c522`). Not re-verified — see D14.

**Still outstanding** (needs a **fresh install** for the prompt itself):

- The sheet appears **after** the permission flow, never stacked behind the
  system permission dialog. (Ordering unconfirmed — the prompt was seen, but
  not whether it could ever race the permission dialog.)
- **Skip** it → prompt never returns on later launches → header still offers
  "Hi there" as a tap target to set a name.
- A **Malayalam** name renders in Noto Sans Malayalam, not as blank boxes.
- Settings → Your name edits it; Cancel leaves it unchanged.

### D11 — Quiet hours · `PENDING`
*Added 2026-08-23.*

- Settings → Smart Alerts opens; the two time pickers set start and end.
- Create a reminder inside quiet hours → the confirm sheet appears →
  **Keep it** stores the chosen time unchanged.
- Repeat → **Move to &lt;end&gt;** stores the window's end instead.
- Create one outside quiet hours → **no sheet at all**.
- **Midnight wrap:** with 22:00–08:00, both 23:30 and 02:00 must count as
  inside. This is the classic off-by-one.
- Set start == end → treated as *no* quiet hours, i.e. nothing is suppressed.
  Getting this backwards would silence every notification the app sends.

### D12 — Vague-task hint · `PENDING`
*Added 2026-08-23.* Type "Sort out the insurance" → hint appears suggesting a
first step. "Use as is" dismisses it and it must not return for that text.
Saving is never blocked. Typing Malayalam must never trigger it.

### D13 — "Why tasks slip" explainer · `PENDING`
*Added 2026-08-23.* Smart Alerts → Why tasks slip shows four cards; "Read more"
expands the article and its five citations. Check readability in **both**
themes and that long citation lines wrap rather than overflow.

---

## D. Visual and layout

### D8 — Dark mode, visually · `PASS` (2026-08-24, user's OEM device)
One defect found and fixed during this pass: the status-bar icons were
invisible with the app set to Light on a dark-mode phone (`017b785`). That fix
is **not** re-verified — see D14.

Re-run this whole walk after any new screen lands. The screens added since
this passed (Smart Alerts, Why tasks slip, the quiet-hours and name sheets)
were **not** part of it.
Jest asserts *token values*, not pixels. Walk every screen with the system
theme dark: home list (incl. an overdue card and a completed one), add/edit,
reminder detail, settings (incl. both modals), about, smart alerts, why tasks
slip, the snooze sheet, the confirm sheet, the quiet-hours sheet, the name
sheet, the exact-alarm banner, and the error fallback. Watch for text that
vanishes into its background, the status bar, and modal overlays.

Toggle the system theme **while the app is open** — the switch should be
immediate. Then exercise Settings → Appearance: Light on a dark device and Dark
on a light device should both win; System hands control back to the OS; the
choice survives a restart; and a forced crash should show the error screen in
the chosen theme.

### D14 — 2026-08-24 device-feedback fixes · `PENDING`
Seven findings from a real device, all fixed but none re-verified. Four were
invisible to the entire test suite.

- **Settings scrolls** all the way to Debug logs. (Root was a plain `View` —
  everything past one viewport was unreachable.)
- **Status bar readable in both themes**, including the combination that broke
  it: app set to **Light** on a phone in **dark mode**, and the reverse.
- **Header greeting does not truncate**, with a short name, a long name, and a
  Malayalam name.
- **Quick-add**: buttons sit below the input; long text uses the full width.
  Check how much of the list is still visible above the fold — the card is
  taller now.
- **Recipient chip** names the chosen contact and its × removes them.
- **Contact picker** stays above the keyboard while typing a search,
  *especially with only one or two matches* — that is when the sheet is
  shortest and used to vanish entirely.
- **Send reminder → edit** opens the editor from the send screen's header.

---

## E. Data safety

### D17 — Corrupt-store quarantine · `PENDING`
*Added 2026-08-23 for `fe10f95`.* Hard to trigger naturally; needs a
debuggable build. Corrupt the store deliberately:

```
adb shell run-as com.curios.remindme    # debuggable builds only
```

then damage the `@reminders_v1` value in `databases/RKStorage`. Relaunch: the
app must open with an **empty list rather than crashing**, and a
`@reminders_corrupt_<timestamp>` key must hold the original payload. Adding a
new reminder afterwards must **not** destroy that quarantined copy.

### D18 — Backup carries the new fields · `PENDING`
*Added 2026-08-23.* Settings → Back up reminders after using the app for a
while. The exported JSON should carry `createdAt`, `completedAt`, `snoozeCount`
and `originalDatetime` on reminders, plus `quietHours` in `settings`. Restore
on a second device and confirm quiet hours actually applies.

Known and accepted: `mergeReminders` is "local always wins", so a re-typed
reminder beats a backup copy carrying real history. Deliberate — see the spec.
