# Dictation Language Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick English or Malayalam as the voice-dictation language from Settings, independent of the phone's system locale, and use that choice for both live mic dictation and shared-audio-file transcription.

**Architecture:** A new persisted setting (`dictationLanguage: "en-US" | "ml-IN"`) added to `services/ReminderService.ts` and exposed through `RemindersContext`, following the exact pattern already used for `defaultAlarmEnabled`/`showDescriptionInNotifications`. It replaces the current device-locale passthrough in `QuickAddInput.tsx` and gets threaded into `SpeechService.transcribeAudioFile` via `SharedTextContext.tsx`. A two-pill selector is added to the Settings screen.

**Tech Stack:** React Native / Expo, `@react-native-async-storage/async-storage`, `expo-localization`, `expo-speech-recognition`, Jest + `@testing-library/react-native`.

## Global Constraints

- Language list is fixed at exactly two values for v1: `"en-US"` (English) and `"ml-IN"` (Malayalam) — spec explicitly excludes other languages.
- AsyncStorage keys in this codebase follow the `@name_v1` convention (see `DEFAULT_ALARM_KEY = "@default_alarm_v1"`) — the new key must match.
- Default resolution (no stored preference yet) is: Malayalam if the device's system locale (`getLocales()[0].languageTag` from `expo-localization`) starts with `"ml"`, else English. Computed on read, never written on first load.
- The setting applies to **both** live mic dictation (`QuickAddInput.tsx`) and shared-audio-file transcription (`SharedTextContext.tsx` → `SpeechService.transcribeAudioFile`).
- No per-recording override UI, no auto-detection — one Settings-level choice used everywhere.
- Run `pnpm --filter @workspace/mobile run test` (or the project's configured test command from that directory) after each task; run `pnpm run typecheck` before the final commit of the plan.

---

### Task 1: Persisted dictation-language setting in ReminderService

**Files:**
- Modify: `artifacts/mobile/services/ReminderService.ts`
- Test: `artifacts/mobile/services/ReminderService.test.ts`

**Interfaces:**
- Produces: `export type DictationLanguage = "en-US" | "ml-IN";`, `export const DICTATION_LANGUAGE_KEY = "@dictation_language_v1";`, `export async function getDictationLanguage(): Promise<DictationLanguage>`, `export async function setDictationLanguage(lang: DictationLanguage): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Add to `artifacts/mobile/services/ReminderService.test.ts`. First add the new names to the existing import block (alphabetical, matching the file's existing import style):

```ts
  DICTATION_LANGUAGE_KEY,
  // ...
  getDictationLanguage,
  // ...
  setDictationLanguage,
```

Then add near the top of the file, alongside the other test-scoped mocks (the file already imports `AsyncStorage` and `Platform`):

```ts
import { getLocales } from "expo-localization";
```

And a new `describe` block, placed after the existing `describe("default alarm setting", ...)` block:

```ts
describe("dictation language setting", () => {
  beforeEach(() => {
    (getLocales as jest.Mock).mockReturnValue([
      { languageTag: "en-US", languageCode: "en", regionCode: "US" },
    ]);
  });

  it("defaults to en-US when unset and the device locale is not Malayalam", async () => {
    const result = await getDictationLanguage();
    expect(result).toBe("en-US");
  });

  it("defaults to ml-IN when unset and the device locale is Malayalam", async () => {
    (getLocales as jest.Mock).mockReturnValue([
      { languageTag: "ml-IN", languageCode: "ml", regionCode: "IN" },
    ]);
    const result = await getDictationLanguage();
    expect(result).toBe("ml-IN");
  });

  it("setDictationLanguage persists ml-IN, and getDictationLanguage reflects it regardless of device locale", async () => {
    await setDictationLanguage("ml-IN");
    const result = await getDictationLanguage();
    expect(result).toBe("ml-IN");
  });

  it("setDictationLanguage persists en-US after being set to ml-IN", async () => {
    await setDictationLanguage("ml-IN");
    await setDictationLanguage("en-US");
    const result = await getDictationLanguage();
    expect(result).toBe("en-US");
  });

  it("setDictationLanguage writes under DICTATION_LANGUAGE_KEY", async () => {
    await setDictationLanguage("ml-IN");
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(DICTATION_LANGUAGE_KEY, "ml-IN");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd artifacts/mobile && npx jest services/ReminderService.test.ts -t "dictation language setting"`
Expected: FAIL — `getDictationLanguage`/`setDictationLanguage`/`DICTATION_LANGUAGE_KEY` are not exported yet.

- [ ] **Step 3: Implement in ReminderService.ts**

Add the import near the top of `artifacts/mobile/services/ReminderService.ts` (after the existing `react-native` import):

```ts
import { getLocales } from "expo-localization";
```

Add the key constant next to the other `*_KEY` constants (after `export const SHOW_DESCRIPTION_KEY = "@show_description_v1";`):

```ts
export const DICTATION_LANGUAGE_KEY = "@dictation_language_v1";
```

Add the type next to the other exported types (after `NotificationData`):

```ts
export type DictationLanguage = "en-US" | "ml-IN";
```

Add the functions after `setShowDescriptionEnabled`:

```ts
export async function getDictationLanguage(): Promise<DictationLanguage> {
  try {
    const raw = await AsyncStorage.getItem(DICTATION_LANGUAGE_KEY);
    if (raw === "en-US" || raw === "ml-IN") return raw;
  } catch {}
  const deviceLocale = getLocales()[0]?.languageTag ?? "en-US";
  return deviceLocale.startsWith("ml") ? "ml-IN" : "en-US";
}

export async function setDictationLanguage(lang: DictationLanguage): Promise<void> {
  await AsyncStorage.setItem(DICTATION_LANGUAGE_KEY, lang);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd artifacts/mobile && npx jest services/ReminderService.test.ts`
Expected: PASS (all tests in the file, not just the new block — confirms no regression to the existing settings tests).

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/services/ReminderService.ts artifacts/mobile/services/ReminderService.test.ts
git commit -m "feat(mobile): add persisted dictation language setting"
```

---

### Task 2: Expose dictationLanguage through RemindersContext

**Files:**
- Modify: `artifacts/mobile/contexts/RemindersContext.tsx`

**Interfaces:**
- Consumes: `getDictationLanguage(): Promise<DictationLanguage>`, `setDictationLanguage(lang: DictationLanguage): Promise<void>`, `type DictationLanguage` from Task 1.
- Produces: `useReminders().dictationLanguage: DictationLanguage`, `useReminders().setDictationLanguage: (lang: DictationLanguage) => Promise<void>`.

This context has no dedicated test file of its own (it's exercised indirectly through `settings.test.tsx`, `QuickAddInput.test.tsx`, etc. in later tasks) — this task is implementation-only, verified by the consuming tasks that follow.

- [ ] **Step 1: Update imports**

In `artifacts/mobile/contexts/RemindersContext.tsx`, extend the existing `@/services/ReminderService` import block:

```ts
import {
  type Reminder,
  type NotificationData,
  type DictationLanguage,
  addReminder as serviceAdd,
  deleteReminder as serviceDelete,
  editReminder as serviceEdit,
  getDefaultAlarmEnabled,
  getDictationLanguage,
  getShowDescriptionEnabled,
  initNotifications,
  loadReminders,
  setDefaultAlarmEnabled as serviceSetDefaultAlarmEnabled,
  setDictationLanguage as serviceSetDictationLanguage,
  setShowDescriptionEnabled as serviceSetShowDescriptionEnabled,
  snoozeReminder as serviceSnooze,
  toggleComplete as serviceToggle,
} from "@/services/ReminderService";

export type { Reminder, NotificationData, DictationLanguage };
```

(The `export type { ... }` line replaces the existing `export type { Reminder, NotificationData };` line — add `DictationLanguage` to it rather than duplicating the statement.)

- [ ] **Step 2: Extend the context type and state**

Add to `RemindersContextType`:

```ts
  dictationLanguage: DictationLanguage;
  setDictationLanguage: (lang: DictationLanguage) => Promise<void>;
```

Add state, alongside the existing `defaultAlarmEnabled`/`showDescriptionInNotifications` state declarations:

```ts
  const [dictationLanguage, setDictationLanguageState] = useState<DictationLanguage>("en-US");
```

- [ ] **Step 3: Load it in the init effect**

Update the init `useEffect`'s `Promise.all` call to include the new getter, and destructure/set its result:

```ts
  useEffect(() => {
    Promise.all([
      loadReminders(),
      getDefaultAlarmEnabled(),
      getShowDescriptionEnabled(),
      getDictationLanguage(),
    ])
      .then(([loadedReminders, defaultAlarm, showDescription, dictLang]) => {
        setReminders(loadedReminders);
        setDefaultAlarmEnabledState(defaultAlarm);
        setShowDescriptionInNotificationsState(showDescription);
        setDictationLanguageState(dictLang);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
```

- [ ] **Step 4: Add the setter callback**

Add alongside `setShowDescriptionInNotifications`:

```ts
  const setDictationLanguage = useCallback(async (lang: DictationLanguage) => {
    await serviceSetDictationLanguage(lang);
    setDictationLanguageState(lang);
  }, []);
```

- [ ] **Step 5: Add both to the provider value**

In the `<RemindersContext.Provider value={{...}}>` object, add:

```ts
        dictationLanguage,
        setDictationLanguage,
```

- [ ] **Step 6: Typecheck**

Run: `cd artifacts/mobile && pnpm run typecheck`
Expected: PASS — no consumers reference the new fields yet, so this only validates the context file itself compiles.

- [ ] **Step 7: Commit**

```bash
git add artifacts/mobile/contexts/RemindersContext.tsx
git commit -m "feat(mobile): expose dictationLanguage through RemindersContext"
```

---

### Task 3: Use dictationLanguage for live mic dictation in QuickAddInput

**Files:**
- Modify: `artifacts/mobile/components/QuickAddInput.tsx`
- Modify: `artifacts/mobile/__tests__/components/QuickAddInput.test.tsx`

**Interfaces:**
- Consumes: `useReminders().dictationLanguage: DictationLanguage` from Task 2.

**Planning finding — provider order bug this task must fix:** `__tests__/components/QuickAddInput.test.tsx`'s `renderComponent()` (and two `rerender(...)` calls later in the same file) currently nest `<SharedTextProvider><RemindersProvider><QuickAddInput /></RemindersProvider></SharedTextProvider>` — `SharedTextProvider` **outside** `RemindersProvider`. The real app (`app/_layout.tsx`) nests them the other way (`RemindersProvider` outside `SharedTextProvider`). This doesn't matter today because `SharedTextContext.tsx` doesn't call `useReminders()` — but Task 5 of this plan makes it do exactly that, which would make `SharedTextProvider` throw ("useReminders must be used within RemindersProvider") in every test in this file once Task 5 lands, since it renders outside `RemindersProvider` here. Fix the order now, while touching this file, so Task 5 doesn't have to.

- [ ] **Step 1: Write the failing test**

In `artifacts/mobile/__tests__/components/QuickAddInput.test.tsx`, add a new test in the mic-related `describe` block that already contains "starts listening when permission is already granted..." (the one whose `beforeEach` sets up granted permissions and `download_success`):

```ts
  it("uses the dictationLanguage setting, not the device locale, when starting to listen", async () => {
    // AsyncStorage is already imported at the top of this file (used by the
    // existing beforeEach's `await (AsyncStorage as any).clear()`).
    await AsyncStorage.setItem("@dictation_language_v1", "ml-IN");

    const { findByTestId } = renderComponent();
    const micButton = await findByTestId("quick-add-mic");
    fireEvent.press(micButton);

    await waitFor(() => {
      expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
        expect.objectContaining({ lang: "ml-IN" })
      );
    });
  });
```

Note: this test relies on `expo-localization`'s mocked `getLocales()` staying `en-US` (the mock's default, per `__mocks__/expo-localization.ts`) — i.e. it proves the recognizer follows the stored setting even though the device locale is English, which is the actual behavior change.

Also fix the three provider-order occurrences in this file (`renderComponent()` and both `rerender(...)` calls) — swap the two providers so `RemindersProvider` is outermost:

```tsx
function renderComponent() {
  return render(
    <RemindersProvider>
      <SharedTextProvider>
        <QuickAddInput />
      </SharedTextProvider>
    </RemindersProvider>
  );
}
```

(and the same swap at the two `rerender(...)` call sites later in the file, which currently mirror the same nested JSX.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd artifacts/mobile && npx jest __tests__/components/QuickAddInput.test.tsx -t "uses the dictationLanguage setting"`
Expected: FAIL — the recognizer is still called with `lang: "en-US"` (from device locale), not `"ml-IN"`.

- [ ] **Step 3: Implement in QuickAddInput.tsx**

Remove the now-unused `getLocales` import (line 16: `import { getLocales } from "expo-localization";`) and the `getDeviceSpeechLocale` function (lines 92-94):

```ts
function getDeviceSpeechLocale(): string {
  return getLocales()[0]?.languageTag ?? "en-US";
}
```

Add `dictationLanguage` to the existing `useReminders()` destructure (currently `const { addReminder, defaultAlarmEnabled } = useReminders();`):

```ts
  const { addReminder, defaultAlarmEnabled, dictationLanguage } = useReminders();
```

Replace the locale line inside the mic-press handler:

```ts
    const locale = getDeviceSpeechLocale();
```

with:

```ts
    const locale = dictationLanguage;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd artifacts/mobile && npx jest __tests__/components/QuickAddInput.test.tsx`
Expected: PASS — including the pre-existing tests in this file (confirms the provider-order swap didn't break anything).

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/components/QuickAddInput.tsx artifacts/mobile/__tests__/components/QuickAddInput.test.tsx
git commit -m "feat(mobile): use dictationLanguage setting for live mic dictation"
```

---

### Task 4: Thread locale into SpeechService.transcribeAudioFile

**Files:**
- Modify: `artifacts/mobile/services/SpeechService.ts`
- Modify: `artifacts/mobile/services/SpeechService.test.ts`

**Interfaces:**
- Produces: `transcribeAudioFile(uri: string, fileName: string, locale: string): Promise<{ busy: boolean } | { text: string } | { failed: true; reason: string }>` (locale becomes a required third parameter; previously it took none and never passed `lang` to the recognizer at all).

**Planning finding:** every existing call to `transcribeAudioFile(...)` in `SpeechService.test.ts` (11 call sites) passes only `(uri, fileName)`. Making `locale` required means every one of those calls needs a third argument or `pnpm run typecheck` fails. This task updates all of them to pass `"en-US"` (the specific locale value isn't what those pre-existing tests are about) alongside adding one new test that specifically asserts the locale is forwarded as `lang`.

- [ ] **Step 1: Write the failing test**

Add to the existing `describe("transcribeAudioFile", ...)` block in `artifacts/mobile/services/SpeechService.test.ts`:

```ts
  it("passes the given locale through to the native module as lang", async () => {
    const resultPromise = transcribeAudioFile("content://some/audio", "note.opus", "ml-IN");

    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({ lang: "ml-IN" })
    );

    const errorListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "error"
    );
    errorListenerCall[1]({ message: "cleanup" });
    await resultPromise;
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd artifacts/mobile && npx jest services/SpeechService.test.ts -t "passes the given locale through to the native module as lang"`
Expected: FAIL — `ExpoSpeechRecognitionModule.start` is called without a `lang` field in the file-transcription path today.

- [ ] **Step 3: Implement in SpeechService.ts**

Change the `transcribeAudioFile` signature (currently `export function transcribeAudioFile(uri: string, fileName: string): Promise<...>`) to:

```ts
export function transcribeAudioFile(
  uri: string,
  fileName: string,
  locale: string
): Promise<{ busy: boolean } | { text: string } | { failed: true; reason: string }> {
```

And add `lang: locale` to the `ExpoSpeechRecognitionModule.start({...})` call inside it (currently):

```ts
    ExpoSpeechRecognitionModule.start({
      audioSource: { uri: cached.uri },
      requiresOnDeviceRecognition: true,
    } as any);
```

becomes:

```ts
    ExpoSpeechRecognitionModule.start({
      audioSource: { uri: cached.uri },
      lang: locale,
      requiresOnDeviceRecognition: true,
    } as any);
```

- [ ] **Step 4: Update all pre-existing calls in the test file**

In `artifacts/mobile/services/SpeechService.test.ts`, every call to `transcribeAudioFile(...)` that currently passes two arguments needs `"en-US"` added as the third. This applies to every call site in the `describe("transcribeAudioFile", ...)` block — search the file for `transcribeAudioFile(` and add `, "en-US"` before the closing `)` on each match that doesn't already have three arguments (the one added in Step 1 already has `"ml-IN"` — leave it as-is). Example of the change pattern:

```ts
// before
const resultPromise = transcribeAudioFile("content://some/audio", "note.opus");
// after
const resultPromise = transcribeAudioFile("content://some/audio", "note.opus", "en-US");
```

Apply this to all remaining call sites: the "copies the source file..." test, the "copies into a distinct cache filename..." test, the "deletes the cached temp copy..." test, the "resolves failed: true ... when an error event fires" test, the "resolves busy: true..." test (both the initial `startListening` setup is untouched — only the `transcribeAudioFile` call itself), the "clears the active session after resolving..." test (both calls — `first` and `secondPromise`), and the "resolves failed: true ... when copy() throws" test (both calls), and the "resolves failed: true when the end event fires..." test (both calls).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd artifacts/mobile && npx jest services/SpeechService.test.ts`
Expected: PASS — all tests in the file, confirming every updated call site still behaves correctly with the added argument.

- [ ] **Step 6: Typecheck**

Run: `cd artifacts/mobile && pnpm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add artifacts/mobile/services/SpeechService.ts artifacts/mobile/services/SpeechService.test.ts
git commit -m "feat(mobile): thread locale into transcribeAudioFile"
```

---

### Task 5: Wire dictationLanguage into SharedTextContext for shared-audio transcription

**Files:**
- Modify: `artifacts/mobile/contexts/SharedTextContext.tsx`
- Modify: `artifacts/mobile/__tests__/contexts/SharedTextContext.test.tsx`

**Interfaces:**
- Consumes: `useReminders().dictationLanguage: DictationLanguage` from Task 2 (valid here — `SharedTextProvider` is nested inside `RemindersProvider` in the real `app/_layout.tsx`); `transcribeAudioFile(uri, fileName, locale)` from Task 4.

**Planning finding:** `__tests__/contexts/SharedTextContext.test.tsx`'s `renderConsumer()` renders `<SharedTextProvider>` with no `RemindersProvider` ancestor at all. Once `SharedTextContext.tsx` calls `useReminders()` in this task, every test in that file will throw ("useReminders must be used within RemindersProvider") unless the wrapper is fixed. This task fixes it as part of the same change.

- [ ] **Step 1: Write the failing test**

In `artifacts/mobile/__tests__/contexts/SharedTextContext.test.tsx`, first fix `renderConsumer()` to wrap in `RemindersProvider` (needed for every existing test in this file to keep passing once `useReminders()` is called inside `SharedTextProvider`):

```tsx
import { RemindersProvider } from "@/contexts/RemindersContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

function renderConsumer() {
  return render(
    <RemindersProvider>
      <SharedTextProvider>
        <Consumer />
      </SharedTextProvider>
    </RemindersProvider>
  );
}
```

Then add a new test to the `describe("SharedTextContext — native share-intent errors", ...)` block:

```ts
  it("transcribes shared audio using the stored dictationLanguage setting", async () => {
    await AsyncStorage.setItem("@dictation_language_v1", "ml-IN");
    jest.spyOn(SpeechService, "isFileTranscriptionSupported").mockReturnValue(true);
    const transcribeSpy = jest
      .spyOn(SpeechService, "transcribeAudioFile")
      .mockResolvedValue({ text: "call mom tomorrow" });
    (useShareIntent as jest.Mock).mockReturnValue({
      isReady: true,
      hasShareIntent: true,
      shareIntent: {
        files: [{ fileName: "AUD-0001.opus", mimeType: "audio/ogg", path: "content://media/AUD-0001.opus" }],
      },
      resetShareIntent: jest.fn(),
      error: null,
    });

    const { findByTestId } = renderConsumer();

    await waitFor(async () => {
      expect((await findByTestId("shared-text")).props.children).toBe("call mom tomorrow");
    });
    expect(transcribeSpy).toHaveBeenCalledWith(
      "content://media/AUD-0001.opus",
      "AUD-0001.opus",
      "ml-IN"
    );
  });
```

Also update the file's `beforeEach` to clear AsyncStorage (matching the pattern used in other test files that now depend on stored settings), by adding `await (AsyncStorage as any).clear();` to it:

```ts
beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
  (useShareIntent as jest.Mock).mockReturnValue({
    isReady: true,
    hasShareIntent: false,
    shareIntent: null,
    resetShareIntent: jest.fn(),
    error: null,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd artifacts/mobile && npx jest __tests__/contexts/SharedTextContext.test.tsx -t "transcribes shared audio using the stored dictationLanguage setting"`
Expected: FAIL — `transcribeAudioFile` is currently called with only two arguments.

- [ ] **Step 3: Implement in SharedTextContext.tsx**

Add the imports:

```ts
import { useReminders, type DictationLanguage } from "@/contexts/RemindersContext";
```

Update `NativeShareIntentCapture`'s props type and destructure to accept the language:

```ts
function NativeShareIntentCapture({
  onText,
  onTranscribingChange,
  onNotice,
  onDebugInfo,
  dictationLanguage,
}: {
  onText: (text: string) => void;
  onTranscribingChange: (transcribing: boolean) => void;
  onNotice: (notice: string | null) => void;
  onDebugInfo: (info: string | null) => void;
  dictationLanguage: DictationLanguage;
}) {
```

Update the `transcribeAudioFile` call site:

```ts
          const result = await transcribeAudioFile(audioFile.path, audioFile.fileName, dictationLanguage);
```

Add `dictationLanguage` to the effect's dependency array (currently `}, [shareIntent, error, resetShareIntent, onText, onTranscribingChange, onNotice, onDebugInfo]);`):

```ts
  }, [shareIntent, error, resetShareIntent, onText, onTranscribingChange, onNotice, onDebugInfo, dictationLanguage]);
```

In `SharedTextProvider`, read the setting and pass it down:

```ts
export function SharedTextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { dictationLanguage } = useReminders();
  const [sharedText, setSharedText] = useState("");
```

And update the `<NativeShareIntentCapture ... />` element:

```tsx
        <NativeShareIntentCapture
          onText={handleText}
          onTranscribingChange={handleTranscribingChange}
          onNotice={handleNotice}
          onDebugInfo={handleDebugInfo}
          dictationLanguage={dictationLanguage}
        />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd artifacts/mobile && npx jest __tests__/contexts/SharedTextContext.test.tsx`
Expected: PASS — including all pre-existing tests in the file (confirms the `RemindersProvider` wrapper fix didn't break anything).

Also re-run Task 3's file to confirm nothing regressed now that `SharedTextContext` depends on `RemindersContext`:

Run: `cd artifacts/mobile && npx jest __tests__/components/QuickAddInput.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/contexts/SharedTextContext.tsx artifacts/mobile/__tests__/contexts/SharedTextContext.test.tsx
git commit -m "feat(mobile): use dictationLanguage setting for shared audio transcription"
```

---

### Task 6: Language picker in Settings

**Files:**
- Modify: `artifacts/mobile/app/(tabs)/settings.tsx`
- Modify: `artifacts/mobile/__tests__/screens/settings.test.tsx`

**Interfaces:**
- Consumes: `useReminders().dictationLanguage: DictationLanguage`, `useReminders().setDictationLanguage` from Task 2; `DICTATION_LANGUAGE_KEY` from Task 1.

- [ ] **Step 1: Write the failing tests**

Add to `artifacts/mobile/__tests__/screens/settings.test.tsx`. Extend the existing import from `@/services/ReminderService`:

```ts
import { DEFAULT_ALARM_KEY, SHOW_DESCRIPTION_KEY, DICTATION_LANGUAGE_KEY } from "@/services/ReminderService";
```

Add a new `describe` block after the existing `describe("SettingsScreen", ...)` content (as additional `it`s inside the same block, matching the file's existing single-`describe` structure):

```ts
  it("highlights English by default when no dictation language is stored (mocked device locale is en-US)", async () => {
    const { findByTestId } = renderScreen();
    const enPill = await findByTestId("dictation-language-en");
    const mlPill = await findByTestId("dictation-language-ml");
    await waitFor(() => expect(enPill.props.accessibilityState?.selected).toBe(true));
    expect(mlPill.props.accessibilityState?.selected).toBe(false);
  });

  it("highlights Malayalam when it's the stored dictation language", async () => {
    await AsyncStorage.setItem(DICTATION_LANGUAGE_KEY, "ml-IN");
    const { findByTestId } = renderScreen();
    const mlPill = await findByTestId("dictation-language-ml");
    await waitFor(() => expect(mlPill.props.accessibilityState?.selected).toBe(true));
  });

  it("tapping the Malayalam pill persists the new dictation language to storage", async () => {
    const { findByTestId } = renderScreen();
    const mlPill = await findByTestId("dictation-language-ml");

    fireEvent.press(mlPill);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(DICTATION_LANGUAGE_KEY, "ml-IN")
    );
  });

  it("tapping the English pill persists the new dictation language to storage", async () => {
    await AsyncStorage.setItem(DICTATION_LANGUAGE_KEY, "ml-IN");
    const { findByTestId } = renderScreen();
    const enPill = await findByTestId("dictation-language-en");

    fireEvent.press(enPill);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(DICTATION_LANGUAGE_KEY, "en-US")
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd artifacts/mobile && npx jest __tests__/screens/settings.test.tsx -t "dictation language"`
Expected: FAIL — `findByTestId("dictation-language-en")` finds nothing yet.

- [ ] **Step 3: Implement in settings.tsx**

Add `dictationLanguage` and `setDictationLanguage` to the existing `useReminders()` destructure:

```ts
  const {
    defaultAlarmEnabled,
    setDefaultAlarmEnabled,
    showDescriptionInNotifications,
    setShowDescriptionInNotifications,
    dictationLanguage,
    setDictationLanguage,
  } = useReminders();
```

Add new styles to the `StyleSheet.create({...})` block, alongside the existing `descriptionCard` style:

```ts
    languageCard: {
      marginTop: 12,
    },
    languageLabel: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      marginBottom: 10,
    },
    languagePillRow: {
      flexDirection: "row",
      gap: 8,
    },
    languagePill: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    languagePillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    languagePillText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    languagePillTextActive: {
      color: colors.primaryForeground,
    },
```

Add the new card's JSX after the existing `descriptionCard` `View` block (before the `debugRow` `Pressable`):

```tsx
        <View style={[styles.alarmCard, styles.languageCard]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.languageLabel}>Dictation language</Text>
            <View style={styles.languagePillRow}>
              <Pressable
                testID="dictation-language-en"
                accessibilityRole="button"
                accessibilityState={{ selected: dictationLanguage === "en-US" }}
                style={[
                  styles.languagePill,
                  dictationLanguage === "en-US" && styles.languagePillActive,
                ]}
                onPress={() => setDictationLanguage("en-US")}
              >
                <Text
                  style={[
                    styles.languagePillText,
                    dictationLanguage === "en-US" && styles.languagePillTextActive,
                  ]}
                >
                  English
                </Text>
              </Pressable>
              <Pressable
                testID="dictation-language-ml"
                accessibilityRole="button"
                accessibilityState={{ selected: dictationLanguage === "ml-IN" }}
                style={[
                  styles.languagePill,
                  dictationLanguage === "ml-IN" && styles.languagePillActive,
                ]}
                onPress={() => setDictationLanguage("ml-IN")}
              >
                <Text
                  style={[
                    styles.languagePillText,
                    dictationLanguage === "ml-IN" && styles.languagePillTextActive,
                  ]}
                >
                  മലയാളം
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd artifacts/mobile && npx jest __tests__/screens/settings.test.tsx`
Expected: PASS — including all pre-existing tests in the file.

- [ ] **Step 5: Full test suite and typecheck**

Run: `cd artifacts/mobile && npx jest`
Expected: PASS — full mobile test suite, confirming no cross-file regressions from any task in this plan.

Run: `pnpm run typecheck` (from repo root, per `CLAUDE.md`)
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/mobile/app/\(tabs\)/settings.tsx artifacts/mobile/__tests__/screens/settings.test.tsx
git commit -m "feat(mobile): add dictation language picker to Settings"
```
