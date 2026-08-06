import React from "react";
import { render, waitFor, fireEvent, act } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ReminderDetailScreen from "@/app/reminder-detail";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { STORAGE_KEY, type Reminder } from "@/services/ReminderService";

jest.mock("expo-haptics");

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn().mockReturnValue(true);

jest.mock("expo-router", () => ({
  router: {
    push: (...args: any[]) => mockPush(...args),
    back: (...args: any[]) => mockBack(...args),
    replace: (...args: any[]) => mockReplace(...args),
    canGoBack: (...args: any[]) => mockCanGoBack(...args),
  },
  useLocalSearchParams: () => ({ id: "r1" }),
}));

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    title: "Test reminder",
    description: "Some details",
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
        <ReminderDetailScreen />
      </RemindersProvider>
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
  await (AsyncStorage as any).clear();
});

describe("ReminderDetailScreen", () => {
  it("shows the loading spinner while reminders are still loading, even before the id matches anything", () => {
    const { getByTestId, queryByText } = renderScreen();
    expect(getByTestId("loading-indicator")).toBeTruthy();
    expect(queryByText("This reminder was already completed or removed.")).toBeNull();
  });

  it("renders title, description, and formatted datetime when found and not completed", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByText } = renderScreen();
    expect(await findByText("Test reminder")).toBeTruthy();
    expect(await findByText("Some details")).toBeTruthy();
  });

  it("shows the already-handled message when the reminder is missing", async () => {
    const { findByText } = renderScreen();
    expect(
      await findByText("This reminder was already completed or removed.")
    ).toBeTruthy();
  });

  it("shows the already-handled message when the reminder is completed", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ completed: true })])
    );
    const { findByText } = renderScreen();
    expect(
      await findByText("This reminder was already completed or removed.")
    ).toBeTruthy();
  });

  it("Mark Done completes the reminder and navigates back", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId } = renderScreen();
    const button = await findByTestId("mark-done-button");

    fireEvent.press(button);

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].completed).toBe(true);
  });

  it("Snooze reschedules the reminder and updates its datetime and notificationId", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId } = renderScreen();
    const button = await findByTestId("snooze-button");

    fireEvent.press(button);

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].datetime).not.toBe(FUTURE);
    expect(stored[0].notificationId).toBe("mock-notif-id");
  });

  it("Edit navigates to add-reminder with the correct id param", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId } = renderScreen();
    const button = await findByTestId("edit-button");

    fireEvent.press(button);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/add-reminder",
      params: { id: "r1" },
    });
  });

  it("Delete shows a styled confirm sheet, then deletes on confirm and navigates back", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId, findByText } = renderScreen();
    const button = await findByTestId("delete-button");

    fireEvent.press(button);

    expect(await findByText("Delete Reminder")).toBeTruthy();
    const confirmButton = await findByTestId("confirm-sheet-confirm");
    await act(async () => {
      fireEvent.press(confirmButton);
    });

    await waitFor(() => expect(mockBack).toHaveBeenCalled(), { timeout: 5000 });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored.find((r: Reminder) => r.id === "r1")).toBeUndefined();
  });

  it("cancelling the delete confirm sheet keeps the reminder and does not navigate back", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId } = renderScreen();
    const button = await findByTestId("delete-button");

    fireEvent.press(button);

    const cancelButton = await findByTestId("confirm-sheet-cancel");
    fireEvent.press(cancelButton);

    expect(mockBack).not.toHaveBeenCalled();
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored.find((r: Reminder) => r.id === "r1")).toBeDefined();
  });
});
