# Visual and layout

[← index](README.md)

| ID | Scenario | Status | Last run | Auto? |
| --- | --- | --- | --- | --- |
| [D8](#d8) | Dark mode, visually | `PASS` | 2026-08-24 | SEMI |
| [D14](#d14) | Seven 2026-08-24 device fixes | `PARTIAL` | 2026-08-29 | SEMI |

---

<a id="d8"></a>
## D8 — Dark mode, visually · `PASS` (2026-08-24, user's OEM device)

One defect found and fixed during this pass: the status-bar icons were
invisible with the app set to Light on a dark-mode phone (`017b785`). That
fix is **not** re-verified — see D14 #2.

Re-run this whole walk after any new screen lands. The screens added since
this passed (Smart Alerts, Why tasks slip, the quiet-hours and name sheets)
were **not** part of it. Jest asserts *token values*, not pixels.

**Setup.** System theme **dark**. Have one overdue reminder and one completed
reminder in the list before starting, so the destructive and muted states
are on screen.

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

At each: look for text vanishing into its background, the **status bar**,
and **modal overlays** — the three places contrast failures actually land.

11. Toggle the **system** theme while the app is open.
12. Settings → Appearance: set **Light** on a dark device, then **Dark** on a
    light device, then **System**.
13. Restart the app.
14. Force a crash again with a non-default theme selected.

**Pass.** Every screen legible in dark. Step 11 switches immediately, with
no restart. Step 12: the explicit choice **wins** over the OS in both
directions, and System hands control back. Step 13: the choice survives.
Step 14: the error screen honours the chosen theme.

**Fails if.** Any text matches its background; the status-bar icons disappear
(that is D14 #2); or the error screen renders in the OS theme rather than the
chosen one — `ThemeProvider` sits outside `ErrorBoundary` specifically so it
does not.

---

<a id="d14"></a>
## D14 — 2026-08-24 device-feedback fixes · `PARTIAL` — #1 and #3 verified 2026-08-29

Seven findings from a real device, all fixed but none fully re-verified.
Four were invisible to the entire test suite.

**Setup.** A device with a real keyboard and a real status bar — four of
these were invisible to the entire suite precisely because jsdom has
neither. Have a long name and a Malayalam name ready.

**Steps and pass criteria, one per finding.**

1. **Settings scrolls.** Open Settings and swipe all the way down.
   *Pass:* you reach the **Debug logs** row. *Root was a plain `View`, so
   everything past one viewport was unreachable — if it stops early, the
   ScrollView regressed.*
   **`PASS` 2026-08-29** — Settings scrolls to Debug logs.
2. **Status bar readable in both themes.** Set Settings → Appearance to
   **Light** while the phone is in **dark mode**, then the reverse.
   *Pass:* the clock, battery and signal icons are visible in **both**
   combinations. This crossed pairing is the one that broke; matching
   app-and-phone themes will not reproduce it.
   *Status: outstanding.*
3. **Header greeting does not truncate.** View the home header with (a) a
   short name, (b) a long full name, (c) a Malayalam name.
   *Pass:* no `Good morn..` clipping in any of the three.
   **`PASS` (partial) 2026-08-29** — header renders "Good afternoon, Anand"
   complete, with "Anand Jayaram" stored. Long and Malayalam names still
   untested.
4. **Quick-add layout.** Open the home screen and type a long title into
   quick-add.
   *Pass:* the buttons sit **below** the input, long text uses the full
   width, and you can still see a useful amount of the reminder list above
   the fold — the card is taller than it was, so judge this as a user, not a
   checkbox.
   *Status: outstanding.*
5. **Recipient chip.** Add a recipient to a reminder.
   *Pass:* the chip names the chosen contact, and its **x** removes them.
   *Status: outstanding.*
6. **Contact picker above the keyboard.** Open the picker and type a search
   that narrows to **one or two matches**.
   *Pass:* the sheet stays above the keyboard. *Few matches is the failing
   case — the sheet is shortest then and used to vanish entirely, so a
   search returning many results proves nothing.*
   *Status: outstanding.*
7. **Send reminder edit.** From the send screen, use the header's edit
   control.
   *Pass:* the reminder editor opens.
   *Status: outstanding.*

**Fails if.** Any of the seven reproduces its original symptom. Record which
number failed — "D14 failed" is not actionable.
