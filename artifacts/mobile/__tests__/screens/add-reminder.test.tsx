import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Contacts from "expo-contacts";
import AddReminderScreen from "@/app/add-reminder";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { STORAGE_KEY, type Reminder } from "@/services/ReminderService";
import * as SpeechService from "@/services/SpeechService";
import * as RecipientLookupService from "@/services/RecipientLookupService";
import * as InvitationService from "@/services/InvitationService";

jest.mock("expo-haptics");

const mockBack = jest.fn();
let mockSearchParams: { id?: string } = { id: "r1" };

jest.mock("expo-router", () => ({
  router: {
    back: (...args: any[]) => mockBack(...args),
    push: jest.fn(),
  },
  useLocalSearchParams: () => mockSearchParams,
}));

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    title: "Original title",
    description: "Original description",
    datetime: FUTURE,
    completed: false,
    notificationId: "notif-r1",
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <RemindersProvider>
        <AddReminderScreen />
      </RemindersProvider>
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockSearchParams = { id: "r1" };
  await (AsyncStorage as any).clear();
  (Contacts.requestPermissionsAsync as jest.Mock).mockResolvedValue({
    status: Contacts.PermissionStatus.GRANTED,
  });
  (Contacts.getContactsAsync as jest.Mock).mockResolvedValue({
    data: [
      { id: "c1", name: "Priya Menon", phoneNumbers: [{ number: "+91 98765 43210" }] },
    ],
  });
});

describe("AddReminderScreen — editing", () => {
  it("saves an edited title and description", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId } = renderScreen();

    const titleInput = await findByTestId("edit-title-input");
    const descriptionInput = await findByTestId("description-input");
    expect(titleInput.props.value).toBe("Original title");
    expect(descriptionInput.props.value).toBe("Original description");

    fireEvent.changeText(titleInput, "Updated title");
    fireEvent.changeText(descriptionInput, "Updated description");

    const saveButton = await findByTestId("save-button");
    fireEvent.press(saveButton);

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].title).toBe("Updated title");
    expect(stored[0].description).toBe("Updated description");
  });
});

describe("AddReminderScreen — adding", () => {
  it("saves a description entered on a new reminder", async () => {
    mockSearchParams = {};
    const { findByTestId } = renderScreen();

    const titleInput = await findByTestId("input-textbox");
    fireEvent.changeText(titleInput, "Call mom tomorrow at 3pm");

    const descriptionInput = await findByTestId("description-input");
    fireEvent.changeText(descriptionInput, "Ask about the weekend trip");

    const saveButton = await findByTestId("save-button");
    fireEvent.press(saveButton);

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].description).toBe("Ask about the weekend trip");
  });
});

describe("AddReminderScreen — recipient", () => {
  it("does not write a recipient key at all when none is picked", async () => {
    // A spread key holding undefined still satisfies `'recipient' in obj`, so
    // the payload must omit it entirely rather than set it undefined.
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId } = renderScreen();

    fireEvent.changeText(await findByTestId("edit-title-input"), "No recipient");
    fireEvent.press(await findByTestId("save-button"));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect("recipient" in stored[0]).toBe(false);
  });

  it("shows an unset recipient row that opens the picker", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId, findByText } = renderScreen();

    expect(await findByText("Remind me to message someone")).toBeTruthy();
    fireEvent.press(await findByTestId("recipient-row"));
    expect(await findByTestId("contact-search")).toBeTruthy();
  });

  it("stores the picked contact's name and raw phone on save", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId, findByText } = renderScreen();

    fireEvent.press(await findByTestId("recipient-row"));
    fireEvent.press(await findByText("Priya Menon"));
    fireEvent.press(await findByTestId("save-button"));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].recipient).toEqual({
      contactId: "c1",
      name: "Priya Menon",
      phone: "+91 98765 43210",
    });
  });

  it("shows the chosen recipient's name on the row after picking", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId, findByText, findAllByText } = renderScreen();

    fireEvent.press(await findByTestId("recipient-row"));
    fireEvent.press(await findByText("Priya Menon"));

    expect((await findAllByText("Priya Menon")).length).toBeGreaterThan(0);
  });

  it("clears a chosen recipient back to none", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId, findByText } = renderScreen();

    fireEvent.press(await findByTestId("recipient-row"));
    fireEvent.press(await findByText("Priya Menon"));
    fireEvent.press(await findByTestId("recipient-clear"));
    fireEvent.press(await findByTestId("save-button"));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect("recipient" in stored[0]).toBe(false);
  });

  it("loads an existing reminder's recipient into the row", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({ recipient: { name: "Anand", phone: "9123456789" } }),
      ])
    );
    const { findByText } = renderScreen();
    expect(await findByText("Anand")).toBeTruthy();
  });

  it("never labels the row in a way that implies delivery", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { queryByText, findByText } = renderScreen();
    await findByText("Remind me to message someone");
    expect(queryByText("Remind someone else")).toBeNull();
  });
});

// T4.1: wiring the reachability check (Task 5) and invitation send (Task 7's
// Edge Function) into the existing Tier 1 flow. Additive only - a recipient
// with no app must behave exactly as before these tests were added.
describe("AddReminderScreen — Tier 2 reachability + invitation send", () => {
  it("stores appUserId on the recipient when the picked contact is reachable", async () => {
    jest.spyOn(RecipientLookupService, "checkReachability").mockResolvedValue({
      appUserId: "user-1",
      lookedUpAt: new Date().toISOString(),
    });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId, findByText } = renderScreen();

    fireEvent.press(await findByTestId("recipient-row"));
    fireEvent.press(await findByText("Priya Menon"));

    expect(await findByTestId("recipient-in-app-badge")).toBeTruthy();
  });

  it("calls sendInvitation with the reminder's fields when saving a reachable recipient", async () => {
    jest.spyOn(RecipientLookupService, "checkReachability").mockResolvedValue({
      appUserId: "user-1",
      lookedUpAt: new Date().toISOString(),
    });
    const sendInvitation = jest
      .spyOn(InvitationService, "sendInvitation")
      .mockResolvedValue({ ok: true, invitationId: "inv-1" });

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId, findByText } = renderScreen();

    fireEvent.press(await findByTestId("recipient-row"));
    fireEvent.press(await findByText("Priya Menon"));
    await findByTestId("recipient-in-app-badge");

    fireEvent.changeText(await findByTestId("edit-title-input"), "Take BP tablets");
    fireEvent.press(await findByTestId("save-button"));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(sendInvitation).toHaveBeenCalledWith(
      "user-1",
      "Take BP tablets",
      "Original description",
      expect.any(String)
    );
  });

  it("still saves the local reminder and does not block on a sendInvitation failure", async () => {
    jest.spyOn(RecipientLookupService, "checkReachability").mockResolvedValue({
      appUserId: "user-1",
      lookedUpAt: new Date().toISOString(),
    });
    jest
      .spyOn(InvitationService, "sendInvitation")
      .mockResolvedValue({ ok: false, error: "network_error" });

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId, findByText } = renderScreen();

    fireEvent.press(await findByTestId("recipient-row"));
    fireEvent.press(await findByText("Priya Menon"));
    await findByTestId("recipient-in-app-badge");
    fireEvent.press(await findByTestId("save-button"));

    // The Tier 1 save must complete (router.back called) even though the
    // Tier 2 send failed - never a blocking modal or a thrown exception.
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].recipient.appUserId).toBe("user-1");
  });

  it("does not call sendInvitation for a recipient with no app", async () => {
    jest.spyOn(RecipientLookupService, "checkReachability").mockResolvedValue({
      appUserId: null,
      lookedUpAt: new Date().toISOString(),
    });
    const sendInvitation = jest.spyOn(InvitationService, "sendInvitation");

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId, findByText, queryByTestId } = renderScreen();

    fireEvent.press(await findByTestId("recipient-row"));
    fireEvent.press(await findByText("Priya Menon"));
    await findByText("Priya Menon");

    fireEvent.press(await findByTestId("save-button"));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());

    expect(queryByTestId("recipient-in-app-badge")).toBeNull();
    expect(sendInvitation).not.toHaveBeenCalled();
  });
});

// The editor shipped with no mic: a reminder created by voice could only be
// corrected by typing, which is the worst case for Malayalam input.
describe("AddReminderScreen — dictation", () => {
  it("starts dictation from the edit-title mic and writes the transcript back", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ title: "Original title" })])
    );
    jest.spyOn(SpeechService, "getMicPermissionStatus").mockResolvedValue({
      granted: true,
      canAskAgain: true,
    });
    jest
      .spyOn(SpeechService, "ensureOfflineModelReady")
      .mockResolvedValue("ready" as any);
    const startListening = jest
      .spyOn(SpeechService, "startListening")
      .mockReturnValue({ busy: false });

    const { findByTestId, findByDisplayValue } = renderScreen();
    // Wait for the async seed from storage — pressing before it lands would
    // capture an empty baseline and prove nothing.
    await findByDisplayValue("Original title");
    fireEvent.press(await findByTestId("edit-title-mic"));

    await waitFor(() => expect(startListening).toHaveBeenCalled());
    // Baseline is the text already in the field, so dictation appends to the
    // existing title rather than silently replacing it.
    expect(startListening.mock.calls[0][0]).toBe("Original title");

    const onResult = startListening.mock.calls[0][2];
    onResult("Original title and buy milk");
    expect(await findByDisplayValue("Original title and buy milk")).toBeTruthy();
  });

  it("shows a notice instead of listening while the offline model is preparing", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    jest.spyOn(SpeechService, "getMicPermissionStatus").mockResolvedValue({
      granted: true,
      canAskAgain: true,
    });
    jest
      .spyOn(SpeechService, "ensureOfflineModelReady")
      .mockResolvedValue("preparing" as any);
    const startListening = jest
      .spyOn(SpeechService, "startListening")
      .mockReturnValue({ busy: false });

    const { findByTestId, findByText } = renderScreen();
    fireEvent.press(await findByTestId("edit-title-mic"));

    expect(
      await findByText("Preparing voice recognition — try again in a moment")
    ).toBeTruthy();
    expect(startListening).not.toHaveBeenCalled();
  });
});
