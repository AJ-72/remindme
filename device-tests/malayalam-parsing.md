# Malayalam on-device input and parsing

[← index](README.md)

Jest covers `malayalamDateParser.ts` directly with clean typed strings; what
it cannot cover is the real device keyboard/recognizer actually emitting the
characters these patterns expect, and locale-driven native formatting.

| ID | Scenario | Status | Last run | Auto? |
| --- | --- | --- | --- | --- |
| [D24](#d24) | 12-hour AM/PM time display | `BLOCKED` | 2026-09-03 (attempted) | AUTO |
| [Numeral clock times](#numeral-clock-times) | Dot separator + am/pm | `PENDING` | — | MANUAL |
| [Ambiguous-numeral sheet](#ambiguous-numeral-sheet) | Confirmation sheet | `PENDING` | — | SEMI |

---

<a id="d24"></a>
## D24 — 12-hour AM/PM time display · `BLOCKED` (attempted 2026-09-03)

Jest covers `formatDatetime.ts` rendering `hour12: true` output; unproven is
whether a real device's locale-driven `toLocaleTimeString` actually obeys the
explicit `hour12` override rather than some ROM/locale quirk overriding it
back to 24-hour (the whole reason this bug existed).

**Attempted via `Maestro/time_12hour_format.yaml`** (`maestro test
Maestro/time_12hour_format.yaml`) — types a timed reminder, asserts the
suggestion pill and the saved card both show `4:30 PM` and never `16:30` /
`16.30`. The flow itself is written and should be correct, but the run
against the one device available (`b81a371a`, 2026-09-03) never got past the
app's splash screen — `MainActivity` focused, no crash in logcat, and no
React Native log lines at all, which points at a stale/release build with no
reachable Metro rather than a problem with the flow or the fix.

- [ ] PENDING — Get a debug build with Metro actually running (or a release
      build that bundles current JS), then run
      `maestro test Maestro/time_12hour_format.yaml` for real.
- [ ] PENDING — Also eyeball it manually: set the device's system locale to
      something that defaults to 24-hour (e.g. most European locales), open
      add-reminder, type a time, confirm both the suggestion pill and the
      saved card still show AM/PM — this is the actual bug being guarded
      against and the Maestro flow can't change device locale itself.

**Related, found while attempting this:** `Maestro/malayalam_flow_a_focus.yaml`,
`smoke_malayalam_text.yaml` and `time_12hour_format.yaml` all had a bare
`tapOn` immediately after `launchApp`, which is unreliable on a slow-launching
build — an `extendedWaitUntil` for the target element was added to all three.
Also, some devices deny `CLEAR_APP_USER_DATA` to the adb shell user
(`SecurityException` from `ActivityManagerService`); `clearState: true` was
removed from `time_12hour_format.yaml` and never added to the Malayalam
flows for this reason — none of the assertions actually need a known-empty
list. See CLAUDE.md's Testing > End-to-end tests (Maestro) section for the
Malayalam-typing workaround (`run-malayalam-maestro-flow.ps1`), which hit the
identical splash-screen block on the same device.

---

<a id="numeral-clock-times"></a>
## Malayalam numeral clock times (dot separator + am/pm) · `PENDING`

Landed with the `malayalamDateParser` numeral-time fix. Jest covers the
parser directly; what it cannot cover is the on-device keyboard actually
emitting the characters these patterns expect.

- [ ] PENDING — Type `ആധാരം എഴുത്ത് ഇന്ന് 11.30` on the Malayalam keyboard on
      the home-screen quick-add. The chips must read `Today · 11:30`, not
      `Today · 09:00`, and the title chip must read `ആധാരം എഴുത്ത്`.
- [ ] PENDING — Type `ഇന്ന് 10.30 am`. Chips must read `Today · 10:30`.
      Repeat with `pm` → `22:30`.
- [ ] PENDING — Confirm the ML keyboard's period key emits U+002E FULL STOP
      (what the parser matches) and not a look-alike. If a time silently
      fails to parse on-device while the same string passes in Jest, this is
      why — check the actual code point before touching the parser.
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

---

<a id="ambiguous-numeral-sheet"></a>
## Ambiguous-numeral confirmation sheet · `PENDING`

The parser now reports "this numeral could be an hour or could be part of
the reminder" instead of choosing, and QuickAddInput asks before saving.
Jest covers the branch and both outcomes; what it cannot cover is the sheet
on a real screen.

- [ ] PENDING — Type `രാവിലെ 5 ആപ്പിൾ വാങ്ങണം` and tap save. A sheet must ask
      `Is "5" the time?` with two rows; nothing may be saved until one is
      tapped.
- [ ] PENDING — Both rows must render their Malayalam title in Noto Sans, not
      tofu boxes, and must not clip on a narrow screen (the title is
      `numberOfLines={1}`, so check a long reminder truncates with an
      ellipsis rather than pushing the time off the row).
- [ ] PENDING — Choose the time row. 05:00 is inside default quiet hours, so
      the quiet-hours sheet must appear next, and the saved title must be
      `ആപ്പിൾ വാങ്ങണം` — confirming the chosen title survived that detour.
- [ ] PENDING — Choose the text row: saved title keeps the `5`, time is
      09:00.
- [ ] PENDING — Dismiss the sheet by tapping outside. Nothing saved, the
      typed text still in the box, and saving again must ask again.
