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

## All scenarios at a glance

Every item, its status, what is left to do, and **whether a machine could run
it unattended**. Last updated after the automated run of **2026-08-29**
(OnePlus CPH2569, EAS preview build) — see that section below for evidence.

**Where things stand: 6 `PASS` · 6 `PARTIAL` · 10 `PENDING` · 1 `BLOCKED`.**

| Mark | Meaning |
| --- | --- |
| `AUTO` | Fully scriptable. Driving *and* the pass/fail assertion are machine-readable. |
| `SEMI` | Driving and setup scriptable; the final judgement needs a human sense (sight, sound, touch) or a second party. |
| `MANUAL` | Needs a human. No machine-readable oracle exists. |

| ID | Scenario | Status | Last run | Auto? | What is still outstanding |
| --- | --- | --- | --- | --- | --- |
| [D19](#D19) | `setAlarmClock()` exact delivery | `PASS` | 2026-08-24 | `AUTO` | Nothing blocking. Open questions only: `FLAG_WAKE_FROM_IDLE` unset yet delivery exact; `ALARM_EARLY_OFFSET_MS` now needs revisiting. |
| [D20](#D20) | EAS re-verify after setAlarmClock | `PASS` | **2026-08-29** | `SEMI` | Lock screen with a **real Clock-app alarm set alongside** — the slot logic is proven, the lock-screen text has not been looked at. |
| [D12](#D12) | Vague-task hint | `PASS` | **2026-08-29** | `AUTO` | Nothing. All five sub-checks verified. |
| [D8](#D8) | Dark mode, visually | `PASS` | 2026-08-24 | `SEMI` | Re-walk needed: Smart Alerts, Why tasks slip, quiet-hours and name sheets all landed **after** this passed. |
| [D2](#D2) | Vibration setting, 4 combinations | `PARTIAL` | **2026-08-29** | `SEMI` | Config half done (all four channels correct, legacy channel gone). Outstanding: does it actually **buzz** in rows 2 and 3 — phone on a table, not in hand. |
| [D7](#D7) | OEM battery-killer survival | `PARTIAL` | 2026-08-24 | `SEMI` | The one run that closes it: alarm + silent pair, overnight, **unplugged**, lateness recorded to the minute. |
| [D9](#D9) | Remind-someone-else Tier 1 | `PARTIAL` | **2026-08-29** | `SEMI` | `wa.me: verified` — but on the *safe* install ordering. Still open: WhatsApp installed **after** the app, the not-on-WhatsApp path, `sms:` across OEMs, permission denied→re-granted, 1000+ contacts, cold-start tap. |
| [D10](#D10) | Name capture and personalization | `PARTIAL` | 2026-08-24 | `SEMI` | Needs `pm clear` (destructive — export first): sheet-vs-permission ordering, Skip persistence, Malayalam name glyphs. |
| [D14](#D14) | Seven 2026-08-24 device fixes | `PARTIAL` | **2026-08-29** | `SEMI` | #1 scroll and #3 greeting verified. Outstanding: #2 status bar (both theme crossings), #4 quick-add fold, #5 recipient chip, #6 picker above keyboard, #7 send→edit. |
| [D1](#D1) | Android Auto Backup restores reminders | `PENDING` | — | `AUTO` | **Runnable on the installed release build** — the pass criterion is read off the screen. Destructive (uninstall) — export first. Highest value: could close backlog item 1. |
| [D3](#D3) | Mark Done / Snooze, app fully closed | `PENDING` | **2026-08-29** (inconclusive) | `SEMI` | Attempted; `input tap` cannot press a notification action on ColorOS. Needs a human thumb or an instrumented runner. |
| [D15](#D15) | Body tap, then Mark Done | `PENDING` | — | `SEMI` | Same ColorOS limitation as D3. |
| [D4](#D4) | Duplicate notifications | `PENDING` | — | `AUTO` | Needs a ~20-minute horizon so a BackgroundFetch sweep runs before firing. Nothing blocks it. |
| [D5](#D5) | Large notification icon | `BLOCKED` | — | `SEMI` | Needs a native/EAS build **and** an eye on the expanded tray. |
| [D6](#D6) | Malayalam dictation end to end | `PENDING` | — | `MANUAL` | A human speaking Malayalam. No substitute. |
| [D11](#D11) | Quiet hours incl. midnight wrap | `PENDING` | — | `AUTO` | Nothing blocks it — **best remaining automation candidate**, and the midnight wrap is the classic off-by-one. |
| [D13](#D13) | "Why tasks slip" explainer | `PENDING` | — | `SEMI` | Both themes, largest font, citation-line wrap. |
| [D16](#D16) | Personalized snooze re-alert | `PENDING` | — | `AUTO` | Nothing blocks it — one string comparison. Needs a fire-then-snooze cycle. |
| [D17](#D17) | Corrupt-store quarantine | `PENDING` | — | `AUTO` | **The only item that truly needs a debuggable build** (`eas build --profile development`) — it must write into private sqlite. |
| [D18](#D18) | Backup carries the new fields | `PENDING` | — | `AUTO` | **Runnable on release** via the share sheet. Generate the data first: complete one, snooze another twice, set quiet hours. |
| [D21](#D21) | Un-completing re-arms the reminder | `PASS` | **2026-08-29** | `AUTO` | Nothing. Both branches verified over adb: future re-arms and rings (338 ms late, screen off); past stays overdue and silent. |
| [D22](#D22) | Alarm copy + status-bar explainer | `PARTIAL` | **2026-08-29** | `SEMI` | Copy, expand/collapse and the intent all pass on device. **One FAIL:** the app is absent from Android's *Alarms & reminders* list, so the escape-hatch paragraph was false — copy rewritten and the button removed. Needs a re-run on a build carrying that. |
| [D23](#D23) | Pre-existing reminders re-arm on launch after an update | `PASS` | **2026-08-30** | `AUTO` | Nothing. Fresh install confirmed 0 alarms registered, then both pre-existing future reminders were armed correctly within 4 s of launch. |

**Totals: 9 `AUTO`, 13 `SEMI`, 1 `MANUAL`** (revised 2026-08-30 after D23 was added as AUTO).

### What blocks what, right now

- **Needs a new build** (carrying the uncommitted 2026-08-28 fixes): D21, D22.
- **Needs a debuggable build**: **D17 only.** Build one with
  `pnpm --filter @workspace/mobile run build:android:dev` (the `development`
  profile — `developmentClient: true`, so the Gradle *debug* variant, hence
  `android:debuggable="true"` and a working `run-as`). Note a dev client
  carries no JS bundle: it needs Metro (`npx expo start --dev-client`) or an
  EAS Update, so it is not an unattended artifact and not the shipping one.
  **Corrected 2026-08-29** — D1 and D18 were previously listed here in error;
  both are runnable on the release build (D1's oracle is on screen, D18's
  export goes through the share sheet). `run-as` is only a convenience there.
- **Needs a human present**: D2 (buzz), D3/D15 (tray press), D5, D6, D8, D13,
  and most of D14.
- **Nothing blocking, just not run yet**: D4, D11, D16. These three are the
  cheapest wins left.

### Machine-readable oracles

How each item would be asserted without a person, kept here so the table above
stays about status:

| ID | Oracle |
| --- | --- |
| D1 | `bmgr backupnow`, reinstall, read `RKStorage` via `run-as` |
| D2 | Channel config from `dumpsys notification`; buzz events from `dumpsys vibrator_manager` |
| D3 / D15 | `pidof` for the kill, storage read for the result (the *press* is the un-automatable part) |
| D4 | Posted-notification count == 1; `dumpsys alarm` registration count |
| D5 | Drawable present in the APK |
| D7 | `AlarmManager` delivery log gives lateness to the ms |
| D8 / D13 / D14 | Navigation + `screencap`; `uiautomator` bounds for overlap and ellipsis |
| D9 | `pm get-app-links`, permission grant/revoke, notification body text |
| D10 | `pm clear`, then `uiautomator` for sheet ordering and skip-persistence |
| D11 | Stored datetime after each choice; sheet presence via `uiautomator` |
| D12 | Hint node present/absent; save succeeds |
| D16 | Notification **title string** from `dumpsys notification` |
| D17 | sqlite write, relaunch, key list |
| D18 | JSON field assertions |
| D19 / D20 / D21 | `dumpsys alarm` `windowLength`/`flags`, `Next alarm clock` slot, `AlarmManager` delivery log |
| D22 | Label strings via `uiautomator`; delivery lateness with the permission revoked |

### What automation would actually take

**None of this exists today.** There is no UI automation harness in the repo —
`pnpm test` is Jest only, which is precisely why this file exists. Read the
column above as "could be automated", not "is".

The gap is narrower than it looks, because the `AUTO` rows mostly do not need
UI driving at all. D17 is pure sqlite. D18 is pure JSON. D19, D21 and much of
D20 are `dumpsys alarm` and `logcat -s AlarmManager`. D16 is one string
comparison against `dumpsys notification`. Those are shell scripts, not a
framework.

What needs a real harness (Maestro is the usual fit for Expo) is anything that
must *create a reminder through the UI* or *press a notification action*:
D3, D11, D12, D15. Worth it — D11's midnight wrap is exactly the kind of
off-by-one a machine should be catching on every build, not a person at 02:00.

**Two limits worth being honest about.**

1. **A machine cannot tell you the app feels right.** Every `SEMI` row bottoms
   out in a human sense, and the four that matter most — D8 contrast, D14's
   status bar, D2's buzz, D5's icon — are exactly the ones that shipped broken
   before, because Jest could not see them either. Automating the other rows
   buys time to look harder at these, it does not replace them.
2. **This file's `PASS` rule still stands.** "A `PASS` must come from a human
   who actually watched it happen" was written against the failure mode of
   trusting green tests. An automated device check is much stronger evidence
   than a Jest run — it exercises the real OS — but it is still a script
   asserting what someone *expected* to matter. Suggested convention if this
   gets built: automated runs report `AUTO-PASS`/`FAIL` and are excellent
   regression alarms, but promoting an item to `PASS` stays a human act.

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

## How each item is written

Every item gives **Setup → Steps → Pass → Fails if**, so it can be run by
someone who did not write the feature and without reading the source.

- **Setup** — build type, install state and any settings that must be set
  *before* step 1. Getting this wrong is the most common cause of a false
  negative in this file.
- **Steps** — numbered and literal. Tap targets by their on-screen label, adb
  commands in full. If a step needs a wait, say how long.
- **Pass** — what you must *observe*. Written so the answer is yes or no, never
  "looks fine".
- **Fails if** — the specific failure signatures worth naming, especially ones
  that look like something else. A test you cannot fail is not a test.

Prose above those headings is the *why* — the root cause, the prior bug, the
reason the check exists. Keep it; it is what stops a future reader from
"simplifying" a step that is load-bearing.

## Automated run — 2026-08-29, OnePlus CPH2569 (EAS preview build, installed 2026-08-25)

Driven over adb (`dumpsys alarm` / `dumpsys notification` / `logcat` /
`uiautomator`). **The build under test predates the 2026-08-28 fixes for
backlog items 19 and 20** — Settings still reads "Play alarm sound by default",
so [D21](#D21) and [D22](#D22) could not be exercised at all and stay `PENDING`.

The app was **not** doze-whitelisted (standby bucket 10 / ACTIVE), which is the
condition these results should be read under.

| ID | Result | Evidence |
| --- | --- | --- |
| [D20](#D20) | **`PASS`** (release build, both halves) | Alarm reminder: `windowLength 0`, `flags 0x9`, `exactAllowReason=policy_permission`, holds the `Next alarm clock` slot. Silent reminder created for **5 h earlier** registered `windowLength 3600000`, `flags 0x4` and **did not take the slot** — the discriminating case. Delivery watched: target 12:44:47 − 60 s offset → fired **12:43:47**, app closed. |
| [D2](#D2) | config half **`PASS`**, perception outstanding | All four channels exist and differ correctly: `reminders-silent` (imp 4, vib off, no sound), `reminders-vibrate` (imp 4, **vib on**, no sound), `reminders-alarm-novibrate` (imp 5, **vib off**, alarm sound), `reminders-alarm` (imp 5, vib on, alarm sound). The legacy `reminders` channel is gone — migration worked. No `pm clear` was needed. |
| [D12](#D12) | **`PASS`** | "Sort out the insurance" → hint; **Use as is** dismissed it and it did **not** return on retyping the same text; "Deal with the taxes" still hinted (dismissal is per-text, not global); "Call Dr Menon at 4pm" → no hint; Malayalam (`ശരിയാക്കണം`) → no hint. |
| [D14](#D14) #1 | **`PASS`** | Settings scrolls to **Debug logs**. |
| [D14](#D14) #3 | **`PASS`** (partial) | Header renders "Good afternoon, Anand" complete, with "Anand Jayaram" stored. Long and Malayalam names still untested. |
| [D9](#D9) | one sub-check **`PASS`** | `pm get-app-links com.whatsapp` → `wa.me: verified`. **Caveat:** WhatsApp here was installed 2024-06-26, the app 2026-08-25, so this is the *safe* ordering — D9's actual worry (WhatsApp installed *after* the app) is still untested. |
| [D3](#D3) / [D15](#D15) | **INCONCLUSIVE — not automatable on this ROM** | See below. |

**Incidental confirmations** (not formal items): natural-language parsing
resolved "tomorrow at 3pm" → `Tomorrow · 15:00` and "in 3 minutes" → `12:44`,
stripping the time words from the title each time; the fired notification used
channel `reminders-alarm` at importance 5 with all three actions present
(`Snooze 15 min` / `More…` / `Mark Done`); and all three pending alarms
survived the app being swiped from recents (`pidof` empty, registrations
intact).

### Two findings from this run

**1. `input tap` cannot press notification action buttons on ColorOS.** Tapping
the exact bounds of **Mark Done** is swallowed by SystemUI as a row click that
never triggers:

```
SystemUi--Notification: clickRow = 0|com.curios.remindme|... triggerClick = false,
  click reason = REASON_NORMAL_ROW_OR_CHILD_ROW_IN_GROUP
```

The notification stayed posted, no activity started, the reminder stayed
pending. **This is a harness limitation, not evidence of an app bug** — do not
record it as a D3/D15 failure. It does mean the `AUTO` rating given to D3 and
D15 in the table above was wrong; they are `SEMI` at best on this ROM, and a
real press needs a human thumb or an instrumented (UiAutomator/Maestro) runner
rather than raw `input tap`.

**2. ColorOS actively freezes the app process.** Visible throughout the run:

```
OplusHansManager: unfreeze uid: 10266 com.curios.remindme ... reason: Broadcast
OplusHansManager: freeze   uid: 10266 com.curios.remindme ... scene: LcdOn
```

The process is thawed to receive a broadcast and re-frozen ~5 s later. This is
a layer *above* AOSP Doze and is the mechanism behind D7's "ColorOS's own
battery layer sits on top and may defer further". Worth keeping in mind for
[D3](#D3) and any future background work: the alarm itself is unaffected
(delivery was exact), but anything expecting to keep running is not.

### Test data left on the device

Three reminders were created and **could not be deleted through the UI** — no
delete affordance was found on the edit screen, on swipe, or on long-press.
Please remove them by hand:

- `D3 tray test` — today 12:44, already fired, notification may still be in the
  tray
- `Silent routing check` — tomorrow 10:00
- `Sort out the insurance` — tomorrow 15:00

Nothing else was changed. No `pm clear`, no uninstall, no settings edits; the
Gboard language was switched with the ordinary globe key and left on English.

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

<a id="D20"></a>
### D20 — Re-verify on an EAS build after the setAlarmClock change · `PASS` (2026-08-29, OnePlus CPH2569, EAS preview)
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

  **Still to observe — two runs, both on the EAS build.**

  *Run 1: actual delivery.* Registration is correct; a firing has never been
  watched on this artifact.
  1. Create an **alarm** reminder 10 minutes out.
  2. `adb shell dumpsys battery unplug` then `adb shell input keyevent 26`
     (screen off), then `adb shell dumpsys deviceidle force-idle`.
  3. Watch the delivery log and record lateness to the millisecond:
     ```
     adb logcat -s AlarmManager | grep curios
     ```
  4. **Always restore:** `adb shell dumpsys deviceidle unforce` and
     `adb shell dumpsys battery reset`.
  *Pass:* delivered within a second of target, `late by` effectively 0.

  *Run 2: the shared alarm slot.* Android has exactly **one** "next alarm
  clock" slot, and the risk is this app evicting the user's real morning alarm.
  1. Set a genuine alarm in the phone's **Clock** app for tomorrow morning.
  2. Create a **silent** reminder for sooner than that alarm.
  3. Check the lock screen, and:
     ```
     adb shell dumpsys alarm | grep -A2 "Next alarm clock"
     ```
  4. Now create an **alarm** reminder for *before* the clock alarm and repeat.
  *Pass:* at step 3 the slot and the lock screen still show the **Clock app's**
  alarm — a silent reminder must never take the slot. At step 4 the reminder
  does take it, which is the documented trade-off, not a bug.
  *Fails if:* step 3 shows the reminder in the slot, or the lock screen's
  "next alarm" text is replaced. That would mean the app silently hides the
  user's real alarm, which is the worst outcome in this whole file.

**LIMITATION this makes explicit — silent reminders stay inexact on ColorOS.**
The 21m43s window above is the D7 downgrade, still fully in force for anything
not routed through `setAlarmClock()`. On this ROM only alarm-type reminders are
punctual; a silent reminder can arrive ~20 minutes late, and up to an hour for a
next-day one. `ALARM_EARLY_OFFSET_MS` covers only the first 60s of that. This is
the accepted cost of not hijacking the system alarm slot — but it is a real
product decision, not a technicality, and it deserves revisiting (default the
alarm toggle on? say so in the UI?).
- Confirm the release build still shows `window=0` — release and debug can
  differ in OEM battery treatment. With an alarm reminder pending:
  ```
  adb shell dumpsys alarm | grep -A4 curios.remindme
  ```
  *Pass:* `windowLength 0` and `flags 0x9` on the alarm-type reminder.
  *Fails if:* the release build shows a non-zero window where debug showed 0.

<a id="D19"></a>
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

<a id="D7"></a>
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

**The one run that closes this item.**

*Setup.* Unplugged, battery optimization at its default aggressive setting, app
**not** doze-whitelisted. Do this in the evening.

*Steps.*
1. Create **two** reminders for the next morning at the same time: one
   **alarm**, one **silent**. The pair is the point — it measures the two
   routes under identical conditions.
2. Record what was registered before you put the phone down:
   ```
   adb shell dumpsys alarm | grep -B2 -A6 curios.remindme
   ```
   Note `windowLength` and `flags` for each.
3. **Unplug.** Screen off. Leave the phone alone all night — no charger, no
   picking it up.
4. In the morning, note the delivery time of each **to the minute, from the
   notification itself**, before touching anything.
5. Plug in and recover the ground truth:
   ```
   adb logcat -b all -d -s AlarmManager | grep curios
   ```

*Pass.* The **alarm** reminder arrives within seconds of its target. The
**silent** one is expected to be late — record *how* late; that number is the
honest figure for the limitation documented in D20, and right now the file
only has a theoretical one-hour upper bound.

*Fails if.* The alarm reminder is more than a minute late, or does not arrive
at all. That would mean `setAlarmClock()` does not survive real overnight Doze
on this ROM, and D19's forced-Doze pass was optimistic.

**Record lateness, never arrival.** "It fired" is the weak evidence that made
the original Phase 4 pass misleading.

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

<a id="D1"></a>
### D1 — Does Android Auto Backup actually restore reminders? · `PENDING`
*Highest value: could close backlog item 1 on Android.*

Evidence so far (2026-08-10, user's OEM device): Settings → Back up other data
lists Reminders at 11 MB with the toggle on, so Auto Backup is enabled and has
run. That does **not** prove our data is in the set — 11 MB is far larger than
our few KB of JSON and is almost certainly the JS bundle/image cache (sitting
next to Expo Go at 12 MB is the tell). What matters is whether `RKStorage` (the
SQLite DB behind AsyncStorage) is included, and a settings screen only shows
the sending half.

**Setup.** The standalone build, **not Expo Go**. A few reminders in the app.

**Do not change build type mid-test.** Auto Backup restore requires the **same
signing key**. Both EAS profiles use the project's managed keystore, so
preview -> development is fine, but a local `npx expo run:android` APK is signed
with the *debug* keystore. Backing up from an EAS build and restoring onto a
locally-built one fails on signature — and looks exactly like Auto Backup being
broken. Stay on one artifact for the whole run.

A debuggable build is **not** required here: the pass criterion is read off the
screen. `run-as` below only diagnoses the failure case.

**Steps.**
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

**Pass.** The reminders are present after the reinstall, without restoring from
your own backup. That is Auto Backup working end to end, and it closes backlog
item 1 on Android.

**Fails if.** The app opens empty — the 11 MB is cache, not our data. Confirm
before recording it:
```
adb shell run-as com.curios.remindme ls -la databases/    # debuggable only
```
`RKStorage` absent or empty means AsyncStorage was never in the backup set.

**Do not ship Settings copy claiming automatic backup until this passes** — a
wrong promise about data safety is worse than saying nothing.

---

## B. Notifications

<a id="D3"></a>
### D3 — Mark Done / Snooze with the app fully closed · `PENDING`
The headless TaskManager path (`tasks/notificationResponseTask.ts`). Jest
covers the foreground listener only, so the case that matters most — the app
not running at all — is entirely unproven.

**Setup.** Any build. Notifications granted. Note your snooze preset
(Settings → Smart Alerts) so you know what to expect in step 7.

**Steps.**
1. Create a reminder **2 minutes** out, alarm on, titled `D3 mark done`.
2. Swipe the app away from recents.
3. Confirm the process is actually dead — this is the whole point of the test:
   ```
   adb shell pidof com.curios.remindme     # must print NOTHING
   ```
4. Screen off. Wait for the notification.
5. Pull down the tray and press **Mark Done**. **Do not open the app.**
6. Now open the app and look at the list.
7. Repeat steps 1–5 with a second reminder, pressing **Snooze** instead, and
   wait out the snooze interval.

**Pass.**
- The notification disappears from the tray when Mark Done is pressed.
- On opening the app the reminder is under **Completed**, not pending.
- The snoozed one re-fires after the preset interval, and its notification
  title reads "Still waiting, &lt;name&gt; — …" if a name is set (that is D16).

**Fails if.**
- Pressing the action does nothing, or the notification stays in the tray.
- The reminder is still pending when you open the app — meaning the action was
  handled by the *foreground* listener on launch, not headlessly, which is
  exactly the bug this test exists to catch.
- The app's UI visibly launches when you press the action. The headless task
  may start the process (fine, `pidof` will print after step 5), but no screen
  should appear.

<a id="D15"></a>
### D15 — Tap the notification body, then press Mark Done on it · `PENDING`
*Added 2026-08-23 for the `53bc7b9` fix.* The dedupe key used to be the
notification id alone, so one notification could be acted on **once ever** —
tapping the body burned the key and the action button was then silently
dropped. Send reminders could never be completed from the tray at all.

**Setup.** Any build. At least one reminder able to fire while you watch.
Because the bug was *one action per notification, ever*, the body tap in step 2
is the load-bearing step — skipping it makes the test pass vacuously.

**Steps.**
1. Create a reminder 2 minutes out, titled `D15 dedupe`. Wait for it to fire.
2. Tap the notification **body**. The app opens on the reminder detail.
3. Press back / home to leave the app. **Do not** dismiss the notification.
4. Pull down the tray. The same notification must still be there.
5. Press **Mark Done** on it.
6. Repeat steps 1–5 with a fresh reminder, pressing **Snooze** at step 5.
7. Repeat once more with a **send reminder** (one with a recipient) — these
   could never be completed from the tray at all under the old key.

**Pass.** In all three runs the action at step 5 takes effect: the reminder is
completed (or re-scheduled for snooze) and the notification clears.

**Fails if.** The action is silently dropped after the body tap — nothing
happens, no error, and the reminder stays pending. That silence is the
signature of the old dedupe key being burned by the tap.

<a id="D4"></a>
### D4 — Duplicate notifications · `PENDING`
The `ALARM_EARLY_OFFSET_MS` fix. The failure needs the ~15-minute
BackgroundFetch sweep to run *while* a reminder is inside the 60-second early
window, so a reminder that fires two minutes after you create it will never
reproduce it. **The horizon is the test.**

**Setup.** Fresh app start. Nothing else pending, so a second notification is
unambiguous.

**Steps.**
1. Create a reminder **~20 minutes** out — long enough that at least one
   BackgroundFetch cycle runs before it fires.
2. Confirm exactly one registration exists:
   ```
   adb shell dumpsys alarm | grep -c curios.remindme
   ```
3. Background the app (home, do not swipe away). Leave the phone alone.
4. Optionally force the sweep rather than waiting:
   ```
   adb shell cmd jobscheduler run -f com.curios.remindme 999
   ```
   then re-run the count in step 2.
5. When it fires, **count the notifications in the tray**.
6. Re-run step 2's command after delivery.

**Pass.** Exactly **one** notification in the tray. The count in step 2 stays
at 1 across the sweep, and drops to 0 after delivery.

**Fails if.** Two notifications with the same title, typically ~60 s apart —
the delivered copy plus a re-armed duplicate. Also a fail if step 6 still shows
a pending registration after delivery: that is an orphan no id can cancel, and
it will fire again later.

<a id="D2"></a>
### D2 — Vibration setting · `PARTIAL` — channel config verified 2026-08-29; perception outstanding
Android creates a notification channel once and never updates it, so the
`reminders-alarm-novibrate` channel will not exist on an existing install and
the fix will look like it failed. See the 2026-08-09 ledger entry.

**Setup — this is what unblocks the item.** Export first (Settings → Back up
reminders; the next command destroys all data), then:
```
adb shell pm clear com.curios.remindme
```
Confirm the channels were recreated before testing anything:
```
adb shell dumpsys notification --noredact | grep -A3 "reminders-alarm"
```
All four channels must be listed, including `reminders-alarm-novibrate`. If
that one is missing, the clear did not take and every result below is void.

**Steps.** Run all four combinations, one reminder each, ~2 minutes out, phone
**on the table not in hand** (you cannot feel a buzz you are holding through a
case):

| # | Alarm toggle | Vibrate toggle | Expect |
| --- | --- | --- | --- |
| 1 | on | on | sound **and** buzz |
| 2 | on | off | sound, **no buzz** |
| 3 | off | on | **buzz, no sound** |
| 4 | off | off | silent, no buzz |

**Pass.** All four behave as tabled. Row 3 is the one the original bug broke —
turning sound off also killed the buzz with no way back.

**Fails if.** Rows 2 and 3 behave identically to row 1 or row 4, i.e. the two
settings are still coupled. Also a fail if the phone's own Do Not Disturb or
ring mode is confounding it — check that before recording a result.

<a id="D5"></a>
### D5 — Large notification icon · `BLOCKED` — needs a native build
The `withLargeNotificationIcon` config plugin. A config plugin only takes
effect through prebuild, so an OTA update can never carry this — and a *local*
build is not evidence either (see Test environment).

**Setup.** An **EAS** build:
`eas build --platform android --profile preview`.

**Steps.**
1. Confirm the drawable actually made it into the artifact before testing by
   eye:
   ```
   adb shell run-as com.curios.remindme ls res/drawable* | grep -i notification
   ```
   (debuggable builds only — otherwise unzip the APK and look under `res/`.)
2. Fire any reminder.
3. **Expand** the notification in the tray — the large icon only appears in the
   expanded form.
4. Check the collapsed form's small icon too, against both a light and a dark
   system theme.

**Pass.** The expanded notification shows the app's large icon, in colour and
not clipped. The small status-bar icon is a recognisable silhouette.

**Fails if.** The large icon is absent (plugin did not run), shows as a white
or grey square (Android's fallback when the drawable is the wrong type), or the
small icon renders as a solid blob — the classic symptom of shipping a full
colour bitmap where a transparent-background silhouette is required.

<a id="D16"></a>
### D16 — Personalized snooze re-alert · `PENDING`
*Added 2026-08-23.* With a name set, snoozing a reminder should produce a
notification titled "Still waiting, &lt;name&gt; — &lt;title&gt;". With no name set it
must read as the plain title, with no dangling greeting.

**Setup.** Set a name via Settings → Your name. Set the snooze preset to
**5 minutes** (Settings → Smart Alerts) so the wait is short.

**Steps.**
1. Create a reminder 2 minutes out titled `Call the plumber`.
2. When it fires, press **Snooze**.
3. Wait out the snooze interval and read the new notification's **title**.
4. Now go to Settings → Your name and **clear** it (empty name).
5. Repeat steps 1–3.
6. Repeat once with a **Malayalam** name set.

**Pass.**
- With a name: `Still waiting, Anand — Call the plumber`.
- With no name: `Call the plumber`, with no leading comma, dash or greeting.
- The Malayalam name renders in script, not as boxes.

**Fails if.** You see a dangling `Still waiting,  — Call the plumber`, or the
literal string `undefined` / `null` where the name goes. That is the empty-name
branch, and it is the entire reason step 4 exists.

---

## C. Feature end-to-end

<a id="D9"></a>
### D9 — Remind-someone-else Tier 1 · `PARTIAL`
**Passing** (2026-08-24, user's OEM device): the send screen opens with the
message pre-filled, the signature and invite line render, and WhatsApp receives
the pre-filled text.

**Still outstanding** (needs a native build — `expo-contacts` has no OTA path).

**Setup.** EAS build. Contacts permission not yet granted, so step 1 exercises
the prompt. Have a contact who **is** on WhatsApp and one who is **not**.

**Steps — the full loop.**
1. Add a reminder, pick a recipient from the contact picker (grant the
   permission when asked), set it **1 minute** out, save.
2. **Lock the phone.** Wait for the notification.
3. Read the notification **body** on the lock screen before tapping.
4. Tap it — from a **cold start** at least once (swipe the app from recents
   first), since that is the untested path.
5. On the send screen, toggle the **invite line off** and watch the preview.
6. Send on WhatsApp, then come back to the app.
7. Mark the reminder done.

**Pass.**
- Step 3's body reads **"Message &lt;name&gt;"**, not "Reminder!".
- Step 4 lands on the send screen with the message pre-filled, both cold and
  warm.
- Step 5's preview updates immediately and the sent message omits the invite.
- Step 6 opens **WhatsApp**, not a browser.
- Step 7 moves it out of "Remind Someone" into Completed.

**Specifically unproven, each worth its own run.**
- `wa.me` opening WhatsApp rather than a browser **on a device where WhatsApp
  was installed after this app** — App Links verification is a real failure
  mode and the confirmed pass above does not cover it. Check with:
  ```
  adb shell pm get-app-links com.whatsapp
  ```
  `wa.me` must show `verified`.
- The **"number not on WhatsApp"** path — use the second contact.
- `sms:` pre-fill across Samsung Messages, Google Messages and iOS Messages.
- The contacts permission **denied, then re-granted** path
  (`adb shell pm revoke com.curios.remindme android.permission.READ_CONTACTS`).
- Contacts list scrolling at **1000+ contacts**.
- Whether READ_CONTACTS trips Play Store review.

Specifically unproven: `wa.me` opening WhatsApp rather than a browser **on a
device where WhatsApp was installed after this app** — App Links verification
is a real failure mode, and the confirmed pass above does not cover it; the
"number not on WhatsApp" path; `sms:` pre-fill across Samsung Messages,
Google Messages and iOS Messages; the contacts permission dialog and the
denied-then-re-granted path; contacts list scrolling at 1000+ contacts; and the
notification tap from a **cold start**. Also confirm READ_CONTACTS does not
trip Play Store review.

<a id="D6"></a>
### D6 — Malayalam dictation end-to-end · `PENDING`
Parser tests use *typed* text. Every Malayalam parser test in the suite feeds
in a clean string, so the one unknown is what the **recognizer actually emits**
— spacing, numerals, and whether it returns Malayalam script at all. The parser
could be perfect and the feature still broken here.

**Setup.** Settings → Dictation language → **Malayalam**. First use triggers an
offline model download ("Preparing voice recognition") — let it finish on wifi
before timing anything.

**Steps.**
1. Open add-reminder, press the mic, and say a phrase with a time in it —
   e.g. *"നാളെ രാവിലെ പത്ത് മണിക്ക് ഡോക്ടറെ വിളിക്കണം"* (call the doctor
   tomorrow at 10am).
2. Read the **title** that lands in the box and the **parsed date/time preview**
   underneath it.
3. Open Settings → **Debug logs** and find the raw transcription string.
4. Repeat with: a relative duration ("രണ്ട് മണിക്കൂർ കഴിഞ്ഞ്"), a weekday, and
   a half-past time — these are separate branches in `malayalamDateParser.ts`.
5. Switch dictation language back to English and dictate an English phrase, to
   confirm the setting actually routes.

**Pass.** The raw transcription in Debug logs is Malayalam script, the title
keeps the task words, and the preview resolves to the right date and time. The
time words must **not** be left stranded in the title.

**Fails if.** The transcription comes back transliterated into Latin script
(that is item 17, Manglish, and is *not* supported — record it as a finding,
not a pass), comes back empty, or the date is right while the title still
contains the time words. Note which of the four phrasings in step 4 failed —
"Malayalam dictation is broken" is not actionable, "half-past does not parse
from speech but does when typed" is.

<a id="D10"></a>
### D10 — Name capture and personalization · `PARTIAL`
*Added 2026-08-23.*

**Passing** (2026-08-24, user's OEM device): the first-launch prompt appeared
and stored the name, the header greets by name, the avatar shows initials, and
outgoing messages carry the "— &lt;name&gt;" signature.

One defect found and fixed during this pass: a full name truncated the header
to "Good morn.." (`4a2c522`). Not re-verified — see D14.

**Still outstanding.**

**Setup.** The prompt only shows once ever, so each run below needs a **fresh
install state**. Export your reminders first, then between runs:
```
adb shell pm clear com.curios.remindme
```

**Steps.**
1. Clear data, launch, and **watch the very first seconds** — specifically
   whether the name sheet can appear *underneath* the system notification
   permission dialog. Record the order you actually see.
2. Press **Skip**. Force-stop and relaunch twice.
3. Tap the header greeting ("Hi there").
4. Clear data again, relaunch, and enter a **Malayalam** name.
5. Go to Settings → Your name, edit it, press **Cancel**. Then edit again and
   confirm.

**Pass.**
- Step 1: the name sheet comes **after** the permission flow, never stacked
  behind or beneath the system dialog.
- Step 2: the prompt never returns, and the header reads "Hi there".
- Step 3: the greeting is a working tap target that opens the name sheet.
- Step 4: the name renders in Noto Sans Malayalam, not as blank boxes — check
  the header, the avatar initials, and an outgoing message signature.
- Step 5: Cancel leaves the old name; confirm changes it everywhere.

**Fails if.** The sheet is visible but untappable behind the permission dialog
(the race in step 1), or a Malayalam name shows as boxes anywhere — the avatar
initials are the most likely place, since they take a substring and can split a
grapheme cluster.

<a id="D11"></a>
### D11 — Quiet hours · `PENDING`
*Added 2026-08-23.*

**Setup.** Settings → Smart Alerts. Set quiet hours to **22:00-08:00** — a
window that crosses midnight, because the wrap is where this breaks.

**Steps.**
1. Confirm both time pickers actually set start and end, and that the values
   survive leaving and re-entering the screen.
2. Create a reminder for **23:30**. The confirm sheet must appear. Press
   **Keep it**.
3. Create another for **02:00**. Sheet must appear again. Press
   **Move to 08:00**.
4. Create one for **14:00**. No sheet.
5. Now set start **and** end to the same value (e.g. 22:00-22:00) and create a
   reminder for 23:30.

**Pass.**
- Steps 2 and 3 both show the sheet — that is the midnight wrap, and 02:00 is
  the case a naive `start <= t && t <= end` comparison gets wrong.
- Step 2 stores **23:30** unchanged; step 3 stores **08:00**.
- Step 4 shows no sheet at all.
- Step 5 shows **no sheet**: start == end means quiet hours are *off*.

**Fails if.** Step 3 shows no sheet (the wrap is inverted), or step 5 shows one
— getting that backwards means every notification the app sends is treated as
quiet and suppressed, which is the worst available failure here.

<a id="D12"></a>
### D12 — Vague-task hint · `PASS` (2026-08-29, OnePlus CPH2569, automated)
*Added 2026-08-23.* The hint is advisory — the failure that matters is it
becoming a **blocker**, or firing on Malayalam where it has no basis.

**Setup.** Add-reminder screen.

**Steps.**
1. Type `Sort out the insurance`. Watch for the hint.
2. Press **Use as is**. Keep typing, then clear the field and retype the same
   text.
3. On a fresh vague title, without dismissing the hint, press **Save**.
4. Type a specific task — `Call Dr Menon at 4pm` — and check no hint appears.
5. Type a Malayalam phrase, vague or not.

**Pass.**
- Step 1 shows a hint suggesting a concrete first step.
- Step 2: dismissed, and it does **not** come back for that same text.
- Step 3: **saving is never blocked** — the reminder saves with the hint on
  screen.
- Steps 4 and 5: no hint. Malayalam must never trigger it.

**Fails if.** Save is disabled or swallowed while the hint is up, or the hint
reappears after "Use as is" — both turn an optional nudge into an obstacle.

<a id="D13"></a>
### D13 — "Why tasks slip" explainer · `PENDING`
*Added 2026-08-23.* Pure content screen, so the risks are all layout: overflow,
contrast, and long unbroken citation URLs.

**Setup.** Nothing. Run it twice, once per theme (Settings → Appearance).

**Steps.**
1. Smart Alerts → **Why tasks slip**.
2. Count the cards, then press **Read more**.
3. Scroll to the very bottom, through all five citations.
4. Switch the theme and repeat 1-3.
5. Raise the system font size to its largest setting and scroll through once
   more.

**Pass.** Four cards; Read more expands the full article and five citations;
everything scrolls to the end with nothing cut off; citation lines **wrap**
rather than running off the right edge; text is readable against the background
in both themes and at the largest font size.

**Fails if.** A citation URL pushes the layout wider than the screen (the whole
page then scrolls sideways), the article cannot be scrolled to its end, or body
text drops to near-invisible contrast in one theme — the usual cause is a
hardcoded colour that only suits the other.

---

## D. Visual and layout

<a id="D8"></a>
### D8 — Dark mode, visually · `PASS` (2026-08-24, user's OEM device)
One defect found and fixed during this pass: the status-bar icons were
invisible with the app set to Light on a dark-mode phone (`017b785`). That fix
is **not** re-verified — see D14.

Re-run this whole walk after any new screen lands. The screens added since
this passed (Smart Alerts, Why tasks slip, the quiet-hours and name sheets)
were **not** part of it.
Jest asserts *token values*, not pixels.

**Setup.** System theme **dark**. Have one overdue reminder and one completed
reminder in the list before starting, so the destructive and muted states are
on screen.

**Steps — walk every screen, in this order.**
1. Home list (with the overdue card and the completed one visible).
2. Add/edit reminder.
3. Reminder detail.
4. Settings, including **both** modals.
5. About.
6. Smart Alerts.
7. Why tasks slip.
8. The sheets: snooze, confirm, quiet-hours, name.
9. The exact-alarm banner.
10. The error fallback (force a crash to reach it).

At each: look for text vanishing into its background, the **status bar**, and
**modal overlays** — the three places contrast failures actually land.

11. Toggle the **system** theme while the app is open.
12. Settings → Appearance: set **Light** on a dark device, then **Dark** on a
    light device, then **System**.
13. Restart the app.
14. Force a crash again with a non-default theme selected.

**Pass.** Every screen legible in dark. Step 11 switches immediately, with no
restart. Step 12: the explicit choice **wins** over the OS in both directions,
and System hands control back. Step 13: the choice survives. Step 14: the error
screen honours the chosen theme.

**Fails if.** Any text matches its background; the status-bar icons disappear
(that is D14 #2); or the error screen renders in the OS theme rather than the
chosen one — `ThemeProvider` sits outside `ErrorBoundary` specifically so it
does not.

<a id="D14"></a>
### D14 — 2026-08-24 device-feedback fixes · `PARTIAL` — #1 and #3 verified 2026-08-29
Seven findings from a real device, all fixed but none re-verified. Four were
invisible to the entire test suite.

**Setup.** A device with a real keyboard and a real status bar — four of these
were invisible to the entire suite precisely because jsdom has neither. Have a
long name and a Malayalam name ready.

**Steps and pass criteria, one per finding.**

1. **Settings scrolls.** Open Settings and swipe all the way down.
   *Pass:* you reach the **Debug logs** row. *Root was a plain `View`, so
   everything past one viewport was unreachable — if it stops early, the
   ScrollView regressed.*
2. **Status bar readable in both themes.** Set Settings → Appearance to
   **Light** while the phone is in **dark mode**, then the reverse.
   *Pass:* the clock, battery and signal icons are visible in **both**
   combinations. This crossed pairing is the one that broke; matching
   app-and-phone themes will not reproduce it.
3. **Header greeting does not truncate.** View the home header with (a) a short
   name, (b) a long full name, (c) a Malayalam name.
   *Pass:* no `Good morn..` clipping in any of the three.
4. **Quick-add layout.** Open the home screen and type a long title into
   quick-add.
   *Pass:* the buttons sit **below** the input, long text uses the full width,
   and you can still see a useful amount of the reminder list above the fold —
   the card is taller than it was, so judge this as a user, not a checkbox.
5. **Recipient chip.** Add a recipient to a reminder.
   *Pass:* the chip names the chosen contact, and its **x** removes them.
6. **Contact picker above the keyboard.** Open the picker and type a search
   that narrows to **one or two matches**.
   *Pass:* the sheet stays above the keyboard. *Few matches is the failing
   case — the sheet is shortest then and used to vanish entirely, so a search
   returning many results proves nothing.*
7. **Send reminder edit.** From the send screen, use the header's edit control.
   *Pass:* the reminder editor opens.

**Fails if.** Any of the seven reproduces its original symptom. Record which
number failed — "D14 failed" is not actionable.

---

## E. Data safety

<a id="D17"></a>
### D17 — Corrupt-store quarantine · `PENDING`
*Added 2026-08-23 for `fe10f95`.* Hard to trigger naturally; needs a
debuggable build. Corrupt the store deliberately:

```
adb shell run-as com.curios.remindme    # debuggable builds only
```

**Setup.** A **debuggable** build. Create two or three reminders first, so the
quarantined payload has recognisable content.

**Steps.**
1. Corrupt the stored JSON deliberately:
   ```
   adb shell run-as com.curios.remindme \
     sqlite3 databases/RKStorage \
     "UPDATE catalystLocalStorage SET value='{not valid json' WHERE key='@reminders_v1';"
   ```
   If `sqlite3` is absent on the device, pull the DB, edit it, push it back.
2. Force-stop and relaunch the app.
3. Read the keys back:
   ```
   adb shell run-as com.curios.remindme \
     sqlite3 databases/RKStorage \
     "SELECT key FROM catalystLocalStorage;"
   ```
4. Add a **new** reminder in the app.
5. Re-run step 3's query.

**Pass.**
- Step 2: the app opens with an **empty list** and does not crash.
- Step 3: a `@reminders_corrupt_<timestamp>` key exists and holds the original
  payload — check it contains your reminder titles, not the corrupt string.
- Step 5: that quarantine key is **still there** after a normal write.

**Fails if.** The app crashes on launch (the whole point of the feature), the
quarantine key is missing, or step 5 shows it gone — a later save overwriting
the only copy of the user's data is worse than the crash.

<a id="D18"></a>
### D18 — Backup carries the new fields · `PENDING`
*Added 2026-08-23.* An empty-ish store will not exercise this — the fields only
appear once the events that set them have happened.

**Setup — you must generate the data first.** In the app:
- create a reminder and **complete** it (sets `completedAt`),
- create another, let it fire, and **snooze it at least twice** (sets
  `snoozeCount` and `originalDatetime`),
- set non-default quiet hours in Smart Alerts.

**Steps.**
1. Settings → **Back up reminders**, share the JSON somewhere you can read it
   (a note to self is fine).
2. Inspect the payload for `createdAt`, `completedAt`, `snoozeCount` and
   `originalDatetime` on the reminders, and `quietHours` under `settings`.
3. On a **second device** (or after `pm clear`), Settings → **Restore from
   backup** and paste it.
4. Open Smart Alerts on that device.
5. Check the restored reminders' snooze history survived — the snoozed one must
   still show its history, not a reset count.

**Pass.** All four reminder fields present and populated with real values (not
`null`), `quietHours` present, and step 4 shows the **restored** window rather
than the default.

**Fails if.** `snoozeCount` restores as 0, or quiet hours read as default after
restore — settings are the half most likely to be dropped, since the reminders
array is the obvious part.

Known and accepted: `mergeReminders` is "local always wins", so a re-typed
reminder beats a backup copy carrying real history. Deliberate — see the spec.

<a id="D21"></a>
### D21 — Un-completing a reminder re-arms it · `PASS` (2026-08-29, OnePlus CPH2569, EAS preview `34d1f57`)
*Added 2026-08-28 for backlog item 19.* The whole failure mode is "never
fired", which Jest cannot see. The old bug was **masked** by the ~15-minute
BackgroundFetch sweep re-arming the reminder, so a generous test window will
pass even against the broken code — the short horizon in step 1 is what makes
this discriminating.

**Setup.** Any build carrying the fix. Notifications granted. Nothing else
pending, so the notification you see is unambiguous.

**Steps — the future branch.**
1. Create a reminder **3 minutes** out, alarm on, titled `D21 re-arm`. Three
   minutes is deliberate: shorter than the sweep, so nothing can cover for a
   broken re-arm.
2. Mark it **Done** before it fires.
3. Move it back to pending from the Done list.
4. Confirm something is actually armed, rather than trusting the UI:
   ```
   adb shell dumpsys alarm | grep -A4 curios.remindme
   ```
5. Screen off, leave the phone alone, and **wait for it to ring** at its
   original time.
6. Repeat steps 1-5 once with the device left idle the whole three minutes —
   this is where OEM power management would have stopped the sweep from
   rescuing the old bug.

**Steps — the past branch.**
7. Let a reminder fire and go overdue. Mark it Done, then un-complete it.

**Pass.**
- Step 4 shows a pending registration.
- Step 5: **it rings**, at its original time.
- Step 7: the reminder returns to the list as **overdue and silent** — no
  notification fires immediately, and no new time is invented for it.

**Fails if.** The alarm icon appears on the card but nothing ever rings. **Do
not accept the icon as proof** — the icon was never the broken part, and
treating it as the pass criterion is exactly how this shipped. Also a fail if
step 7 fires a notification straight away.

### Result — 2026-08-29, `PASS` on both branches

Run over adb on the EAS preview build of `34d1f57`, screen off, app not
doze-whitelisted. A **4-minute** horizon was used deliberately: shorter than
the ~15-minute BackgroundFetch sweep, so nothing could have covered for a
broken re-arm.

**Future branch.** Reminder created for 16:45, alarm on:

| stage | `dumpsys alarm` | `Next alarm clock` |
| --- | --- | --- |
| after save | `#18 origWhen=1788002085856 window=0 flags=0x9` | 16:44:45.856 |
| after **Mark Done** | *gone* | fell back to tomorrow 14:59 |
| after **un-complete** | `#12 origWhen=1788002085856 window=0 flags=0x9` | **16:44:45.856 again** |

The entry number changing `#18 -> #12` on the same `origWhen` shows this is a
**fresh registration**, not a leftover that was never cancelled.

Then the part that actually matters — **it rang**. Target 16:44:45.856,
delivered **16:44:46.194 = 338 ms late**, screen off, on channel
`reminders-alarm` at importance 5:

```
08-29 16:44:46.194 sysui_multi_action: ... com.curios.remindme,857,reminders-alarm,858,5
08-29 16:44:46.207 NotifAttentionHelper: vibrateLinearmotorIfNeed,
                   android.resource://com.curios.remindme/raw/alarm
```

The registration cleared itself after firing (`grep -c 1788002085856` -> 0), so
no orphan was left behind.

**Past branch.** The same reminder, now overdue at 16:47, was marked done and
un-completed again:

- alarm registrations **unchanged at 2** (the two unrelated future test
  reminders) — nothing new scheduled
- no `1788002085856` registration
- **zero posted notifications** — nothing fired on un-completion
- the list moved from "4 upcoming" to "5 upcoming"

So it returned as **overdue and silent**, which is the documented decision: no
notification, and no new time invented on the user's behalf.

**Note on the old bug.** Under the previous code the future-branch row after
un-complete would have been empty, and the 16:45 reminder would simply never
have rung — the sweep could not have rescued a 4-minute horizon. This run
discriminates between the two.

<a id="D22"></a>
### D22 — Alarm toggle copy and the status-bar icon explainer · `PARTIAL` — copy verified 2026-08-29; one FAIL found and fixed, needs a re-run
*Added 2026-08-28 for backlog item 20.* Two halves: the copy must be legible,
and — more importantly — the claim it makes must be **true on the ROM**.

**Setup.** Android device. Settings screen.

**Steps — copy and layout.**
1. Read the alarm row with the toggle **on**, then **off**.
2. Raise the system font to its **largest** setting and read both again. The
   new label is longer than the one it replaced and shares the row with a
   switch.
3. Tap **"Why is there an alarm icon in my status bar?"**. Tap again.
4. Read the expanded body in **both** themes.
5. Press **"Open alarms & reminders settings"**.
6. Check on an **iPhone**, or confirm by inspection, that the row is absent
   there.

**Steps — verifying the claim (the half that matters).**
7. With an alarm reminder pending, note the status-bar clock icon.
8. Turn **off** Android's *Allow setting alarms and reminders* for this app
   (the screen step 5 opens).
9. Create a new alarm reminder ~10 minutes out and check the status bar again.
10. Measure its delivery, unplugged and idle, as in D7.

**Pass.**
- Title reads **"Alarm — rings, and arrives on time"**; sub-label switches to
  **"Silent, and may arrive up to 20 minutes late"** when off.
- Neither line clips or overlaps the switch at the largest font size.
- The explainer expands and collapses, is readable in both themes, and is
  **Android-only**.
- Step 5 lands on Android's *Alarms & reminders* special-access screen for this
  app — **not** the generic app-info page. Verify the fallback too, on a ROM
  where `sendIntent` may be unavailable.
- Steps 9-10: the clock icon **disappears** and the reminder **arrives late**.

**Fails if.** Step 10 shows the reminder still punctual with the permission
revoked. The explainer would then be telling users something false about their
own phone, and the copy must change before this ships.

### Result — 2026-08-29 (OnePlus CPH2569, build carrying the item-20 fix)

**Steps 1-4 and 6: `PASS`.** Confirmed by screenshot — the title reads "Alarm —
rings, and arrives on time" over "Rings out loud, and fires at exactly the time
you set", the explainer expands and collapses, and the body is legible.

**Step 5: `FAIL`, and it invalidated steps 7-10.** The button opened Android's
*Alarms & reminders* screen correctly, but **this app is not listed on it**, so
the instruction was a dead end and the revoke test could not be performed at
all.

**Cause — the app's own manifest, and it is deliberate.** `app.json` declares
both `SCHEDULE_EXACT_ALARM` and `USE_EXACT_ALARM`. `USE_EXACT_ALARM` is a
*normal* permission: auto-granted at install, **not user-revocable**, and
reserved for apps whose core function is alarms/clocks/reminders. Apps holding
it are omitted from that screen by design — the screen is backed by the
`SCHEDULE_EXACT_ALARM` appop, which `USE_EXACT_ALARM` supersedes on targetSdk
34+ (this app targets 36). The earlier dump agrees: `USE_EXACT_ALARM:
granted=true`, no granted line for `SCHEDULE_EXACT_ALARM`.

**So the permission model is right and the copy was wrong.** Dropping
`USE_EXACT_ALARM` to make the app appear in that list would make exact alarms
opt-in and silently unpunctual for every new user — a bad trade for a reminder
app, and Play allows the permission for this category. **Do not "fix" this by
changing the manifest.**

**Fixed 2026-08-29:** the escape-hatch paragraph and the
"Open alarms & reminders settings" button are gone. The explainer now says
Android offers no per-app switch because the app registers as an alarm app, and
points at **the app's own Alarm toggle** — which is the real control, since a
silent reminder never registers through `setAlarmClock()` and so shows no icon.
Three tests lock this in, including one asserting the old claim is *absent*.

**Re-run needed** on a build carrying that change: steps 1-4 and 6 again, plus
the new step 7 below.

7. Turn the **Alarm** toggle off, leave only silent reminders pending, and
   confirm the status-bar clock icon **disappears**. Then measure a silent
   reminder's delivery unplugged and idle, as in D7 — it should be late. That
   is now the claim the copy makes, and it is the one to verify.

<a id="D23"></a>
### D23 — Pre-existing reminders re-arm on launch after an app update · `PASS` (2026-08-30, OnePlus CPH2569, EAS preview)
*Added 2026-08-30 for backlog item 21.* Found while investigating a real
report ("alarm at 8.00 didn't ring yet even though time has passed") — Android
wipes every `AlarmManager` registration on app install/update, and nothing
used to re-arm a reminder that already existed before the update except a
~15-minute `BackgroundFetch` sweep that can permanently give up if it doesn't
run in time. See `system_learnings.md` (2026-08-30) for the full root-cause
writeup.

**Setup.** Two reminders already saved and due later the same day, one with
the Alarm toggle on and one off, on the currently installed build.

**Steps.**
1. Install a new build over the existing one (this alone wipes AlarmManager).
2. **Before opening the app**, confirm zero alarms are registered:
   `adb shell dumpsys alarm | grep -c "com.curios.remindme.*NotificationsService"`
   must read `0`.
3. Launch the app.
4. Immediately re-check `dumpsys alarm` for the same package.

**Pass.** Both pre-existing reminders show a fresh, correct alarm registration
within a few seconds of launch — no wait for a background sweep. The
alarm-on reminder should carry `window=0 flags=0x9` (`setAlarmClock`); the
alarm-off one an inexact entry (`flags=0x4`).

**Fails if.** Either reminder stays unregistered after launch, or only
reappears after several minutes (meaning the sweep did the work, not the
launch-time reschedule this item is meant to verify).

### Result — 2026-08-30 (OnePlus CPH2569, build `9ca2272`/`fb84813`)

Installed the fix APK over the previous build. Baseline confirmed **0**
`NotificationsService` alarms registered immediately post-install
(`09:23:09`). Force-launched the app at `09:23:18`; by `09:23:22` (within 4
seconds) `dumpsys alarm` showed both pre-existing reminders re-armed:

- **"Silent routing check"** (alarm off, due 10:00) → `origWhen` decoded to
  **09:59:00**, `flags=0x4`, `windowLength=1607103` — correct inexact entry,
  60 s early per `ALARM_EARLY_OFFSET_MS`.
- **"Sort out the insurance"** (alarm on, due 15:00) → `origWhen` decoded to
  **14:59:00**, `flags=0x9`, `windowLength=0` — correct `setAlarmClock()`
  entry.

Both match their reminder's actual time and alarm setting exactly, confirming
the fix closes the reinstall-wipe window immediately on launch rather than
depending on the 15-minute sweep.

## Malayalam numeral clock times (dot separator + am/pm) — PENDING

Landed with the `malayalamDateParser` numeral-time fix. Jest covers the parser
directly; what it cannot cover is the on-device keyboard actually emitting the
characters these patterns expect.

- [ ] PENDING — Type `ആധാരം എഴുത്ത് ഇന്ന് 11.30` on the Malayalam keyboard on
      the home-screen quick-add. The chips must read `Today · 11:30`, not
      `Today · 09:00`, and the title chip must read `ആധാരം എഴുത്ത്`.
- [ ] PENDING — Type `ഇന്ന് 10.30 am`. Chips must read `Today · 10:30`.
      Repeat with `pm` → `22:30`.
- [ ] PENDING — Confirm the ML keyboard's period key emits U+002E FULL STOP
      (what the parser matches) and not a look-alike. If a time silently fails
      to parse on-device while the same string passes in Jest, this is why —
      check the actual code point before touching the parser.
- [ ] PENDING — Dictate (mic, Malayalam) a numeral time and check whether the
      recognizer writes `11.30`, `11:30` or `11 30`. The first two now parse;
      a space-separated form still does not.
- [ ] PENDING — Type `പാൽ 2.50 രൂപ വാങ്ങണം`. No time chip may appear, the
      title must keep `2.50`, and tapping save must open the no-time sheet
      with a picker rather than scheduling anything.
- [ ] PENDING — Type `ഇന്ന് 18.00 മീറ്റിംഗ്` (24-hour). Chip must read
      `Today · 18:00`, not `09:00`.
- [ ] PENDING — Type `ഇന്ന് 00.30 മരുന്ന്`. Chip must read `Today · 00:30`
      and the notification must actually fire after midnight, not at 09:00 —
      the 24-hour path is new and midnight was previously unreachable.
