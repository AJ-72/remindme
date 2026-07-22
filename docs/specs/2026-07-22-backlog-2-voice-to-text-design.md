# Backlog item 2 (audio half) — voice-to-text reminders — design

## Problem

Backlog item 2 asks for "audio support." Scoped down to its voice-to-text
half: users should be able to speak a reminder instead of typing it, and
(on supported Android devices) forward a voice note from another app (e.g.
WhatsApp) and have it transcribed automatically.

## Scope

- **In scope**: a mic button on the Home screen's quick-add bar
  (`components/QuickAddInput.tsx`) for live speech-to-text; receiving a
  forwarded audio file via Android's share sheet and attempting to
  auto-transcribe it (see the WhatsApp-codec risk below — this may
  degrade to a filename fallback for real WhatsApp audio until verified
  otherwise).
- **Not in scope**: image support (the other half of item 2 — separate
  backlog item if pursued later); storing/playing back the original audio
  as a reminder attachment (transcription is one-way — audio in, text out,
  original discarded); a mic button on the Add/Edit Reminder screen
  (`app/add-reminder.tsx`) — quick-add only, per this session's scoping;
  iOS audio-forwarding — `expo-share-intent` is already configured with
  `disableIOS: true` in `app.json`, so share-intent (any kind) is
  Android-only in this app today, and this feature doesn't change that;
  an audio transcode/re-encode pipeline (e.g. ffmpeg-kit) — explicitly
  deferred pending the spike below, not silently assumed away.
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
  unqualified `latest`; pin the `sdk-54` tag.** Not yet installed in this
  repo — subject to the `minimumReleaseAge: 1440` supply-chain gate in
  `pnpm-workspace.yaml` when added.
- Live mic recognition: on-device on both platforms. Android requires API
  33+ (Android 13+) for continuous/on-device mode plus a one-time offline
  language-model download (see "Android offline model" below); below that
  there's no on-device continuous mode. iOS on-device requires iOS 13+
  (17+ for full feature parity).
- File-based transcription (the forwarded-audio case): **iOS** — natively
  supported via `SFSpeechURLRecognitionRequest`, no extra constraint
  beyond what live mode already needs. **Android** — supported only via a
  file-streaming trick gated on **API 33+ (Android 13+)**; below that,
  there is no on-device file-transcription path at all, on-device or
  otherwise.
- Requires a config plugin entry and a custom dev client / EAS build (not
  Expo Go) — this app already builds via EAS, so this is not a new
  constraint.
- **Documented supported audio formats (Android file-transcription path):
  16kHz 16-bit PCM WAV, 16kHz MP3 (mono/stereo), 16kHz OGG **Vorbis**.**
  This does **not** include Opus.

### WhatsApp-codec risk (read before implementing the forwarded-audio path)

WhatsApp voice notes are encoded as **Opus**, not Vorbis — a different
codec in the same Ogg-family container. The package's Android
file-transcription path does not list Opus as a verified-supported
format. This means: **a real WhatsApp voice note forwarded on a fully
up-to-date Android 13/14 device may fail to decode and fall through to
the filename fallback below, even though the OS-version gate says it
should be supported.** This is a materially different (and larger) risk
than "only old Android devices don't get transcription" — it may affect
the primary target case.

**Decision: proceed with the design as specified, but the first task in
the implementation plan must be a real-device spike** — install a dev
client on an Android 13+ phone, forward an actual WhatsApp voice note via
the share sheet, and confirm whether `transcribeAudioFile` succeeds or
falls through to the filename fallback. This determines whether the
forwarded-audio feature ships as designed or needs to be explicitly
re-scoped (e.g. filename-only, or a follow-up transcode step) — that
decision is deferred to after the spike, not made here.

### Android <13 / unsupported-format fallback

When file transcription isn't available (`isFileTranscriptionSupported()`
returns `false` — see below) **or** `transcribeAudioFile` fails (e.g. an
undecodable format like Opus): auto-fill the quick-add text field with the
file's name instead of a transcript, plus a one-line inline note. Per the
"always review before save" principle above, this keeps behavior
consistent — always land in the text field, always reviewable — rather
than a special-cased silent failure.

**Fallback copy must not claim a specific cause.** Since both "Android
<13" and "file format not supported" land in the same fallback, and the
implementation can't always distinguish them cleanly, the inline note
reads: **"Couldn't transcribe this audio — added the file name instead."**
Do not say "not available on this device" (that's only true for the
OS-version case, and would be misleading for a 13+ device hitting a codec
failure).

### Android offline model

On-device recognition (`requiresOnDeviceRecognition: true`, required by
the "no cloud" decision) needs a per-locale language model downloaded to
the device first. This is not automatic — the app must explicitly trigger
it via `ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale })`.
The call resolves with a status: `"opened_dialog"` (Android 13 — shows a
system dialog), `"download_success"` (Android 14+ — downloaded
immediately), or `"download_scheduled"` (queued — **not usable yet**, e.g.
waiting for WiFi).

**Design implication**: the first mic tap on a fresh install must trigger
this check/download before (or instead of) calling `start()`. If the
model isn't ready yet, the mic button shows a distinct **"Preparing voice
recognition — try again in a moment"** state — separate from the
transcription-failure message, so a not-ready-yet model doesn't look like
a broken microphone.

## Design

### New file: `services/SpeechService.ts`

Thin wrapper around `expo-speech-recognition`, mirroring the shape of
`ReminderService.ts`'s permission functions (`requestNotificationPermissions`,
etc.) for consistency. **Uses the module's plain event-emitter API
(`ExpoSpeechRecognitionModule.addListener`), not the `useSpeechRecognitionEvent`
hook** — the hook can only run during component render, and this service
is invoked imperatively from event handlers, so the hook-based API is not
usable here.

The module is a native singleton with one global recognition session and
one global event stream — a second `start()` call while one is already
running either throws or cross-wires results between callers. The service
tracks this explicitly:

- Module-level state: `let activeMode: "live" | "file" | null = null;` and
  `let activeSubscriptions: { remove: () => void }[] = [];`.
- `getMicPermissionStatus(): Promise<{ granted: boolean; canAskAgain: boolean }>`
  — wraps `ExpoSpeechRecognitionModule.getPermissionsAsync()`.
- `requestMicPermission(): Promise<boolean>` — wraps
  `requestPermissionsAsync()`, returns whether now granted.
- `ensureOfflineModelReady(locale: string): Promise<"ready" | "preparing">`
  — wraps `androidTriggerOfflineModelDownload({ locale })`; on Android,
  maps `"download_success"` → `"ready"`, `"opened_dialog"`/`"download_scheduled"`
  → `"preparing"`. On iOS (no offline-model concept), always resolves
  `"ready"`.
- `startListening(baseline: string, onResult: (fullText: string) => void, onEnd: () => void, onError: (message: string) => void): { busy: boolean }`
  — if `activeMode !== null`, returns `{ busy: true }` immediately and
  calls neither `start()` nor any callback (caller surfaces the "still
  transcribing…" message — see below). Otherwise sets `activeMode = "live"`,
  calls `ExpoSpeechRecognitionModule.start({ continuous: true, interimResults: true, requiresOnDeviceRecognition: true })`,
  and registers `addListener("result", ...)` / `addListener("end", ...)` /
  `addListener("error", ...)` subscriptions (stored in
  `activeSubscriptions`). Each `"result"` event's cumulative transcript is
  combined as `baseline + " " + transcript` (trimmed) and passed to
  `onResult`. `"end"`/`"error"` both call `stopListening()` internally
  (clearing `activeMode` and removing subscriptions) before invoking the
  caller's `onEnd`/`onError`. Returns `{ busy: false }`.
- `stopListening(): void` — calls `.stop()`, removes all
  `activeSubscriptions`, clears them, and sets `activeMode = null`.
  Safe to call even if not currently listening (no-op).
- `isFileTranscriptionSupported(): boolean` — `true` on iOS; on Android,
  `true` only when `Platform.Version >= 33` (mirrors the existing
  `checkExactAlarmPermission`'s `Platform.Version` check pattern in
  `ReminderService.ts`). Note: this reflects OS-version eligibility only,
  not format/codec support — see the WhatsApp-codec risk above; a `true`
  result does not guarantee a given file will actually transcribe.
- `transcribeAudioFile(uri: string): Promise<{ busy: boolean } | { text: string } | { failed: true }>`
  — if `activeMode !== null`, resolves `{ busy: true }` immediately
  without starting anything. Otherwise sets `activeMode = "file"`, copies
  the input `uri` to the app's cache directory first via
  `expo-file-system`'s `copyAsync` (see "Content-URI handling" below),
  then calls `ExpoSpeechRecognitionModule.start({ audioSource: { uri: cachedUri }, requiresOnDeviceRecognition: true })`.
  Registers the same `addListener` subscriptions as `startListening`, but
  resolves the returned Promise on the first terminal event instead of
  invoking ongoing callbacks: `"result"` with a final (non-interim) flag →
  resolves `{ text: transcript }`; `"error"` → resolves `{ failed: true }`
  (this function never rejects — every path is a resolved variant, so
  callers don't need try/catch). Always calls `stopListening()`-equivalent
  cleanup (clear `activeMode`, remove subscriptions) before resolving,
  on every path.

#### Content-URI handling

`expo-speech-recognition` documents only `file://` URI support for
`audioSource.uri`. Files arriving via `expo-share-intent` on Android may
be exposed as `content://` URIs (the underlying `AndroidShareIntentFile`
type has both `contentUri` and `filePath`; the hook's normalized
`ShareIntentFile.path` may resolve to either depending on the sending
app). `transcribeAudioFile` does not assume the input `uri` is directly
usable — it always copies the source into the app's own cache directory
first via `expo-file-system`'s `copyAsync({ from: uri, to: <cacheDirectory> + fileName })`
and passes the resulting guaranteed-`file://` cache URI to the native
module. `expo-file-system` is a new dependency this feature introduces
(not previously used in this app) — add it alongside `expo-speech-recognition`.

### `components/QuickAddInput.tsx`

Add a mic `Pressable` in the bar, next to the existing notes-toggle and
alarm-toggle icons (`QuickAddInput.tsx:432-448`), following the same
`testID`/`hitSlop` convention:

- New state: `const [listening, setListening] = useState(false)`,
  `const [micNotice, setMicNotice] = useState<string | null>(null)` (used
  for all non-error informational states: preparing-model, busy, and
  transcription-failure messages — see below).
- Tap while idle:
  1. Check `getMicPermissionStatus()`.
     - If denied and `!canAskAgain`: call `Linking.openSettings()` (same
       API already used by `openExactAlarmSettings` in
       `ReminderService.ts`). On return, **do not auto-start listening** —
       instead just leave the mic button in its normal idle state so the
       user can tap it again once permission is granted. (An
       auto-triggered mic activation on app-foreground would be a
       privacy-surprising side effect and is explicitly rejected — this
       differs from the passive `AppState`-driven banner-clearing pattern
       used for the exact-alarm permission, which never activates
       anything by itself.)
     - If denied but `canAskAgain`: call `requestMicPermission()`; if now
       granted, continue to step 2; if still denied, do nothing further
       (the OS dialog was the appropriate prompt).
     - If granted: continue to step 2.
  2. Call `SpeechService.ensureOfflineModelReady(deviceLocale)` (device
     locale from `Intl` or a fixed `"en-US"` default — no locale-picker
     UI in this pass). If `"preparing"`, set
     `micNotice = "Preparing voice recognition — try again in a moment"`
     and stop here (do not call `startListening`).
  3. Call `SpeechService.startListening(input, onResult, onEnd, onError)`
     (passing the current `input` state as the append baseline — see
     "Append vs. replace" below). If the return value is `{ busy: true }`,
     set `micNotice = "Still transcribing the shared audio…"` and stop
     (a share-intent file transcription is in progress — see
     `SharedTextContext` below). Otherwise set `listening = true` and
     `micNotice = null`.
- While listening: reuse the existing pill-animation primitives
  (`pillAnim`/`pillTranslate`, `QuickAddInput.tsx:121-122`) as the model
  for a new, separate animation — the mic icon pulses via a dedicated
  `micPulse = useRef(new Animated.Value(1)).current`, scaling
  `1 → 1.15 → 1` on an `Animated.loop(Animated.sequence(...))` while
  `listening` is true, stopped via `micPulse.stopAnimation()` on
  end/tap-to-stop.
- **Append vs. replace**: each `onResult(fullText)` call sets
  `setInput(fullText)` directly — `SpeechService.startListening` already
  combined the captured baseline with the cumulative transcript
  internally (see above), so `QuickAddInput` doesn't re-derive this
  itself. This means whatever was typed before the mic tap is preserved
  and the spoken words are appended after it, satisfying the
  append-not-replace decision. The existing `parseNaturalLanguage(input)`
  effect (`QuickAddInput.tsx:129-145`) picks up each update identically
  to typed text — zero changes needed to the parsing or preview-pill
  logic. (Interim results do re-trigger this effect on every partial
  utterance, which re-runs chrono parsing and restarts the pill-spring
  animation each time — accepted as a minor cosmetic cost for this pass,
  not deferred to a debounce; revisit if it's noticeably janky in
  practice.)
- Tap while listening: `SpeechService.stopListening()`, `listening = false`.
- `onError` callback: `setListening(false)` and
  `setMicNotice("Couldn't hear that — try again or type it in.")`.
- `micNotice` renders as a small `Text` below the bar (same visual slot
  as the existing pill row), cleared on the next mic tap or text edit.

### `contexts/SharedTextContext.tsx`

Currently only detects shared **text**, and its local `ShareIntent` type
(`SharedTextContext.tsx:22-25`) only declares `{ text?, webUrl? }` — this
type must be extended to include `files: ShareIntentFile[] | null` and
`type` (matching the real `expo-share-intent` hook's normalized shape) or
the new code below won't typecheck.

Extend `NativeShareIntentCapture` to also check `shareIntent?.files` for
an audio mime type (`audio/*`):

- If an audio file is present:
  1. If `SpeechService.isFileTranscriptionSupported()` is `false`: call
     `onText(file.fileName)` immediately (skip transcription entirely —
     known-unsupported OS version).
  2. Otherwise call `SpeechService.transcribeAudioFile(file.path)`.
     - `{ busy: true }` (mic was already active): call
       `onText(file.fileName)` as the safe fallback for this pass — do
       not queue the file for later (queuing is a possible future
       enhancement, not required now). The `QuickAddInput` mic-tap path
       independently surfaces its own "still transcribing" notice for the
       symmetric case (mic tapped while a file transcription is already
       running) — the two "busy" directions are handled independently
       and neither queues the other.
     - `{ text }`: call `onText(text)`.
     - `{ failed: true }`: call `onText(file.fileName)` — the "Couldn't
       transcribe this audio" fallback.
  3. Only call `resetShareIntent()` **after** the above resolves (all
     paths through `SpeechService.transcribeAudioFile` are async) — do
     not call it synchronously as the current text-only path does
     (`SharedTextContext.tsx:44-49`), since `expo-share-intent`'s default
     `resetOnBackground: true` could otherwise clear the pending share
     intent out from under an in-flight transcription if the app
     backgrounds mid-call. No config change needed for this — just
     correct sequencing in `NativeShareIntentCapture`.
- `QuickAddInput` shows the same pulsing mic-listening visual state while
  a share-intent transcription is in flight as it does for the live-mic
  path: `SharedTextContext` exposes a `sharedAudioTranscribing: boolean`
  alongside `sharedText`, and `QuickAddInput`'s existing `useEffect` on
  `sharedText` (`QuickAddInput.tsx:122-127`) also watches this flag to
  toggle its own `listening` state for the animation, without owning the
  transcription logic itself.

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
  test patterns in `ReminderService.test.ts`), for
  `getMicPermissionStatus`/`requestMicPermission` against a mocked
  `expo-speech-recognition` module (new `__mocks__/expo-speech-recognition.ts`,
  following the existing `__mocks__/expo-notifications.ts` pattern), and
  specifically for the concurrency guard: a test asserting a second
  `startListening`/`transcribeAudioFile` call while one is already active
  returns `{ busy: true }` without invoking `ExpoSpeechRecognitionModule.start`
  again, and a test asserting `transcribeAudioFile` resolves (never
  rejects) on a mocked `"error"` event with `{ failed: true }`.
- `components/QuickAddInput.test.tsx` (already exists from a prior
  session): add cases for tapping the mic button while permission is
  granted (asserts `startListening` called, icon reflects listening
  state), while denied-can't-ask-again (asserts `Linking.openSettings`
  called, and that returning to the app does NOT auto-start listening),
  and while a share-intent transcription is already in flight (asserts
  the "still transcribing" notice appears and `startListening` is not
  called a second time).
- No new test for `SharedTextContext`'s audio-file branch beyond what
  exists — the existing `NativeShareIntentCapture` has no current test
  coverage (native module boundary), consistent with today's baseline.

## Open item carried into the implementation plan

The WhatsApp-codec risk (see above) means the **first task** in the
implementation plan must be a real-device spike: build a dev client,
forward an actual WhatsApp voice note on an Android 13+ device, and
confirm whether `transcribeAudioFile` succeeds. If it fails
(Opus-not-supported), the plan's remaining tasks proceed unchanged — the
design already treats failure as a first-class path (the filename
fallback) — but the feature's expected day-to-day behavior for
WhatsApp-forwarded audio specifically should be called out to the user as
"copies the filename, doesn't transcribe" rather than presented as full
transcription support, pending a possible future transcode step.
