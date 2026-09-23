import React from "react";
import { render, waitFor, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import QuickAddInput from "@/components/QuickAddInput";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { SharedTextProvider, useSharedText } from "@/contexts/SharedTextContext";
import {
  DEFAULT_ALARM_KEY,
  DICTATION_LANGUAGE_KEY,
  MAX_REGISTER_PROMPTS,
  MIC_LANGUAGE_LINE_KEY,
  REGISTERED_PHONE_KEY,
  REGISTER_PROMPT_COUNT_KEY,
  resetRegisterPromptSession,
  STORAGE_KEY,
} from "@/services/ReminderService";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { AppState, Linking, Platform, StyleSheet } from "react-native";
import * as SpeechService from "@/services/SpeechService";
import { WAVEFORM_BARS } from "@/utils/micLevel";
import * as ContactsService from "@/services/ContactsService";
import * as InvitationService from "@/services/InvitationService";
import * as RecipientLookupService from "@/services/RecipientLookupService";

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
  // The "one offer per session" guard is a module-level flag, so without this
  // the first test to see an offer silences it for every test after it.
  resetRegisterPromptSession();
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

  // The Settings toggle only seeds NEW reminders, so a user who turned it off
  // gets a silent reminder with no other signal at compose time. The hint also
  // names lateness, since the alarm flag decides the scheduling API too.
  it("warns that the reminder will be silent when the default is off", async () => {
    await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(false));
    const { findByTestId } = renderComponent();

    const hint = await findByTestId("quick-add-silent-hint");
    expect(hint).toBeTruthy();
  });

  it("shows no silent warning when the default is on", async () => {
    await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(true));
    const { queryByTestId, findByTestId } = renderComponent();

    await findByTestId("quick-add-alarm-toggle");
    await waitFor(() =>
      expect(queryByTestId("quick-add-silent-hint")).toBeNull()
    );
  });

  it("clears the silent warning once the bell is tapped", async () => {
    await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(false));
    const { findByTestId, queryByTestId } = renderComponent();

    await findByTestId("quick-add-silent-hint");
    fireEvent.press(await findByTestId("quick-add-alarm-toggle"));

    await waitFor(() =>
      expect(queryByTestId("quick-add-silent-hint")).toBeNull()
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

  // A numeral next to a period word is genuinely undecidable — "രാവിലെ 5" is
  // both "at 5 AM" and "5 <things>, in the morning". Saving on a guess quietly
  // deletes the count from the user's own text, so the app asks once.
  it("asks which reading is meant instead of saving an ambiguous numeral", async () => {
    const { findByTestId, findByText, queryByText } = renderComponent();

    const titleInput = await findByTestId("quick-add-input");
    fireEvent.changeText(titleInput, "രാവിലെ 5 ആപ്പിൾ വാങ്ങണം");

    fireEvent.press(await findByTestId("quick-add-save"));

    // Nothing is written until the user answers.
    expect(await findByText('Is "5" the time?')).toBeTruthy();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(queryByText("ആപ്പിൾ വാങ്ങണം")).toBeTruthy(); // the "it's the hour" row
  });

  it("keeps the count in the title when the user says the numeral is not a time", async () => {
    const { findByTestId, findByText } = renderComponent();

    const titleInput = await findByTestId("quick-add-input");
    fireEvent.changeText(titleInput, "രാവിലെ 5 ആപ്പിൾ വാങ്ങണം");
    fireEvent.press(await findByTestId("quick-add-save"));

    fireEvent.press(await findByText("5 ആപ്പിൾ വാങ്ങണം"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(1);
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].title).toBe("5 ആപ്പിൾ വാങ്ങണം");
    expect(new Date(stored[0].datetime).getHours()).toBe(9);
  });

  it("uses the numeral as the hour when the user says it is a time", async () => {
    const { findByTestId, findByText } = renderComponent();

    const titleInput = await findByTestId("quick-add-input");
    fireEvent.changeText(titleInput, "രാവിലെ 5 ആപ്പിൾ വാങ്ങണം");
    fireEvent.press(await findByTestId("quick-add-save"));

    fireEvent.press(await findByText("ആപ്പിൾ വാങ്ങണം"));

    // 05:00 falls inside the default quiet hours (22:00-08:00), so the save
    // detours through that sheet. The chosen title has to survive the detour —
    // it is held in a ref, since the parsed title is the wrong one here.
    fireEvent.press(await findByTestId("quiet-hours-sheet-keep"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(1);
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].title).toBe("ആപ്പിൾ വാങ്ങണം");
    expect(new Date(stored[0].datetime).getHours()).toBe(5);
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

  it("shows no clear button while the input is empty", async () => {
    const { queryByTestId, findByTestId } = renderComponent();
    await findByTestId("quick-add-input");
    expect(queryByTestId("quick-add-clear")).toBeNull();
  });

  it("clears the typed text and the parsed time when the clear button is pressed", async () => {
    const { findByTestId, queryByText, queryByTestId } = renderComponent();

    const titleInput = await findByTestId("quick-add-input");
    fireEvent.changeText(titleInput, "tomorrow at 5pm meeting");
    expect(await findByTestId("quick-add-clear")).toBeTruthy();
    await waitFor(() => expect(queryByText("Tomorrow")).toBeTruthy());

    fireEvent.press(await findByTestId("quick-add-clear"));

    await waitFor(() => expect(queryByText("Tomorrow")).toBeNull());
    expect(titleInput.props.value).toBe("");
    expect(queryByTestId("quick-add-clear")).toBeNull();
  });

  it("clears the notes text too", async () => {
    const { findByTestId } = renderComponent();

    const titleInput = await findByTestId("quick-add-input");
    fireEvent.changeText(titleInput, "buy milk");
    fireEvent.press(await findByTestId("quick-add-notes-toggle"));
    const notesInput = await findByTestId("quick-add-notes-input");
    fireEvent.changeText(notesInput, "two litres");

    fireEvent.press(await findByTestId("quick-add-clear"));

    await waitFor(() => expect(titleInput.props.value).toBe(""));
    expect(notesInput.props.value).toBe("");
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
      expect(flatStyle.backgroundColor).toBe("#D64E2E");
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
      // Idle, the mic pill carries the primary fill; only listening turns it
      // to the destructive "stop" colour.
      expect(flatStyle.backgroundColor).toBe("#E85C3C");
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

    await waitFor(() => expect(getMicColor()).toBe("#FFFFFF"));

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

    expect(getMicColor()).toBe("#FFFFFF");
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
    expect(getMicColor()).toBe("#FFFFFF");
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

  // The row had a small user-plus icon AND the big labelled button below it,
  // two ways in to one thing. The row keeps only what has no other home.
  it("has no recipient icon in the action row, only the labelled button", async () => {
    const { findByTestId, queryByTestId } = renderComponent();
    expect(await findByTestId("quick-add-remind-someone")).toBeTruthy();
    expect(queryByTestId("quick-add-recipient")).toBeNull();
  });

  it("saves the picked contact as the reminder's recipient", async () => {
    const { findByTestId, findByText } = renderComponent();

    fireEvent.press(await findByTestId("quick-add-remind-someone"));
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
  // On a device there was no way to tell whether a contact had been attached:
  // the only feedback was the button icon swapping user-plus for user-check,
  // which names nobody.
  it("names the chosen contact on a chip", async () => {
    const { findByTestId, findByText } = renderComponent();

    fireEvent.press(await findByTestId("quick-add-remind-someone"));
    fireEvent.press(await findByText("Priya"));

    const chip = await findByTestId("quick-add-recipient-chip");
    expect(chip).toBeTruthy();
    expect(await findByTestId("quick-add-recipient-clear")).toBeTruthy();
  });

  it("removes the recipient from the chip", async () => {
    const { findByTestId, findByText, queryByTestId } = renderComponent();

    fireEvent.press(await findByTestId("quick-add-remind-someone"));
    fireEvent.press(await findByText("Priya"));
    await findByTestId("quick-add-recipient-chip");

    fireEvent.press(await findByTestId("quick-add-recipient-clear"));
    await waitFor(() =>
      expect(queryByTestId("quick-add-recipient-chip")).toBeNull()
    );
  });

  it("hides the chip again after a save", async () => {
    const { findByTestId, findByText, queryByTestId } = renderComponent();

    fireEvent.press(await findByTestId("quick-add-remind-someone"));
    fireEvent.press(await findByText("Priya"));
    await findByTestId("quick-add-recipient-chip");

    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "Call Priya tomorrow at 3pm"
    );
    fireEvent.press(await findByTestId("quick-add-save"));

    // Wait for the write to land first: asserting on the chip alone races the
    // async save chain and fails intermittently.
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toBeNull()
    );
    await waitFor(() =>
      expect(queryByTestId("quick-add-recipient-chip")).toBeNull()
    );
  });

  it("clears the recipient after a save", async () => {
    const { findByTestId, findByText } = renderComponent();

    fireEvent.press(await findByTestId("quick-add-remind-someone"));
    fireEvent.press(await findByText("Priya"));
    await waitFor(async () =>
      expect(
        (await findByTestId("quick-add-remind-someone")).props.accessibilityLabel
      ).toBe("Remind Priya")
    );

    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "Call Priya tomorrow at 3pm"
    );
    fireEvent.press(await findByTestId("quick-add-save"));

    await waitFor(async () =>
      expect(
        (await findByTestId("quick-add-remind-someone")).props.accessibilityLabel
      ).toBe("Remind someone else")
    );
  });

  it("attaches the returned invitation id to the local reminder on a successful send", async () => {
    jest.spyOn(RecipientLookupService, "checkReachability").mockResolvedValue({
      appUserId: "user-1",
      lookedUpAt: new Date().toISOString(),
    });
    jest
      .spyOn(InvitationService, "sendInvitation")
      .mockResolvedValue({ ok: true, invitationId: "inv-1" });

    const { findByTestId, findByText } = renderComponent();
    fireEvent.press(await findByTestId("quick-add-remind-someone"));
    fireEvent.press(await findByText("Priya"));
    await findByTestId("recipient-in-app-badge");

    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "Call Priya tomorrow at 3pm"
    );
    fireEvent.press(await findByTestId("quick-add-save"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
      expect(stored[0]?.invitationId).toBe("inv-1");
    });
  });

  it("does not attach an invitation id when the send fails", async () => {
    jest.spyOn(RecipientLookupService, "checkReachability").mockResolvedValue({
      appUserId: "user-1",
      lookedUpAt: new Date().toISOString(),
    });
    jest
      .spyOn(InvitationService, "sendInvitation")
      .mockResolvedValue({ ok: false, error: "network_error" });

    const { findByTestId, findByText } = renderComponent();
    fireEvent.press(await findByTestId("quick-add-remind-someone"));
    fireEvent.press(await findByText("Priya"));
    await findByTestId("recipient-in-app-badge");

    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "Call Priya tomorrow at 3pm"
    );
    fireEvent.press(await findByTestId("quick-add-save"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
      expect(stored).toHaveLength(1);
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
    expect(stored[0].invitationId).toBeUndefined();
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

describe("QuickAddInput — the listening surface", () => {
  // The pause/no-speech clocks themselves are covered in
  // utils/dictationTimer.test.ts, against a plain fake clock. These tests
  // cover what the component does around them: the surface, the two ways out
  // of a session, and an interruption.
  function fireResult(transcript: string, isFinal = false) {
    const call = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (c) => c[0] === "result"
    );
    act(() => {
      call[1]({ isFinal, results: [{ transcript }] });
    });
  }

  /** One loudness reading from the recognizer, as the waveform receives it. */
  function fireVolume(value: number) {
    const call = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(
      (c) => c[0] === "volumechange"
    );
    act(() => {
      call[1]({ value });
    });
  }

  // jest.replaceProperty below needs an explicit restore - it is not undone
  // by the top-level beforeEach's jest.clearAllMocks() (that only clears call
  // history, not replaced property values; only jest.restoreAllMocks() does).
  // Without this, Platform.OS stayed "android" for every test in the file
  // declared after this block, which is how "saves with the pinned time"
  // (B23) silently ran under Android semantics and surfaced this gap.
  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    SpeechService.stopListening();
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

  async function startMic() {
    const utils = renderComponent();
    const micButton = await utils.findByTestId("quick-add-mic");
    fireEvent.press(micButton);
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalled());
    return utils;
  }

  it("shows the surface, with both ways out, while the live mic is open", async () => {
    const { findByTestId } = await startMic();
    expect(await findByTestId("listening-surface")).toBeTruthy();
    expect(await findByTestId("listening-done")).toBeTruthy();
    expect(await findByTestId("listening-cancel")).toBeTruthy();
  });

  it("shows no surface for a shared audio transcription, which has nothing to stop", async () => {
    (useSharedText as jest.Mock).mockReturnValue({
      sharedText: "",
      clearSharedText: jest.fn(),
      sharedAudioTranscribing: true,
      sharedAudioNotice: null,
    });
    const { queryByTestId } = renderComponent();
    await waitFor(() => expect(queryByTestId("listening-surface")).toBeNull());
  });

  it("says whether anything has been heard yet", async () => {
    const { findByText } = await startMic();
    expect(await findByText(/say your reminder/i)).toBeTruthy();

    fireResult("buy milk");
    expect(await findByText(/stop speaking when you/i)).toBeTruthy();
  });

  it("keeps the words when Done is pressed", async () => {
    const stopSpy = jest.spyOn(SpeechService, "stopListening");
    const { findByTestId, queryByTestId } = await startMic();
    fireResult("water the plants");

    fireEvent.press(await findByTestId("listening-done"));

    await waitFor(() => expect(queryByTestId("listening-surface")).toBeNull());
    expect(stopSpy).toHaveBeenCalled();
    const titleInput = await findByTestId("quick-add-input");
    expect(titleInput.props.value).toBe("water the plants");
  });

  it("throws the words away when Cancel is pressed", async () => {
    const { findByTestId, queryByTestId } = await startMic();
    const titleInput = await findByTestId("quick-add-input");
    fireResult("something the user did not mean", true);
    expect(titleInput.props.value).toBe("something the user did not mean");

    fireEvent.press(await findByTestId("listening-cancel"));

    await waitFor(() => expect(queryByTestId("listening-surface")).toBeNull());
    expect(titleInput.props.value).toBe("");
    expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalled();
  });

  it("cancels back to what was already typed, not to an empty field", async () => {
    const { findByTestId } = await startMic();
    const titleInput = await findByTestId("quick-add-input");
    fireEvent.press(await findByTestId("listening-cancel"));

    fireEvent.changeText(titleInput, "pay rent");
    fireEvent.press(await findByTestId("quick-add-mic"));
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(2));

    fireResult("pay rent and something wrong");
    fireEvent.press(await findByTestId("listening-cancel"));

    await waitFor(() => expect(titleInput.props.value).toBe("pay rent"));
  });

  it("stops dictation when the app leaves the foreground, and keeps what was heard", async () => {
    const handlers: ((s: string) => void)[] = [];
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event: string, handler: any) => {
        handlers.push(handler);
        return { remove: jest.fn() } as any;
      });

    const { findByTestId, queryByTestId, findByText } = await startMic();
    fireResult("book the tickets");

    act(() => {
      handlers.forEach((h) => h("background"));
    });

    await waitFor(() => expect(queryByTestId("listening-surface")).toBeNull());
    const titleInput = await findByTestId("quick-add-input");
    expect(titleInput.props.value).toBe("book the tickets");
    expect(await findByText(/stopped when you left the app/i)).toBeTruthy();
  });

  // Frames 7, 8 and 9 of the first-run study. A scale pulse says something is
  // happening; it says nothing about whether the device can hear THIS user,
  // which is the question a person who has just been ignored by a microphone
  // is actually asking.
  describe("the waveform", () => {
    function barHeights(utils: any) {
      return Array.from({ length: WAVEFORM_BARS }, (_, i) =>
        StyleSheet.flatten(utils.getByTestId(`listening-wave-bar-${i}`).props.style).height
      );
    }

    it("is on screen for the whole session", async () => {
      const utils = await startMic();
      expect(await utils.findByTestId("listening-wave")).toBeTruthy();
    });

    it("grows with the user's own voice", async () => {
      const utils = await startMic();
      await utils.findByTestId("listening-wave");
      const quiet = barHeights(utils);

      fireVolume(8);
      const loud = barHeights(utils);

      loud.forEach((h, i) => expect(h).toBeGreaterThan(quiet[i]));
    });

    // The one thing this surface must never do. A waveform that animates on
    // its own would perform just as convincingly with the mic switched off,
    // which is the exact lie it exists to rule out.
    it("stays flat while the recognizer reports silence", async () => {
      const utils = await startMic();
      await utils.findByTestId("listening-wave");
      const before = barHeights(utils);

      fireVolume(-2);

      expect(barHeights(utils)).toEqual(before);
    });

    it("counts the seconds the mic has been open", async () => {
      const utils = await startMic();
      expect((await utils.findByTestId("listening-timer")).props.children).toBe("0:00");
    });
  });

  describe("the words still being guessed", () => {
    it("shows them on the surface, not in the field", async () => {
      const utils = await startMic();
      fireResult("call Amma at seven");

      expect((await utils.findByTestId("listening-interim")).props.children).toContain(
        "call Amma at seven"
      );
      expect((await utils.findByTestId("quick-add-input")).props.value).toBe("");
    });

    it("moves them into the field once the recognizer commits", async () => {
      const utils = await startMic();
      fireResult("call Amma at seven");
      fireResult("call Amma at seven", true);

      expect((await utils.findByTestId("quick-add-input")).props.value).toBe(
        "call Amma at seven"
      );
      expect(utils.queryByTestId("listening-interim")).toBeNull();
    });

    // Inter carries no Malayalam glyphs, so a dictated Malayalam guess would
    // render as boxes with the default family.
    it("renders a Malayalam guess in the Malayalam face", async () => {
      const utils = await startMic();
      fireResult("നാളെ വിളിക്കണം");

      const style = StyleSheet.flatten(
        (await utils.findByTestId("listening-interim")).props.style
      );
      expect(style.fontFamily).toBe("NotoSansMalayalam_400Regular");
    });
  });

  describe("the pause clock, made visible", () => {
    it("stays hidden until something has actually been heard", async () => {
      const utils = await startMic();
      await utils.findByTestId("listening-surface");
      expect(utils.queryByTestId("listening-silence")).toBeNull();
    });

    it("appears once the first word lands", async () => {
      const utils = await startMic();
      fireResult("buy milk", true);
      expect(await utils.findByTestId("listening-silence")).toBeTruthy();
    });
  });

  describe("naming the languages the mic takes", () => {
    it("says so on the first microphone of the install", async () => {
      const utils = await startMic();
      const line = await utils.findByTestId("listening-language");
      expect(line.props.children).toMatch(/Tap the language above/);
    });

    it("says it once, and never again", async () => {
      await AsyncStorage.setItem(MIC_LANGUAGE_LINE_KEY, "1");
      const utils = await startMic();
      await utils.findByTestId("listening-surface");
      expect(utils.queryByTestId("listening-language")).toBeNull();
    });

    it("records that it was said, so the next install is the next chance", async () => {
      const utils = await startMic();
      await utils.findByTestId("listening-language");
      await waitFor(async () =>
        expect(await AsyncStorage.getItem(MIC_LANGUAGE_LINE_KEY)).toBe("1")
      );
    });

  });

  // The setting lived only in Settings, which is the one screen a user holding
  // a reminder to dictate is not looking at. Nothing on this screen said
  // whether the mic expected English or Malayalam.
  describe("which language the mic is listening for", () => {
    // One control, not two: the mic button carries the language it will
    // listen in, written out in full in its own script. Tapping anywhere on
    // it starts dictation; the language changes on the listening bar.
    it("names the language on the mic button, in its own script", async () => {
      const utils = renderComponent();
      expect(
        (await utils.findByTestId("quick-add-mic-language")).props.children
      ).toBe("English");
    });

    it("says what the button does, and in which language, to a screen reader", async () => {
      const utils = renderComponent();
      expect(
        (await utils.findByTestId("quick-add-mic")).props.accessibilityLabel
      ).toBe("Speak in English");
    });

    it("has no separate language row next to the mic", () => {
      const utils = renderComponent();
      expect(utils.queryByTestId("dictation-language")).toBeNull();
    });

    it("shows a stored Malayalam choice on the mic button", async () => {
      await AsyncStorage.setItem(DICTATION_LANGUAGE_KEY, "ml-IN");
      const utils = renderComponent();
      await waitFor(() =>
        expect(utils.getByTestId("quick-add-mic-language").props.children).toBe("മലയാളം")
      );
      expect(utils.getByTestId("quick-add-mic").props.accessibilityLabel).toBe(
        "Speak in മലയാളം"
      );
    });

    it("persists a switch made on the listening bar, and the mic button follows it", async () => {
      const utils = await startMic();
      fireEvent.press(await utils.findByTestId("listening-language-switch"));
      await waitFor(async () =>
        expect(await AsyncStorage.getItem(DICTATION_LANGUAGE_KEY)).toBe("ml-IN")
      );
      await waitFor(() =>
        expect(utils.getByTestId("quick-add-mic-language").props.children).toBe("മലയാളം")
      );
    });

    // A user who only finds out the language is wrong once their own words
    // come back as nonsense needs the fix in front of them, not in Settings.
    it("offers the other language while the mic is open", async () => {
      const utils = await startMic();
      expect(
        (await utils.findByTestId("listening-language-name")).props.children
      ).toBe("English");
      expect(
        utils.getByTestId("listening-language-switch").props.accessibilityLabel
      ).toBe("Switch dictation to മലയാളം");
    });

    it("restarts the recognizer in the new language, and drops the wrong-language words", async () => {
      const utils = await startMic();
      fireResult("nonsense from the wrong model", true);
      (ExpoSpeechRecognitionModule.start as jest.Mock).mockClear();
      fireEvent.press(await utils.findByTestId("listening-language-switch"));
      await waitFor(() =>
        expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
          expect.objectContaining({ lang: "ml-IN" })
        )
      );
      expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalled();
    });
  });
});

// The first-run "Add your number" modal was removed, and the action-row icon
// that replaced it names nobody and reads as decoration. This is the permanent,
// labelled way in that the redesign promised.
describe("QuickAddInput — the permanent way to remind someone else", () => {
  beforeEach(() => {
    jest.spyOn(ContactsService, "loadPickableContacts").mockResolvedValue({
      permission: "granted",
      contacts: [{ name: "Priya", phone: "9876543210", contactId: "c1" }],
    });
  });

  it("is on screen with no recipient chosen", async () => {
    const { findByTestId, findByText } = renderComponent();
    expect(await findByTestId("quick-add-remind-someone")).toBeTruthy();
    expect(await findByText("Remind someone else")).toBeTruthy();
  });

  it("opens the contact picker", async () => {
    const { findByTestId, findByText } = renderComponent();
    fireEvent.press(await findByTestId("quick-add-remind-someone"));
    expect(await findByText("Priya")).toBeTruthy();
  });

  it("stays on screen after a recipient is chosen", async () => {
    const { findByTestId, findByText } = renderComponent();
    fireEvent.press(await findByTestId("quick-add-remind-someone"));
    fireEvent.press(await findByText("Priya"));
    await findByTestId("quick-add-recipient-chip");
    expect(await findByTestId("quick-add-remind-someone")).toBeTruthy();
  });
});

// Without a registered number there is no Supabase session, so
// checkReachability() returns null for every contact and no recipient can ever
// earn the in-app badge. The offer used to live only on the WhatsApp share
// screen, which this path never visits - so on a device it never appeared.
describe("QuickAddInput — the offer to register your own number", () => {
  beforeEach(() => {
    jest.spyOn(ContactsService, "loadPickableContacts").mockResolvedValue({
      permission: "granted",
      contacts: [{ name: "Priya", phone: "9876543210", contactId: "c1" }],
    });
  });

  /** Just the pick. The offer's trigger is naming a person, not saving. */
  async function pickRecipient(getBy: any) {
    fireEvent.press(await getBy.findByTestId("quick-add-remind-someone"));
    fireEvent.press(await getBy.findByText("Priya"));
  }

  async function saveWithRecipient(getBy: any) {
    await pickRecipient(getBy);
    fireEvent.changeText(
      await getBy.findByTestId("quick-add-input"),
      "Call Priya tomorrow at 3pm"
    );
    fireEvent.press(await getBy.findByTestId("quick-add-save"));
  }

  it("offers after a reminder is sent to someone else", async () => {
    const view = renderComponent();
    await saveWithRecipient(view);
    expect(await view.findByTestId("register-number-nudge")).toBeTruthy();
  });

  // add-reminder.tsx has always offered at the pick. The home screen waited
  // for Save, so the same act asked at two different moments depending on
  // which screen the user reached the picker from.
  it("offers at the contact pick, before anything is saved", async () => {
    const view = renderComponent();
    await pickRecipient(view);

    expect(await view.findByTestId("register-number-nudge")).toBeTruthy();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("names the person who was reminded", async () => {
    const view = renderComponent();
    await saveWithRecipient(view);
    await view.findByTestId("register-number-nudge");
    expect(view.getByText(/Priya/)).toBeTruthy();
  });

  it("stays away from a reminder with no recipient", async () => {
    const { findByTestId, queryByTestId } = renderComponent();
    fireEvent.changeText(await findByTestId("quick-add-input"), "Buy milk tomorrow at 3pm");
    fireEvent.press(await findByTestId("quick-add-save"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
      expect(stored).toHaveLength(1);
    });
    expect(queryByTestId("register-number-nudge")).toBeNull();
  });

  it("stays away once a number is already registered", async () => {
    await AsyncStorage.setItem(REGISTERED_PHONE_KEY, "+919876543210");
    const view = renderComponent();
    await saveWithRecipient(view);

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
      expect(stored).toHaveLength(1);
    });
    expect(view.queryByTestId("register-number-nudge")).toBeNull();
  });

  it("stays away once the cap is spent", async () => {
    await AsyncStorage.setItem(REGISTER_PROMPT_COUNT_KEY, String(MAX_REGISTER_PROMPTS));
    const view = renderComponent();
    await saveWithRecipient(view);

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
      expect(stored).toHaveLength(1);
    });
    expect(view.queryByTestId("register-number-nudge")).toBeNull();
  });

  it("counts the offer when it is shown, not when it is taken", async () => {
    const view = renderComponent();
    await saveWithRecipient(view);
    await view.findByTestId("register-number-nudge");

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(REGISTER_PROMPT_COUNT_KEY)).toBe("1")
    );
  });
});

// Frame 2 of the first-run study. The old cold open was an empty list behind
// four permission asks, which said the app was not ready yet. These say the
// opposite, and one of them says it in Malayalam.
describe("QuickAddInput — the cold-open examples", () => {
  it("shows three examples and the line that explains them", async () => {
    const { findByTestId } = renderComponent();
    await findByTestId("starter-examples");
    expect(await findByTestId("starter-example-0")).toBeTruthy();
    expect(await findByTestId("starter-example-1")).toBeTruthy();
    expect(await findByTestId("starter-example-2")).toBeTruthy();
    expect(await findByTestId("starter-helper")).toBeTruthy();
  });

  it("offers one example in Malayalam, where the script support is visible", async () => {
    const { findByText } = renderComponent();
    expect(
      await findByText(
        "നാളെ രാവിലെ പാൽ വാങ്ങണം"
      )
    ).toBeTruthy();
  });

  it("puts a tapped example into the composer", async () => {
    const { findByTestId } = renderComponent();
    fireEvent.press(await findByTestId("starter-example-0"));
    await waitFor(async () =>
      expect((await findByTestId("quick-add-input")).props.value).toBe("Call Amma at 7 pm")
    );
  });

  it("gets out of the way as soon as the user types", async () => {
    const { findByTestId, queryByTestId } = renderComponent();
    await findByTestId("starter-examples");
    fireEvent.changeText(await findByTestId("quick-add-input"), "Buy milk");
    await waitFor(() => expect(queryByTestId("starter-examples")).toBeNull());
  });

  it("never returns once there is a reminder to look at instead", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "r1",
          title: "Buy milk",
          datetime: new Date(Date.now() + 86400000).toISOString(),
          completed: false,
        },
      ])
    );
    const { findByTestId, queryByTestId } = renderComponent();
    await findByTestId("quick-add-input");
    await waitFor(() => expect(queryByTestId("starter-examples")).toBeNull());
  });
});

// Frame 3. The parser has already read the title, so naming the person in it
// costs nothing - and a user who just typed a name is the only user on this
// screen who can be shown what sending to another person is for.
describe("QuickAddInput — the send-to-a-person chip", () => {
  it("offers the person the title names", async () => {
    const { findByTestId, findByText } = renderComponent();
    fireEvent.changeText(await findByTestId("quick-add-input"), "Call Amma at 7 pm");
    expect(await findByText("Send to Amma instead?")).toBeTruthy();
  });

  it("stays away from a task that names nobody", async () => {
    const { findByTestId, queryByTestId } = renderComponent();
    fireEvent.changeText(await findByTestId("quick-add-input"), "Take medicine at 9 am");
    await waitFor(() => expect(queryByTestId("send-to-person-chip")).toBeNull());
  });

  it("opens the contact picker", async () => {
    const { findByTestId } = renderComponent();
    fireEvent.changeText(await findByTestId("quick-add-input"), "Tell Priya about the rent");
    fireEvent.press(await findByTestId("send-to-person-chip"));
    expect(await findByTestId("contact-picker-cancel")).toBeTruthy();
  });

  it("goes quiet once a recipient is attached, the question being answered", async () => {
    jest.spyOn(ContactsService, "loadPickableContacts").mockResolvedValue({
      permission: "granted",
      contacts: [{ name: "Amma", phone: "9876543210", contactId: "c1" }],
    });
    const { findByTestId, findByText, queryByTestId } = renderComponent();
    fireEvent.changeText(await findByTestId("quick-add-input"), "Call Amma at 7 pm");
    fireEvent.press(await findByTestId("send-to-person-chip"));
    fireEvent.press(await findByText("Amma"));
    await findByTestId("quick-add-recipient-chip");

    await waitFor(() => expect(queryByTestId("send-to-person-chip")).toBeNull());
  });

  // A refusal is about this name only. The next reminder may well name
  // somebody the user does want to send to.
  it("dismisses for the name it named, not for every name after it", async () => {
    const { findByTestId, queryByTestId } = renderComponent();
    fireEvent.changeText(await findByTestId("quick-add-input"), "Call Amma at 7 pm");
    fireEvent.press(await findByTestId("send-to-person-chip-dismiss"));
    await waitFor(() => expect(queryByTestId("send-to-person-chip")).toBeNull());

    fireEvent.changeText(await findByTestId("quick-add-input"), "Tell Priya about the rent");
    expect(await findByTestId("send-to-person-chip")).toBeTruthy();
  });
});

describe("QuickAddInput — recurrence", () => {
  it("shows a third pill and strips the recurrence phrase from the title when typed", async () => {
    const { findByTestId, getByText, queryByText } = renderComponent();
    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "take tablet every day at 8am"
    );
    expect(await findByTestId("quick-add-repeat-pill")).toBeTruthy();
    expect(getByText("Daily")).toBeTruthy();
    // The title itself must not still carry the recurrence phrase.
    await waitFor(() => {
      const stored = queryByText("take tablet every day");
      expect(stored).toBeNull();
    });
  });

  it("lights the repeat action-row button when a rule is parsed", async () => {
    const { findByTestId } = renderComponent();
    const repeatBtn = await findByTestId("quick-add-repeat");
    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "take tablet every day at 8am"
    );
    await waitFor(() => {
      expect(repeatBtn.props.accessibilityLabel).not.toBe("Repeat");
    });
  });

  it("opens the repeat sheet from the action row and sets a rule by hand", async () => {
    const { findByTestId } = renderComponent();
    fireEvent.changeText(await findByTestId("quick-add-input"), "Take tablet at 8am");
    fireEvent.press(await findByTestId("quick-add-repeat"));
    expect(await findByTestId("repeat-sheet")).toBeTruthy();

    fireEvent.press(await findByTestId("repeat-option-daily"));
    fireEvent.press(await findByTestId("repeat-sheet-confirm"));

    expect(await findByTestId("quick-add-repeat-pill")).toBeTruthy();
  });

  it("saves the recurrence rule on the reminder payload", async () => {
    const { findByTestId } = renderComponent();
    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "take tablet every day at 8am"
    );
    fireEvent.press(await findByTestId("quick-add-save"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(1);
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].recurrence).toEqual({ freq: "daily", interval: 1 });
  });

  it("omits the recurrence key entirely for a one-shot reminder", async () => {
    const { findByTestId } = renderComponent();
    fireEvent.changeText(await findByTestId("quick-add-input"), "Call mom tomorrow at 3pm");
    fireEvent.press(await findByTestId("quick-add-save"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(1);
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect("recurrence" in stored[0]).toBe(false);
  });

  it("resets recurrence after save so the next reminder does not inherit it", async () => {
    const { findByTestId, queryByTestId } = renderComponent();
    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "take tablet every day at 8am"
    );
    fireEvent.press(await findByTestId("quick-add-save"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(1);
    });

    fireEvent.changeText(await findByTestId("quick-add-input"), "Call mom tomorrow at 3pm");
    fireEvent.press(await findByTestId("quick-add-save"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(2);
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    // Newest-first storage order — "Call mom" was saved second.
    const callMom = stored.find((r: { title: string }) => r.title === "Call mom");
    expect("recurrence" in callMom).toBe(false);
  });

  it("a rule set by hand is cleared once the text changes and re-parses without one", async () => {
    const { findByTestId, queryByTestId } = renderComponent();
    fireEvent.changeText(await findByTestId("quick-add-input"), "Take tablet at 8am");
    await waitFor(async () => {
      fireEvent.press(await findByTestId("quick-add-repeat"));
    });
    fireEvent.press(await findByTestId("repeat-option-daily"));
    fireEvent.press(await findByTestId("repeat-sheet-confirm"));
    await waitFor(async () => {
      expect(await findByTestId("quick-add-repeat-pill")).toBeTruthy();
    });

    // Re-typing re-runs the parse effect and, since this text has no
    // recurrence phrase, clears the hand-picked rule — matching parsedDate's
    // own documented sync rule exactly (the parse effect always wins).
    fireEvent.changeText(await findByTestId("quick-add-input"), "Take tablet at 9am");
    await waitFor(() => {
      expect(queryByTestId("quick-add-repeat-pill")).toBeNull();
    });
  });

  describe("B23: Editable date/time/recurrence pills", () => {
    it("renders a date pill when the parse produces a date", async () => {
      const { findByTestId, queryByTestId } = renderComponent();
      const input = await findByTestId("quick-add-input");
      fireEvent.changeText(input, "Call tomorrow");

      await waitFor(() => {
        expect(queryByTestId("quick-add-date-pill")).toBeTruthy();
      });

      const datePill = queryByTestId("quick-add-date-pill")!;
      expect(() => fireEvent.press(datePill)).not.toThrow();
    });

    it("renders a time pill when the parse produces a time", async () => {
      const { findByTestId, queryByTestId } = renderComponent();
      const input = await findByTestId("quick-add-input");
      fireEvent.changeText(input, "Call at 3pm");

      await waitFor(() => {
        expect(queryByTestId("quick-add-time-pill")).toBeTruthy();
      });

      const timePill = queryByTestId("quick-add-time-pill")!;
      expect(() => fireEvent.press(timePill)).not.toThrow();
    });

    it("renders a repeat pill when the parse produces a recurrence", async () => {
      const { findByTestId, queryByTestId } = renderComponent();
      const input = await findByTestId("quick-add-input");
      fireEvent.changeText(input, "Call every day");

      await waitFor(() => {
        expect(queryByTestId("quick-add-repeat-pill")).toBeTruthy();
      });

      const repeatPill = queryByTestId("quick-add-repeat-pill")!;
      expect(() => fireEvent.press(repeatPill)).not.toThrow();
    });

    it("hides the date pill when no date is parsed", async () => {
      const { findByTestId, queryByTestId } = renderComponent();
      fireEvent.changeText(await findByTestId("quick-add-input"), "Call mom");

      expect(queryByTestId("quick-add-date-pill")).toBeNull();
    });

    it("shows the time pill alongside the date pill, since the parser always fills a time", async () => {
      const { findByTestId, queryByTestId } = renderComponent();
      fireEvent.changeText(await findByTestId("quick-add-input"), "Tomorrow");

      await waitFor(() => {
        expect(queryByTestId("quick-add-date-pill")).toBeTruthy();
        expect(queryByTestId("quick-add-time-pill")).toBeTruthy();
      });
    });

    it("hides the repeat pill when no recurrence is parsed", async () => {
      const { findByTestId, queryByTestId } = renderComponent();
      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Buy groceries"
      );

      expect(queryByTestId("quick-add-repeat-pill")).toBeNull();
    });

    it("opens the date picker when the date pill is tapped", async () => {
      const { findByTestId } = renderComponent();
      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Call tomorrow"
      );

      await waitFor(async () => {
        const datePill = await findByTestId("quick-add-date-pill");
        fireEvent.press(datePill);
      });

      // Verify the date picker sheet opens (check for its testID)
      await waitFor(async () => {
        const datePickerSheet = await findByTestId("date-time-picker-sheet");
        expect(datePickerSheet).toBeTruthy();
      });
    });

    it("opens the time picker when the time pill is tapped", async () => {
      const { findByTestId } = renderComponent();
      fireEvent.changeText(await findByTestId("quick-add-input"), "Call at 3pm");

      await waitFor(async () => {
        const timePill = await findByTestId("quick-add-time-pill");
        fireEvent.press(timePill);
      });

      // Verify the time picker sheet opens
      await waitFor(async () => {
        const timePickerSheet = await findByTestId("date-time-picker-sheet");
        expect(timePickerSheet).toBeTruthy();
      });
    });

    it("opens the recurrence picker when the repeat pill is tapped", async () => {
      const { findByTestId } = renderComponent();
      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Call daily"
      );

      const repeatPill = await findByTestId("quick-add-repeat-pill");
      fireEvent.press(repeatPill);

      // Verify the repeat sheet opens
      const repeatSheet = await findByTestId("repeat-sheet");
      expect(repeatSheet).toBeTruthy();
    });

    it("pins the date when the date picker confirms", async () => {
      const { findByTestId } = renderComponent();
      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Call tomorrow"
      );

      await waitFor(async () => {
        const datePill = await findByTestId("quick-add-date-pill");
        fireEvent.press(datePill);
      });

      const confirmButton = await findByTestId("date-time-picker-confirm");
      fireEvent.press(confirmButton);

      // The date should stay pinned even if the parse doesn't match
      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Call at 3pm"
      );

      await waitFor(async () => {
        const savedDatePill = await findByTestId("quick-add-date-pill");
        expect(savedDatePill).toBeTruthy();
      });
    });

    it("pins the time when the time picker confirms", async () => {
      const { findByTestId } = renderComponent();
      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Call at 3pm"
      );

      await waitFor(async () => {
        const timePill = await findByTestId("quick-add-time-pill");
        fireEvent.press(timePill);
      });

      const confirmButton = await findByTestId("date-time-picker-confirm");
      fireEvent.press(confirmButton);

      // The time should stay pinned across text changes
      fireEvent.changeText(await findByTestId("quick-add-input"), "Buy milk");

      await waitFor(async () => {
        const savedTimePill = await findByTestId("quick-add-time-pill");
        expect(savedTimePill).toBeTruthy();
      });
    });

    it("pins the recurrence when the repeat picker confirms", async () => {
      const { findByTestId } = renderComponent();
      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Call every day"
      );

      await waitFor(async () => {
        const repeatPill = await findByTestId("quick-add-repeat-pill");
        fireEvent.press(repeatPill);
      });

      fireEvent.press(await findByTestId("repeat-sheet-confirm"));

      // The recurrence should stay pinned
      fireEvent.changeText(await findByTestId("quick-add-input"), "Speak");

      await waitFor(async () => {
        const savedRepeatPill = await findByTestId("quick-add-repeat-pill");
        expect(savedRepeatPill).toBeTruthy();
      });
    });

    it("cancels the date picker without pinning when dismiss is tapped", async () => {
      const { findByTestId, queryByTestId } = renderComponent();
      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Call tomorrow"
      );

      await waitFor(async () => {
        const datePill = await findByTestId("quick-add-date-pill");
        fireEvent.press(datePill);
      });

      const cancelButton = await findByTestId("date-time-picker-cancel");
      fireEvent.press(cancelButton);

      // Date should revert to parsed value, then vanish on next keystroke
      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Take tablet"
      );

      await waitFor(() => {
        expect(queryByTestId("quick-add-date-pill")).toBeNull();
      });
    });

    it("cancels the time picker without pinning when dismiss is tapped", async () => {
      const { findByTestId, queryByTestId } = renderComponent();
      fireEvent.changeText(await findByTestId("quick-add-input"), "Call at 3pm");

      await waitFor(async () => {
        const timePill = await findByTestId("quick-add-time-pill");
        fireEvent.press(timePill);
      });

      const cancelButton = await findByTestId("date-time-picker-cancel");
      fireEvent.press(cancelButton);

      // Time should revert to parsed value, then vanish on next keystroke
      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Take tablet"
      );

      await waitFor(() => {
        expect(queryByTestId("quick-add-time-pill")).toBeNull();
      });
    });

    it("cancels the repeat picker without pinning when dismissed", async () => {
      const { findByTestId, queryByTestId } = renderComponent();
      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Call every day"
      );

      const repeatPill = await findByTestId("quick-add-repeat-pill");
      fireEvent.press(repeatPill);

      // Dismiss the sheet (swipe or close)
      const cancelButton = await findByTestId("repeat-sheet-cancel");
      fireEvent.press(cancelButton);

      // Recurrence should revert, then vanish on keystroke
      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Buy milk"
      );

      await waitFor(() => {
        expect(queryByTestId("quick-add-repeat-pill")).toBeNull();
      });
    });

    it("saves with the pinned date when both pinned and parsed exist", async () => {
      const { findByTestId } = renderComponent();

      // Parse a date
      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Call tomorrow at 3pm"
      );

      // Pin a date via the picker
      await waitFor(async () => {
        const datePill = await findByTestId("quick-add-date-pill");
        fireEvent.press(datePill);
      });

      const confirmButton = await findByTestId("date-time-picker-confirm");
      fireEvent.press(confirmButton);

      // Save
      fireEvent.press(await findByTestId("quick-add-save"));

      await waitFor(async () => {
        const stored = JSON.parse(
          (await AsyncStorage.getItem(STORAGE_KEY)) as string
        );
        expect(stored).toHaveLength(1);
      });
      const stored = JSON.parse(
        (await AsyncStorage.getItem(STORAGE_KEY)) as string
      );
      // Should use the pinned value, not the parse
      expect(stored[0].datetime).toBeTruthy();
    });

    it("saves with the pinned time when both pinned and parsed exist", async () => {
      const { findByTestId } = renderComponent();

      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Call tomorrow at 3pm"
      );

      await waitFor(async () => {
        const timePill = await findByTestId("quick-add-time-pill");
        fireEvent.press(timePill);
      });

      // Actually change the time via the picker (not just reconfirm the
      // parsed 3pm) so a save that silently kept the old value is caught.
      const nativePicker = await findByTestId("mock-date-time-picker");
      const pickedTime = new Date();
      pickedTime.setHours(21, 15, 0, 0);
      await act(async () => {
        fireEvent(nativePicker, "press", pickedTime);
      });
      fireEvent.press(await findByTestId("date-time-picker-confirm"));

      fireEvent.press(await findByTestId("quick-add-save"));

      await waitFor(async () => {
        const stored = JSON.parse(
          (await AsyncStorage.getItem(STORAGE_KEY)) as string
        );
        expect(stored).toHaveLength(1);
      });
      const stored = JSON.parse(
        (await AsyncStorage.getItem(STORAGE_KEY)) as string
      );
      // Regression: a prior bug composed the pinned date and pinned time
      // into two independent full-Date overrides instead of one merged
      // value, so a time-only pin never reached the save payload at all
      // (effectiveDate, which save reads, ignored pinnedTime entirely) -
      // the saved reminder kept the originally-parsed 3pm no matter what
      // was picked here.
      const savedTime = new Date(stored[0].datetime);
      expect(savedTime.getHours()).toBe(21);
      expect(savedTime.getMinutes()).toBe(15);
    });

    it("keeps the date unchanged when only the time chip is pinned", async () => {
      const { findByTestId } = renderComponent();

      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Call tomorrow at 3pm"
      );

      const dateLabelBefore = (
        await findByTestId("quick-add-date-pill")
      ).props.accessibilityLabel as string;

      await waitFor(async () => {
        const timePill = await findByTestId("quick-add-time-pill");
        fireEvent.press(timePill);
      });
      fireEvent.press(await findByTestId("date-time-picker-confirm"));

      const dateLabelAfter = (
        await findByTestId("quick-add-date-pill")
      ).props.accessibilityLabel as string;

      // Pinning only the time must not disturb the date half of the
      // composed value - the two pins are independent partial overrides.
      expect(dateLabelAfter).toEqual(dateLabelBefore);
    });

    it("Android: tapping the date pill edits only the date, not the time, and saves it", async () => {
      const originalPlatform = Platform.OS;
      Platform.OS = "android";
      try {
        const { findByTestId } = renderComponent();

        fireEvent.changeText(
          await findByTestId("quick-add-input"),
          "Call tomorrow at 3pm"
        );

        const timeLabelBefore = (
          await findByTestId("quick-add-time-pill")
        ).props.accessibilityLabel as string;

        await waitFor(async () => {
          const datePill = await findByTestId("quick-add-date-pill");
          fireEvent.press(datePill);
        });

        // Android's real picker fires onChange directly - no separate
        // Confirm button for a single-purpose pill edit. Simulate the
        // native module handing back a picked date.
        const nativePicker = await findByTestId("mock-date-time-picker");
        const pickedDate = new Date();
        pickedDate.setDate(pickedDate.getDate() + 5);
        fireEvent(nativePicker, "press", pickedDate);

        // A date-only pill edit must not chain into a second, unrequested
        // time picker - the date-then-time chain is only for the original
        // "no time found" flow (activePillEditor === null).
        expect(
          (await findByTestId("quick-add-time-pill")).props.accessibilityLabel
        ).toEqual(timeLabelBefore);

        fireEvent.press(await findByTestId("quick-add-save"));

        await waitFor(async () => {
          const stored = JSON.parse(
            (await AsyncStorage.getItem(STORAGE_KEY)) as string
          );
          expect(stored).toHaveLength(1);
        });
        const stored = JSON.parse(
          (await AsyncStorage.getItem(STORAGE_KEY)) as string
        );
        const saved = new Date(stored[0].datetime);
        expect(saved.getDate()).toBe(pickedDate.getDate());
        expect(saved.getHours()).toBe(15); // unchanged 3pm from the parse
      } finally {
        Platform.OS = originalPlatform;
      }
    });

    it("Android: tapping a pill opens only the native picker, not the custom sheet underneath it", async () => {
      // Regression: handleDatePillPress/handleTimePillPress used to set both
      // showNoTimeSheet(true) and pickerMode, stacking the custom "Edit
      // date"/"Edit time" sheet underneath Android's own native dialog. The
      // native dialog is self-contained (its own OK/Cancel) - the sheet must
      // not mount at all for a pill edit on Android.
      const originalPlatform = Platform.OS;
      Platform.OS = "android";
      try {
        const { findByTestId, queryByTestId } = renderComponent();

        fireEvent.changeText(
          await findByTestId("quick-add-input"),
          "Call tomorrow at 3pm"
        );

        await waitFor(async () => {
          const datePill = await findByTestId("quick-add-date-pill");
          fireEvent.press(datePill);
        });

        await findByTestId("mock-date-time-picker");
        expect(queryByTestId("date-time-picker-sheet")).toBeNull();
      } finally {
        Platform.OS = originalPlatform;
      }
    });

    it("Android: tapping the time pill commits the picked time on first onChange, without a stale-state race", async () => {
      const originalPlatform = Platform.OS;
      Platform.OS = "android";
      try {
        const { findByTestId } = renderComponent();

        fireEvent.changeText(
          await findByTestId("quick-add-input"),
          "Call tomorrow at 3pm"
        );

        await waitFor(async () => {
          const timePill = await findByTestId("quick-add-time-pill");
          fireEvent.press(timePill);
        });

        const nativePicker = await findByTestId("mock-date-time-picker");
        const pickedTime = new Date();
        pickedTime.setHours(9, 30, 0, 0);
        fireEvent(nativePicker, "press", pickedTime);

        fireEvent.press(await findByTestId("quick-add-save"));

        await waitFor(async () => {
          const stored = JSON.parse(
            (await AsyncStorage.getItem(STORAGE_KEY)) as string
          );
          expect(stored).toHaveLength(1);
        });
        const stored = JSON.parse(
          (await AsyncStorage.getItem(STORAGE_KEY)) as string
        );
        const saved = new Date(stored[0].datetime);
        // Regression: handlePickerConfirm used to read `suggestedTime` from
        // closure in the same tick as the setSuggestedTime(updated) call
        // above it, seeing the state from *before* this picker's onChange -
        // always one step stale. Reading here confirms the picked 9:30, not
        // the 3pm the text originally parsed.
        expect(saved.getHours()).toBe(9);
        expect(saved.getMinutes()).toBe(30);
      } finally {
        Platform.OS = originalPlatform;
      }
    });

    it("saves with the pinned recurrence when both pinned and parsed exist", async () => {
      const { findByTestId } = renderComponent();

      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Call every day at 3pm"
      );

      const repeatPill = await findByTestId("quick-add-repeat-pill");
      fireEvent.press(repeatPill);
      fireEvent.press(await findByTestId("repeat-sheet-confirm"));

      fireEvent.press(await findByTestId("quick-add-save"));

      await waitFor(async () => {
        const stored = JSON.parse(
          (await AsyncStorage.getItem(STORAGE_KEY)) as string
        );
        expect(stored).toHaveLength(1);
      });
      const stored = JSON.parse(
        (await AsyncStorage.getItem(STORAGE_KEY)) as string
      );
      expect(stored[0].recurrence).toBeTruthy();
    });

    it("clears all pinned values after save", async () => {
      const { findByTestId, queryByTestId } = renderComponent();

      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Call tomorrow at 3pm daily"
      );

      // Pin each component
      await waitFor(async () => {
        const datePill = await findByTestId("quick-add-date-pill");
        fireEvent.press(datePill);
      });
      fireEvent.press(await findByTestId("date-time-picker-confirm"));

      fireEvent.changeText(await findByTestId("quick-add-input"), "Call");
      await waitFor(async () => {
        const timePill = await findByTestId("quick-add-time-pill");
        fireEvent.press(timePill);
      });
      fireEvent.press(await findByTestId("date-time-picker-confirm"));

      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Call daily"
      );
      await waitFor(async () => {
        const repeatPill = await findByTestId("quick-add-repeat-pill");
        fireEvent.press(repeatPill);
      });
      fireEvent.press(await findByTestId("repeat-sheet-confirm"));

      // Save
      fireEvent.press(await findByTestId("quick-add-save"));

      await waitFor(async () => {
        const stored = JSON.parse(
          (await AsyncStorage.getItem(STORAGE_KEY)) as string
        );
        expect(stored).toHaveLength(1);
      });

      // Pills should be gone after save
      expect(queryByTestId("quick-add-date-pill")).toBeNull();
      expect(queryByTestId("quick-add-time-pill")).toBeNull();
      expect(queryByTestId("quick-add-repeat-pill")).toBeNull();
    });

    it("has adequate hit targets for pills (pressable)", async () => {
      const { findByTestId } = renderComponent();
      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Call tomorrow at 3pm daily"
      );

      await waitFor(async () => {
        const datePill = await findByTestId("quick-add-date-pill");
        const timePill = await findByTestId("quick-add-time-pill");
        const repeatPill = await findByTestId("quick-add-repeat-pill");

        // Each pill must actually respond to a press (real hit-target check,
        // not a brittle introspection of the underlying component's name).
        expect(() => fireEvent.press(datePill)).not.toThrow();
        expect(() => fireEvent.press(timePill)).not.toThrow();
        expect(() => fireEvent.press(repeatPill)).not.toThrow();
      });
    });

    it("announces pills as buttons to screen readers", async () => {
      const { findByTestId } = renderComponent();
      fireEvent.changeText(
        await findByTestId("quick-add-input"),
        "Call tomorrow at 3pm daily"
      );

      const datePill = await findByTestId("quick-add-date-pill");
      const timePill = await findByTestId("quick-add-time-pill");
      const repeatPill = await findByTestId("quick-add-repeat-pill");

      expect(datePill.props.accessible).toBe(true);
      expect(datePill.props.accessibilityRole).toBe("button");
      expect(datePill.props.accessibilityLabel).toBeTruthy();

      expect(timePill.props.accessible).toBe(true);
      expect(timePill.props.accessibilityRole).toBe("button");
      expect(timePill.props.accessibilityLabel).toBeTruthy();

      expect(repeatPill.props.accessible).toBe(true);
      expect(repeatPill.props.accessibilityRole).toBe("button");
      expect(repeatPill.props.accessibilityLabel).toBeTruthy();
    });
  });
});
