# Feature end-to-end flows

[← index](README.md)

| ID | Scenario | Status | Last run | Auto? |
| --- | --- | --- | --- | --- |
| [D12](#d12) | Vague-task hint | `PASS` | 2026-08-29 | AUTO |
| [D9](#d9) | Remind-someone-else Tier 1 | `PARTIAL` (core loop `PASS`) | 2026-08-30 | SEMI |
| [D10](#d10) | Name capture and personalization | `PARTIAL` | 2026-08-24 | SEMI |
| [D6](#d6) | Malayalam dictation end to end | `PENDING` | — | MANUAL |
| [D11](#d11) | Quiet hours incl. midnight wrap | `PARTIAL` | 2026-09-04 | AUTO (partial) |
| [D13](#d13) | "Why tasks slip" explainer | `PENDING` | — | SEMI |
| [D40](#d40) | "How you're doing" adherence screen | `PENDING` | — | SEMI |
| [D41](#d41) | Better-time suggestion on save | `PENDING` | — | SEMI |
| [D42](#d42) | Postponed-task intervention panel | `PENDING` | — | SEMI |
| [D43](#d43) | notifiedAt / openedAt stamping survives a cold-start race | `PENDING` | — | SEMI |

---

<a id="d12"></a>
## D12 — Vague-task hint · `PASS` (2026-08-29, OnePlus CPH2569, automated)

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

**Result (2026-08-29):** "Sort out the insurance" → hint; **Use as is**
dismissed it and it did **not** return on retyping the same text; "Deal with
the taxes" still hinted (dismissal is per-text, not global); "Call Dr Menon
at 4pm" → no hint; Malayalam (`ശരിയാക്കണം`) → no hint. All five sub-checks
verified.

**Re-verified 2026-09-04** (OnePlus CPH2569, local debug build) via
`Maestro/d12_vague_task_hint.yaml`. Same five sub-checks, run automatically:
hint appears on "Sort out the insurance"; **Use as is** dismisses it; a
second vague title ("Deal with the taxes") saves successfully with the hint
still showing (routes through the "No time found" confirm sheet, since
neither test title carries a parseable time — see the flow's own comments);
"Call Dr Menon at 4pm" shows no hint; Malayalam shows no hint. All green.

---

<a id="d9"></a>
## D9 — Remind-someone-else Tier 1 · `PARTIAL`

Blocks backlog **B8** (M4 Tier 1 device sign-off).

**Core loop `PASS`** (2026-08-30, user's OEM device): a contact was picked
from the phone's contacts and the pre-filled message sent by **both WhatsApp
and SMS**. With the 2026-08-24 run (send screen opens pre-filled, signature
and invite line render), that is the happy path end to end, and M4 Tier 1
counts as shipped rather than pending.

What is left below is the set of paths a happy-path run cannot reach. Each is
worth its own run; step 1 of the unproven list is the one that would silently
degrade every WhatsApp send on a whole class of devices.

**Still outstanding** (needs a native build — `expo-contacts` has no OTA
path). The full-loop steps below are retained because the cold-start tap and
the notification body text were not part of the 2026-08-30 run.

**Setup.** EAS build. Contacts permission not yet granted, so step 1
exercises the prompt. Have a contact who **is** on WhatsApp and one who is
**not**.

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
- `wa.me` opening WhatsApp rather than a browser **on a device where
  WhatsApp was installed after this app** — App Links verification is a real
  failure mode and the confirmed pass below does not cover it. Check with:
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

### Result — 2026-08-29 (one sub-check `PASS`)

`pm get-app-links com.whatsapp` → `wa.me: verified`. **Caveat:** WhatsApp
here was installed 2024-06-26, the app 2026-08-25, so this is the *safe*
ordering — D9's actual worry (WhatsApp installed *after* the app) is still
untested.

---

<a id="d10"></a>
## D10 — Name capture and personalization · `PARTIAL`

*Added 2026-08-23.*

**Passing** (2026-08-24, user's OEM device): the first-launch prompt appeared
and stored the name, the header greets by name, the avatar shows initials,
and outgoing messages carry the "— &lt;name&gt;" signature.

One defect found and fixed during this pass: a full name truncated the
header to "Good morn.." (`4a2c522`). Re-verify via D14 #3 (partially done —
short and long names verified 2026-08-29, Malayalam names still untested).

**Setup.** The prompt only shows once ever, so each run below needs a
**fresh install state**. Export your reminders first, then between runs:
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

**Fails if.** The sheet is visible but untappable behind the permission
dialog (the race in step 1), or a Malayalam name shows as boxes anywhere —
the avatar initials are the most likely place, since they take a substring
and can split a grapheme cluster.

---

<a id="d6"></a>
## D6 — Malayalam dictation end-to-end · `PENDING`

Parser tests use *typed* text. Every Malayalam parser test in the suite feeds
in a clean string, so the one unknown is what the **recognizer actually
emits** — spacing, numerals, and whether it returns Malayalam script at all.
The parser could be perfect and the feature still broken here.

**Setup.** Settings → Dictation language → **Malayalam**. First use triggers
an offline model download ("Preparing voice recognition") — let it finish on
wifi before timing anything.

**Steps.**
1. Open add-reminder, press the mic, and say a phrase with a time in it —
   e.g. *"നാളെ രാവിലെ പത്ത് മണിക്ക് ഡോക്ടറെ വിളിക്കണം"* (call the doctor
   tomorrow at 10am).
2. Read the **title** that lands in the box and the **parsed date/time
   preview** underneath it.
3. Open Settings → **Debug logs** and find the raw transcription string.
4. Repeat with: a relative duration ("രണ്ട് മണിക്കൂർ കഴിഞ്ഞ്"), a weekday,
   and a half-past time — these are separate branches in
   `malayalamDateParser.ts`.
5. Switch dictation language back to English and dictate an English phrase,
   to confirm the setting actually routes.

**Pass.** The raw transcription in Debug logs is Malayalam script, the title
keeps the task words, and the preview resolves to the right date and time.
The time words must **not** be left stranded in the title.

**Fails if.** The transcription comes back transliterated into Latin script
(that is Manglish support, and is *not* implemented — record it as a
finding, not a pass), comes back empty, or the date is right while the title
still contains the time words. Note which of the four phrasings in step 4
failed — "Malayalam dictation is broken" is not actionable, "half-past does
not parse from speech but does when typed" is.

---

<a id="d11"></a>
## D11 — Quiet hours · `PARTIAL` (2026-09-04, OnePlus CPH2569, automated — navigation/save only)

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
5. Now set start **and** end to the same value (e.g. 22:00-22:00) and create
   a reminder for 23:30.

**Pass.**
- Steps 2 and 3 both show the sheet — that is the midnight wrap, and 02:00
  is the case a naive `start <= t && t <= end` comparison gets wrong.
- Step 2 stores **23:30** unchanged; step 3 stores **08:00**.
- Step 4 shows no sheet at all.
- Step 5 shows **no sheet**: start == end means quiet hours are *off*.

**Fails if.** Step 3 shows no sheet (the wrap is inverted), or step 5 shows
one — getting that backwards means every notification the app sends is
treated as quiet and suppressed, which is the worst available failure here.

### Result — 2026-09-04, `PARTIAL`

`Maestro/d11_quiet_hours.yaml` ran green, but it is a **scoped-down
placeholder**, not the scenario above: it navigates to Smart Alerts,
confirms the "Quiet hours" section renders, returns to Home, and saves one
reminder with no time in it (confirming the "No time found" sheet). It does
**not** drive the native Android `DateTimePicker` dialog to actually set
22:00–08:00 or create reminders at 23:30/02:00/14:00, because that picker is
a native OS spinner Maestro cannot reliably drive with `tapOn: text` (no
tappable "22"/"08" labels — it's a scroll wheel). The midnight-wrap
assertions in Steps 2–5 above are still **untested** on hardware.

Also found and fixed while building the flow: a plain `tapOn: text: "Home"`
from the Smart Alerts screen is ambiguous — it matched the Android system
nav bar's own Home button (`resource-id=com.android.systemui:id/home`,
`accessibilityText=Home`) instead of the app's Home tab, backgrounding the
whole app to the launcher. Worked around by relaunching the app instead of
tapping "Home" text after leaving a pushed route.

**Next step to close this out:** either drive the native picker with
swipe/coordinate gestures (higher flake risk — not attempted this session)
or run Steps 1–5 by hand (SEMI).
## D13 — "Why tasks slip" explainer · `PENDING`

*Added 2026-08-23.* Pure content screen, so the risks are all layout:
overflow, contrast, and long unbroken citation URLs.

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
rather than running off the right edge; text is readable against the
background in both themes and at the largest font size.

**Fails if.** A citation URL pushes the layout wider than the screen (the
whole page then scrolls sideways), the article cannot be scrolled to its
end, or body text drops to near-invisible contrast in one theme — the usual
cause is a hardcoded colour that only suits the other.

---

<a id="d40"></a>
## D40 — "How you're doing" adherence screen · `PENDING`

*Added 2026-09-15.* Every number on this screen is derived from the reminder
records themselves, so Jest proves the arithmetic. What Jest cannot see is a
screen of stacked cards on a real viewport, the weekday bar row at a narrow
width, and Malayalam reminder titles in the stuck list — Inter carries no
Malayalam glyphs, so a missed `getFontFamily` call renders as boxes and only
shows up on a device.

**Setup.** A device with a real history: at least 10 reminders that have come
due, a mix of finished and missed, spread over more than one hour of the day.
Include at least one reminder with a Malayalam title, postponed 3+ times.

**Steps.**
1. From the home screen header, tap the bar-chart icon (`header-insights-button`), left of the name avatar. Also confirm Settings → **How you're doing** still opens the same screen.
2. Read every card top to bottom. Scroll to the end.
3. Rotate to landscape, then back.
4. Switch the theme (light → dark → system) with the screen open.
5. Tap a task in the "keeps moving" list.
6. Tap **Why tasks slip** at the bottom.
7. Clear all reminders, then reopen the screen.

**Pass.**
- Step 2: no clipped text, no card overlapping the tab bar or the notch, and
  the weekday bars sit on one row with all seven labels legible.
- Step 2: the Malayalam title in the stuck list renders as script, not boxes.
- Step 4: every card is readable in both themes — the warning-surface panels
  are the ones to watch, they are the least-used colour pair in the app.
- Step 5 opens that reminder's detail screen.
- Step 7 shows the "Nothing has come due yet" state, with no percentage and
  no bar chart, rather than a row of zeroes.

**Fails if.** Any percentage appears that the user cannot reconcile with
their own list, the bars wrap to a second row, or Malayalam renders as boxes.

---

<a id="d41"></a>
## D41 — Better-time suggestion on save · `PENDING`

*Added 2026-09-15.* Deliberately a rare banner: it needs the chosen hour to be
measurably worse than a well-sampled strong hour. The device risk is not the
logic (Jest covers that) but placement — it appears between the parsed
preview and the alarm toggle, on a screen that already scrolls, with the
keyboard possibly up.

**Setup.** A device whose history gives a clear strong hour (e.g. several
finished 8 AM reminders) and a clear weak one (several missed 10 PM ones).

**Steps.**
1. Add a reminder for 10 PM. Watch for the banner as the time resolves.
2. With the keyboard open, scroll the screen. Check the banner is reachable.
3. Press **Move it**. Read the Time row.
4. Press **Save**, then reopen the reminder.
5. Add another 10 PM reminder. Press **Keep mine**, then **Save**.
6. Add a reminder at an hour with no history at all.

**Pass.**
- Step 1: the banner names both hours and both percentages.
- Step 2: the banner is not stuck under the keyboard or off-screen.
- Step 3: the Time row changes to the suggested hour and the "auto" badge
  is gone.
- Step 4: the saved reminder is at the suggested hour, and the notification
  is re-armed for the NEW time — check the tray at that time, not just the UI.
- Step 5: the reminder saves at 10 PM, unchanged.
- Step 6: no banner. Silence on an unmeasured hour is the intended behaviour.

**Fails if.** The time changes without the user pressing **Move it**, or the
old notification still fires after an accepted move.

---

<a id="d42"></a>
## D42 — Postponed-task intervention panel · `PENDING`

*Added 2026-09-15.* Appears on the detail screen at the third postponement.
Replaces a line of Settings copy that used to promise alerts go quiet on their
own — nothing implemented that, and this check exists partly to confirm the
promise and the behaviour now agree.

**Setup.** One reminder. A history that names a strong hour (see D41).

**Steps.**
1. Snooze the reminder twice from the tray. Open its detail screen.
2. Snooze a third time. Reopen the detail screen.
3. Press **Make it smaller**.
4. Back on the detail screen, press **Try 8 AM–9 AM**.
5. Wait for the new time and watch the tray.
6. Settings → Smart Alerts. Read the closing paragraph.

**Pass.**
- Step 1: no panel at two postponements.
- Step 2: the panel appears and says "You have moved this 3 times".
- Step 3 opens the edit screen with the title editable.
- Step 4: the reminder moves to the strong hour and stays open — it must not
  be marked done.
- Step 5: the alert actually fires at the new time. The panel changes the
  schedule, so a stale notification here is a real bug.
- Step 6: the paragraph describes the panel above and does **not** claim
  alerts stop by themselves.

**Fails if.** The panel ticks the task off, the moved reminder never fires, or
Settings still promises behaviour the app does not have.

<a id="d47"></a>
## D47 — Registration "Skip for now" actually dismisses the screen · `PENDING`
Jest's `expo-router` mock hardcodes `canGoBack()` to `true`, so the real
router's behavior on first launch (no back stack under the pushed
`register-number` screen) can only be proven on a device.

**Setup.** Fresh install, or `@registration_onboarding_v1` cleared from
AsyncStorage so first-run onboarding fires again.

**Steps.**
1. Launch the app, let permission onboarding settle, and wait for the
   "Add your number" screen to appear.
2. Tap **Skip for now**.
3. Repeat from a fresh install, this time tapping the **X** close button
   instead.

**Pass.** Both dismiss the screen back to the home tab immediately, and
relaunching the app does not show the registration screen again.

**Fails if.** Either button leaves the same screen on-screen (the bug this
fixed — a bare `router.back()` no-ops when there's nothing under this
screen in the stack).

<a id="d45"></a>
## D45 — Country-code picker on registration · `PENDING`
Malayalam-supporting app, real NRI user base — the device-region guess in
`normalizeForIdentity` is wrong whenever a phone's system region doesn't
match its SIM/carrier country (see `system_learnings.md`'s 2026-09-11
entry). The picker's whole purpose is letting a real device with a
mismatched region still register correctly, so it needs a device with an
actually mismatched region to prove, not just Jest's mocked one.

**Setup.** A device whose system locale region differs from its SIM/carrier
country (or Settings → change system region temporarily).

**Steps.**
1. Open registration. Confirm the calling code shown matches the device's
   guessed region.
2. Tap the calling-code button, pick a different country from the list.
3. Enter a national number for that country and register.

**Pass.** The calling code button updates immediately on picking a country.
The number sent to `selfRegister` uses the explicitly picked country's
calling code, not the device's guessed one — confirm via the account this
creates actually being reachable by lookup from a sender who expects that
country's number.

**Fails if.** The picker's selection doesn't change what gets submitted, or
the device's guessed region silently wins anyway.

---

<a id="d43"></a>
## D43 — notifiedAt / openedAt stamping survives a cold-start race · `PENDING`

*Added 2026-09-16.* Jest proved the fix with two mocked functions racing each
other (`services/ReminderService.test.ts`, "concurrent writes do not clobber
each other"). What it cannot prove is the real trigger: a genuinely killed
app, a real tap, real `AsyncStorage` I/O timing on a real device. The mocked
version passing does not mean the real one does — this is exactly the class
of bug (two async storage writers overlapping) that a real device's slower,
less deterministic I/O could still expose in a shape the mock can't.

**Setup.** One reminder due a few minutes out, with its notification alarm on.
Force-stop the app (`adb shell am force-stop com.curios.remindme`), not just
background it — the bug is specific to a fully killed process.

**Steps.**
1. Wait for the notification to arrive in the tray with the app killed.
2. Tap it. This cold-starts the app straight into `reminder-detail` while
   `RemindersProvider`'s own mount-time reschedule sweep is also running.
3. Force-stop and repeat steps 1-2 four or five times in a row.
4. After each run, use `adb shell run-as com.curios.remindme` (or the
   Settings → backup export, which reads the same storage) to inspect the
   reminder's raw stored JSON.

**Pass.** Every run leaves `openedAt` set (the screen was opened) — and
`notifiedAt`, only if the app process was still alive when the tap-triggered
launch reached the received listener (see `Reminder.notifiedAt`'s own
real-limitation note — `notifiedAt` can legitimately be absent on a true
cold-start tap; `openedAt` is the one that must never be lost).

**Fails if.** `openedAt` is missing on some runs but not others — that
pattern (present sometimes, absent other times, same steps every time) is
exactly the signature of the lost-update race the write lock was meant to
close, and would mean the fix doesn't hold on real device I/O timing even
though it holds against the mock.

---

## D48 — First run no longer leaves the app for exact-alarm settings — `PENDING`

**Why hardware only.** Jest has no system settings screen and no launcher, so
the old auto-jump to Android's exact-alarm settings and its absence look
identical to the suite. The whole point of this change is what the user sees
in the first ten seconds of a real install, which is exactly what jsdom
cannot render.

**Setup.** A fresh install on Android 12+ (uninstall first, or
`adb shell pm clear com.curios.remindme` — the flags are in `AsyncStorage`,
so a plain reinstall over existing data proves nothing).

**Steps.**
1. Launch the app for the first time.
2. Watch what happens, without touching anything.

**Pass.** The name sheet opens, with the home screen behind it. No system
dialog of any kind appears: no notification permission dialog, and no
exact-alarm settings screen. The `register-number` modal never appears.
`ExactAlarmBanner` is visible at the top of the home screen if the permission
is missing, and its button still reaches the settings screen when tapped.

**Fails if.** The device leaves the app for a system settings screen at any
point without a tap, or a notification permission dialog appears before the
first save (that ask now belongs to D50), or the "Add your number" modal
appears on top of the name sheet, or the name sheet never opens at all.

## D49 — A skipped name is still skipped after a relaunch — `PENDING`

**Why hardware only.** The flag survives in real `AsyncStorage` across a real
process death, which the in-memory mock cannot demonstrate.

**Setup.** Continue from D48, or a fresh install.

**Steps.**
1. On the name sheet, tap Skip.
2. Force-stop the app (`adb shell am force-stop com.curios.remindme`).
3. Launch it again.

**Pass.** The home screen opens directly. No name sheet, no permission
dialog, no number modal. The header keeps its tap-to-add-name affordance.

**Fails if.** Any first-run surface reappears — that would mean the flag did
not persist, and every cold start would nag a user who already declined.

## D50 — The notification ask arrives on the first save — `PENDING`

**Why hardware only.** Jest cannot show an Android permission dialog, so it
cannot prove where in the flow the dialog lands, nor that the reminder saved
in the same action still rings.

**Setup.** A fresh install (`adb shell pm clear com.curios.remindme`).

**Steps.**
1. Launch the app and answer or skip the name sheet.
2. Type a reminder for two minutes from now and save it.
3. Grant the notification permission when the dialog appears.
4. Lock the device and wait for the reminder time.

**Pass.** The permission dialog appears at step 2, not before. The reminder
saves and appears in the list. It rings at the set time.

**Fails if.** No dialog appears at the first save, or the dialog appears but
the reminder is missing from the list afterwards, or the reminder is listed
but never rings — the last one means the save raced the grant and scheduled
nothing.

## D51 — A refused permission shows a live repair path — `PENDING`

**Why hardware only.** `canAskAgain` is set by the real Android package
manager after real refusals; the mock cannot reach the state where the OS
silently drops a request.

**Setup.** A fresh install.

**Steps.**
1. Save a reminder and refuse the notification dialog.
2. Look at the home screen and at the saved reminder's card.
3. Tap **Turn on** in the banner and refuse again.
4. Repeat until Android stops showing the dialog (two refusals on most
   builds), then tap **Turn on** once more.
5. Grant the permission in the settings screen and return to the app.

**Pass.** The banner reads "Notifications are off. Your reminders will not
ring." and the future reminder's card carries a **Will not ring** chip. At
step 4 the app opens its own page in system settings instead of doing
nothing. On return the banner and the chip both disappear without a
relaunch.

**Fails if.** Tapping **Turn on** produces no visible change at any point —
that is the exact dead-button failure this ladder exists to remove — or the
banner stays after permission is granted.

## D52 — The nudge names a ring the user already lost — `PENDING`

**Why hardware only.** It needs a reminder whose time truly passes on a real
clock, with the permission truly off.

**Setup.** Continue from D51 with the permission still refused.

**Steps.**
1. Save a reminder for one minute from now.
2. Wait two minutes with the app closed.
3. Open the app.

**Pass.** The banner reads "A reminder passed without ringing. Notifications
are off." The overdue reminder's card carries no **Will not ring** chip.

**Fails if.** The banner keeps the generic wording, or the overdue card
shows the chip — granting permission cannot rescue that ring, so the chip
there would be a label the user can do nothing about.

## D53 — Dictation ends itself after a pause — `PENDING`

**Why hardware only.** Jest has no microphone and no recognizer. The pause
clock only means something against real speech, real partial results and a
real device's recognition delay.

**Setup.** Grant the microphone permission. Open the home screen.

**Steps.**
1. Tap the mic.
2. Say "buy milk tomorrow at six", then stop speaking and do nothing.
3. Watch the input field and the listening panel.

**Pass.** The panel appears the moment the mic opens and reads "Listening —
say your reminder". It changes to "stop speaking when you're done" as soon
as words appear. About two and a half seconds after the last word, the panel
disappears by itself, the pulse stops, and the text stays in the field.

**Fails if.** The mic stays open after the pause, or the text disappears
when the session ends, or the panel never appears.

## D54 — Cancel throws the words away, Done keeps them — `PENDING`

**Why hardware only.** It needs a real recognizer, whose last partial result
can arrive after the tap.

**Setup.** Continue from D53.

**Steps.**
1. Type "pay rent" into the field.
2. Tap the mic and say "and call the bank".
3. Tap **Cancel**.
4. Tap the mic again, say "and call the bank", and tap **Done**.

**Pass.** After step 3 the field reads exactly "pay rent" and nothing is
added a moment later. After step 4 the field holds both phrases. Each tap
gives a short vibration.

**Fails if.** Cancel leaves the dictated words behind, or a late result
lands in the field a second after Cancel, or Cancel empties a field that
already held typed text.

## D55 — An open mic that hears nothing says so — `PENDING`

**Why hardware only.** Silence on a real microphone is not silence in Jest:
some devices emit empty results, some emit nothing at all.

**Setup.** A quiet room.

**Steps.**
1. Tap the mic and say nothing for about eight seconds.

**Pass.** After about six seconds the panel disappears and the app says
"Didn't hear anything — try again or type it in."

**Fails if.** The mic stays open, or it closes with no message at all.

## D56 — Leaving the app stops dictation — `PENDING`

**Why hardware only.** Android gives the microphone to whatever comes to the
front. Only a real device shows what the app is left holding.

**Setup.** Grant the microphone permission.

**Steps.**
1. Tap the mic and say "book the tickets".
2. Press Home, or take an incoming call.
3. Return to the app.

**Pass.** The panel is gone, the pulse has stopped, and "book the tickets"
is still in the field. The app says the voice input stopped when you left.

**Fails if.** The pulse is still running on return, or the mic is still
held, or the words are lost.

## D57 — The contacts ask explains itself before the OS asks — `PENDING`

**Why hardware only.** Android gives an app one contacts dialog and then
stops. Only a real device can show that the dialog was not spent, and that
the app behaves when it is gone.

**Setup.** A fresh install. Do not grant contacts.

**Steps.**
1. Tap the person icon beside the mic.
2. Read what appears, then tap **Type a number instead** and close the sheet.
3. Open the sheet again and tap **Choose from contacts**. Refuse the system
   dialog.
4. Tap **Allow contacts** and refuse again, until Android stops asking.
5. Open the sheet once more.

**Pass.** At step 2 the system dialog never appears. At step 4 the sheet
offers **Allow contacts**, not settings. At step 5 the sheet reads
"Contacts are turned off" and offers **Open settings**, which opens the app's
own page. Every one of these states also offers **Type a number instead**.

**Fails if.** The system dialog appears before step 3, or **Allow contacts**
does nothing once Android has stopped asking, or any state leaves the user
with no way forward.

## D58 — A reminder for someone, with no address book — `PENDING`

**Why hardware only.** It has to prove that a real send works from a number
that never came from the contacts list.

**Setup.** Contacts refused, from D57.

**Steps.**
1. Type "call about the invoice tomorrow at 10".
2. Tap the person icon, then **Type a number instead**.
3. Type a name and a real number you can message, then **Use this number**.
4. Save, open the reminder's card, and send by WhatsApp or SMS.

**Pass.** The chip names the person typed in. The message opens with the
right text and the right number. The reminder behaves like any other.

**Fails if.** The number is rejected, the chip shows the raw digits when a
name was typed, or the send opens with the wrong number.

## D59 — The number offer arrives after a send, and stops — `PENDING`

**Why hardware only.** The offer follows a real handoff to WhatsApp or SMS,
which Jest cannot perform.

**Setup.** A fresh install with no registered number.

**Steps.**
1. Create and send a reminder to somebody.
2. Return to the app and look below the send buttons.
3. Tap **Not now**.
4. Send a second reminder, and a third.

**Pass.** No offer appears before the first send. After it, the offer names
the person just reminded. It appears once more on the second send, and never
again on the third.

**Fails if.** The offer appears before any send, or keeps appearing after
two refusals, or appears at all for a user whose number is registered.

## D60 — The name sheet stays above the keyboard — `PENDING`

**Why hardware only.** jsdom has no soft keyboard, so a field it covers
renders identically to one it does not.

**Setup.** A fresh install, first launch.

**Steps.**
1. Wait for the name sheet.
2. Tap the name field.
3. Type a name, and watch the field while typing.

**Pass.** The field, the Continue button and the Skip link all stay visible
above the keyboard. Every character typed is readable.

**Fails if.** The keyboard covers the field, the button, or the link.

## D61 — The notification banner's button is never dead — `PENDING`

**Why hardware only.** Only a real OS keeps `canAskAgain`, and only system
settings can revoke a permission that was already granted.

**Setup.** A reminder saved with notifications granted.

**Steps.**
1. Turn notifications off for this app in Android settings.
2. Return to the app and read the banner's button.
3. Tap it.
4. Turn the permission back on, and come back to the app.

**Pass.** The button reads **Open settings**, not Turn on. The tap opens this
app's settings page. The banner and every card clear on return, with no
relaunch.

**Fails if.** The button reads Turn on, or the tap does nothing at all. This
is the reported defect.

## D62 — Dictation keeps every sentence across a pause — `PENDING`

**Why hardware only.** Only a real recognizer closes a segment at a pause and
starts the next one from empty. That is the behaviour that used to erase the
field.

**Setup.** Any screen with a mic.

**Steps.**
1. Tap the mic and say "buy milk".
2. Pause for about one second, and say "and bread".
3. Stop speaking and let the session close itself.

**Pass.** The field reads "buy milk and bread". Nothing is erased at the
pause. The session closes about 2.5 seconds after the last word, and keeps
the text.

**Fails if.** The field clears at the pause, or holds only the last sentence,
or the text changes after the session closes.

## D63 — The add/edit sheet dictates like the home bar — `PENDING`

**Why hardware only.** Same recognizer behaviour as D62, on the second
screen that has a mic.

**Setup.** Open **Add reminder**, then open an existing reminder to edit.

**Steps.**
1. Tap the mic on the new-reminder field and speak two sentences with a pause.
2. Let it close itself.
3. Repeat, and press **Cancel** instead.
4. Repeat on the edit screen's title field.

**Pass.** The listening panel appears on both screens, with Done and Cancel.
The pause keeps both sentences. Cancel puts back the text as it was.

**Fails if.** Either screen shows no panel, loses a sentence, or leaves the
mic open with no way to stop it.

## D64 — Remind someone else is always reachable — `PENDING`

**Why hardware only.** A control that is present but off-screen, or behind
the keyboard, passes in Jest and fails on a phone.

**Setup.** A fresh install.

**Steps.**
1. Look below the input bar on the home screen.
2. Tap **Remind someone else**.
3. Choose a contact, and look at the button again.

**Pass.** The labelled button is visible from install day, opens the picker,
and stays on screen after a recipient is chosen.

**Fails if.** The button is missing, covered by the keyboard, or disappears
once a recipient is attached.

## D65 — A typed number carries its country code — `PENDING`

**Why hardware only.** The defect it prevents comes from the device locale
disagreeing with the SIM, which jsdom cannot have.

**Setup.** A device whose system region differs from its SIM country, if you
have one.

**Steps.**
1. Tap **Remind someone else**, then **Type a number instead**.
2. Read the country-code field before typing.
3. Clear the country code and try to submit.
4. Put a code back, type a real number, and send.

**Pass.** The code field is filled from the device region. Submit is refused
with no code. The message opens with the full international number.

**Fails if.** The code is missing, ignored, or doubled in the sent number.

## D66 — The number offer reaches the people who need it — `PENDING`

**Why hardware only.** The offer is what creates the Supabase session, so
only a device can show whether the bolt badge comes back afterwards.

**Setup.** A fresh install with no registered number, and a second device
that has the app with a registered number.

**Steps.**
1. Choose the second device's contact as a recipient on the add/edit screen.
2. Read what appears under the recipient row.
3. Take the offer and register your number.
4. Choose the same contact again.

**Pass.** The offer appears at the pick, names the person, and appears at
most twice per install. After registering, the recipient chip carries the
bolt badge.

**Fails if.** No offer appears, or the badge never returns after registering.
This is the reported defect.
