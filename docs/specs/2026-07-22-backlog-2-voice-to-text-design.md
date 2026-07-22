# Backlog item 2 (audio half) — voice-to-text reminders — design

## Problem

Backlog item 2 asks for "audio support." Scoped down to its voice-to-text
half: users should be able to speak a reminder instead of typing it, and
(on supported Android devices) forward a voice note from another app (e.g.
WhatsApp) and have it transcribed automatically.

## Scope

- **In scope**: a mic button on the Home screen's quick-add bar
  (`components/QuickAddInput.tsx`) for live speech-to-text; receiving a
  forwarded audio file via Android's share sheet and auto-transcribing it.
- **Not in scope**: image support (the other half of item 2 — separate
  backlog item if pursued later); storing/playing back the original audio
  as a reminder attachment (transcription is one-way — audio in, text out,
  original discarded); a mic button on the Add/Edit Reminder screen
  (`app/add-reminder.tsx`) — quick-add only, per this session's scoping;
  iOS audio-forwarding — `expo-share-intent` is already configured with
  `disableIOS: true` in `app.json`, so share-intent (any kind) is
  Android-only in this app today, and this feature doesn't change that.
- Both audio entry points (mic, forwarded file) feed into the **same**
  existing quick-add text field and go through the **same** existing
  natural-language title/date parser — no new reminder state, no
  auto-save. The user always sees and confirms the resulting text before
  saving, exactly as if they'd typed it.

## Technology decision

**On-device speech recognition** via `expo-speech-recognition` (no cloud
API, no network call, no API key). Confirmed via research:
- Package: `expo-speech-recognition@sdk-54` (npm dist-tag for Expo SDK 54
  compatibility, resolves to v3.1.3). The unqualified `latest` tag targets
  SDK 56 and raises iOS's native floor to 16.4 — **do not install
  unqualified `latest`; pin the `sdk-54` tag.**
- Live mic recognition: on-device on both platforms. Android requires API
  33+ (Android 13+) for continuous/on-device mode plus a one-time offline
  language-model download; below that there's no on-device continuous
  mode. iOS on-device requires iOS 13+ (17+ for full feature parity).
- File-based transcription (the forwarded-audio case): **iOS** — natively
  supported via `SFSpeechURLRecognitionRequest`, no extra constraint
  beyond what live mode already needs. **Android** — supported only via a
  file-streaming trick gated on **API 33+ (Android 13+)**; below that,
  there is no on-device file-transcription path at all, on-device or
  otherwise.
- Requires a config plugin entry and a custom dev client / EAS build (not
  Expo Go) — this app already builds via EAS, so this is not a new
  constraint.

**Android <13 fallback**: file transcription is unavailable. Per the
"always review before save" principle above, forwarded audio on Android
<13 still auto-fills the quick-add text field — just with the file's name
instead of a transcript — plus a one-line inline note that transcription
wasn't available on this device. This keeps behavior consistent (always
land in the text field, always reviewable) rather than a special-cased
silent failure.

## Design

### New file: `services/SpeechService.ts`

Thin wrapper around `expo-speech-recognition`, mirroring the shape of
`ReminderService.ts`'s permission functions (`requestNotificationPermissions`,
etc.) for consistency:

- `getMicPermissionStatus(): Promise<{ granted: boolean; canAskAgain: boolean }>`
  — wraps `ExpoSpeechRecognitionModule.getPermissionsAsync()`.
- `requestMicPermission(): Promise<boolean>` — wraps
  `requestPermissionsAsync()`, returns whether now granted.
- `startListening(onResult: (text: string) => void, onEnd: () => void, onError: (message: string) => void): void`
  — wraps `ExpoSpeechRecognitionModule.start({ continuous: true, interimResults: true })`
  plus `useSpeechRecognitionEvent` listeners for `"result"`/`"end"`/`"error"`.
- `stopListening(): void` — wraps `.stop()`.
- `isFileTranscriptionSupported(): boolean` — `true` on iOS; on Android,
  `true` only when `Platform.Version >= 33` (mirrors the existing
  `checkExactAlarmPermission`'s `Platform.Version` check pattern in
  `ReminderService.ts`).
- `transcribeAudioFile(uri: string): Promise<string>` — wraps
  `ExpoSpeechRecognitionModule.start({ audioSource: { uri } })` for a
  one-shot file transcription, resolving with the final result text or
  rejecting on error/no-speech-detected.

### `components/QuickAddInput.tsx`

Add a mic `Pressable` in the bar, next to the existing notes-toggle and
alarm-toggle icons (`QuickAddInput.tsx:432-448`), following the same
`testID`/`hitSlop` convention:

- New state: `const [listening, setListening] = useState(false)`.
- Tap while idle: check `getMicPermissionStatus()`.
  - If granted: `SpeechService.startListening(...)`, set `listening = true`.
  - If denied but `canAskAgain`: call `requestMicPermission()`, then
    proceed as above if now granted.
  - If denied and `!canAskAgain`: call `Linking.openSettings()` (same API
    already used by `openExactAlarmSettings` in `ReminderService.ts`).
    Re-check permission on the next `AppState` "active" transition (the
    app already has this exact pattern in `app/_layout.tsx:101-113` for
    the exact-alarm banner) and auto-start listening if now granted.
- While listening: reuse the existing pill-animation primitives
  (`pillAnim`/`pillTranslate`, `QuickAddInput.tsx:121-122`) — the mic icon
  itself pulses via a new `Animated.loop` on a dedicated
  `micPulse = useRef(new Animated.Value(1)).current`, scaling
  `1 → 1.15 → 1` on a `Animated.sequence` loop while `listening` is true,
  stopped via `micPulse.stopAnimation()` on end/tap-to-stop.
- `onResult` callback: appends/replaces `input` state (same `setInput`
  used for typing) with the interim/final transcript, so the existing
  `parseNaturalLanguage(input)` effect (`QuickAddInput.tsx:129-145`) picks
  it up identically to typed text — zero changes needed to the parsing or
  preview-pill logic.
- Tap while listening: `SpeechService.stopListening()`, `listening = false`.
- `onError` callback: `setListening(false)` and set a new
  `const [micError, setMicError] = useState<string | null>(null)` to a
  user-facing message ("Couldn't hear that — try again or type it in."),
  rendered as a small `Text` below the bar (same visual slot as the
  existing pill row), cleared on the next mic tap or text edit.

### `contexts/SharedTextContext.tsx`

Currently only detects shared **text** (`shareIntent?.text ?? shareIntent?.webUrl`,
`SharedTextContext.tsx:41-42`). Extend `NativeShareIntentCapture` to also
check `shareIntent?.files` for an audio mime type (`audio/*`):

- If an audio file is present and `SpeechService.isFileTranscriptionSupported()`
  is `true`: call `SpeechService.transcribeAudioFile(file.path)`. On
  success, call the existing `onText(transcript)` — no new context field
  needed, since `QuickAddInput` already consumes `sharedText` exactly the
  same way as typed input.
- If transcription fails, or `isFileTranscriptionSupported()` is `false`:
  call `onText(file.fileName)` instead (the Android <13 fallback above),
  so the field is still populated and reviewable rather than silently
  doing nothing.
- While transcription is in progress, `QuickAddInput` shows the same
  pulsing mic-listening visual state as the live-mic path (both funnel
  through the same `listening` boolean — `SharedTextContext` exposes it
  alongside `sharedText` so `QuickAddInput`'s `useEffect` on `sharedText`
  can toggle it).

### `app.json`

- Add `"audio/*"` to the existing `expo-share-intent` plugin's
  `androidIntentFilters` (currently `["text/*"]` only,
  `app.json:55-57`) — becomes `["text/*", "audio/*"]`.
- Add the `expo-speech-recognition` config plugin to the `plugins` array:
  ```json
  ["expo-speech-recognition", {
    "microphonePermission": "Allow Reminders to use the microphone to add reminders by voice.",
    "speechRecognitionPermission": "Allow Reminders to transcribe speech into reminder text."
  }]
  ```

### Testing

- `services/SpeechService.test.ts`: unit tests for
  `isFileTranscriptionSupported()` (mocking `Platform.OS`/`Platform.Version`,
  mirroring the existing `channelIdForAlarm`/`checkExactAlarmPermission`
  test patterns in `ReminderService.test.ts`), and for
  `getMicPermissionStatus`/`requestMicPermission` against a mocked
  `expo-speech-recognition` module (new `__mocks__/expo-speech-recognition.ts`,
  following the existing `__mocks__/expo-notifications.ts` pattern).
- `components/QuickAddInput.test.tsx` (already exists from a prior
  session): add cases for tapping the mic button while permission is
  granted (asserts `startListening` called, icon reflects listening state)
  and while denied-can't-ask-again (asserts `Linking.openSettings` called).
- No new test for `SharedTextContext`'s audio-file branch beyond what
  exists — the existing `NativeShareIntentCapture` has no current test
  coverage (native module boundary), consistent with today's baseline.
