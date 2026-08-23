import React from "react";
import { render, waitFor, fireEvent, act } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import HomeScreen from "@/app/(tabs)/index";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { SharedTextProvider } from "@/contexts/SharedTextContext";
import { STORAGE_KEY, USER_NAME_KEY, type Reminder } from "@/services/ReminderService";
import { formatHeaderDate } from "@/utils/formatHeaderDate";

jest.mock("expo-haptics");
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    title: "Test reminder",
    description: "",
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
        <SharedTextProvider>
          <HomeScreen />
        </SharedTextProvider>
      </RemindersProvider>
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
});

describe("HomeScreen", () => {
  it("shows the empty state when there are no reminders", async () => {
    const { findByText } = renderScreen();
    expect(await findByText("No reminders yet")).toBeTruthy();
  });

  it("shows the greeting header with a date and upcoming-count subtitle", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({ id: "r1", title: "Task one", completed: false, datetime: FUTURE }),
        makeReminder({ id: "r2", title: "Task two", completed: false, datetime: FUTURE }),
      ])
    );
    const { findByText, findByTestId } = renderScreen();
    expect(await findByText("Hi there")).toBeTruthy();
    expect(await findByText("2 upcoming")).toBeTruthy();
    // This test was named "with a date" from the start but never asserted one,
    // which is how the header shipped without it.
    expect((await findByTestId("header-date")).props.children).toBe(
      formatHeaderDate(new Date())
    );
  });

  it("shows today's date beside the Today title", async () => {
    const { findByTestId } = renderScreen();
    const dateEl = await findByTestId("header-date");
    // Matches the mockup's "08, August 2026" shape.
    expect(dateEl.props.children).toMatch(
      /^\d{2}, (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/
    );
  });

  it("shows 'All caught up!' as the subtitle when there are no upcoming reminders", async () => {
    const { findByText } = renderScreen();
    expect(await findByText("Hi there")).toBeTruthy();
    expect(await findByText("All caught up!")).toBeTruthy();
  });

  it("lists reminder titles loaded from storage", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1", title: "Buy milk" })])
    );
    const { findByText } = renderScreen();
    expect(await findByText("Buy milk")).toBeTruthy();
  });

  it("puts incomplete reminders under Upcoming and completed under Completed", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({ id: "r1", title: "Not done", completed: false, datetime: FUTURE }),
        makeReminder({ id: "r2", title: "Done", completed: true, datetime: PAST }),
      ])
    );
    const { findByText } = renderScreen();
    expect(await findByText("Upcoming")).toBeTruthy();
    expect(await findByText("Completed")).toBeTruthy();
    expect(await findByText("Not done")).toBeTruthy();
    expect(await findByText("Done")).toBeTruthy();
  });

  it("sorts completed reminders newest-first, independent of upcoming's earliest-first order", async () => {
    const OLDER = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const NEWER = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({ id: "r1", title: "Completed older", completed: true, datetime: OLDER }),
        makeReminder({ id: "r2", title: "Completed newer", completed: true, datetime: NEWER }),
      ])
    );
    const { findByText, UNSAFE_getAllByType } = renderScreen();
    await findByText("Completed newer");

    const Text = require("react-native").Text;
    const titles = UNSAFE_getAllByType(Text)
      .map((node: any) => node.props.children)
      .filter((c: any) => c === "Completed older" || c === "Completed newer");
    expect(titles).toEqual(["Completed newer", "Completed older"]);
  });

  it("deleting a reminder shows a styled confirm sheet, then removes it from the visible list on confirm", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1", title: "Delete me" })])
    );
    const { findByText, findByTestId, queryByText, UNSAFE_getAllByType } = renderScreen();
    await findByText("Delete me");

    const Feather = require("@expo/vector-icons").Feather;
    const trashIcon = UNSAFE_getAllByType(Feather).find(
      (node: any) => node.props.name === "trash-2"
    );
    fireEvent.press(trashIcon.parent);

    expect(await findByText("Delete Reminder")).toBeTruthy();
    const confirmButton = await findByTestId("confirm-sheet-confirm");
    await act(async () => {
      fireEvent.press(confirmButton);
    });

    await waitFor(() => expect(queryByText("Delete me")).toBeNull(), { timeout: 5000 });
  });

  it("cancelling the delete confirm sheet keeps the reminder", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1", title: "Keep me" })])
    );
    const { findByText, findByTestId, UNSAFE_getAllByType } = renderScreen();
    await findByText("Keep me");

    const Feather = require("@expo/vector-icons").Feather;
    const trashIcon = UNSAFE_getAllByType(Feather).find(
      (node: any) => node.props.name === "trash-2"
    );
    fireEvent.press(trashIcon.parent);

    const cancelButton = await findByTestId("confirm-sheet-cancel");
    fireEvent.press(cancelButton);

    await waitFor(async () => {
      expect(await findByText("Keep me")).toBeTruthy();
    });
  });
});

describe("HomeScreen — Remind Someone section", () => {
  it("puts an incomplete send reminder in Remind Someone, not Upcoming", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({ id: "s1", title: "Message Priya", recipient: { name: "Priya", phone: "9876543210" } }),
        makeReminder({ id: "p1", title: "Buy milk" }),
      ])
    );
    const { findByText, getAllByText } = renderScreen();
    expect(await findByText("Remind Someone")).toBeTruthy();
    // Each reminder appears exactly once across all sections.
    expect(getAllByText("Message Priya")).toHaveLength(1);
    expect(getAllByText("Buy milk")).toHaveLength(1);
  });

  it("hides the Remind Someone section when there are no send reminders", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "p1", title: "Buy milk" })])
    );
    const { findByText, queryByText } = renderScreen();
    await findByText("Buy milk");
    expect(queryByText("Remind Someone")).toBeNull();
  });

  it("keeps a completed send reminder in Completed, not Remind Someone", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({
          id: "s1",
          title: "Message Priya",
          completed: true,
          recipient: { name: "Priya", phone: "9876543210" },
        }),
      ])
    );
    const { findByText, queryByText, getAllByText } = renderScreen();
    await findByText("Completed");
    expect(queryByText("Remind Someone")).toBeNull();
    expect(getAllByText("Message Priya")).toHaveLength(1);
  });

  it("treats a recipient with no usable phone as an ordinary reminder", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({ id: "s1", title: "No phone", recipient: { name: "X", phone: "" } }),
      ])
    );
    const { findByText, queryByText } = renderScreen();
    await findByText("No phone");
    expect(queryByText("Remind Someone")).toBeNull();
  });

  it("counts send reminders in the header subtitle alongside upcoming ones", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({ id: "s1", title: "Message Priya", recipient: { name: "Priya", phone: "9876543210" } }),
        makeReminder({ id: "p1", title: "Buy milk" }),
      ])
    );
    const { findByText } = renderScreen();
    expect(await findByText("2 upcoming")).toBeTruthy();
  });
});

describe("HomeScreen — personal greeting", () => {
  async function renderWithName(name: string) {
    await AsyncStorage.setItem(USER_NAME_KEY, name);
    return renderScreen();
  }

  it("greets by name, with the time of day", async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 23, 9, 0, 0));
    try {
      const { findByTestId } = await renderWithName("Anand");
      expect((await findByTestId("header-greeting")).props.children).toBe(
        "Good morning, Anand"
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("falls back to 'Hi there' with no name stored", async () => {
    const { findByTestId } = renderScreen();
    expect((await findByTestId("header-greeting")).props.children).toBe("Hi there");
  });

  it("shows initials in the avatar once a name is set", async () => {
    const { findByTestId } = await renderWithName("Anand Jayaram");
    expect((await findByTestId("header-initials")).props.children).toBe("AJ");
  });

  // The count is the only status on this screen. An unnamed user must not lose
  // it to the name prompt — that would make skipping onboarding a downgrade.
  it("keeps the upcoming count in the unnamed state", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1" }), makeReminder({ id: "r2" })])
    );
    const { findByText } = renderScreen();
    expect(await findByText("2 upcoming")).toBeTruthy();
  });

  it("names the user in the all-caught-up subtitle", async () => {
    const { findByText } = await renderWithName("Anand");
    expect(await findByText("All caught up, Anand!")).toBeTruthy();
  });

  it("saves a name typed into the sheet opened from the header", async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("header-avatar"));
    fireEvent.changeText(await findByTestId("name-sheet-input"), "Anand");
    fireEvent.press(await findByTestId("name-sheet-save"));

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(USER_NAME_KEY)).toBe("Anand")
    );
    expect((await findByTestId("header-greeting")).props.children).toContain("Anand");
  });

  it("renders a Malayalam name in the Malayalam font", async () => {
    const { findByTestId } = await renderWithName("ആനന്ദ്");
    const greeting = await findByTestId("header-greeting");
    const flat = Array.isArray(greeting.props.style)
      ? Object.assign({}, ...greeting.props.style)
      : greeting.props.style;
    expect(flat.fontFamily).toBe("NotoSansMalayalam_700Bold");
  });
});
