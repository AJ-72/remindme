import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import QuickAddInput from "@/components/QuickAddInput";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { SharedTextProvider, useSharedText } from "@/contexts/SharedTextContext";
import { STORAGE_KEY } from "@/services/ReminderService";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { Linking, Platform } from "react-native";
import * as SpeechService from "@/services/SpeechService";

jest.mock("expo-haptics");

// Mock the whole module for this file so individual tests can control
// `sharedAudioTranscribing` directly, without plumbing a fake
// `expo-share-intent` native event through `SharedTextProvider`. The real
// `SharedTextProvider` is passed through unchanged (it's a harmless no-op
// under jest, since `expo-share-intent` isn't installed there) — only
// `useSharedText` is replaced, since that's the only surface QuickAddInput
// actually consumes.
jest.mock("@/contexts/SharedTextContext", () => {
  const actual = jest.requireActual("@/contexts/SharedTextContext");
  return {
    ...actual,
    useSharedText: jest.fn(),
  };
});

function renderComponent() {
  return render(
    <RemindersProvider>
      <SharedTextProvider>
        <QuickAddInput />
      </SharedTextProvider>
    </RemindersProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
  (useSharedText as jest.Mock).mockReturnValue({
    sharedText: "",
    clearSharedText: jest.fn(),
    sharedAudioTranscribing: false,
    sharedAudioNotice: null,
  });
});

describe("QuickAddInput", () => {
  it("saves a description entered via the notes toggle, alongside a parsed date", async () => {
    const { findByTestId, getByTestId } = renderComponent();

    const titleInput = await findByTestId("quick-add-input");
    fireEvent.changeText(titleInput, "Call mom tomorrow at 3pm");

    const notesToggle = await findByTestId("quick-add-notes-toggle");
    fireEvent.press(notesToggle);

    const notesInput = await findByTestId("quick-add-notes-input");
    fireEvent.changeText(notesInput, "Ask about the weekend trip");

    const saveButton = getByTestId("quick-add-save");
    fireEvent.press(saveButton);

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(1);
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].title).toBe("Call mom");
    expect(stored[0].description).toBe("Ask about the weekend trip");
  });

  it("parses a Malayalam date/time phrase into the date pill and title", async () => {
    const { findByTestId, findByText } = renderComponent();

    const titleInput = await findByTestId("quick-add-input");
    fireEvent.changeText(titleInput, "നാളെ വൈകിട്ട് 5 മണിക്ക് മീറ്റിംഗ്");

    // The pill row renders "Tomorrow" and "5:00 PM"-formatted text once a
    // date is parsed — this confirms routing engaged, not just that saving works.
    expect(await findByText("Tomorrow")).toBeTruthy();

    const saveButton = await findByTestId("quick-add-save");
    fireEvent.press(saveButton);

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(1);
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].title).toBe("മീറ്റിംഗ്");
  });

  it("parses a Malayalam speech-transcript-shaped spelled-out-number string via the mic result path", async () => {
    const { findByTestId, findByText } = renderComponent();
    const titleInput = await findByTestId("quick-add-input");

    // Simulate what the mic result listener does: setInput(fullText) with a
    // transcript containing a spelled-out number, since on-device speech
    // recognition transcribes numbers as words more often than digits.
    fireEvent.changeText(titleInput, "നാളെ വൈകിട്ട് അഞ്ച് മണിക്ക് മീറ്റിംഗ്");

    // Confirms the spelled-out number ("അഞ്ച്" = five) was actually recognized
    // and parsed into a date — not just that the input echoes its own value.
    expect(await findByText("Tomorrow")).toBeTruthy();

    const saveButton = await findByTestId("quick-add-save");
    fireEvent.press(saveButton);

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(1);
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].title).toBe("മീറ്റിംഗ്");
  });

  it("renders the notes input with the Malayalam font when notes text is Malayalam", async () => {
    const { findByTestId } = renderComponent();

    const notesToggle = await findByTestId("quick-add-notes-toggle");
    fireEvent.press(notesToggle);

    const notesInput = await findByTestId("quick-add-notes-input");
    fireEvent.changeText(notesInput, "നാളെ വൈകിട്ട് മീറ്റിംഗ്");

    const flatStyle = Array.isArray(notesInput.props.style)
      ? Object.assign({}, ...notesInput.props.style)
      : notesInput.props.style;
    expect(flatStyle.fontFamily).toBe("NotoSansMalayalam_400Regular");
  });

  it("renders the notes input with the Inter font when notes text is English", async () => {
    const { findByTestId } = renderComponent();

    const notesToggle = await findByTestId("quick-add-notes-toggle");
    fireEvent.press(notesToggle);

    const notesInput = await findByTestId("quick-add-notes-input");
    fireEvent.changeText(notesInput, "Ask about the weekend trip");

    const flatStyle = Array.isArray(notesInput.props.style)
      ? Object.assign({}, ...notesInput.props.style)
      : notesInput.props.style;
    expect(flatStyle.fontFamily).toBe("Inter_400Regular");
  });
});

describe("QuickAddInput — mic button", () => {
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

  it("starts listening when permission is already granted and the model is ready", async () => {
    const { findByTestId } = renderComponent();
    const micButton = await findByTestId("quick-add-mic");

    fireEvent.press(micButton);

    await waitFor(() => {
      expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
        expect.objectContaining({ requiresOnDeviceRecognition: true })
      );
    });
  });

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

  it("populates the input field when a result event fires while listening", async () => {
    const { findByTestId } = renderComponent();
    const micButton = await findByTestId("quick-add-mic");
    fireEvent.press(micButton);

    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalled());

    const resultListenerCall = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (call) => call[0] === "result"
    );
    resultListenerCall[1]({ isFinal: true, results: [{ transcript: "call mom tomorrow at 3pm" }] });

    const titleInput = await findByTestId("quick-add-input");
    await waitFor(() => expect(titleInput.props.value).toBe("call mom tomorrow at 3pm"));
  });

  it("deep-links to Settings when permission is denied and cannot be asked again, without auto-starting on return", async () => {
    (ExpoSpeechRecognitionModule.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      canAskAgain: false,
      status: "denied",
    });
    const openSettingsSpy = jest.spyOn(Linking, "openSettings").mockResolvedValue();

    const { findByTestId } = renderComponent();
    const micButton = await findByTestId("quick-add-mic");
    fireEvent.press(micButton);

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
    const micButton = await findByTestId("quick-add-mic");
    fireEvent.press(micButton);

    expect(await findByText(/Preparing voice recognition/i)).toBeTruthy();
    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
  });

  it("shows the listening pulse animation while a shared audio file transcribes", async () => {
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

  it("stops the listening pulse animation once shared audio transcription finishes", async () => {
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

  it("does not stop a shared-audio transcription session when the mic button is pressed (Finding 2b), and shows a busy notice instead", async () => {
    const stopListeningSpy = jest.spyOn(SpeechService, "stopListening");
    (useSharedText as jest.Mock).mockReturnValue({
      sharedText: "",
      clearSharedText: jest.fn(),
      sharedAudioTranscribing: true,
      sharedAudioNotice: null,
    });

    const { findByTestId, findByText } = renderComponent();
    const micButton = await findByTestId("quick-add-mic");

    fireEvent.press(micButton);

    expect(await findByText(/Still transcribing the shared audio/i)).toBeTruthy();
    expect(stopListeningSpy).not.toHaveBeenCalled();
    stopListeningSpy.mockRestore();
  });

  it("does not clobber an in-progress live mic session when a shared-audio transcription starts and finishes (Finding 2a's QuickAddInput-observable half)", async () => {
    const stopListeningSpy = jest.spyOn(SpeechService, "stopListening");
    const { findByTestId, rerender, UNSAFE_getAllByType } = renderComponent();
    const micButton = await findByTestId("quick-add-mic");

    // Start a real live mic session first (permission granted, model ready
    // per the outer beforeEach).
    fireEvent.press(micButton);
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
