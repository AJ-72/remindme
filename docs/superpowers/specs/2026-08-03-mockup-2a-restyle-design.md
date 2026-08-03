# Home screen restyle: match Claude Design mockup 2a ("Just Remind — Clean Neutral")

**Date:** 2026-08-03
**Status:** Approved

## Summary

Restyle the mobile app's home screen, reminder cards, and quick-add input to match the visual language of mockup 2a from the "Task Reminder App Design Options" Claude Design project (`https://claude.ai/design/p/abc962a4-7dd7-468d-b3b0-ca75581348ad`, sections 2a/2b): fully-rounded ("soft") shapes, cozy density, a "Today"-style greeting header, and a TYPE/SPEAK tab toggle on the quick-add input replacing the standalone mic icon.

This is primarily a visual/token restyle plus one scoped interaction change (the TYPE/SPEAK tabs). App name stays "Reminders" — no rebrand, no new screens, no other functional changes.

## Reference

- Source mockup: Claude Design project "Task Reminder App Design Options", sections **2a** (Just Remind — Clean Neutral) and **2b** (Auto-detected date/time, confirmation chips).
- Mockup theme system: accent color, `shape` (soft/crisp/boxy), `density` (cozy/compact). This restyle uses **accent `#6366f1`** (current app indigo, closest to mockup's purple option — not the mockup's blue default), **shape: soft**, **density: cozy**.

## Scope

### 1. Design tokens (`constants/colors.ts`)

- Keep `primary`/accent at `#6366f1` (no color change).
- Radius scale reflects "soft" shape:
  - Cards / list container: `20` (was `16`).
  - Checkboxes, avatar placeholder, save button, capsule accent button: fully round (`circular`, i.e. `borderRadius = size / 2` or `999`).
  - Input capsule: `20` (was `16`).
- `background` unchanged (`#F7F7F8`, already matches mockup's off-white).

### 2. Home screen header (`app/(tabs)/index.tsx`)

- Replace the static "Reminders" title with a mockup-style header:
  - Large 30px bold title reading **"Today"**.
  - Subtitle line combining date and task count: `"{Weekday}, {Month} {Day} · {N} tasks"` (reuse existing date-formatting conventions from `formatDatetime.ts`), or `"All caught up!"` when there are no upcoming reminders — same empty-state copy as today, just relocated under the new title.
  - Circular placeholder avatar icon top-right, reusing the existing `colors.muted` circle styling already used for `emptyIcon` (no new asset/functionality — decorative only).
- Section labels ("Upcoming"/"Completed") keep current text and behavior; only visual restyle (radius/spacing) applies, no wording change.
- Screen title in navigation/tab chrome stays "Reminders" — only the in-page header text changes to "Today". No app name/branding change anywhere.

### 3. Quick-add input capsule (`components/QuickAddInput.tsx`)

- Bar becomes a fully rounded capsule: `borderRadius: 20`.
- **New TYPE/SPEAK tab row**, added below the main input row inside the capsule, matching mockup layout:
  - **TYPE tab** (default/initial state): current text-input row as-is (typing, notes toggle, alarm toggle, save all unchanged). Switching to TYPE while listening stops dictation via the existing `stopListening()` path (same call the app makes today when the mic icon is tapped to stop).
  - **SPEAK tab**: switching to it starts live dictation immediately, invoking the existing flow unchanged: mic-permission check → `ensureOfflineModelReady` → `startListening`. All existing notices/edge cases carry over verbatim, just triggered by tab selection instead of icon tap:
    - "Preparing voice recognition — try again in a moment" (model not ready)
    - "Still transcribing the shared audio…" (shared-audio transcription in progress — `micSourceRef.current === "shared"`)
    - "Couldn't hear that — try again or type it in." (recognition error)
    - Permission-denied → `Linking.openSettings()` (same as today)
  - While actively listening, the **SPEAK tab itself** displays the pulsing mic/waveform indicator — reuse the existing `micPulse` Animated.Value and pulse loop (`startMicPulse`/`stopMicPulse`), relocated from the old standalone mic icon into the tab's visual.
  - If listening stops on its own (silence timeout, recognition error, or a shared-audio transcription finishing) while SPEAK is still selected, the tab stops pulsing but **remains selected** — no auto-switch back to TYPE. Tab selection is manual; only the pulse reflects live listening state.
  - Underline/active-tab styling in accent color, matching mockup (`activeTabStyle`).
- **Standalone mic icon button is removed** from the top icon row. Remaining icon row order: notes toggle, alarm/bell toggle, save — unchanged behavior for all three.
- Save button becomes a filled circular accent button (`borderRadius: 999`), matching mockup's `accentBtnStyle` (was a 16px-radius rounded square).
- All other input behavior unchanged: natural-language parsing preview pills, notes field, no-time-found bottom sheet, date/time picker, mic permission/model-download flows, shared-text/shared-audio intake via `SharedTextContext`.

### 4. Reminder list & cards (`components/ReminderCard.tsx`)

- Card corner radius → `20` (was `16`), matching mockup's list-card look.
- Checkbox stays circular; size adjusted to `24px` (was `26px`) to match mockup's `checkFilledStyle`/`checkOutlineStyle` proportions.
- Row padding tightened to cozy-density value (`14px 16px`), matching mockup's `rowStyle`.
- All row content, icons (delete, overdue alert/clock), text hierarchy, completed/overdue styling logic — unchanged.

## Explicitly out of scope

- No TYPE/SPEAK-driven change to notes field, alarm toggle, or save behavior — all continue working identically regardless of active tab.
- No "Just Remind" wordmark/logo — app name stays "Reminders" throughout (nav chrome, Settings, About).
- No dark-mode palette work (app is light-only today; token changes apply to the existing light palette only).
- No changes to Settings or About screens.
- No changes to `add-reminder.tsx` / `reminder-detail.tsx` modals, notification handling, or any AsyncStorage/service-layer logic.
- Mockup 2b's confirmation-chip UI (chips appearing under the input as date/time are auto-detected while typing) is **not** adopted — the existing pill-row preview (`pillRow`/`pill` styles, already present in `QuickAddInput.tsx`) is kept as-is, just restyled per the token changes above (radius, spacing). It already serves the same purpose as 2b's chips.

## Testing

- Update/extend existing tests in `components/QuickAddInput.test.tsx` (or equivalent) to cover: tab switching starts/stops listening correctly, SPEAK tab shows pulse while listening, TYPE tab stops listening, mic icon button is gone, existing notice strings still fire from tab-triggered start attempts.
- Update `ReminderCard` and home-screen snapshot/behavior tests if they assert on specific radius/style values or icon presence (mic icon removal).
- Manual verification: run the app, exercise both tabs, confirm dictation starts/stops correctly, confirm shared-audio-in-progress notice still surfaces correctly if SPEAK is tapped mid-shared-transcription.
