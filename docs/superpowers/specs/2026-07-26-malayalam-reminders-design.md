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

The real signature of `parseNaturalLanguage()` in `components/QuickAddInput.tsx` (lines 63–80) is:

```ts
function parseNaturalLanguage(text: string): { title: string; date: Date | null } {
  if (!text.trim()) return { title: "", date: null };
  const now = new Date();
  const results = chrono.parse(text, now, { forwardDate: true });
  // ... strips each result's matched substring (by r.index/r.text) from title
}
```

It takes no `now` parameter (creates it internally) and returns `{ title, date }` directly, having already stripped the matched substring(s) out of the title itself — it does not expose a separate "matched substring" to the caller. The Malayalam path must return the same shape so the call site doesn't need to branch on which parser ran:

```ts
const MALAYALAM_RANGE = /[ഀ-ൿ]/;

function parseNaturalLanguage(text: string): { title: string; date: Date | null } {
  if (!text.trim()) return { title: "", date: null };
  if (MALAYALAM_RANGE.test(text)) {
    return parseMalayalamDateTime(text);
  }
  // existing chrono.parse(...) path, unchanged
}
```

`parseMalayalamDateTime(text: string, now: Date = new Date()): { title: string; date: Date | null }` lives in a new file, `utils/malayalamDateParser.ts`. The `now` parameter defaults to the current time in production (so the call site in `parseNaturalLanguage` doesn't need to pass anything) but is injectable so tests can pin it — this is a deliberate difference from chrono's own signature, whose `now` is required. The function does its own stripping + whitespace/punctuation cleanup to produce `title`, mirroring lines 75–78 of the existing function. Unparsed Malayalam text behaves exactly like unparsed English text today: the full string becomes the title, and the user sets date/time manually.

Keeping this as a fully separate module (rather than extending chrono or building a shared regex layer) means the existing English path is untouched — zero risk of regressing chrono behavior — and the Malayalam patterns can be tested in isolation.

**Code-mixed input (e.g. "call John നാളെ 5pm" or "Meeting tomorrow നാളെ"):** routing is binary on "does the string contain any Malayalam character" — there is no per-token script splitting. A string with any Malayalam character routes entirely to `parseMalayalamDateTime`, which only recognizes Malayalam date/time vocabulary; embedded Latin date tokens (e.g. "5pm") are not parsed and are left untouched inside the title (since only recognized Malayalam matches get stripped). Symmetrically, a string with zero Malayalam characters but an English relative-date word next to a Malayalam clock phrase never reaches the Malayalam parser's vocabulary and vice versa. This is a stated v1 limitation, not a bug: fully general code-mixed parsing (splitting a string into per-token scripts and running both parsers) is deferred — see Out of scope.

### Malayalam pattern coverage (v1)

`parseMalayalamDateTime` uses independent resolvers per component (day, period-of-day, clock hour/minute, relative duration), then **composes** their results onto one `Date`, rather than one monolithic regex. Composition rule:

1. Start from `now` (or `now` + duration offset if a relative-duration pattern matched — see below).
2. If a **day resolver** matched (relative day word or weekday name), set that `Date`'s year/month/day, carrying the time-of-day forward from step 3 (default 09:00 if no time component matched at all, matching the app's existing default-time convention for date-only input).
3. If a **clock/period resolver** matched, set that `Date`'s hour/minute, keeping whatever day was set in step 2 (or today's day, if no day resolver matched).
4. If a **relative-duration resolver** matched, it is mutually exclusive with day/clock resolvers (a string like "5 മണിക്കൂർ കഴിഞ്ഞ്" doesn't also carry a day or clock phrase) and returns `now + offset` directly, skipping steps 2–3.

Worked example — "നാളെ വൈകിട്ട് 5 മണിക്ക് മീറ്റിംഗ്" (tomorrow evening at 5 o'clock, meeting): day resolver matches "നാളെ" → day = tomorrow's date. Period+clock resolver matches "വൈകിട്ട് 5 മണിക്ക്" → hour = 17 (വൈകിട്ട്/evening biases 1–11 to PM), minute = 0. Composed: tomorrow's date at 17:00. Title after stripping both matched substrings: "മീറ്റിംഗ്".

Matched via regex against the input (whitespace-normalized before matching; the matched substrings are then located and stripped from the **original, non-normalized** text using a plain string search of each matched phrase, so normalization never has to be reconciled with index-based stripping):

- **Relative days**: ഇന്ന് (today), നാളെ (tomorrow), മറ്റന്നാൾ (day after tomorrow).
- **Weekday names**: ഞായർ, തിങ്കൾ, ചൊവ്വ, ബുധൻ, വ്യാഴം, വെള്ളി, ശനി — resolves to the **next occurrence including today** (i.e. if today is Wednesday and the text says "ബുധൻ", it resolves to today — same convention chrono's `forwardDate: true` uses for the English path); അടുത്ത (next) prefix forces +7 days even when today matches.
- **Clock time**: "X മണിക്ക്" (at X o'clock), where X is a digit run (Malayalam or Arabic numerals) or a spelled-out number word (ഒന്ന്–പന്ത്രണ്ട്, 1–12 — see Numerals below). Period-of-day words (രാവിലെ/morning, ഉച്ചയ്ക്ക്/noon, വൈകിട്ട്/evening, രാത്രി/night) disambiguate AM/PM when combined with an hour (രാവിലെ/ഉച്ചയ്ക്ക് → AM for 1–11, വൈകിട്ട്/രാത്രി → PM for 1–11; 12 is left as-is under any period word), or set a default hour (9 AM / 12 PM / 6 PM / 9 PM respectively) when used without an explicit hour.
- **Half-past**: "X മണി കഴിഞ്ഞ് അര" / "അര X മണിക്ക്" patterns → :30 on hour X. No quarter-past/to support in v1 (rare enough in casual reminder phrasing to defer).
- **Relative durations**: "X മണിക്കൂർ കഴിഞ്ഞ്" (in X hours), "X മിനിറ്റ് കഴിഞ്ഞ്" (in X minutes) — X as digit run or spelled-out number word, same as clock time.

**Pattern precedence** (only matters when a string could plausibly match more than one category): relative-duration patterns are checked first and, if matched, short-circuit the rest (they're semantically exclusive with day/clock resolvers per the composition rule above). Then day resolver, then clock/period/half-past resolvers are checked together since they compose rather than conflict. Within clock resolvers, half-past is checked before plain "X മണിക്ക്" so "അര" isn't left dangling as unmatched trailing text.

Ambiguous or unrecognized phrasing returns a null match — same fallback behavior as chrono's miss case.

**Numerals:** all numeric slots (clock hour, half-past hour, duration count) accept three forms: Malayalam digits (൦–൯), Arabic digits (0–9), and spelled-out Malayalam number words for 1–12 (ഒന്ന്, രണ്ട്, മൂന്ന്, നാല്, അഞ്ച്, ആറ്, ഏഴ്, എട്ട്, ഒൻപത്/ഒമ്പത്, പത്ത്, പതിനൊന്ന്, പന്ത്രണ്ട്). Number words are in scope (not deferred) because on-device speech-to-text transcribes numbers as words far more often than digits — excluding them would leave the "or speaking" half of the feature's goal largely non-functional. This is intentionally capped at 1–12 (the range clock times need); duration counts above 12 (e.g. "15 മിനിറ്റ്") are expected to arrive as digits in practice and are covered by the digit forms, not spelled-out words beyond 12.

### Speech path

No structural changes to `SpeechService.ts` — transcribed text already lands in `QuickAddInput`'s text state and flows through `parseNaturalLanguage()`, so it's covered by the routing change above automatically. Add a test feeding a Malayalam transcript-shaped string through `parseNaturalLanguage()` to confirm routing engages for speech-sourced text, covering both digit and spelled-out-number-word transcript shapes (the Numerals rule above).

### Font handling

Add `@expo-google-fonts/noto-sans-malayalam` and load it alongside the existing Inter fonts in `app/_layout.tsx`, in the same `useFonts` call that currently loads `Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold`, `Inter_700Bold` (confirmed as the app's actual four weights, all used elsewhere — e.g. `app/reminder-detail.tsx` uses both 600 and 700). Confirmed: `@expo-google-fonts/noto-sans-malayalam@0.4.2` ships matching `400Regular`/`500Medium`/`600SemiBold`/`700Bold` exports (plus other weights unused here), so no weight-substitution fallback is needed — the mapping below is 1:1.

New helper, `utils/getFontFamily.ts`, with a weight parameter matching the app's actual four weights (not a 3-value regular/medium/bold enum):

```ts
type FontWeight = "400Regular" | "500Medium" | "600SemiBold" | "700Bold";

const INTER_WEIGHTS: Record<FontWeight, string> = {
  "400Regular": "Inter_400Regular",
  "500Medium": "Inter_500Medium",
  "600SemiBold": "Inter_600SemiBold",
  "700Bold": "Inter_700Bold",
};

const NOTO_SANS_MALAYALAM_WEIGHTS: Record<FontWeight, string> = {
  "400Regular": "NotoSansMalayalam_400Regular",
  "500Medium": "NotoSansMalayalam_500Medium",
  "600SemiBold": "NotoSansMalayalam_600SemiBold",
  "700Bold": "NotoSansMalayalam_700Bold",
};

export function getFontFamily(text: string, weight: FontWeight): string {
  return (MALAYALAM_RANGE.test(text) ? NOTO_SANS_MALAYALAM_WEIGHTS : INTER_WEIGHTS)[weight];
}
```

Applied only where user-entered reminder content is rendered — `components/QuickAddInput.tsx` (the input itself and the parsed-preview text), `components/ReminderCard.tsx` (title on the list), `app/reminder-detail.tsx` (title/description), `app/add-reminder.tsx` (title/description fields). Static UI chrome (nav labels, buttons, headers) keeps its hardcoded Inter `fontFamily` — those are always English and don't need the check.

**Implementation note:** at each of these call sites, `fontFamily` currently lives inside a static `StyleSheet.create({...})` block (a fixed string, not data-dependent). Since the font must now depend on the *content* being rendered, each site needs its `fontFamily` moved out of the static style object and applied as an inline override alongside it, e.g. `[styles.title, { fontFamily: getFontFamily(title, "700Bold") }]`. This is a small but real refactor at ~5 call sites, not a drop-in prop change — call this out explicitly so it isn't missed during implementation. One acknowledged cosmetic side effect: `QuickAddInput`'s live `TextInput` will swap `fontFamily` the moment the first Malayalam character is typed, which can cause a minor cursor/line-height jump on Android; acceptable for v1, not being specifically mitigated.

## Testing

This repo splits tests between colocated `*.test.ts(x)` next to the source (e.g. `services/ReminderService.test.ts`) and a top-level `__tests__/` tree for screens and some components (e.g. the real `QuickAddInput` suite lives at `__tests__/components/QuickAddInput.test.tsx`, not colocated). New test files follow existing convention per file: colocated for new `utils/` modules (matching `services/`-style colocation), and edits to `__tests__/components/QuickAddInput.test.tsx` at its real path for the existing suite.

- New `utils/malayalamDateParser.test.ts`, with the parser's internal `now` passed in as an injectable second argument for deterministic date math (or the module structured so tests can freeze `Date` — either way, tests must not depend on the real wall-clock date). Cases: one per pattern category (today/tomorrow/day-after, each weekday including the "today matches, no അടുത്ത" case resolving to today, and the അടുത്ത/+7 case, o'clock with and without period words, half-past, relative hours/minutes), the composed multi-component example from the Malayalam pattern coverage section (day + period + hour together), all three numeral forms (Malayalam digit, Arabic digit, spelled-out word) each producing the same result, unrecognized text returning a null match cleanly, and the pattern-precedence case (a string that could match more than one category, asserting the documented precedence wins).
- New `utils/malayalamCodeMixed.test.ts` (or folded into the file above): explicit expected-value assertions for code-mixed input per the routing rule above — e.g. `"call John നാളെ 5pm"` routes to the Malayalam parser, extracts "നാളെ" as the day, leaves "5pm" untouched inside the title (not parsed as a time); `"Meeting tomorrow"` (no Malayalam characters at all) routes to chrono unchanged.
- Extend `__tests__/components/QuickAddInput.test.tsx` (existing chrono-based test suite, real path) with Malayalam-routing cases: confirms script detection dispatches to the Malayalam parser instead of chrono for Malayalam input, and a Malayalam-transcript-shaped case (spelled-out numbers, since that's the more likely real transcript shape per the Numerals rule) to cover the speech path.
- New `utils/getFontFamily.test.ts`: returns the Malayalam font for Malayalam input, Inter for English/mixed-but-Latin-dominant input, for each of the four weights (`400Regular`/`500Medium`/`600SemiBold`/`700Bold`).
- What remains manual-only: actual on-device rendering check (Malayalam glyphs display correctly, font looks visually consistent, no jarring cursor jump in `QuickAddInput` when the first Malayalam character is typed) across all five render sites, and, if the device's OS speech engine supports Malayalam, an end-to-end spoken-reminder check — both device/OS-dependent and not practical to assert in unit tests.

## Out of scope / explicitly deferred

- UI string translation / i18n framework for the app itself.
- Machine translation or any external API for parsing.
- Quarter-past/quarter-to time phrasing.
- Any other Indian language beyond Malayalam (the routing structure makes adding another script/parser pair straightforward later, but that's not built now).
- Fully general code-mixed parsing (splitting a string into per-script tokens and running both the Malayalam and English parsers against their respective tokens, then merging). v1 routes on presence-of-any-Malayalam-character only; see the Code-mixed input note above for the resulting limitation.
- Spelled-out Malayalam number words above 12 (e.g. for minute counts like "പതിനഞ്ച്" for 15) — digit forms cover this range instead.
