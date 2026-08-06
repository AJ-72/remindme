import React from "react";
import { render, waitFor, fireEvent, act } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import HomeScreen from "@/app/(tabs)/index";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { SharedTextProvider } from "@/contexts/SharedTextContext";
import { STORAGE_KEY, type Reminder } from "@/services/ReminderService";

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
