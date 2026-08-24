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

---

## A. Cross-cutting risks

### D7 — OEM battery-killer survival · `PENDING`
Do scheduled alarms fire at all on Xiaomi/Oppo/Vivo with battery optimization
at its default aggressive setting? Flagged as a listing blocker in the
2026-08-09 adoption assessment, and the blind spot behind D1 and D4. **Test
this first** — several other items are meaningless if alarms do not fire.

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
