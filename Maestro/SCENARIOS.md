# Maestro test scenario catalog — core reminders

Scenarios not already fully proven by Jest (jsdom can't see the real
keyboard, viewport, scroll, or OS chrome). Each is a 2-3 line statement of
intent; ones marked **[AUTOMATED]** have a matching `Maestro/*.yaml` flow.
IDs are new (`M1`...`M40`), separate from the `device-tests/` `D`-numbering
(those are OS/alarm-mechanics; these are UI-driving/input scenarios).

Legend: **H**appy path · **N**egative · **A**dversarial · **E**dge/boundary · **S**ecurity

## Reminder creation

- M1 [H] Create a reminder with plain English text + explicit time; verify it saves and shows in the list at the parsed time. **[AUTOMATED]** (`create_reminder.yaml`, pre-existing)
- M2 [H] Create a reminder with no time phrase; verify the "no time found" Confirm sheet appears and confirming persists it. **[AUTOMATED]** (`d12_vague_task_hint.yaml` exercises this path already)
- M3 [E] Save with an empty title (whitespace only); verify Save is a no-op or shows validation, never a blank list entry. **[AUTOMATED]** (`m3_empty_title_boundary.yaml`)
- M4 [E] Title at/just-over any max-length limit (very long string, 500+ chars); verify no crash, truncation or scroll, not garbled render.
- M5 [A] Title containing emoji, RTL (Arabic), and mixed Malayalam+English in one string; verify correct font fallback per `getFontFamily.ts` and no mojibake. **[AUTOMATED]** (`m5_mixed_script_adversarial.yaml`)
- M6 [A] Title containing raw HTML/script-like text (`<script>alert(1)</script>`, `"; DROP TABLE--`); verify it renders as inert literal text, never executed or interpreted. **[AUTOMATED]** (`m6_injection_like_text.yaml`)
- M7 [E] Title that is only digits/only punctuation; verify natural-language parser doesn't crash and something sane saves.
- M8 [N] Rapid double-tap on Save; verify exactly one reminder is created, not two. **[AUTOMATED]** (`m8_rapid_double_tap_save.yaml`)
- M9 [E] Date far in the past ("yesterday at 3pm" with no recurrence) and far future (a date years out); verify both save without overflow/crash.
- M10 [A] Paste a very long clipboard string (thousands of chars) into the input in one shot instead of typing; verify no ANR/freeze.

## Editing & deleting

- M11 [H] Edit an existing reminder's title and time; verify the change persists and the list re-sorts by new time. **[AUTOMATED]** (`edit_reminder_reparse_and_order.yaml`, pre-existing)
- M12 [N] Open edit, change nothing, tap back/close; verify original reminder is unchanged (no silent re-save/re-parse).
- M13 [E] Edit a reminder to remove its only time-bearing text; verify it re-prompts rather than silently keeping a stale time.
- M14 [H] Mark a reminder done, then un-complete it; verify it re-arms (re-appears as pending, not lost). **[AUTOMATED]** (D21 already `PASS`; re-check as regression)
- M15 [H] Delete a single reminder via detail screen; verify it disappears from the list and doesn't reappear on relaunch. **[AUTOMATED]** (`m15_delete_persists_after_relaunch.yaml`)
- M16 [N] Delete, then immediately background/kill the app before any debounce/save completes; on relaunch verify the delete still held (no resurrection from a stale write).

## List & completed section

- M17 [H] Clear-all-completed removes only completed items, leaves pending ones untouched. **[AUTOMATED]** (`home_clear_all_completed.yaml`, pre-existing)
- M18 [E] Clear-all-completed when there are zero completed items; verify the action is disabled/hidden, not a crash on an empty batch.
- M19 [H] Upcoming reminders grouped by date, correct ordering (today/tomorrow/later). **[AUTOMATED]** (`home_upcoming_grouped_by_date.yaml`, pre-existing)
- M20 [E] Two reminders at the exact same timestamp; verify both appear (no dedup-by-time collision) and ordering between them is stable across relaunch.

## Natural-language / Malayalam (device-only slice; parser logic itself is Jest's job)

- M21 [H] Malayalam-script title with a relative day + clock time entered via ADBKeyboard; verify correct parse and correct font (Noto Sans Malayalam) rendering on-device.
- M22 [A] Ambiguous numeral in Malayalam ("5" with no am/pm marker); verify the ambiguous-numeral confirmation sheet appears and both choices produce the expected saved time. (already tracked as `PENDING` in `device-tests/malayalam-parsing.md`)
- M23 [E] Time phrase describing midnight-wrap ("12am" / "12pm" boundary); verify no off-by-12-hours bug on the actual rendered card.

## Settings

- M24 [H] Toggle default-alarm and show-description switches; verify state persists across app relaunch (not just in-session). **[AUTOMATED]** (`m24_settings_persist_after_relaunch.yaml`)
- M25 [H] Switch dictation language en↔ml; verify the picker reflects the change and (Android) the "preparing voice recognition" first-use prompt appears once per new locale.
- M26 [N] Rapidly toggle a switch on/off many times in succession; verify final on-screen state matches final persisted state (no race where storage write lags UI).
- M27 [H] Negated alarm-toggle label renders correctly, distinct from removed old copy. **[AUTOMATED]** (`settings_negated_alarm_toggle.yaml`, pre-existing)

## Dictation / mic entry

- M28 [H] Tap mic, dictate a short English phrase, verify transcribed text lands in the input and can still be edited/saved normally.
- M29 [N] Tap mic then immediately tap it again (cancel) before speaking; verify no crash, no stuck "listening" state, input stays editable.
- M30 [E] Deny microphone permission (or revoke it in system settings) then tap mic; verify a clear in-app message, not a silent no-op or crash.

## Share-intent (in scope only for anything not Jest-covered)

- M31 [E] Share a very long shared-text payload (e.g. a forwarded WhatsApp message thousands of chars long) into the app; verify it's accepted into the input without trunc... crash, matching `SharedTextContext`'s real device text-handling limits (`SharedTextContext.test.tsx` covers the JS logic; this covers the OS handoff itself).

## Boundary / stress

- M32 [E] Create reminders until the list is long enough to require scrolling multiple screens; verify `scrollUntilVisible` still finds items and performance doesn't degrade to ANR.
- M33 [E] Background the app mid-input (typing, unsaved), switch to another app, return; verify draft text is preserved, not lost.
- M34 [N] Force-kill the app mid-save (before persistence completes) via `adb shell am kill`; on relaunch, verify no partial/corrupt reminder entry (ties to D17 corrupt-store quarantine).

## Security-relevant (device-provable slice only — HMAC/RLS/server-side belong to `lib/db` tests, not Maestro)

- M35 [S] Reminder titles/descriptions containing injection-shaped text (M6 above) never execute as code and never break out of their rendered text node — the on-device analog of an XSS check for a client with no webview rendering user content, still worth proving no `dangerouslySetInnerHTML`-equivalent exists.
- M36 [S] With dictation-language set to Malayalam, dictate/type a string that is valid Malayalam Unicode but includes bidi-override or zero-width control characters; verify rendering doesn't visually spoof the title (e.g. hide a word) — a known Unicode-spoofing class.
- M37 [S] App backgrounded then screenshotted by the OS (recent-apps thumbnail); not Maestro-automatable, but flag as a manual privacy check for whether reminder content (e.g. someone's medical reminder) leaks into the OS app-switcher preview. **[MANUAL — out of Maestro scope, noted for `device-tests/`]**

## Notes

- M4, M7, M9, M10, M13, M16, M18, M20, M22, M23, M25, M26, M28-M34, M36
  are catalogued but **not automated this pass** — listed for prioritization,
  not because they don't matter. M37 is inherently manual.
- Scenarios already covered by an existing `Maestro/*.yaml` are marked
  **[AUTOMATED] (pre-existing)** and were not re-written.
- New flows added this pass (see each file's header comment for detail):
  `m3_empty_title_boundary.yaml`, `m5_mixed_script_adversarial.yaml`,
  `m6_injection_like_text.yaml`, `m8_rapid_double_tap_save.yaml`,
  `m15_delete_persists_after_relaunch.yaml`,
  `m24_settings_persist_after_relaunch.yaml`.
