# WhatsApp → Reminder via Clipboard Paste

**Date:** 2026-07-19
**Scope:** `artifacts/mobile`
**Goal:** Let a user turn a WhatsApp message like "lets meet tomorrow evening" into a reminder with minimal friction, without WhatsApp's own share mechanism (which doesn't support plain text).

## Why not share-intent

`artifacts/mobile/contexts/SharedTextContext.tsx` + `expo-share-intent` already implement an Android share-sheet receiver (Task #20), and it was assumed this would cover WhatsApp. Verified on-device that it does not: WhatsApp's long-press menu on a **text** message offers Reply / Copy / Forward / Star / Delete — no "Share" action, and "Forward" only targets WhatsApp contacts/chats, never external apps. WhatsApp help center confirms the only path to get text out of a message is Copy → clipboard → manual paste ("How to copy and paste on WhatsApp").

WhatsApp **does** support sharing images and voice notes to external apps (confirmed on-device) — `SharedTextContext`'s existing plumbing already works for those via the Android share sheet, but `app.json`'s `androidIntentFilters` is currently `["text/*"]` only. Extending it to `image/*` and audio types, plus building an on-device audio/OCR pipeline, is a real opportunity but out of scope here — **tracked as backlog**, not part of this design.

A native `ACTION_PROCESS_TEXT` (Android's text-selection context-menu action) integration was also considered and rejected: verified on-device that selecting text inside a WhatsApp message does not expose the app to that system action either, and it would have required a custom native Android module beyond Expo's config-plugin capabilities regardless.

## Approach

Copy → paste is the only mechanism WhatsApp actually exposes for text. The design closes the gap between "technically possible" (long-press-paste into the existing `QuickAddInput` box already works today) and "seamless" by detecting clipboard content automatically when the app opens.

## Part A — Paste-from-clipboard suggestion

**Flow:** User copies a WhatsApp message → switches to the Reminders app → a dismissible suggestion chip appears above `QuickAddInput` showing a preview of the clipboard text → tapping it fills the input, running the existing `chrono-node` parse pipeline unchanged → user reviews parsed title/date and saves.

**Trigger:** Read the clipboard when the home screen (`app/index.tsx`) regains focus — via `AppState` change to `active` and/or React Navigation focus event, not backgrounded polling. Android 10+ restricts clipboard reads to the focused app or default IME (confirmed via Android's official privacy-changes docs); foreground-focus is exactly the condition the OS permits, so no special permission or native module is needed.

**Library:** Add `expo-clipboard` (`getStringAsync`). Not currently a dependency.

**Dedup / dismissal rules:**
- Skip if clipboard text is empty/whitespace-only.
- Skip if clipboard text is identical to the last suggestion the user already dismissed or converted into a reminder (store last-seen clipboard hash in memory/state — no persistence needed, this is a same-session nicety, not a durable feature).
- Chip is dismissible (X button) and does not reappear for that same clipboard content in the current app session.

**UI placement:** New small component (e.g. `ClipboardSuggestionChip`) rendered between the header and `QuickAddInput` in `app/index.tsx`, consistent with existing card/chip styling (`colors.card`, `colors.primary` accents used elsewhere in the file).

**Non-goals:** No background service, no clipboard listener while app is backgrounded, no cross-session persistence of dismissed clipboard content.

## Part B — Hardening the no-date-found fallback for pasted/shared text

Testing confirms `chrono-node` already parses the exact motivating example correctly: "lets meet tomorrow evening" → tomorrow 8:00 PM. It also handles "tomorrow morning," "tonight," "next week," "this weekend," "on saturday," and explicit times/dates without changes.

It returns no match for fully date-less phrases: "catch up soon," "lets meet later," "gym after work," "need to call the plumber." These already fall through to the existing "no time found" bottom sheet in `QuickAddInput.tsx` (`showNoTimeSheet`), which suggests the next full hour and lets the user confirm or change it — this fallback is correct behavior, not a bug.

**Scope for this design:** verify that fallback holds up specifically for pasted/shared text, which tends to be longer and noisier than typed input (sender names, emojis, links, multi-line WhatsApp forwards). Concretely:
- Confirm the title-extraction cleanup (stripping matched date/time substrings, trimming punctuation) in `parseNaturalLanguage` degrades gracefully on multi-sentence or emoji-heavy pasted text rather than producing a mangled title.
- No changes to chrono-node itself or its parsing options — this is a verification/hardening pass on existing code paths, not new NLP work.

## Testing

Extend the existing `artifacts/mobile` jest suite (see `docs/specs/2026-07-19-mobile-testing-design.md`):
- New `ClipboardSuggestionChip` component test: renders when clipboard has new text, hidden when empty/duplicate/dismissed.
- `expo-clipboard` gets a manual jest mock (pattern matches `__mocks__/expo-notifications.ts`).
- `parseNaturalLanguage` (`add-reminder.tsx` / `QuickAddInput.tsx`) gets additional test cases for multi-line and emoji-containing pasted text, asserting the title is cleaned sensibly and the no-match case still triggers the fallback sheet.

## Out of scope / backlog

- Extending `expo-share-intent`'s `androidIntentFilters` to `image/*` and audio MIME types so WhatsApp-shared images/voice notes reach `SharedTextContext` (would need OCR for images, speech-to-text for audio, before reminder creation) — real opportunity, separate spec.
- Any WhatsApp Business API / bot-based server-side integration — heavier, needs the currently-unused mobile-to-API-server connection to come online first.
