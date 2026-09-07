# Cross-cutting: alarm delivery mechanics

[← index](README.md)

The OEM battery/Doze/AlarmManager behavior that everything else in this
project's notification reliability depends on. **Read D7 first** if you are
new to this — several other items are meaningless if alarms do not fire.

| ID | Scenario | Status | Last run | Auto? |
| --- | --- | --- | --- | --- |
| [D26](#d26) | Exact timing for non-alarm reminders | `PASS` | 2026-09-06 | SEMI |
| [D25](#d25) | How Google Tasks actually stays punctual | `INFO` | 2026-09-05 | AUTO |
| [D19](#d19) | `setAlarmClock()` exact delivery | `PASS` | 2026-08-24 | AUTO |
| [D20](#d20) | EAS re-verify after setAlarmClock | `PASS` | 2026-08-29 | SEMI |
| [D7](#d7) | OEM battery-killer survival | `PARTIAL` | 2026-08-24 | SEMI |
| [D22](#d22) | Alarm copy + status-bar explainer | `PARTIAL` | 2026-08-29 | SEMI |
| [D1](#d1) | Android Auto Backup restores reminders | `PENDING` | — | AUTO |

---

<a id="d25"></a>
## D25 — How Google Tasks actually stays punctual · `INFO` (2026-09-05, OnePlus CPH2569, Android 15)

*Added 2026-09-05.* Not a pass/fail item — a **comparison measurement** that
settles a recurring question ("why are Outlook/Gmail/Tasks on time and we are
not?") and corrects a wrong explanation that had been assumed in D20.

**Three plausible explanations, all measured false on this device:**

| Hypothesis | Verdict | Evidence |
| --- | --- | --- |
| FCM server push, no local alarm | **false** | A reminder created with data off still fired accurately — the server never saw it |
| On the ColorOS/Doze allowlist | **false** | `dumpsys deviceidle whitelist` has no `apps.tasks` entry |
| Spends the alarm-clock slot | **false** | Tasks' own `dumpsys alarm` entry carries `flags 0x0`, not the `0x9` a `setAlarmClock()` registration shows |

`com.google.android.gms` **is** whitelisted, which is likely where the
allowlist assumption came from — but Tasks itself is a separate, unprivileged
package.

**What Tasks actually registers.** Its one pending alarm is *weaker* than
anything we schedule — an 18-hour window and no flags at all:

```
RTC_WAKEUP #95: ... com.google.android.apps.tasks
  windowLength 64800000   <- 18 hours
  flags 0x0               <- no FLAG_STANDALONE, no FLAG_ALLOW_WHILE_IDLE
  action com.google.android.apps.tasks.NOTIFICATIONS
  component ...notification.dailynotification.DailyNotificationReceiver
  repeatInterval 86400000
```

**The actual mechanism: app-standby bucket.** Reminder delivery runs through
`*walarm*:com.google.android.apps.tasks.intent.action.SHOW_NOTIFICATION`, and
the alarm history shows Doze applying **no deferral** to most of them
(`device_idle=--`), with `app_standby` as the binding policy on every snapshot:

```
#4: Reason=alarm_cancelled  rtc=2026-09-05 17:25:43.151
  tag=*walarm*:...SHOW_NOTIFICATION
  policyWhenElapsed: requester=-4h13m58s725ms
                     device_idle=--        <- no Doze deferral
```

Buckets, same moment (`adb shell am get-standby-bucket <pkg>`):

| package | bucket |
| --- | --- |
| `com.oneplus.deskclock` | 5 (EXEMPTED) |
| `com.google.android.gm` | 5 (EXEMPTED) |
| `com.google.android.apps.tasks` | **10 (ACTIVE)** |
| `com.curios.remindme` | **20 (WORKING_SET)** |

Tasks sits one tier above us, sustained by frequent background activity
(`14 wakeups`, `+5s861ms running`, four cancel-and-re-arm cycles of
`SHOW_NOTIFICATION` inside ~40 minutes). ColorOS's alignment heuristic keys
off this bucket.

**Tasks is not immune either.** One history entry *was* caught by Doze and
pushed nearly 20 hours out — proof the mechanism is a favourable bucket, not
a guarantee:

```
#3: device_idle=-3h38m43s280ms  adjustment=+19h43m58s808ms
```

### Why this does not change the fix

Chasing bucket 10 would mean manufacturing background wakeups — a bad trade
for a reminder app's battery profile, and still not a guarantee (see #3
above). `setAlarmClock()` measured **0 ms late** under the same forced Doze
that deferred Tasks' own alarm (see [D19](#d19)), so our exact path is
*stronger* than what Tasks uses, not weaker.

It also **reinforces** the alarm-only gate in
`patches/expo-notifications@0.32.17.patch`: the alarm-clock slot is genuinely
free on this device, so the concern about evicting the user's real Clock alarm
is well-founded and worth continuing to respect.

**Open follow-up.** The bucket gap is only one tier, so it is a *contributing*
factor rather than a proven sole cause; a ColorOS-specific package heuristic
independent of bucket has not been ruled out. Re-running the bucket comparison
after this app has been left unopened for a few days would sharpen it — if we
drop to 30+ while Tasks holds 10, the correlation strengthens.

**Reproduce:**
```powershell
adb shell dumpsys deviceidle whitelist | Select-String "tasks|curios"
adb shell dumpsys alarm | Select-String -Context 2,10 "apps.tasks"
# Read the slot with care: on this ROM the "Next alarm clock information:"
# header rendered EMPTY during the 2026-09-05 run even though a real
# alarm-clock alarm was registered (the deskclock entry was present further
# down the same dump). It DID render populated on 2026-08-26 (see D19), so
# this is unexplained rather than a known ROM behaviour -- treat an empty
# header as inconclusive, not as proof no app holds the slot, and confirm
# against the per-package entry below before drawing any conclusion.
adb shell dumpsys alarm | Select-String -Context 0,3 "Next alarm clock"
adb shell dumpsys alarm | Select-String -Context 2,10 "com.curios.remindme"
adb shell am get-standby-bucket com.google.android.apps.tasks
adb shell am get-standby-bucket com.curios.remindme
```
Note `dumpsys alarm` lists only **pending** alarms — a reminder that already
fired leaves nothing to inspect but its history entry.

---

<a id="d19"></a>
## D19 — setAlarmClock() fixes exact delivery · `PASS` (2026-08-24, OnePlus CPH2569, Android 15)

*Added 2026-08-24. Read D7 first — this is the fix for it.* Measured on a
**local debug APK**, not the shipping artifact — see D20 for the EAS
re-verify. The alarm-timing result itself is solid (AlarmManager's own
delivery log), but do not read it as clearance for the whole feature.

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

- **`FLAG_WAKE_FROM_IDLE` (0x2) is NOT set** and the app does not appear in
  the dump's `Next wake from idle:` list, yet delivery was exact anyway. Not
  understood. Re-check after a longer Doze period, where maintenance windows
  are further apart than under `force-idle`.
- ~~**`ALARM_EARLY_OFFSET_MS = 60000` must now be revisited.**~~ **Resolved**
  by the exact-timing change (see [D26](#d26)): the constant is removed, and
  the two duplicate-delivery guards that depended on it now simplify to a
  plain `datetime > now` comparison. Verification of the resulting delivery
  time is D26's job, not this note's.
- **The status-bar alarm icon.** Every scheduled reminder now registers as a
  system alarm clock. Confirm what the user actually sees with several
  reminders pending — **addressed by D22**, see below.
- **OEM frequency heuristics.** Some ROMs flag apps calling `setAlarmClock()`
  often as "frequently wakes your system". Unverified; watch for it.
- **Other OEMs** — MIUI/HyperOS, OneUI, Funtouch all still untested.
- Overnight unplugged run, and after-reboot re-arm (the boot path goes through
  the same `setupAlarm`, so it should inherit the fix).

---

<a id="d20"></a>
## D20 — Re-verify on an EAS build after the setAlarmClock change · `PASS` (2026-08-29, OnePlus CPH2569, EAS preview)

*Added 2026-08-24.* Everything measured for D19 was on a **local debug APK**,
which is not the shipping artifact. Re-run on an EAS build
(`eas build --platform android --profile preview`, see CLAUDE.md):

- **Contacts** — `PASS` (2026-08-25, EAS preview build): permission prompt
  and contact list both working, confirming the regression was confined to
  the local APK's stale manifest (missing `READ_CONTACTS`, see the Test
  environment section in [README.md](README.md)) and never reached the
  shipping artifact. Recipient chip and the full send flow are covered by D9,
  not re-checked here.
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
  sooner — so a silent reminder cannot displace it. Designed as a
  discriminating test: broken routing would have let the sooner reminder
  seize the slot. This also clears the "uncompiled" risk — the EAS build
  compiling proves `request.content?.body?.optBoolean("alarm", false)`
  typechecks.

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
  clock" slot, and the risk is this app evicting the user's real morning
  alarm.
  1. Set a genuine alarm in the phone's **Clock** app for tomorrow morning.
  2. Create a **silent** reminder for sooner than that alarm.
  3. Check the lock screen, and:
     ```
     adb shell dumpsys alarm | grep -A2 "Next alarm clock"
     ```
  4. Now create an **alarm** reminder for *before* the clock alarm and repeat.
  *Pass:* at step 3 the slot and the lock screen still show the **Clock
  app's** alarm — a silent reminder must never take the slot. At step 4 the
  reminder does take it, which is the documented trade-off, not a bug.
  *Fails if:* step 3 shows the reminder in the slot, or the lock screen's
  "next alarm" text is replaced. That would mean the app silently hides the
  user's real alarm, which is the worst outcome in this whole checklist.

**LIMITATION this makes explicit — silent reminders stay inexact on ColorOS.**
The 21m43s window above is the D7 downgrade, still fully in force for
anything not routed through `setAlarmClock()`. On this ROM only alarm-type
reminders are punctual; a silent reminder can arrive ~20 minutes late, and up
to an hour for a next-day one. `ALARM_EARLY_OFFSET_MS` covers only the first
60s of that. This is the accepted cost of not hijacking the system alarm slot
— but it is a real product decision, not a technicality.

> **Do not attribute Google's advantage here to Doze allowlisting — that was
> measured false on this device.** See [D25](#d25): `com.google.android.apps.tasks`
> is *not* on the Doze whitelist, does *not* hold the alarm-clock slot, and its
> own alarms carry weaker flags than ours. Its edge is standby-bucket standing,
> not a privileged API.

- Confirm the release build still shows `window=0` — release and debug can
  differ in OEM battery treatment. With an alarm reminder pending:
  ```
  adb shell dumpsys alarm | grep -A4 curios.remindme
  ```
  *Pass:* `windowLength 0` and `flags 0x9` on the alarm-type reminder.
  *Fails if:* the release build shows a non-zero window where debug showed 0.

---

<a id="d7"></a>
## D7 — OEM battery-killer survival · `PARTIAL`

Do scheduled alarms fire at all with battery optimization at its default
aggressive setting? Flagged as a listing blocker in the 2026-08-09 adoption
assessment, and the blind spot behind D1 and D4. **Test this first** —
several other items are meaningless if alarms do not fire.

**Passing** (2026-08-24, OnePlus `CPH2569`, Android 15 / SDK 35, battery
optimization on, app *not* doze-whitelisted): Phase 0 (app open), Phase 1
(backgrounded, screen off), Phase 2 (swiped from recents) and Phase 4
(overnight, unplugged) all delivered.

### The one run that still closes this item

*Setup.* Unplugged, battery optimization at its default aggressive setting,
app **not** doze-whitelisted. Do this in the evening.

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
honest figure for the D20 limitation, and right now this file only has a
theoretical one-hour upper bound.

*Fails if.* The alarm reminder is more than a minute late, or does not arrive
at all. That would mean `setAlarmClock()` does not survive real overnight
Doze on this ROM, and D19's forced-Doze pass was optimistic.

**Record lateness, never arrival.** "It fired" is weak evidence — see the
investigation below for why.

### Still outstanding

- Phase 3 — forced Doze (methodology below has already run once, see
  Investigation log; worth periodic re-confirmation on new builds).
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
  so the investigation below is reasonable evidence for Oppo and Realme too.
  Still uncovered, in priority order: **Xiaomi (MIUI/HyperOS)** — most
  aggressive, and its Autostart has no equivalent elsewhere; **Samsung
  (OneUI)** — its "Deep sleeping apps" demotes by usage over days;
  **Vivo/iQOO (Funtouch)**.

Note for Windows: `adb` is not on PATH; use the full path recorded in
[README.md](README.md), and `Select-String` in place of `grep` when running
from PowerShell.

<details>
<summary>Investigation log (root-cause history — why D19/setAlarmClock exists)</summary>

**Open defect found 2026-08-24 — alarms were registered INEXACT with a
one-hour window.** `adb shell dumpsys alarm` showed the pending reminder as
`windowLength 3600000 ... flags 0x4` — up to an hour late; an exact alarm has
`windowLength 0`. `flags 0x4` is `FLAG_ALLOW_WHILE_IDLE` alone —
`setExactAndAllowWhileIdle` would also set `FLAG_STANDALONE` (0x1) and
`FLAG_WAKE_FROM_IDLE` (0x2), i.e. `0x7`. Surprising because `USE_EXACT_ALARM`
was `granted=true` (auto-granted on Android 13+).

Confirmed as a live ColorOS behaviour, not a stale alarm — a freshly created
2-minute reminder came back inexact too (`windowLength 43509`, scaling
roughly with how far out the reminder is, ~futurity/4).

**Consequence:** reminders silently allowed to fire late, worse the further
out. For an alarm-style app this is a correctness bug, not a polish item.

**Methodological trap: USB charging suppresses Doze entirely.** Early timing
observations were taken plugged in for adb — Android's best case. **Any
timing measurement must be taken UNPLUGGED**, screen off, phone left alone.

**Phase 3 (forced Doze) reproduces deterministically** without unplugging —
`dumpsys battery unplug` makes the OS believe it is on battery while USB
stays connected:

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
IDLE, pending reminders had `whenElapsed` moved onto an exact multiple of
300000 (a 5-minute maintenance-window boundary):

```
#29  whenElapsed 221860231 -> 222000000   (+139769 ms)
#8   whenElapsed 221398059 -> 221700000   (+301941 ms)
```

Delivery matched those rewritten times to the second:

| asked for   | delivered   | late by      |
| ----------- | ----------- | ------------ |
| 17:02:44.49 | 17:07:46.49 | **5m 02.0s** |
| 17:10:26.66 | 17:12:46.47 | **2m 19.8s** |

Treat this as a **floor**, not the worst case — forced Doze runs maintenance
windows every ~5 minutes; real overnight Doze stretches them progressively
further apart, up to an hour.

**Not fixable by settings.** Enabling ColorOS's "Allow background activity" /
Auto-launch moved the app into the Doze whitelist and standby bucket `5`
(EXEMPTED), yet a 30-minute reminder created in that state was **still
inexact** (`windowLength 1302875`, 21.7 min slack). The app also does **not**
appear under Settings → Special app access → Alarms & reminders — expected,
since Android hides apps holding the auto-granted `USE_EXACT_ALARM` from that
screen (it only lists the user-revocable `SCHEDULE_EXACT_ALARM`). No
user-facing setting remains to enable.

**CONFIRMED by same-alarm pairing.** Call-site log and resulting alarm,
matched on trigger timestamp: `setExactAndAllowWhileIdle()` called, no
`SecurityException`, inexact alarm registered anyway. `policyWhenElapsed`
showed nothing deferred it *after* registration — the window was applied *at
registration*.

**Two interpretation traps:**
- `exactAllowReason` reflects entitlement, **not** whether the request was
  exact — `com.google.android.googlequicksearchbox` shows the same reason on
  a `window=+1h0m0s0ms` (inexact) alarm.
- `policyWhenElapsed` showing no delay only rules out post-registration
  deferral by Doze/Standby/Battery Saver — it says nothing about the
  registration itself.
- The logcat ring buffer holds ~4 minutes on this device. Capture with
  `adb logcat -v time > file &` before the action, never `logcat -d` after.

**ROOT CAUSE — ColorOS silently DOWNGRADES exact alarms.** An instrumented
build of `expo-notifications` (forced to compile from source, see
system_learnings.md) logged, for the alarm below:

```
remindme-patch: EXACT alarm set for 1787571626662 (canScheduleExactAlarms=true)
RTC_WAKEUP #56 ... origWhen 1787571626662  windowLength 1302623  flags 0x4
```

`canScheduleExactAlarms()` returned **true**, `setExactAndAllowWhileIdle()`
was called, **no SecurityException was thrown** — and the OS registered an
inexact alarm with a 21.7-minute window regardless. `expo-notifications` was
scheduling correctly all along; neither it nor the app was at fault.

**The same phone DOES grant exact alarms to its clock app** (`windowLength
0`, present in the dump's `Next wake from idle:` list). Also confirmed it is
**not about privilege** — `com.google.android.deskclock`, an ordinary
user-space app, **not** doze-whitelisted, standby bucket 20 (worse than
ours), also gets `windowLength 0` via the same `setExactAndAllowWhileIdle`
API we call, with identical permission state. **So the mechanism was
UNKNOWN** — every checkable variable matched or favoured us. The likeliest
explanation is a ColorOS-internal classification of clock/alarm packages not
exposed via `dumpsys`/`appops`, but that was a guess, not a finding.

**What this established:** a normal third-party app CAN obtain exact alarms
on this ROM; the capability is reachable via a different API.
`AlarmManager.setAlarmClock()` was the one untried API — the case for it was
not the OEM clock app comparison (over-read initially) but that it is the
only alarm API carrying a user-visible commitment (status-bar icon,
`getNextAlarmClock()`), which is likely why OEMs honour it. **This is what
D19 then confirmed.**

</details>

---

<a id="d22"></a>
## D22 — Alarm toggle copy and the status-bar icon explainer · `PARTIAL` — copy verified 2026-08-29; steps rewritten 2026-09-04, needs a re-run

*Added 2026-08-28 for backlog item 20 (legacy #).* Two halves: the copy must
be legible, and — more importantly — the claim it makes must be **true on the
ROM**.

**The control here is the app's own Alarm toggle, not an OS permission.**
Android's *Alarms & reminders* special-access screen does **not** list this
app and never will — `app.json` declares `USE_EXACT_ALARM`, a normal
permission that is auto-granted, not user-revocable, and causes Android to
omit the app from that screen by design (see the 2026-08-29 result below, and
D7's investigation log). Any instruction to revoke the OS permission is
unrunnable; the earlier version of this item said to, and could not be
completed. Do not reintroduce it.

**Setup.** Android device. Settings screen.

**Steps — copy and layout.**
1. Read the alarm row with the toggle **on**, then **off**.
2. Raise the system font to its **largest** setting and read both again. The
   label is longer than the one it replaced and shares the row with a switch.
3. Tap **"Why is there an alarm icon in my status bar?"**. Tap again.
4. Read the expanded body in **both** themes. It must say Android offers no
   per-app switch (because the app registers as an alarm app) and point at
   the app's **own Alarm toggle** — and must **not** offer an "Open alarms &
   reminders settings" button or any other escape hatch.
5. Check on an **iPhone**, or confirm by inspection, that the row is absent
   there.

**Steps — verifying the claim (the half that matters).**
6. With the **Alarm** toggle **on** and two alarm reminders pending, note the
   status-bar clock icon is present.
7. Turn the **Alarm** toggle **off**. A prompt offers to silence the existing
   reminders — choose **"Keep them as they are"** first. The icon must
   **stay**: the setting is only a default, and per-reminder intent survives.
8. Toggle off again and this time accept **"Silence all N"**. The status-bar
   clock icon must now **disappear**, since no `setAlarmClock()` registration
   remains.
9. Create a reminder while the setting is off. The compose screen must warn
   *"Silent — may arrive up to 20 min late"*, and the warning must vanish when
   the bell is tapped.
10. Measure that silent reminder's delivery ~10 minutes out, unplugged and
    idle, as in D7. Record lateness to the second, never just "it fired".

**Pass.**
- Title reads **"Alarm — rings, and arrives on time"**; sub-label switches to
  **"Silent, and may arrive up to 20 minutes late"** when off.
- Neither line clips or overlaps the switch at the largest font size.
- The explainer expands and collapses, is readable in both themes, is
  **Android-only**, and offers no OS-settings button.
- Step 7: declining the sweep leaves the icon **and** the reminders ringing —
  the default never silently overwrites a per-reminder choice.
- Step 8: accepting it clears the icon.
- Step 9: the compose-screen warning appears and clears on override.
- Step 10: the silent reminder **arrives late** — that is the ~20-minute
  figure the sub-label promises (D20's LIMITATION note).

**Fails if.** The icon persists at step 8 after the sweep is accepted, or the
silent reminder at step 10 is punctual. Either way the copy is telling users
something false about their own phone, and it must change before this ships.

**Note on the ~20-minute figure.** The 2026-09-04 dump measured a silent
reminder registered with `windowLength 1659354` — 27m39s, not 20 — and the
window scales with futurity (~/4), so a next-day silent reminder can be an
hour late. The sub-label's "20 minutes" is optimistic. Worth revisiting the
copy, tracked separately from this item's pass/fail.

### Result — 2026-08-29 (OnePlus CPH2569, build carrying the item-20 fix)

**Steps 1-4 and 6: `PASS`.** Confirmed by screenshot — title/sub-label copy
correct, explainer expands/collapses, body legible.

**Step 5: `FAIL`, and it invalidated steps 7-10.** The button opened
Android's *Alarms & reminders* screen correctly, but **this app is not
listed on it**, so the instruction was a dead end and the revoke test could
not be performed at all.

**Cause — the app's own manifest, and it is deliberate.** `app.json` declares
both `SCHEDULE_EXACT_ALARM` and `USE_EXACT_ALARM`. `USE_EXACT_ALARM` is a
*normal* permission: auto-granted at install, **not user-revocable**, and
reserved for apps whose core function is alarms/clocks/reminders. Apps
holding it are omitted from that screen by design. **Do not "fix" this by
changing the manifest** — dropping `USE_EXACT_ALARM` would make exact alarms
opt-in and silently unpunctual for every new user.

**Fixed 2026-08-29:** the escape-hatch paragraph and the "Open alarms &
reminders settings" button are gone. The explainer now says Android offers no
per-app switch because the app registers as an alarm app, and points at
**the app's own Alarm toggle** — the real control, since a silent reminder
never registers through `setAlarmClock()` and so shows no icon. Three tests
lock this in.

**Steps rewritten 2026-09-04** to match that fix — the procedure above is now
the one to run. **Re-run needed** on a build carrying the change: all of steps
1-8, since the copy the earlier pass verified is not the copy that shipped.

---

<a id="d1"></a>
## D1 — Does Android Auto Backup actually restore reminders? · `PENDING`

*Highest value: could close backlog **B3** (Google Drive sync) on Android.*

Evidence so far (2026-08-10, user's OEM device): Settings → Back up other
data lists Reminders at 11 MB with the toggle on, so Auto Backup is enabled
and has run. That does **not** prove our data is in the set — 11 MB is far
larger than our few KB of JSON and is almost certainly the JS bundle/image
cache (sitting next to Expo Go at 12 MB is the tell). What matters is whether
`RKStorage` (the SQLite DB behind AsyncStorage) is included, and a settings
screen only shows the sending half.

**Setup.** The standalone build, **not Expo Go**. A few reminders in the app.

**Do not change build type mid-test.** Auto Backup restore requires the
**same signing key**. Both EAS profiles use the project's managed keystore,
so preview → development is fine, but a local `npx expo run:android` APK is
signed with the *debug* keystore. Backing up from an EAS build and restoring
onto a locally-built one fails on signature — and looks exactly like Auto
Backup being broken. Stay on one artifact for the whole run.

A debuggable build is **not** required here: the pass criterion is read off
the screen. `run-as` below only diagnoses the failure case.

**Steps.**
1. **Export first** via Settings → Back up reminders. If the restore fails,
   the reminders on that phone are gone.
2. `adb shell pm list packages | grep curios` → must print
   `com.curios.remindme`. A package-name mismatch produced a false negative
   in async-storage's own bug report.
3. `adb shell bmgr backupnow com.curios.remindme` → wait for
   `Backup finished with result: Success`.
4. `adb uninstall com.curios.remindme` — via adb, **not** the launcher; some
   OEM launchers offer "keep app data" and would invalidate the test.
5. Reinstall and **DO NOT LAUNCH THE APP**. Restore lands after install and
   before first launch; opening it early is the most common false negative.
6. `adb shell dumpsys backup | grep -i "restore\|com.curios"`, then open the
   app.

**Pass.** The reminders are present after the reinstall, without restoring
from your own backup. That is Auto Backup working end to end, and it closes
backlog **B3** on Android.

**Fails if.** The app opens empty — the 11 MB is cache, not our data. Confirm
before recording it:
```
adb shell run-as com.curios.remindme ls -la databases/    # debuggable only
```
`RKStorage` absent or empty means AsyncStorage was never in the backup set.

**Do not ship Settings copy claiming automatic backup until this passes** — a
wrong promise about data safety is worse than saying nothing.

---

<a id="d26"></a>
## D26 — Exact timing for non-alarm reminders · `PASS` (2026-09-06, user-confirmed)

*Added 2026-09-05.* Silent reminders now route through `setAlarmClock()` like
alarm ones. The JS flag is `exactTiming` (default ON, global Settings toggle +
per-reminder override in the detail screen); the native patch reads it from
`content.data` alongside `alarm`.

**Why this cannot be proven in Jest.** The suite asserts the flag reaches
`content.data` and nothing further. Everything that matters here — whether
ColorOS honours the registration, what the alarm's `windowLength` and `flags`
actually are, and when the notification lands — happens inside the OS. The
baseline below was measured with the *old* build precisely because green tests
said nothing about it.

**Baseline (2026-09-05, OnePlus CPH2569, local debug build, device b81a371a).**
A silent reminder 5 minutes out, on the alarm-gated build, reproducing the
reported bug:

```
remindme-patch: EXACT set for 1788626415840 (alarmClock=false, canScheduleExactAlarms=true)
RTC_WAKEUP #10: ... com.curios.remindme ... windowLength 130581 ... flags 0x4
```

`130581 / 174000 = 75.0%` — an exact match for AOSP's `maxTriggerTime()`
inexact heuristic. The call succeeded, the permission was held, no exception
was thrown, and the alarm was still registered inexact. The deskclock control
was unaffected (`windowLength 0`, `flags 0x9`).

**Requires a native rebuild.** The patch changed, and expo-notifications ships
a precompiled `.aar` — `buildFromSource` for it is already set in
`artifacts/mobile/package.json`, but the APK must be rebuilt or the old
alarm-gated binary keeps running and every check below reports the baseline.

**Steps.**
1. Rebuild and install (`npx expo run:android` from `artifacts/mobile`, or
   `scripts/dev-device.ps1`).
2. Create a **silent** reminder ~5 minutes out.
3. ```
   adb logcat -d | Select-String "remindme-patch"
   adb shell dumpsys alarm | Select-String -Context 2,10 "com.curios.remindme"
   ```
4. Watch it fire against a clock.
5. Turn the reminder's **"Arrive on time"** switch off in its detail screen and
   repeat steps 3-4 with a fresh reminder.

**Pass.** At step 3 the log line reads `ALARM_CLOCK set` (not `EXACT set`) and
the alarm shows `windowLength 0` with `flags 0x9`. At step 4 it arrives within
a few seconds of its time. At step 5 it reverts to `EXACT set` / `flags 0x4` —
the override must actually reach the native layer, or the setting is decorative.

**Fails if.** `windowLength` is non-zero with the switch ON — particularly at
**75% of futurity**, which is the ColorOS demotion fingerprint and would mean
`setAlarmClock()` is being downgraded too, invalidating the whole approach.

### Result — 2026-09-06 (OnePlus CPH2569, local debug build, device b81a371a)

Rebuilt via `build-and-install-android.ps1` (`buildFromSource` compiled the
patch — confirmed by `remindme-patch` log lines appearing at all). Four
independent silent reminders created and watched fire, then the override
tested via snooze:

| reminder | target | delivered | late by | log line | windowLength | flags |
| --- | --- | --- | --- | --- | --- | --- |
| D26 | 06:50:00.000 | 06:50:00.009 | 9ms | `ALARM_CLOCK set` | 0 | 0x9 |
| D26b | 07:29:00.000 | 07:29:00.008 | 8ms | `ALARM_CLOCK set` | 0 | 0x9 |
| D26c | 07:43:00.000 | 07:43:00.009 | 9ms | `ALARM_CLOCK set` | 0 | 0x9 |
| D26d | 07:48:00.000 | 07:48:00.013 | 13ms | `ALARM_CLOCK set` | 0 | 0x9 |

All four confirmed via `adb shell dumpsys alarm` (registration) and
`adb logcat -d | grep remindme-patch` (native call), cross-checked against
`AlarmManager: sending alarm` in a continuous `logcat -v time` capture
(not `logcat -d` after the fact, to avoid the ring-buffer trap noted in D7).
`NotificationContentProvider queryBadge` confirmed the tray notification
actually posted, and the D26 notification was visually present in the shade.

**Step 5 (override).** The switch lives on `reminder-detail.tsx`, reached only
via a notification tap — tapping a card from the home list opens **Edit**
(`add-reminder.tsx`), which has no such control. This makes the override
untestable on a reminder before its first fire. Worked around by: letting
D26d fire, opening its notification, turning **Arrive on time** off (switch
`checked` verified via `uiautomator dump`, not just visually), then tapping
**Snooze** (+5 min) to produce a fresh future registration carrying the
override:

```
remindme-patch: EXACT set for 1788661696251 (alarmClock=false, canScheduleExactAlarms=true)
RTC_WAKEUP #19: ... com.curios.remindme ... windowLength 224979 ... flags 0x4
```

`EXACT set`, non-zero window, `flags 0x4` — the override reaches the native
layer correctly.

**Not directly tested: the override on a reminder's own first fire** (only
via snooze's reschedule path). The code path is the same
(`editReminder` → cancel + reschedule with the new `exactTiming`), and snooze
uses `scheduleSnoozeNotification`, a distinct function from
`scheduleNotification` — both were confirmed in Jest to thread `exactTiming`
per the summary, but only the snooze path has now been confirmed on-device.

**UX gap noticed, not a scheduling defect:** the "Arrive on time" switch is
shown and interactive on already-fired/completed reminders too, where
toggling it is inert (confirmed: no new alarm registration resulted from
toggling D26c/D26d post-fire, consistent with `isPendingForAlarmRewrite`
correctly skipping them) but the screen gives no indication of that. Worth a
follow-up to disable or hide the switch once a reminder is completed.

**Status: `PASS`, confirmed by the user 2026-09-06** — the user set up the
D26e reminder, snoozed it with the override off, and confirmed the result
above directly rather than from a screenshot alone.

**Also unverified, and not answered by the above:**
- **The `showIntent` question.** Every reminder now claims the alarm-clock
  display slot, so the status-bar icon is expected to be permanently present
  in normal use — a much more visible change than when only alarm reminders
  did it. Whether a null `showIntent` suppresses the icon was **not** measured;
  it could not be, since the installed build never reached `setAlarmClock()`
  for a silent reminder. Check what the status bar and lock screen actually
  show with several silent reminders pending.
- **The user's real Clock alarm** must still fire, and D22's finding that the
  slot is display-only (all alarms fire regardless) should be re-confirmed now
  that far more reminders compete for it.
- **OEM frequency heuristics** — "frequently wakes your system" warnings become
  likelier now that every reminder registers as an alarm clock.
- **Battery.** Previously flagged as unverified for alarm reminders only; the
  population is now every reminder.
