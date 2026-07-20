import React from "react";
import { Alert } from "react-native";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
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
      <SharedTextProvider>
        <RemindersProvider>
          <HomeScreen />
        </RemindersProvider>
      </SharedTextProvider>
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

  it("deleting a reminder removes it from the visible list", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_title, _msg, buttons) => {
        buttons?.find((btn) => btn.text === "Delete")?.onPress?.();
      });

    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1", title: "Delete me" })])
    );
    const { findByText, queryByText, UNSAFE_getAllByType } = renderScreen();
    await findByText("Delete me");

    const Feather = require("@expo/vector-icons").Feather;
    const trashIcon = UNSAFE_getAllByType(Feather).find(
      (node: any) => node.props.name === "trash-2"
    );
    fireEvent.press(trashIcon.parent);

    await waitFor(() => expect(queryByText("Delete me")).toBeNull());
    alertSpy.mockRestore();
  });
});
