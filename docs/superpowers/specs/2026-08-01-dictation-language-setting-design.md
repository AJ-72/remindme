# Dictation language setting

## Problem

Voice dictation (`SpeechService.startListening`, used by `components/QuickAddInput.tsx`) always recognizes speech in whatever locale the phone's OS is set to (`getDeviceSpeechLocale()` reads `getLocales()[0].languageTag`). A user whose phone's system language is English has no way to dictate a reminder in Malayalam (or any other regional language) without changing their entire phone's system language — not something most people are willing to do just to add a reminder. Separately, `SpeechService.transcribeAudioFile` (used to transcribe shared audio, e.g. WhatsApp voice notes, via `SharedTextContext.tsx`) doesn't pass a locale to the recognizer at all today.

## Goals

- Let the user pick a dictation language independent of the phone's system language, from Settings.
- v1 language list: English and Malayalam only.
- The chosen language applies to both live mic dictation (`QuickAddInput`) and shared-audio-file transcription (`SharedTextContext`).
- Before the user ever picks a language, default sensibly: Malayalam if the device's system locale is Malayalam, English otherwise.
- Setting persists across app restarts (AsyncStorage, matching the existing settings pattern).

## Non-goals

- No language list beyond English/Malayalam in v1 — the mechanism is generic (stores a locale tag string) so adding more languages later is a small follow-up, not a redesign.
- No automatic language detection/switching mid-recording — one active language at a time, chosen explicitly.
- No changes to `parseNaturalLanguage()` / the Malayalam date-time parser (see `2026-07-26-malayalam-reminders-design.md`) — this feature only affects which language the speech recognizer listens for, not how the resulting transcript is interpreted.
- No per-recording language override UI (e.g. a toggle next to the mic button) — one setting, used everywhere dictation happens.

## Technical design

### Storage & default resolution

`services/ReminderService.ts` gains a new persisted setting, following the exact pattern of `getDefaultAlarmEnabled`/`setDefaultAlarmEnabled`:

```ts
const DICTATION_LANGUAGE_KEY = "dictationLanguage";
type DictationLanguage = "en-US" | "ml-IN";

export async function getDictationLanguage(): Promise<DictationLanguage> {
  const raw = await AsyncStorage.getItem(DICTATION_LANGUAGE_KEY);
  if (raw === "en-US" || raw === "ml-IN") return raw;
  // no explicit preference saved yet — derive a default from device locale
  const deviceLocale = getLocales()[0]?.languageTag ?? "en-US";
  return deviceLocale.startsWith("ml") ? "ml-IN" : "en-US";
}

export async function setDictationLanguage(lang: DictationLanguage): Promise<void> {
  await AsyncStorage.setItem(DICTATION_LANGUAGE_KEY, lang);
}
```

The device-locale-based default is computed on read, not written on first load — so it stays correct if the user changes their phone's system locale before ever opening Settings, and there's no migration/seeding step needed.

### Context

`contexts/RemindersContext.tsx`: add `dictationLanguage: DictationLanguage` and `setDictationLanguage: (lang: DictationLanguage) => Promise<void>` to `RemindersContextType`, following the `defaultAlarmEnabled` pattern exactly — loaded in the existing init `Promise.all(...)` alongside `getDefaultAlarmEnabled()`/`getShowDescriptionEnabled()`, with a corresponding `setDictationLanguageState` local state setter.

### Speech recognition call sites

- **`components/QuickAddInput.tsx`**: replace the `getDeviceSpeechLocale()` call (currently line 92-94, 306) with `dictationLanguage` read from `useReminders()`. Delete `getDeviceSpeechLocale()` — it becomes dead code once nothing calls it.
- **`services/SpeechService.ts`**: `transcribeAudioFile(uri, fileName, locale)` gains a required third parameter, `locale: string`, passed into the `ExpoSpeechRecognitionModule.start({...})` call in the file-transcription path (currently missing a `lang` field entirely at lines 161-164) as `lang: locale`.
- **`contexts/SharedTextContext.tsx`**: read `dictationLanguage` via `useReminders()` (valid — `SharedTextProvider` is nested inside `RemindersProvider` in `app/_layout.tsx`) and pass it as the new third argument at the existing `transcribeAudioFile(audioFile.path, audioFile.fileName)` call site (line 124).

`ensureOfflineModelReady(locale)` (`SpeechService.ts`) needs no change — it already accepts whatever locale string it's given and triggers the Android offline-model download for it, so switching the setting to Malayalam naturally triggers that download path the next time `QuickAddInput` records.

### Settings UI

`app/(tabs)/settings.tsx` gains a new card, styled like the existing `alarmCard`/`descriptionCard` rows, containing a two-option segmented control (two `Pressable` pills side by side, not a `Switch` — this isn't a boolean): "English" and "മലയാളം". The selected pill is highlighted with `colors.primary`, matching the existing selected/active visual language used elsewhere (e.g. the alarm icon's `colors.primary` vs `colors.mutedForeground` state). Tapping a pill calls `setDictationLanguage("en-US")` / `setDictationLanguage("ml-IN")`.

## Testing

Following this repo's convention (colocated `*.test.ts` for services, `__tests__/` tree for screens/components):

- `services/ReminderService.test.ts`: extend with cases for `getDictationLanguage`/`setDictationLanguage` — returns a saved preference when one exists, derives Malayalam default from a Malayalam device locale when none is saved, derives English default from a non-Malayalam device locale when none is saved.
- `services/SpeechService.test.ts`: extend `transcribeAudioFile` tests to assert the given `locale` is passed as `lang` to `ExpoSpeechRecognitionModule.start`.
- `__tests__/components/QuickAddInput.test.tsx`: assert that recording uses `dictationLanguage` from context (not device locale) — e.g. set context to `"ml-IN"` while mocking device locale as English, confirm `startListening`/`ensureOfflineModelReady` receive `"ml-IN"`.
- `__tests__/contexts/SharedTextContext.test.tsx`: assert `transcribeAudioFile` is called with the context's `dictationLanguage`.
- New settings screen coverage (or extend an existing `settings.tsx` test if one exists): tapping each pill calls `setDictationLanguage` with the right value and updates the highlighted state.
- What remains manual-only: actual on-device speech recognition in Malayalam (OS/model-dependent, not practical to assert in unit tests), and confirming the Android offline-model download prompt appears the first time Malayalam is selected.

## Out of scope / explicitly deferred

- Languages beyond English and Malayalam.
- Per-recording language override (toggle near the mic button instead of a single Settings-level choice).
- Automatic language detection.
- Any change to how transcribed/typed text is parsed for dates — that's the existing Malayalam date-time parser, untouched here.
