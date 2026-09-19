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

  it("clears an ALREADY-STORED recipient on an existing reminder, not just a freshly-picked one", async () => {
    // Regression: {...r, ...data} alone can never clear a field the caller
    // omits, since there is nothing in `data` to overwrite r's own old value
    // with — only reproducible when the recipient was already on the stored
    // reminder BEFORE this edit session, unlike the test above (which picks
    // and clears within the same session, never touching r's stored value).
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ recipient: { name: "Anand", phone: "9123456789" } })])
    );
    const { findByTestId, findByText } = renderScreen();
    expect(await findByText("Anand")).toBeTruthy();

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

  it("attaches the returned invitation id to the local reminder on a successful send", async () => {
    jest.spyOn(RecipientLookupService, "checkReachability").mockResolvedValue({
      appUserId: "user-1",
      lookedUpAt: new Date().toISOString(),
    });
    jest
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
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    const added = stored.find((r: { title: string }) => r.title === "Take BP tablets");
    expect(added.invitationId).toBe("inv-1");
  });

  it("does not attach an invitation id when the send fails", async () => {
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

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].invitationId).toBeUndefined();
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

describe("the better-time suggestion", () => {
  /** Local-time ISO offset from now, for the hour-bucket history. */
  function at(daysFromNow: number, hour: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  }

  /** 8 AM always finished, 10 PM never: a clear, well-sampled split. */
  function morningVsNight(): Reminder[] {
    return [
      ...Array.from({ length: 5 }, (_, i) =>
        makeReminder({
          id: `h${i}`,
          completed: true,
          datetime: at(-2, 8),
          completedAt: at(-2, 8),
        })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeReminder({ id: `m${i}`, datetime: at(-2, 22) })
      ),
    ];
  }

  /** The reminder being edited, sitting at the user's weakest hour. */
  function editedAtNight(): Reminder {
    return makeReminder({ id: "r1", datetime: at(2, 22) });
  }

  it("stays silent when there is no history to argue from", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([editedAtNight()]));
    const { queryByTestId, findByTestId } = renderScreen();
    await findByTestId("save-button");
    expect(queryByTestId("time-suggestion")).toBeNull();
  });

  it("offers the strong hour when the chosen one is measurably worse", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...morningVsNight(), editedAtNight()])
    );
    const { findByTestId } = renderScreen();
    const text = (await findByTestId("time-suggestion-text")).props.children;
    expect(text).toContain("8 AM");
    expect(text).toContain("10 PM");
  });

  it("stays silent when the reminder is already at the strong hour", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        ...morningVsNight(),
        makeReminder({ id: "r1", datetime: at(2, 8) }),
      ])
    );
    const { queryByTestId, findByTestId } = renderScreen();
    await findByTestId("save-button");
    expect(queryByTestId("time-suggestion")).toBeNull();
  });

  it("stays silent about an hour it has no evidence against", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        ...morningVsNight(),
        // 3 PM is unmeasured. No data is not the same as bad data.
        makeReminder({ id: "r1", datetime: at(2, 15) }),
      ])
    );
    const { queryByTestId, findByTestId } = renderScreen();
    await findByTestId("save-button");
    expect(queryByTestId("time-suggestion")).toBeNull();
  });

  it("moves the time to the strong hour on accept, and then goes away", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...morningVsNight(), editedAtNight()])
    );
    const { findByTestId, queryByTestId } = renderScreen();
    fireEvent.press(await findByTestId("time-suggestion-accept"));
    await waitFor(() => expect(queryByTestId("time-suggestion")).toBeNull());

    // The reminder itself must not change until the user saves.
    fireEvent.press(await findByTestId("save-button"));
    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const saved = JSON.parse(raw as string).find((r: Reminder) => r.id === "r1");
      expect(new Date(saved.datetime).getHours()).toBe(8);
    });
  });

  it("leaves the time alone when the user keeps their own", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...morningVsNight(), editedAtNight()])
    );
    const { findByTestId, queryByTestId } = renderScreen();
    fireEvent.press(await findByTestId("time-suggestion-dismiss"));
    await waitFor(() => expect(queryByTestId("time-suggestion")).toBeNull());

    fireEvent.press(await findByTestId("save-button"));
    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const saved = JSON.parse(raw as string).find((r: Reminder) => r.id === "r1");
      expect(new Date(saved.datetime).getHours()).toBe(22);
    });
  });
});

describe("AddReminderScreen — recurrence", () => {
  it("add mode: sets the rule from a typed recurrence phrase and strips it from the title", async () => {
    mockSearchParams = {};
    const { findByTestId } = renderScreen();
    fireEvent.changeText(
      await findByTestId("input-textbox"),
      "take tablet every day at 8am"
    );
    await waitFor(() => {
      expect(findByTestId("repeat-row")).toBeTruthy();
    });
    const repeatRow = await findByTestId("repeat-row");
    fireEvent.press(await findByTestId("save-button"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(1);
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].recurrence).toEqual({ freq: "daily", interval: 1 });
    expect(repeatRow).toBeTruthy();
  });

  it("add mode: does not write a recurrence key for a one-shot reminder", async () => {
    mockSearchParams = {};
    const { findByTestId } = renderScreen();
    fireEvent.changeText(await findByTestId("input-textbox"), "Call mom tomorrow at 3pm");
    fireEvent.press(await findByTestId("save-button"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(1);
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect("recurrence" in stored[0]).toBe(false);
  });

  it("add mode: setting the rule by hand via the Repeats row reaches the save payload", async () => {
    mockSearchParams = {};
    const { findByTestId } = renderScreen();
    fireEvent.changeText(await findByTestId("input-textbox"), "Water the plants at 6pm");

    fireEvent.press(await findByTestId("repeat-row"));
    fireEvent.press(await findByTestId("repeat-option-weekly"));
    fireEvent.press(await findByTestId("save-button"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(1);
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].recurrence.freq).toBe("weekly");
  });

  it("edit mode: seeds the Repeats row from the existing reminder's rule", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ recurrence: { freq: "daily", interval: 1 } })])
    );
    const { findByText } = renderScreen();
    expect(await findByText("Daily")).toBeTruthy();
  });

  it("edit mode: clearing to 'Doesn't repeat' via the picker removes the rule on save", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ recurrence: { freq: "daily", interval: 1 } })])
    );
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("repeat-row"));
    fireEvent.press(await findByTestId("repeat-option-none"));
    fireEvent.press(await findByTestId("save-button"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect("recurrence" in stored[0]).toBe(false);
    });
  });

  it("edit mode: typing a recurrence phrase into the title sets the rule", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId, findByText } = renderScreen();
    const titleInput = await findByTestId("edit-title-input");
    // The seed effect sets editTitle asynchronously (existing loads from
    // context after mount) — wait for the seeded value to actually land
    // before typing, or this edit races the seed and is silently overwritten.
    await waitFor(() => expect(titleInput.props.value).toBe("Original title"));

    fireEvent.changeText(titleInput, "Original title every monday");

    expect(await findByText(/Weekly on Mon/)).toBeTruthy();
  });

  it("edit mode: removing the recurrence phrase from the title does NOT clear an existing rule", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ recurrence: { freq: "daily", interval: 1 } })])
    );
    const { findByTestId, findByText } = renderScreen();
    // Seeded as "Daily" from existing.recurrence — confirm before editing.
    expect(await findByText("Daily")).toBeTruthy();

    const titleInput = await findByTestId("edit-title-input");
    await waitFor(() => expect(titleInput.props.value).toBe("Original title"));
    fireEvent.changeText(titleInput, "Updated title, no recurrence phrase here");

    // Still "Daily" — the rule was not silently blanked by the title edit.
    expect(await findByText("Daily")).toBeTruthy();
  });

  it("edit mode: saving with moveAnchor true moves the recurrence anchor to the edited time", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({
          recurrence: { freq: "daily", interval: 1 },
          recurrenceAnchor: "2000-01-01T08:00:00.000Z",
        }),
      ])
    );
    const { findByTestId } = renderScreen();
    const titleInput = await findByTestId("edit-title-input");
    // Wait for the seed effect to fully land before saving, or this races
    // parsedDate's own seed from existing.datetime.
    await waitFor(() => expect(titleInput.props.value).toBe("Original title"));
    fireEvent.press(await findByTestId("save-button"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      // The screen's own parsedDate (from the existing reminder's datetime,
      // FUTURE) becomes the new anchor — deliberately moved because saving
      // from this screen IS the deliberate schedule restatement.
      expect(stored[0].recurrenceAnchor).not.toBe("2000-01-01T08:00:00.000Z");
    });
  });
});
