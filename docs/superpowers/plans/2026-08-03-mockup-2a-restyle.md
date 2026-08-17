# Mockup 2a Home-Screen Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do NOT use subagents/dispatched agents for this work — execute inline in the current session.

**Goal:** Restyle the Reminders app's home screen, reminder cards, and quick-add input to match Claude Design mockup 2a ("Just Remind — Clean Neutral"): fully-rounded ("soft") shapes, cozy density, a "Today"-style header, and a TYPE/SPEAK tab toggle on the quick-add input that replaces the standalone mic icon button.

**Architecture:** Pure restyle of three existing files (`constants/colors.ts`, `app/(tabs)/index.tsx`, `components/ReminderCard.tsx`) plus one behavior-preserving interaction change in `components/QuickAddInput.tsx` (mic icon → TYPE/SPEAK tabs, same underlying `SpeechService.startListening`/`stopListening` calls). No new screens, no service/context changes, no navigation changes. App name/nav title stays "Reminders"; only the in-page header text becomes "Today".

**Tech Stack:** React Native (Expo), TypeScript, `StyleSheet.create`, Jest + `@testing-library/react-native`, `expo-speech-recognition` (via existing `SpeechService.ts` wrapper — unchanged).

## Global Constraints

- Accent color stays `#6366f1` (no color change) — per spec.
- Shape: "soft" — cards/list container radius `20`; checkboxes, avatar placeholder, save button, capsule accent button are fully circular.
- Density: "cozy" — row padding `14px 16px` (already the current row padding value in most places; keep as-is unless noted).
- App name/nav tab title remains "Reminders" everywhere (nav chrome, Settings, About) — only the home screen's in-page header text changes to "Today".
- No new screens, no `add-reminder.tsx`/`reminder-detail.tsx` changes, no Settings/About changes, no dark-mode palette work, no service/context/AsyncStorage logic changes.
- TYPE/SPEAK tab selection is manual only — no auto-switch back to TYPE when listening ends on its own.
- SPEAK tab reuses the exact existing `SpeechService.startListening`/`stopListening` flow, permission checks, offline-model checks, and all existing notice strings verbatim — only the trigger UI changes (tab press instead of icon press).
- Standalone mic icon button (`testID="quick-add-mic"`) is removed entirely; remaining top icon row order: notes toggle, alarm/bell toggle, save.
- Spec reference: `docs/superpowers/specs/2026-08-03-mockup-2a-restyle-design.md`.

---

## File Structure

- **Modify:** `artifacts/mobile/constants/colors.ts` — add radius tokens for cards, capsule, circular elements.
- **Modify:** `artifacts/mobile/app/(tabs)/index.tsx` — header restyle ("Today" title + date/count subtitle + avatar placeholder), card/list radius token usage.
- **Modify:** `artifacts/mobile/components/ReminderCard.tsx` — card radius, checkbox size, row padding.
- **Modify:** `artifacts/mobile/components/QuickAddInput.tsx` — capsule radius, circular save button, TYPE/SPEAK tab row replacing mic icon.
- **Modify:** `artifacts/mobile/__tests__/components/QuickAddInput.test.tsx` — replace mic-button-based tests with tab-based tests.
- **Modify:** `artifacts/mobile/__tests__/screens/index.test.tsx` — no test changes expected (title-agnostic already), but add one assertion for the new header format.

---

## Task 1: Add radius design tokens

**Files:**
- Modify: `artifacts/mobile/constants/colors.ts`

**Interfaces:**
- Produces: `colors.radius` (existing, currently `14`, used as generic default) stays untouched for backward compat. New tokens: `colors.radiusCard = 20`, `colors.radiusCapsule = 20`, `colors.radiusFull = 999` (for fully-circular elements sized via width/height, still needs a large enough constant to fully round any current element size).

- [ ] **Step 1: Add the new radius tokens**

Edit `artifacts/mobile/constants/colors.ts`:

```ts
const colors = {
  light: {
    text: "#1a1a2e",
    tint: "#6366f1",

    background: "#F7F7F8",
    foreground: "#1a1a2e",

    card: "#ffffff",
    cardForeground: "#1a1a2e",

    primary: "#6366f1",
    primaryForeground: "#ffffff",

    secondary: "#ede9fe",
    secondaryForeground: "#4338ca",

    muted: "#F0F0F2",
    mutedForeground: "#7c7c9d",

    accent: "#818cf8",
    accentForeground: "#ffffff",

    destructive: "#ef4444",
    destructiveForeground: "#ffffff",

    border: "#E4E4E7",
    input: "#E4E4E7",

    success: "#10b981",
    successForeground: "#ffffff",

    warning: "#f59e0b",
    warningForeground: "#ffffff",
  },
  radius: 14,
  radiusCard: 20,
  radiusCapsule: 20,
  radiusFull: 999,
};

export default colors;
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm --filter @workspace/mobile run typecheck`
Expected: no new errors (this is an additive change to a plain object; `useColors()` spreads the palette and adds `radius`, so `radiusCard`/`radiusCapsule`/`radiusFull` won't be visible via `useColors()` yet — that's fine, Task 2-4 read them directly from the `colors` module or we extend `useColors`. See Step 3.)

- [ ] **Step 3: Expose the new tokens through `useColors()`**

Read `artifacts/mobile/hooks/useColors.ts` — it currently returns `{ ...palette, radius: colors.radius }`. Update the return to also include the new top-level tokens:

```ts
export function useColors() {
  const scheme = useColorScheme();
  const palette =
    scheme === "dark" && "dark" in colors
      ? (colors as Record<string, typeof colors.light>).dark
      : colors.light;
  return {
    ...palette,
    radius: colors.radius,
    radiusCard: colors.radiusCard,
    radiusCapsule: colors.radiusCapsule,
    radiusFull: colors.radiusFull,
  };
}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm --filter @workspace/mobile run typecheck`
Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/constants/colors.ts artifacts/mobile/hooks/useColors.ts
git commit -m "feat(mobile): add soft-shape radius tokens for mockup 2a restyle"
```

---

## Task 2: Restyle ReminderCard (radius, checkbox size, row padding)

**Files:**
- Modify: `artifacts/mobile/components/ReminderCard.tsx`

**Interfaces:**
- Consumes: `useColors()` → now also provides `radiusCard: 20`, `radiusFull: 999` (from Task 1).
- Produces: no new exports; visual-only change to the existing default-exported `ReminderCard` component.

- [ ] **Step 1: Update `card` style radius**

In `artifacts/mobile/components/ReminderCard.tsx`, in the `styles` object (around line 48-67), change:

```ts
card: {
  backgroundColor: colors.card,
  borderRadius: 16,
  padding: 16,
  ...
```

to:

```ts
card: {
  backgroundColor: colors.card,
  borderRadius: colors.radiusCard,
  padding: 16,
  ...
```

- [ ] **Step 2: Update `checkButton` size to 24px (was 26px) and keep it circular**

Change:

```ts
checkButton: {
  width: 26,
  height: 26,
  borderRadius: 13,
  borderWidth: 2,
  ...
```

to:

```ts
checkButton: {
  width: 24,
  height: 24,
  borderRadius: 12,
  borderWidth: 2,
  ...
```

(Circular = half of width/height; `12` is correct for a `24`-wide circle. Do not use `radiusFull` here — `999` on a `24`x`24` box still renders as a circle in React Native since it's clamped to half the smaller dimension, but using the explicit half-value keeps the style self-documenting and matches the existing codebase convention of writing exact pixel radii for sized elements.)

- [ ] **Step 3: Run existing ReminderCard/home-screen tests to confirm nothing broke**

Run: `pnpm --filter @workspace/mobile run test -- ReminderCard`
Expected: PASS (no test currently asserts on `checkButton` size/radius or `card` radius — this is a pure visual change with no behavioral assertions to update).

If there is no dedicated `ReminderCard.test.tsx`, instead run:

Run: `pnpm --filter @workspace/mobile run test -- index.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/mobile/components/ReminderCard.tsx
git commit -m "feat(mobile): restyle ReminderCard to soft/cozy mockup 2a shape"
```

---

## Task 3: Restyle home screen header ("Today" title + date/count subtitle + avatar placeholder)

**Files:**
- Modify: `artifacts/mobile/app/(tabs)/index.tsx`
- Modify: `artifacts/mobile/__tests__/screens/index.test.tsx`

**Interfaces:**
- Consumes: `useColors()` (existing), `useReminders()` (existing, unchanged), `upcoming`/`completed` arrays (existing local `useMemo` computation, unchanged).
- Produces: no new exports; visual-only change to the header markup inside the default-exported `HomeScreen` component.

- [ ] **Step 1: Write a failing test for the new header format**

Add to `artifacts/mobile/__tests__/screens/index.test.tsx`, inside the `describe("HomeScreen", ...)` block:

```ts
  it("shows a 'Today' header with a date and upcoming-count subtitle", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({ id: "r1", title: "Task one", completed: false, datetime: FUTURE }),
        makeReminder({ id: "r2", title: "Task two", completed: false, datetime: FUTURE }),
      ])
    );
    const { findByText } = renderScreen();
    expect(await findByText("Today")).toBeTruthy();
    expect(await findByText("2 upcoming")).toBeTruthy();
  });

  it("shows 'All caught up!' as the subtitle when there are no upcoming reminders", async () => {
    const { findByText } = renderScreen();
    expect(await findByText("Today")).toBeTruthy();
    expect(await findByText("All caught up!")).toBeTruthy();
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm --filter @workspace/mobile run test -- index.test.tsx -t "Today"`
Expected: FAIL — `findByText("Today")` does not find the text (current header says "Reminders").

- [ ] **Step 3: Update the header markup in `index.tsx`**

Replace the `<View style={styles.header}>` block (lines 159-164) with:

```tsx
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Today</Text>
            <Text style={styles.headerSubtitle}>
              {upcoming.length === 0 ? "All caught up!" : `${upcoming.length} upcoming`}
            </Text>
          </View>
          <View style={styles.headerAvatar} />
        </View>
      </View>
```

Note: this keeps the existing subtitle text logic (`"All caught up!"` vs. `"${upcoming.length} upcoming"`) exactly as it already was — only the title text and layout change (title/subtitle stacked on the left, decorative circle on the right, matching the mockup).

- [ ] **Step 4: Add the new `headerRow` and `headerAvatar` styles**

In the `styles = StyleSheet.create({...})` block, add these two entries (near `header`/`headerTitle`/`headerSubtitle`, around line 59-75):

```ts
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.muted,
    },
```

Leave `headerTitle` and `headerSubtitle` styles as they already are (30px bold title, 14px muted subtitle — these already match the mockup's sizing, only the text content changed).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @workspace/mobile run test -- index.test.tsx`
Expected: PASS, including all pre-existing tests in this file (they don't assert on header title text, so they remain unaffected) and the two new tests from Step 1.

- [ ] **Step 6: Commit**

```bash
git add artifacts/mobile/app/\(tabs\)/index.tsx artifacts/mobile/__tests__/screens/index.test.tsx
git commit -m "feat(mobile): restyle home screen header to mockup 2a 'Today' layout"
```

---

## Task 4: Restyle QuickAddInput capsule (radius, circular save button) — no behavior change

**Files:**
- Modify: `artifacts/mobile/components/QuickAddInput.tsx`

**Interfaces:**
- Consumes: `useColors()` (now also provides `radiusCapsule: 20` from Task 1).
- Produces: no new exports; visual-only change to `bar` and `saveBtn` styles. This task does NOT touch the icon row or add tabs yet — that's Task 5. Keeping this separate lets the capsule-shape change be reviewed/tested independently of the larger tab-toggle behavior change.

- [ ] **Step 1: Update the `bar` style radius**

In `artifacts/mobile/components/QuickAddInput.tsx`, in the `styles` object (around line 356-375), change:

```ts
bar: {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.card,
  borderRadius: 16,
  ...
```

to:

```ts
bar: {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.card,
  borderRadius: colors.radiusCapsule,
  ...
```

- [ ] **Step 2: Update the `saveBtn` style to be fully circular**

Change:

```ts
saveBtn: {
  width: 32,
  height: 32,
  borderRadius: 16,
  backgroundColor: canSave ? colors.primary : colors.muted,
  alignItems: "center",
  justifyContent: "center",
},
```

`borderRadius: 16` on a `32`x`32` box is already fully circular (half of 32) — no change needed here. Confirm this by inspection; do not edit if already correct. (This step exists to make the plan's radius sweep explicit and auditable — the value was already correct before this restyle.)

- [ ] **Step 3: Run existing QuickAddInput tests to confirm the capsule/save-button change doesn't break anything**

Run: `pnpm --filter @workspace/mobile run test -- QuickAddInput`
Expected: PASS (no test asserts on `bar`/`saveBtn` radius values).

- [ ] **Step 4: Commit**

```bash
git add artifacts/mobile/components/QuickAddInput.tsx
git commit -m "feat(mobile): restyle QuickAddInput capsule to soft mockup 2a radius"
```

---

## Task 5: Replace mic icon button with TYPE/SPEAK tabs

**Files:**
- Modify: `artifacts/mobile/components/QuickAddInput.tsx`
- Modify: `artifacts/mobile/__tests__/components/QuickAddInput.test.tsx`

**Interfaces:**
- Consumes (unchanged, from `@/services/SpeechService`): `startListening(baseline: string, locale: string, onResult: (fullText: string) => void, onEnd: () => void, onError: (message: string) => void, onDevice?: boolean): { busy: boolean }`, `stopListening(): void`, `ensureOfflineModelReady(locale: string): Promise<"ready" | "preparing" | "unavailable">`, `getMicPermissionStatus(): Promise<{ granted: boolean; canAskAgain: boolean }>`, `requestMicPermission(): Promise<boolean>`.
- Produces: new local state `activeTab: "type" | "speak"` inside `QuickAddInput`. New `testID`s: `"quick-add-tab-type"`, `"quick-add-tab-speak"` (replacing the removed `testID="quick-add-mic"`). The existing `listening` boolean state and `micPulse` Animated.Value are reused, not renamed — later code/tests reading "is it listening" still checks `listening`.

This task is the only functionally-behavioral change in the whole plan. Everything else it touches (`handleMicPress` logic, permission/model-check flow, notice strings) is preserved verbatim — only the trigger changes from an icon press to a tab press, and there are now two trigger directions (start on SPEAK select, stop on TYPE select).

- [ ] **Step 1: Write failing tests for the new tab-based interaction**

Replace the entire `describe("QuickAddInput — mic button", ...)` block (lines 152-362) in `artifacts/mobile/__tests__/components/QuickAddInput.test.tsx` with:

```ts
describe("QuickAddInput — TYPE/SPEAK tabs", () => {
  beforeEach(() => {
    // SpeechService tracks its "active listening session" in module-level
    // state; some tests below (deliberately) start listening and never end
    // the session via a UI action, which would otherwise leak into the next
    // test as a stale "busy" session. Reset it here for isolation.
    SpeechService.stopListening();
    // ensureOfflineModelReady() short-circuits to "ready" on any non-Android
    // platform (jest-expo's default Platform.OS is "ios"), so it would never
    // consult the mocked androidTriggerOfflineModelDownload response below.
    // Force android so the "preparing" test actually exercises that path.
    jest.replaceProperty(Platform, "OS", "android");
    (ExpoSpeechRecognitionModule.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      canAskAgain: true,
      status: "granted",
    });
    (ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload as jest.Mock).mockResolvedValue({
      status: "download_success",
      message: "ok",
    });
  });

  it("has no standalone mic icon button", async () => {
    const { queryByTestId } = renderComponent();
    await waitFor(() => {
      expect(queryByTestId("quick-add-mic")).toBeNull();
    });
  });

  it("starts listening when the SPEAK tab is selected and permission/model are ready", async () => {
    const { findByTestId } = renderComponent();
    const speakTab = await findByTestId("quick-add-tab-speak");

    fireEvent.press(speakTab);

    await waitFor(() => {
      expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
        expect.objectContaining({ requiresOnDeviceRecognition: true })
      );
    });
  });

  it("uses the dictationLanguage setting, not the device locale, when SPEAK starts listening", async () => {
    await AsyncStorage.setItem("@dictation_language_v1", "ml-IN");

    const { findByTestId } = renderComponent();
    const speakTab = await findByTestId("quick-add-tab-speak");
    fireEvent.press(speakTab);

    await waitFor(() => {
      expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
        expect.objectContaining({ lang: "ml-IN" })
      );
    });
  });

  it("populates the input field when a result event fires while listening via SPEAK", async () => {
    const { findByTestId } = renderComponent();
    const speakTab = await findByTestId("quick-add-tab-speak");
    fireEvent.press(speakTab);

    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalled());

    const resultListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "result"
    );
    resultListenerCall[1]({ isFinal: true, results: [{ transcript: "call mom tomorrow at 3pm" }] });

    const titleInput = await findByTestId("quick-add-input");
    await waitFor(() => expect(titleInput.props.value).toBe("call mom tomorrow at 3pm"));
  });

  it("stops listening when the TYPE tab is selected while SPEAK was active", async () => {
    const stopListeningSpy = jest.spyOn(SpeechService, "stopListening");
    const { findByTestId } = renderComponent();
    const speakTab = await findByTestId("quick-add-tab-speak");
    const typeTab = await findByTestId("quick-add-tab-type");

    fireEvent.press(speakTab);
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalled());

    fireEvent.press(typeTab);

    await waitFor(() => expect(stopListeningSpy).toHaveBeenCalled());
    stopListeningSpy.mockRestore();
  });

  it("deep-links to Settings when permission is denied and cannot be asked again, without auto-starting on return", async () => {
    (ExpoSpeechRecognitionModule.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      canAskAgain: false,
      status: "denied",
    });
    const openSettingsSpy = jest.spyOn(Linking, "openSettings").mockResolvedValue();

    const { findByTestId } = renderComponent();
    const speakTab = await findByTestId("quick-add-tab-speak");
    fireEvent.press(speakTab);

    await waitFor(() => expect(openSettingsSpy).toHaveBeenCalled());
    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();

    openSettingsSpy.mockRestore();
  });

  it("shows a busy notice and does not call start when the model is still preparing", async () => {
    (ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload as jest.Mock).mockResolvedValueOnce({
      status: "opened_dialog",
      message: "dialog shown",
    });

    const { findByTestId, findByText } = renderComponent();
    const speakTab = await findByTestId("quick-add-tab-speak");
    fireEvent.press(speakTab);

    expect(await findByText(/Preparing voice recognition/i)).toBeTruthy();
    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
  });

  it("pulses the SPEAK tab while a shared audio file transcribes", async () => {
    (useSharedText as jest.Mock).mockReturnValue({
      sharedText: "",
      clearSharedText: jest.fn(),
      sharedAudioTranscribing: true,
      sharedAudioNotice: null,
    });

    const { UNSAFE_getAllByType } = renderComponent();

    await waitFor(() => {
      const micIcon = UNSAFE_getAllByType(Feather).find(
        (node) => node.props.name === "mic"
      );
      expect(micIcon?.props.color).toBe("#6366f1");
    });
  });

  it("stops the SPEAK tab pulse once shared audio transcription finishes", async () => {
    (useSharedText as jest.Mock).mockReturnValue({
      sharedText: "",
      clearSharedText: jest.fn(),
      sharedAudioTranscribing: false,
      sharedAudioNotice: null,
    });

    const { UNSAFE_getAllByType } = renderComponent();

    await waitFor(() => {
      const micIcon = UNSAFE_getAllByType(Feather).find(
        (node) => node.props.name === "mic"
      );
      expect(micIcon?.props.color).toBe("#7c7c9d");
    });
  });

  it("does not stop a shared-audio transcription session when SPEAK is pressed (Finding 2b), and shows a busy notice instead", async () => {
    const stopListeningSpy = jest.spyOn(SpeechService, "stopListening");
    (useSharedText as jest.Mock).mockReturnValue({
      sharedText: "",
      clearSharedText: jest.fn(),
      sharedAudioTranscribing: true,
      sharedAudioNotice: null,
    });

    const { findByTestId, findByText } = renderComponent();
    const speakTab = await findByTestId("quick-add-tab-speak");

    fireEvent.press(speakTab);

    expect(await findByText(/Still transcribing the shared audio/i)).toBeTruthy();
    expect(stopListeningSpy).not.toHaveBeenCalled();
    stopListeningSpy.mockRestore();
  });

  it("does not clobber an in-progress live mic session when a shared-audio transcription starts and finishes (Finding 2a's QuickAddInput-observable half)", async () => {
    const stopListeningSpy = jest.spyOn(SpeechService, "stopListening");
    const { findByTestId, rerender, UNSAFE_getAllByType } = renderComponent();
    const speakTab = await findByTestId("quick-add-tab-speak");

    // Start a real live mic session first (permission granted, model ready
    // per the outer beforeEach).
    fireEvent.press(speakTab);
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalled());

    const getMicColor = () =>
      UNSAFE_getAllByType(Feather).find((node) => node.props.name === "mic")?.props.color;

    await waitFor(() => expect(getMicColor()).toBe("#6366f1"));

    // Now simulate a shared audio file starting to transcribe while the
    // live session is still active — this must NOT touch the live
    // session's listening/pulse state.
    (useSharedText as jest.Mock).mockReturnValue({
      sharedText: "",
      clearSharedText: jest.fn(),
      sharedAudioTranscribing: true,
      sharedAudioNotice: null,
    });
    rerender(
      <RemindersProvider>
        <SharedTextProvider>
          <QuickAddInput />
        </SharedTextProvider>
      </RemindersProvider>
    );

    expect(getMicColor()).toBe("#6366f1");
    expect(stopListeningSpy).not.toHaveBeenCalled();

    // ...and back to false again.
    (useSharedText as jest.Mock).mockReturnValue({
      sharedText: "",
      clearSharedText: jest.fn(),
      sharedAudioTranscribing: false,
      sharedAudioNotice: null,
    });
    rerender(
      <RemindersProvider>
        <SharedTextProvider>
          <QuickAddInput />
        </SharedTextProvider>
      </RemindersProvider>
    );

    // The live session survived the blip untouched: still active, never stopped.
    expect(getMicColor()).toBe("#6366f1");
    expect(stopListeningSpy).not.toHaveBeenCalled();
    stopListeningSpy.mockRestore();
  });
});
```

Note: the two shared-audio-pulse tests (`"pulses the SPEAK tab..."` / `"stops the SPEAK tab pulse..."`) and the "Finding 2a" test still search for a `Feather` icon named `"mic"` by color — Step 3 keeps a `Feather name="mic"` icon (relocated inside the SPEAK tab, not the old standalone button), so these assertions carry over unchanged in spirit; only their surrounding `describe` block and the trigger (`speakTab` instead of `micButton`) changed.

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm --filter @workspace/mobile run test -- QuickAddInput`
Expected: FAIL — `findByTestId("quick-add-tab-speak")` throws (element not found), since the tabs don't exist yet.

- [ ] **Step 3: Implement the TYPE/SPEAK tab row and wire it to the existing mic logic**

In `artifacts/mobile/components/QuickAddInput.tsx`:

**3a.** Add tab state near the other `useState` declarations (around line 106-116):

```ts
  const [activeTab, setActiveTab] = useState<"type" | "speak">("type");
```

**3b.** Extract the existing mic-start logic out of `handleMicPress` into two directional handlers. Replace the current `handleMicPress` function (lines 274-332) with:

```ts
  const startSpeakMode = async () => {
    setMicNotice(null);
    const { granted, canAskAgain } = await getMicPermissionStatus();
    if (!granted) {
      if (!canAskAgain) {
        Linking.openSettings();
        return;
      }
      const nowGranted = await requestMicPermission();
      if (!nowGranted) return;
    }

    const locale = dictationLanguage;
    const modelStatus = await ensureOfflineModelReady(locale);
    if (modelStatus === "preparing") {
      setMicNotice("Preparing voice recognition — try again in a moment");
      return;
    }

    const { busy } = startListening(
      input,
      locale,
      (fullText) => setInput(fullText),
      () => {
        micSourceRef.current = null;
        setListening(false);
        stopMicPulse();
      },
      () => {
        micSourceRef.current = null;
        setListening(false);
        stopMicPulse();
        setMicNotice("Couldn't hear that — try again or type it in.");
      },
      modelStatus !== "unavailable"
    );
    if (busy) {
      setMicNotice("Still transcribing the shared audio…");
      return;
    }
    micSourceRef.current = "live";
    setListening(true);
    startMicPulse();
  };

  const stopSpeakMode = () => {
    if (micSourceRef.current === "shared") {
      // A shared audio file is transcribing right now — stopping here would
      // kill its native listeners and permanently wedge the concurrency
      // guard (see Finding 2b). Surface a notice instead of stopping it.
      setMicNotice("Still transcribing the shared audio…");
      return;
    }
    stopListening();
    micSourceRef.current = null;
    setListening(false);
    stopMicPulse();
  };

  const handleTabPress = (tab: "type" | "speak") => {
    setActiveTab(tab);
    if (tab === "speak") {
      if (!listening) startSpeakMode();
    } else {
      if (listening) stopSpeakMode();
    }
  };
```

This preserves every existing branch of the old `handleMicPress` (permission check, offline model check, busy notices, error notice, shared-audio guard) — it's the same logic split across "start" (SPEAK selected) and "stop" (TYPE selected) instead of a single toggle function.

**3c.** Remove the old standalone mic `Pressable` from the icon row. In the JSX `bar` View, delete this block:

```tsx
        <Pressable
          style={styles.alarmBtn}
          onPress={handleMicPress}
          hitSlop={8}
          testID="quick-add-mic"
        >
          <Animated.View style={{ transform: [{ scale: micPulse }] }}>
            <Feather
              name="mic"
              size={16}
              color={listening ? colors.primary : colors.mutedForeground}
            />
          </Animated.View>
        </Pressable>
```

The icon row (inside `styles.bar`) now reads, in order: text input, notes-toggle `Pressable`, bell/alarm-toggle `Pressable`, save `Pressable` — matching the spec's required order (notes, bell, save).

**3d.** Add the TYPE/SPEAK tab row as a new sibling directly below the `styles.bar` `View`, still inside `styles.wrapper` (i.e. after the closing `</View>` of the `bar` row, before the `{micNotice && (...)}` block):

```tsx
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, activeTab === "type" && styles.tabActive]}
          onPress={() => handleTabPress("type")}
          testID="quick-add-tab-type"
        >
          <Text style={[styles.tabText, activeTab === "type" && styles.tabTextActive]}>
            TYPE
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "speak" && styles.tabActive]}
          onPress={() => handleTabPress("speak")}
          testID="quick-add-tab-speak"
        >
          <Animated.View style={{ transform: [{ scale: activeTab === "speak" ? micPulse : 1 }] }}>
            <Feather
              name="mic"
              size={13}
              color={activeTab === "speak" ? colors.primary : colors.mutedForeground}
            />
          </Animated.View>
          <Text style={[styles.tabText, activeTab === "speak" && styles.tabTextActive]}>
            SPEAK
          </Text>
        </Pressable>
      </View>
```

Note the mic icon's `color` now reflects `activeTab === "speak"` (tab selection) rather than the old `listening` boolean — this matches the existing shared-audio-pulse tests from Step 1, which flip `sharedAudioTranscribing` and expect the icon to turn `colors.primary`/`colors.mutedForeground`; since `sharedAudioTranscribing` becoming `true` drives `micSourceRef.current = "shared"` and `setListening(true)` (existing `useEffect` at lines 127-143, unchanged), and that effect does not touch `activeTab` — **this requires also auto-switching `activeTab` to `"speak"` when a shared-audio transcription starts**, so the tab visually reflects it. Add this to the existing shared-audio `useEffect` (lines 127-143):

```ts
  useEffect(() => {
    if (sharedAudioTranscribing) {
      if (micSourceRef.current === "live") {
        // A live mic session already owns listening/pulse state — don't let
        // this (typically near-instantly-busy) shared-audio attempt touch it.
        return;
      }
      micSourceRef.current = "shared";
      setListening(true);
      setActiveTab("speak");
      startMicPulse();
      setMicNotice(null);
    } else if (micSourceRef.current === "shared") {
      micSourceRef.current = null;
      setListening(false);
      stopMicPulse();
    }
  }, [sharedAudioTranscribing]);
```

(Only the `setActiveTab("speak")` line is new.) This makes the Step-1 shared-audio-pulse tests pass, since they don't press any tab first — the tab auto-follows a shared-audio session the same way `listening` already did.

**3e.** Add the new styles to the `styles = StyleSheet.create({...})` object:

```ts
    tabRow: {
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 6,
      paddingTop: 6,
      marginTop: 6,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    tab: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingBottom: 6,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    tabActive: {
      borderBottomColor: colors.primary,
    },
    tabText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    tabTextActive: {
      color: colors.primary,
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @workspace/mobile run test -- QuickAddInput`
Expected: PASS — all tests in the rewritten `describe("QuickAddInput — TYPE/SPEAK tabs", ...)` block, plus all pre-existing tests in the first `describe("QuickAddInput", ...)` block (title/notes/save flow — untouched by this task).

- [ ] **Step 5: Run the full mobile test suite to check for regressions elsewhere**

Run: `pnpm --filter @workspace/mobile run test`
Expected: PASS. Pay particular attention to any test in `__tests__/screens/add-reminder.test.tsx` or elsewhere that might reference `testID="quick-add-mic"` — grep for it first:

Run: `grep -rn "quick-add-mic" artifacts/mobile --include=*.tsx --include=*.ts`
Expected: no remaining references outside of this plan's own rewritten test file (which no longer contains any `quick-add-mic` reference — it was replaced by the "has no standalone mic icon button" test in Step 1).

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @workspace/mobile run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add artifacts/mobile/components/QuickAddInput.tsx artifacts/mobile/__tests__/components/QuickAddInput.test.tsx
git commit -m "feat(mobile): replace mic icon with TYPE/SPEAK tabs on quick-add input"
```

---

## Task 6: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite one more time**

Run: `pnpm --filter @workspace/mobile run test`
Expected: PASS, all suites.

- [ ] **Step 2: Run full typecheck across all packages**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual smoke test in a running app (if a dev environment is available)**

Start the app per `CLAUDE.md` ("Run & Operate" section — `npx expo start` against an existing dev client, or `npx expo run:android` for a full local build). Verify:
- Home screen shows "Today" as the title, with either "N upcoming" or "All caught up!" as the subtitle, and a circular placeholder avatar top-right.
- Reminder cards have visibly more rounded corners (20px) and a 24px circular checkbox.
- The quick-add input bar is a fully rounded capsule.
- Below the input row, TYPE and SPEAK tabs are visible; TYPE is active by default.
- Tapping SPEAK triggers the existing permission/model-check flow (same behavior as the old mic icon) and, once listening starts, the SPEAK tab's mic icon pulses.
- Tapping TYPE while SPEAK is listening stops dictation.
- Save button is a filled circular accent button.
- If this cannot be run in the current environment, state that explicitly rather than claiming it was verified.

- [ ] **Step 4: No commit for this task** (verification only, no file changes).

---

## Plan Self-Review Notes

- **Spec coverage:** all five spec sections (tokens, header, capsule/tabs, cards, out-of-scope items) map to Tasks 1-5; out-of-scope items (2b's chips, dark mode, other screens) are untouched by any task, consistent with the spec.
- **Type consistency:** `useColors()` return type gains `radiusCard`/`radiusCapsule`/`radiusFull` in Task 1 and is consumed identically in Tasks 2-4; `activeTab: "type" | "speak"` is introduced once in Task 5 and used consistently within that task; `SpeechService.startListening`/`stopListening` signatures in Task 5 match `services/SpeechService.ts` exactly as read from source.
- **No placeholders:** every step includes literal code to write or an exact command to run.
