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
