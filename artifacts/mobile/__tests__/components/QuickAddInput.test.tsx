import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import QuickAddInput from "@/components/QuickAddInput";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { SharedTextProvider, useSharedText } from "@/contexts/SharedTextContext";
import { DEFAULT_ALARM_KEY, STORAGE_KEY } from "@/services/ReminderService";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { Linking, Platform, StyleSheet } from "react-native";
import * as SpeechService from "@/services/SpeechService";
import * as ContactsService from "@/services/ContactsService";

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
  // The title input is multiline so long reminders wrap into view instead of
  // scrolling off the right edge. On a multiline TextInput the return key
  // inserts a newline and never fires onSubmitEditing unless blurOnSubmit is
  // true — so these two props have to stay in agreement or Done stops saving.
  it("keeps the title input multiline with submit still wired up", async () => {
    const { findByTestId } = renderComponent();
    const titleInput = await findByTestId("quick-add-input");

    expect(titleInput.props.multiline).toBe(true);
    expect(titleInput.props.blurOnSubmit).toBe(true);
    expect(StyleSheet.flatten(titleInput.props.style).maxHeight).toBeGreaterThan(0);
  });

  it("saves via the return key on the multiline title input", async () => {
    const { findByTestId } = renderComponent();

    const titleInput = await findByTestId("quick-add-input");
    fireEvent.changeText(titleInput, "Call mom tomorrow at 3pm");
    fireEvent(titleInput, "submitEditing");

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(1);
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].title).toBe("Call mom");
  });

  // The alarm icon must reflect the Settings default, not a hardcoded true.
  // Two bugs shipped here: the state was seeded only on first mount (and this
  // component never unmounts on the home screen), and saving reset it to true
  // unconditionally — leaving a lit bell while sound was off in Settings.
  it("shows the alarm off when the stored default is off", async () => {
    await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(false));
    const { findByTestId } = renderComponent();

    const alarmBtn = await findByTestId("quick-add-alarm-toggle");
    await waitFor(() =>
      expect(alarmBtn.props.accessibilityState?.selected).toBe(false)
    );
  });

  it("saves with alarm off when the stored default is off", async () => {
    await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(false));
    const { findByTestId } = renderComponent();

    const titleInput = await findByTestId("quick-add-input");
    fireEvent.changeText(titleInput, "Call mom tomorrow at 3pm");
    await waitFor(async () => {
      const btn = await findByTestId("quick-add-alarm-toggle");
      expect(btn.props.accessibilityState?.selected).toBe(false);
    });
    fireEvent.press(await findByTestId("quick-add-save"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(1);
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].alarm).toBe(false);
  });

  it("returns the alarm to the stored default after saving, not to on", async () => {
    await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(false));
    const { findByTestId } = renderComponent();

    const titleInput = await findByTestId("quick-add-input");
    fireEvent.changeText(titleInput, "Call mom tomorrow at 3pm");
    fireEvent.press(await findByTestId("quick-add-save"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(1);
    });

    const alarmBtn = await findByTestId("quick-add-alarm-toggle");
    await waitFor(() =>
      expect(alarmBtn.props.accessibilityState?.selected).toBe(false)
    );
  });

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

describe("QuickAddInput — mic toggle", () => {
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

  it("starts listening when the mic button is pressed and permission/model are ready", async () => {
    const { findByTestId } = renderComponent();
    const micButton = await findByTestId("quick-add-mic");

    fireEvent.press(micButton);

    await waitFor(() => {
      expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
        expect.objectContaining({ requiresOnDeviceRecognition: true })
      );
    });
  });

  it("uses the dictationLanguage setting, not the device locale, when the mic starts listening", async () => {
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

  it("stops listening when the mic button is pressed again while listening", async () => {
    const stopListeningSpy = jest.spyOn(SpeechService, "stopListening");
    const { findByTestId } = renderComponent();
    const micButton = await findByTestId("quick-add-mic");

    fireEvent.press(micButton);
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalled());

    fireEvent.press(micButton);

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

  it("shows the listening state while a shared audio file transcribes", async () => {
    (useSharedText as jest.Mock).mockReturnValue({
      sharedText: "",
      clearSharedText: jest.fn(),
      sharedAudioTranscribing: true,
      sharedAudioNotice: null,
    });

    const { findByTestId } = renderComponent();

    await waitFor(async () => {
      const micButton = await findByTestId("quick-add-mic");
      const flatStyle = Array.isArray(micButton.props.style)
        ? Object.assign({}, ...micButton.props.style)
        : micButton.props.style;
      expect(flatStyle.backgroundColor).toBe("#ef4444");
    });
  });

  it("clears the listening state once shared audio transcription finishes", async () => {
    (useSharedText as jest.Mock).mockReturnValue({
      sharedText: "",
      clearSharedText: jest.fn(),
      sharedAudioTranscribing: false,
      sharedAudioNotice: null,
    });

    const { findByTestId } = renderComponent();

    await waitFor(async () => {
      const micButton = await findByTestId("quick-add-mic");
      const flatStyle = Array.isArray(micButton.props.style)
        ? Object.assign({}, ...micButton.props.style)
        : micButton.props.style;
      expect(flatStyle.backgroundColor).toBeUndefined();
    });
  });

  it("does not stop a shared-audio transcription session when the mic is pressed (Finding 2b), and shows a busy notice instead", async () => {
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

    await waitFor(() => expect(getMicColor()).toBe("#ffffff"));

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

    expect(getMicColor()).toBe("#ffffff");
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
    expect(getMicColor()).toBe("#ffffff");
    expect(stopListeningSpy).not.toHaveBeenCalled();
    stopListeningSpy.mockRestore();
  });
});

// Attaching a recipient used to require saving the reminder and then
// re-opening it in the editor — the quick-add bar had no way in at all.
describe("QuickAddInput — remind someone", () => {
  beforeEach(() => {
    jest
      .spyOn(ContactsService, "loadPickableContacts")
      .mockResolvedValue({
        permission: "granted",
        contacts: [{ name: "Priya", phone: "9876543210", contactId: "c1" }],
      });
  });

  it("saves the picked contact as the reminder's recipient", async () => {
    const { findByTestId, findByText } = renderComponent();

    fireEvent.press(await findByTestId("quick-add-recipient"));
    fireEvent.press(await findByText("Priya"));

    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "Call Priya tomorrow at 3pm"
    );
    fireEvent.press(await findByTestId("quick-add-save"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
      expect(stored).toHaveLength(1);
      expect(stored[0].recipient).toEqual({
        name: "Priya",
        phone: "9876543210",
        contactId: "c1",
      });
    });
  });

  // A recipient left behind after a save would silently aim the NEXT reminder
  // at the same person.
  it("clears the recipient after a save", async () => {
    const { findByTestId, findByText } = renderComponent();

    fireEvent.press(await findByTestId("quick-add-recipient"));
    fireEvent.press(await findByText("Priya"));
    await waitFor(async () =>
      expect(
        (await findByTestId("quick-add-recipient")).props.accessibilityLabel
      ).toBe("Remind Priya")
    );

    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "Call Priya tomorrow at 3pm"
    );
    fireEvent.press(await findByTestId("quick-add-save"));

    await waitFor(async () =>
      expect(
        (await findByTestId("quick-add-recipient")).props.accessibilityLabel
      ).toBe("Remind someone")
    );
  });
});


describe("QuickAddInput — quiet hours confirmation", () => {
  // 23:30 is inside the default 22:00-08:00 window; 14:00 is outside. Both
  // phrasings verified against the real parser before being used here.
  it("asks before saving inside quiet hours, and keeps the time when told to", async () => {
    const { findByTestId } = renderComponent();

    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "Take the tablet at 11:30pm"
    );
    fireEvent.press(await findByTestId("quick-add-save"));

    // Nothing saved yet - the sheet is asking first.
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();

    fireEvent.press(await findByTestId("quiet-hours-sheet-keep"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
      expect(stored).toHaveLength(1);
      expect(new Date(stored[0].datetime).getHours()).toBe(23);
      expect(new Date(stored[0].datetime).getMinutes()).toBe(30);
    });
  });

  it("moves the reminder to the end of quiet hours when asked", async () => {
    const { findByTestId } = renderComponent();

    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "Take the tablet at 11:30pm"
    );
    fireEvent.press(await findByTestId("quick-add-save"));
    fireEvent.press(await findByTestId("quiet-hours-sheet-move"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
      expect(stored).toHaveLength(1);
      expect(new Date(stored[0].datetime).getHours()).toBe(8);
      expect(new Date(stored[0].datetime).getMinutes()).toBe(0);
    });
  });

  it("saves without asking when the time is outside quiet hours", async () => {
    const { findByTestId, queryByTestId } = renderComponent();

    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "Call the plumber at 2pm"
    );
    fireEvent.press(await findByTestId("quick-add-save"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
      expect(stored).toHaveLength(1);
    });
    expect(queryByTestId("quiet-hours-sheet-keep")).toBeNull();
  });

  // Dismissing must abandon the save entirely rather than silently writing
  // the reminder the user was still deciding about.
  it("saves nothing when the sheet is dismissed", async () => {
    const { findByTestId, queryByTestId } = renderComponent();

    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "Take the tablet at 11:30pm"
    );
    fireEvent.press(await findByTestId("quick-add-save"));
    fireEvent.press(await findByTestId("quiet-hours-sheet-overlay"));

    await waitFor(() => expect(queryByTestId("quiet-hours-sheet-keep")).toBeNull());
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});


describe("QuickAddInput — vague task hint", () => {
  it("suggests a first action for a vague opener", async () => {
    const { findByTestId } = renderComponent();
    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "Sort out the insurance"
    );
    expect(await findByTestId("vague-task-hint")).toBeTruthy();
  });

  it("shows no hint for a concrete task", async () => {
    const { findByTestId, queryByTestId } = renderComponent();
    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "Call the dentist at 3pm"
    );
    await waitFor(() => expect(queryByTestId("vague-task-hint")).toBeNull());
  });

  // Advisory means advisory: dismissing must not bring it back for the same text.
  it("stays dismissed for the same text", async () => {
    const { findByTestId, queryByTestId } = renderComponent();
    const input = await findByTestId("quick-add-input");

    fireEvent.changeText(input, "Sort out the insurance");
    fireEvent.press(await findByTestId("vague-task-hint-dismiss"));
    await waitFor(() => expect(queryByTestId("vague-task-hint")).toBeNull());

    fireEvent.changeText(input, "Sort out the insurance");
    await waitFor(() => expect(queryByTestId("vague-task-hint")).toBeNull());
  });

  it("never blocks saving", async () => {
    const { findByTestId } = renderComponent();
    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "Sort out the insurance tomorrow at 2pm"
    );
    fireEvent.press(await findByTestId("quick-add-save"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
      expect(stored).toHaveLength(1);
      expect(stored[0].title).toContain("Sort out the insurance");
    });
  });
});
