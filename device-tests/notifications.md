# Notifications: actions, channels, dedupe

[← index](README.md)

| ID | Scenario | Status | Last run | Auto? |
| --- | --- | --- | --- | --- |
| [D2](#d2) | Vibration setting, 4 combinations | `PARTIAL` | 2026-08-29 | SEMI |
| [D3](#d3) | Mark Done / Snooze, app fully closed | `PENDING` | 2026-08-29 (inconclusive) | SEMI |
| [D4](#d4) | Duplicate notifications | `PARTIAL` | 2026-09-04 | AUTO (partial) |
| [D15](#d15) | Body tap, then Mark Done | `PENDING` | — | SEMI |
| [D16](#d16) | Personalized snooze re-alert | `PARTIAL` | 2026-09-04 | AUTO (partial) |

## Known ColorOS harness limitation (affects D3 and D15)

**`input tap` cannot press notification action buttons on ColorOS.** Found
during the 2026-08-29 automated run — tapping the exact bounds of a
notification action (e.g. **Mark Done**) is swallowed by SystemUI as a row
click that never triggers:

```
SystemUi--Notification: clickRow = 0|com.curios.remindme|... triggerClick = false,
  click reason = REASON_NORMAL_ROW_OR_CHILD_ROW_IN_GROUP
```

The notification stayed posted, no activity started, the reminder stayed
pending. **This is a harness limitation, not an app bug.** It does mean the
`AUTO` rating originally given to D3/D15 was wrong — they are `SEMI` at best
on this ROM, and a real press needs a human thumb or an instrumented
(UiAutomator/Maestro) runner rather than raw `input tap`.

ColorOS also actively freezes the app process during this kind of run
(`OplusHansManager: freeze uid: ... scene: LcdOn`, thawed only ~5s to receive
a broadcast) — a layer above AOSP Doze, same mechanism behind D7's "ColorOS's
own battery layer sits on top". The alarm itself is unaffected (delivery was
exact), but anything expecting to keep running is not.

---

<a id="d2"></a>
## D2 — Vibration setting · `PARTIAL` — channel config verified 2026-08-29; perception outstanding

Android creates a notification channel once and never updates it, so the
`reminders-alarm-novibrate` channel will not exist on an existing install and
the fix will look like it failed. See the 2026-08-09 ledger entry in
`system_learnings.md`.

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

**Steps.** Run all four combinations, one reminder each, ~2 minutes out,
phone **on the table not in hand** (you cannot feel a buzz you are holding
through a case):

| # | Alarm toggle | Vibrate toggle | Expect |
| --- | --- | --- | --- |
| 1 | on | on | sound **and** buzz |
| 2 | on | off | sound, **no buzz** |
| 3 | off | on | **buzz, no sound** |
| 4 | off | off | silent, no buzz |

**Pass.** All four behave as tabled. Row 3 is the one the original bug broke
— turning sound off also killed the buzz with no way back.

**Fails if.** Rows 2 and 3 behave identically to row 1 or row 4, i.e. the two
settings are still coupled. Also a fail if the phone's own Do Not Disturb or
ring mode is confounding it — check that before recording a result.

### Result — 2026-08-29 (config half only)

All four channels exist and differ correctly: `reminders-silent` (imp 4, vib
off, no sound), `reminders-vibrate` (imp 4, **vib on**, no sound),
`reminders-alarm-novibrate` (imp 5, **vib off**, alarm sound),
`reminders-alarm` (imp 5, vib on, alarm sound). The legacy `reminders`
channel is gone — migration worked. No `pm clear` was needed. **Perception
(does it actually buzz) still outstanding.**

---

<a id="d3"></a>
## D3 — Mark Done / Snooze with the app fully closed · `PENDING`

The headless TaskManager path (`tasks/notificationResponseTask.ts`). Jest
covers the foreground listener only, so the case that matters most — the app
not running at all — is entirely unproven.

**Setup.** Any build. Notifications granted. Note your snooze preset
(Settings → Smart Alerts) so you know what to expect in step 7.

**Steps.**
1. Create a reminder **2 minutes** out, alarm on, titled `D3 mark done`.
2. Swipe the app away from recents.
3. Confirm the process is actually dead — this is the whole point of the
   test:
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
  title reads "Still waiting, &lt;name&gt; — …" if a name is set (that is
  D16).

**Fails if.**
- Pressing the action does nothing, or the notification stays in the tray —
  see the ColorOS harness limitation above before recording this against the
  app.
- The reminder is still pending when you open the app — meaning the action
  was handled by the *foreground* listener on launch, not headlessly, which
  is exactly the bug this test exists to catch.
- The app's UI visibly launches when you press the action. The headless task
  may start the process (fine, `pidof` will print after step 5), but no
  screen should appear.

**Attempted 2026-08-29:** inconclusive — see the ColorOS limitation note
above. Needs a human thumb or an instrumented (UiAutomator/Maestro) runner.

---

<a id="d15"></a>
## D15 — Tap the notification body, then press Mark Done on it · `PENDING`

*Added 2026-08-23 for the `53bc7b9` fix.* The dedupe key used to be the
notification id alone, so one notification could be acted on **once ever** —
tapping the body burned the key and the action button was then silently
dropped. Send reminders could never be completed from the tray at all.

**Setup.** Any build. At least one reminder able to fire while you watch.
Because the bug was *one action per notification, ever*, the body tap in
step 2 is the load-bearing step — skipping it makes the test pass vacuously.

**Steps.**
1. Create a reminder 2 minutes out, titled `D15 dedupe`. Wait for it to fire.
2. Tap the notification **body**. The app opens on the reminder detail.
3. Press back / home to leave the app. **Do not** dismiss the notification.
4. Pull down the tray. The same notification must still be there.
5. Press **Mark Done** on it.
6. Repeat steps 1–5 with a fresh reminder, pressing **Snooze** at step 5.
7. Repeat once more with a **send reminder** (one with a recipient) — these
   could never be completed from the tray at all under the old key.

**Pass.** In all three runs the action at step 5 takes effect: the reminder
is completed (or re-scheduled for snooze) and the notification clears.

**Fails if.** The action is silently dropped after the body tap — nothing
happens, no error, and the reminder stays pending. That silence is the
signature of the old dedupe key being burned by the tap. Same ColorOS
`input tap` limitation as D3 applies if driving this over adb.

---

<a id="d4"></a>
## D4 — Duplicate notifications · `PARTIAL` (2026-09-04, OnePlus CPH2569, automated — UI half only)

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
the delivered copy plus a re-armed duplicate. Also a fail if step 6 still
shows a pending registration after delivery: that is an orphan no id can
cancel, and it will fire again later.

### Result — 2026-09-04, `PARTIAL`

`Maestro/d4_duplicate_notifications.yaml` ran green, but it only exercises
the **UI-driving half**: saves "Duplicate test reminder at 1:30 PM" twice in
a row and confirms both saves succeed. It does not use the ~20-minute
horizon or the `dumpsys alarm`/`dumpsys notification` counts from Steps
1–6 above — the actual `ALARM_EARLY_OFFSET_MS` dedupe race this item exists
to catch is still **untested** on hardware. Treat the flow as a smoke test
that reminder creation doesn't itself throw on a duplicate title, not as a
pass on D4's real scenario.

---

<a id="d16"></a>
## D16 — Personalized snooze re-alert · `PARTIAL` (2026-09-04, OnePlus CPH2569, automated — save only)

*Added 2026-08-23.* With a name set, snoozing a reminder should produce a
notification titled "Still waiting, &lt;name&gt; — &lt;title&gt;". With no
name set it must read as the plain title, with no dangling greeting.

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
literal string `undefined` / `null` where the name goes. That is the
empty-name branch, and it is the entire reason step 4 exists.

### Result — 2026-09-04, `PARTIAL`

`Maestro/d16_personalized_snooze.yaml` ran green, but it only saves a
regular reminder ("Test snooze reminder at 2:00 PM") and confirms it
persists — it does not create a "remind someone" reminder, wait for it to
fire, press Snooze, wait out the interval, or read the re-alert
notification's title via `dumpsys notification`. That full loop (Steps 1–6
above) needs timing Maestro doesn't drive well for OS-scheduled
notifications and is still **untested** on hardware.
