# Malayalam reminder input

## Problem

Users can only get natural-language date/time extraction out of typed (or spoken) reminder text in English — `parseNaturalLanguage()` in `components/QuickAddInput.tsx` calls `chrono.parse()` (chrono-node, English-only). If a user types or speaks a reminder in Malayalam, `chrono.parse()` finds nothing, so the entire raw string becomes the reminder title with no date/time extracted, and the user has to set the time manually via the picker. Separately, Malayalam text renders in the OS default font rather than the app's Inter typeface, since Inter has no Malayalam glyphs.

## Goals

- Typing (or speaking, via existing speech-to-text) a reminder in Malayalam with a natural date/time phrase (e.g. "നാളെ വൈകിട്ട് 5 മണിക്ക് മീറ്റിംഗ്") extracts the date/time automatically, the same way English phrases do today.
- Malayalam reminder text (titles/descriptions) renders in a font that actually supports Malayalam glyphs, visually consistent with the rest of the app's typography.
- No regressions to existing English parsing.

## Non-goals

- No UI translation (buttons, labels, screens stay English) — this is about understanding/rendering user-entered content, not an i18n framework for the app itself.
- No machine translation or external API dependency — the app is local-first; parsing must work fully offline.
- No changes to speech-to-text transcription itself (`SpeechService.ts`, device-locale passthrough) — only verifying that Malayalam transcripts flow correctly into the new parser, since transcribed text lands in the same `QuickAddInput` state and goes through the same `parseNaturalLanguage()` function as typed text.
- No support for every possible Malayalam date/time phrasing — covers the common patterns listed below, not open-ended natural language.

## Technical design

### Script detection & routing

`parseNaturalLanguage()` (`components/QuickAddInput.tsx`, current chrono-only implementation) gains a script check before parsing:

```ts
const MALAYALAM_RANGE = /[ഀ-ൿ]/;

function parseNaturalLanguage(text: string, now: Date) {
  if (MALAYALAM_RANGE.test(text)) {
    return parseMalayalamDateTime(text, now);
  }
  // existing chrono.parse(...) path, unchanged
}
```

`parseMalayalamDateTime` lives in a new file, `utils/malayalamDateParser.ts`, and mirrors the existing contract: given raw text and a reference `now`, return the matched date and the substring that matched (so the caller can strip it from the text to derive the title), or a null match if nothing recognized. Unparsed Malayalam text behaves exactly like unparsed English text today: the full string becomes the title, and the user sets date/time manually.

Keeping this as a fully separate module (rather than extending chrono or building a shared regex layer) means the existing English path is untouched — zero risk of regressing chrono behavior — and the Malayalam patterns can be tested in isolation.

### Malayalam pattern coverage (v1)

Matched via regex against the input (whitespace-normalized), supporting both Malayalam digits (൦–൯) and Arabic digits (0–9) since mixed usage in typed/transcribed text is common:

- **Relative days**: ഇന്ന് (today), നാളെ (tomorrow), മറ്റന്നാൾ (day after tomorrow).
- **Weekday names**: ഞായർ, തിങ്കൾ, ചൊവ്വ, ബുധൻ, വ്യാഴം, വെള്ളി, ശനി — resolves to the next occurrence of that weekday; അടുത്ത (next) prefix forces +7 days when today is that weekday.
- **Clock time**: "X മണിക്ക്" (at X o'clock). Period-of-day words (രാവിലെ/morning, ഉച്ചയ്ക്ക്/noon, വൈകിട്ട്/evening, രാത്രി/night) disambiguate AM/PM when combined with an hour, or set a default hour when used alone.
- **Half-past**: "X മണി കഴിഞ്ഞ് അര" / "അര മണിക്ക്" patterns → :30. No quarter-past/to support in v1 (rare enough in casual reminder phrasing to defer).
- **Relative durations**: "X മണിക്കൂർ കഴിഞ്ഞ്" (in X hours), "X മിനിറ്റ് കഴിഞ്ഞ്" (in X minutes).

Ambiguous or unrecognized phrasing returns a null match — same fallback behavior as chrono's miss case.

### Speech path

No structural changes to `SpeechService.ts` — transcribed text already lands in `QuickAddInput`'s text state and flows through `parseNaturalLanguage()`, so it's covered by the routing change above automatically. Add a test feeding a Malayalam transcript-shaped string through `parseNaturalLanguage()` to confirm routing engages for speech-sourced text and that mixed numeral styles (OS transcription may render numbers as Arabic digits or Malayalam words) are both handled.

### Font handling

Add `@expo-google-fonts/noto-sans-malayalam` and load it alongside the existing Inter fonts in `app/_layout.tsx` (same `useFonts` call, same loading-gate pattern already used for Inter).

New helper, `utils/getFontFamily.ts`:

```ts
export function getFontFamily(text: string, weight: "regular" | "medium" | "bold"): string {
  if (MALAYALAM_RANGE.test(text)) {
    return NOTO_SANS_MALAYALAM_WEIGHTS[weight];
  }
  return INTER_WEIGHTS[weight];
}
```

Applied only where user-entered reminder content is rendered — `components/QuickAddInput.tsx` (the input itself and the parsed-preview text), `components/ReminderCard.tsx` (title on the list), `app/reminder-detail.tsx` (title/description), `app/add-reminder.tsx` (title/description fields). Static UI chrome (nav labels, buttons, headers) keeps its hardcoded Inter `fontFamily` — those are always English and don't need the check.

## Testing

- New `utils/malayalamDateParser.test.ts`: one case per pattern category above (today/tomorrow/day-after, each weekday, o'clock with and without period words, half-past, relative hours/minutes), plus: mixed Malayalam+English text, unrecognized text returns null cleanly, mixed Malayalam/Arabic numerals in the same string.
- Extend `components/QuickAddInput.test.tsx` (existing chrono-based test suite) with Malayalam-routing cases: confirms script detection dispatches to the Malayalam parser instead of chrono, and a Malayalam-transcript-shaped case to cover the speech path.
- New test for `utils/getFontFamily.ts`: returns the Malayalam font for Malayalam input, Inter for English/mixed-but-Latin-dominant input, correct weight mapping for each of `regular`/`medium`/`bold`.
- What remains manual-only: actual on-device rendering check (Malayalam glyphs display correctly, font looks visually consistent) and, if the device's OS speech engine supports Malayalam, an end-to-end spoken-reminder check — both device/OS-dependent and not practical to assert in unit tests.

## Out of scope / explicitly deferred

- UI string translation / i18n framework for the app itself.
- Machine translation or any external API for parsing.
- Quarter-past/quarter-to time phrasing.
- Any other Indian language beyond Malayalam (the routing structure makes adding another script/parser pair straightforward later, but that's not built now).
