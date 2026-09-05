# Data safety: storage, backup, re-arm reliability

[← index](README.md)

| ID | Scenario | Status | Last run | Auto? |
| --- | --- | --- | --- | --- |
| [D17](#d17) | Corrupt-store quarantine | `PARTIAL` | 2026-09-04 | AUTO (partial) |
| [D18](#d18) | Backup carries the new fields | `PARTIAL` | 2026-09-04 | AUTO (partial) |
| [D21](#d21) | Un-completing re-arms the reminder | `PASS` | 2026-08-29 | AUTO |
| [D23](#d23) | Pre-existing reminders re-arm on launch after an update | `PASS` | 2026-08-30 | AUTO |

---

<a id="d17"></a>
## D17 — Corrupt-store quarantine · `PARTIAL` (2026-09-04, OnePlus CPH2569, automated — setup only)

*Added 2026-08-23 for `fe10f95`.* Hard to trigger naturally; needs a
debuggable build.

**Setup.** A **debuggable** build. Create two or three reminders first, so
the quarantined payload has recognisable content.

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
- Step 3: a `@reminders_corrupt_<timestamp>` key exists and holds the
  original payload — check it contains your reminder titles, not the
  corrupt string.
- Step 5: that quarantine key is **still there** after a normal write.

**Fails if.** The app crashes on launch (the whole point of the feature),
the quarantine key is missing, or step 5 shows it gone — a later save
overwriting the only copy of the user's data is worse than the crash.

### Result — 2026-09-04, `PARTIAL`

`Maestro/d17_corrupt_store_quarantine.yaml` ran green on the local debug
build (`android:debuggable="true"`, so `run-as` works — confirmed: pulled
`databases/RKStorage` via `adb exec-out run-as ... cat ...`, a real SQLite
file). The flow only creates a valid reminder and confirms it saves — it
does **not** corrupt the stored JSON, relaunch, or check for the
quarantine key, because that's a deliberate `adb`/`sqlite3` step outside
what a UI-driving Maestro flow does. Steps 1, 3 and 5 above (the actual
corruption/quarantine assertions) are still **untested** on hardware this
session.

Note for whoever runs Steps 1–5 by hand: `sqlite3` is not present on this
device's shell (`run-as: exec failed for sqlite3: No such file or
directory`) — pull the DB with `adb exec-out run-as com.curios.remindme
cat databases/RKStorage > local.db`, edit locally, push back, per the
Setup note's fallback.

---

<a id="d18"></a>
## D18 — Backup carries the new fields · `PARTIAL` (2026-09-04, OnePlus CPH2569, automated — up to the share sheet)

*Added 2026-08-23.* An empty-ish store will not exercise this — the fields
only appear once the events that set them have happened.

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
5. Check the restored reminders' snooze history survived — the snoozed one
   must still show its history, not a reset count.

**Pass.** All four reminder fields present and populated with real values
(not `null`), `quietHours` present, and step 4 shows the **restored** window
rather than the default.

**Fails if.** `snoozeCount` restores as 0, or quiet hours read as default
after restore — settings are the half most likely to be dropped, since the
reminders array is the obvious part.

Known and accepted: `mergeReminders` is "local always wins", so a re-typed
reminder beats a backup copy carrying real history. Deliberate — see the
spec.

### Result — 2026-09-04, `PARTIAL`

`Maestro/d18_backup_carries_fields.yaml` ran green: saves a reminder,
navigates to Settings, scrolls to and taps **Back up reminders**
(`testID="backup-row"` — the row is below the fold, Settings has grown past
one screen). That tap calls `Share.share()`, which hands off to the native
Android share sheet — outside the app's view hierarchy and outside
Maestro's control, so the flow deliberately stops there. None of the actual
field-preservation checks (Steps 1–5: complete/snooze/quiet-hours setup,
inspecting the JSON for `createdAt`/`completedAt`/`snoozeCount`/
`originalDatetime`/`quietHours`, restoring on a second device) ran this
session — still **untested** on hardware.

One earlier attempt at this flow hit a `DeviceServerDiedException:
DEADLINE_EXCEEDED` on Maestro's very first `deviceInfo` call (2-minute
gRPC timeout) — transient, not reproduced on retry, most likely an
already-open native share sheet from a prior manual run holding device
foreground. Note for next time: confirm `adb shell dumpsys window |
grep mCurrentFocus` shows the app (not a system UI surface) before
starting a Maestro run.

---

<a id="d21"></a>
## D21 — Un-completing a reminder re-arms it · `PASS` (2026-08-29, OnePlus CPH2569, EAS preview `34d1f57`)

*Added 2026-08-28 for backlog item 19 (legacy #).* The whole failure mode is
"never fired", which Jest cannot see. The old bug was **masked** by the
~15-minute BackgroundFetch sweep re-arming the reminder, so a generous test
window will pass even against the broken code — the short horizon in step 1
is what makes this discriminating.

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
`reminders-alarm` at importance 5. The registration cleared itself after
firing (`grep -c 1788002085856` -> 0), so no orphan was left behind.

**Past branch.** The same reminder, now overdue at 16:47, was marked done and
un-completed again: alarm registrations **unchanged at 2** (the two unrelated
future test reminders) — nothing new scheduled, no `1788002085856`
registration, **zero posted notifications**. So it returned as **overdue and
silent**, the documented decision: no notification, no new time invented.

**Note on the old bug.** Under the previous code the future-branch row after
un-complete would have been empty, and the 16:45 reminder would simply never
have rung — the sweep could not have rescued a 4-minute horizon. This run
discriminates between the two.

---

<a id="d23"></a>
## D23 — Pre-existing reminders re-arm on launch after an app update · `PASS` (2026-08-30, OnePlus CPH2569, EAS preview)

*Added 2026-08-30 for backlog item 21 (legacy #).* Found while investigating
a real report ("alarm at 8.00 didn't ring yet even though time has passed")
— Android wipes every `AlarmManager` registration on app install/update, and
nothing used to re-arm a reminder that already existed before the update
except a ~15-minute `BackgroundFetch` sweep that can permanently give up if
it doesn't run in time. See `system_learnings.md` (2026-08-30) for the full
root-cause writeup.

**Setup.** Two reminders already saved and due later the same day, one with
the Alarm toggle on and one off, on the currently installed build.

**Steps.**
1. Install a new build over the existing one (this alone wipes AlarmManager).
2. **Before opening the app**, confirm zero alarms are registered:
   `adb shell dumpsys alarm | grep -c "com.curios.remindme.*NotificationsService"`
   must read `0`.
3. Launch the app.
4. Immediately re-check `dumpsys alarm` for the same package.

**Pass.** Both pre-existing reminders show a fresh, correct alarm
registration within a few seconds of launch — no wait for a background
sweep. The alarm-on reminder should carry `window=0 flags=0x9`
(`setAlarmClock`); the alarm-off one an inexact entry (`flags=0x4`).

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

Both match their reminder's actual time and alarm setting exactly,
confirming the fix closes the reinstall-wipe window immediately on launch
rather than depending on the 15-minute sweep.
