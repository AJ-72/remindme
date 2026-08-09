import React from "react";
import { render, waitFor, fireEvent, act } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ReminderDetailScreen from "@/app/reminder-detail";
import { RemindersProvider } from "@/contexts/RemindersContext";
import {
  SNOOZE_PRESET_KEY,
  STORAGE_KEY,
  type Reminder,
} from "@/services/ReminderService";

jest.mock("expo-haptics");

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn().mockReturnValue(true);
// Mutable so a test can arrive with the notification's openSnooze param set.
let mockSearchParams: Record<string, string> = { id: "r1" };

jest.mock("expo-router", () => ({
  router: {
    push: (...args: any[]) => mockPush(...args),
    back: (...args: any[]) => mockBack(...args),
    replace: (...args: any[]) => mockReplace(...args),
    canGoBack: (...args: any[]) => mockCanGoBack(...args),
  },
  useLocalSearchParams: () => mockSearchParams,
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
  mockSearchParams = { id: "r1" };
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

  it("Snooze opens the preset sheet without rescheduling yet", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId, findByText } = renderScreen();

    fireEvent.press(await findByTestId("snooze-button"));

    expect(await findByText("Snooze until…")).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].datetime).toBe(FUTURE);
  });

  // Arriving from the notification's "More…" action, which can't render the
  // preset list in the tray and so hands off to the sheet here.
  it("opens the snooze sheet immediately when the openSnooze param is set", async () => {
    mockSearchParams = { id: "r1", openSnooze: "1" };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByText } = renderScreen();

    expect(await findByText("Snooze until…")).toBeTruthy();
  });

  it("does not open the sheet without the param", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { queryByText, findByText } = renderScreen();

    await findByText("Test reminder");
    expect(queryByText("Snooze until…")).toBeNull();
  });

  it("choosing a preset reschedules the reminder and navigates back", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId } = renderScreen();

    fireEvent.press(await findByTestId("snooze-button"));
    await act(async () => {
      fireEvent.press(await findByTestId("snooze-option-30"));
    });

    await waitFor(() => expect(mockBack).toHaveBeenCalled(), { timeout: 5000 });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].datetime).not.toBe(FUTURE);
    expect(stored[0].notificationId).toBe("mock-notif-id");
    const expected = Date.now() + 30 * 60 * 1000;
    expect(Math.abs(new Date(stored[0].datetime).getTime() - expected)).toBeLessThan(5000);
  });

  it("choosing a preset persists it as the new default", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId } = renderScreen();

    fireEvent.press(await findByTestId("snooze-button"));
    await act(async () => {
      fireEvent.press(await findByTestId("snooze-option-tomorrow"));
    });

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(SNOOZE_PRESET_KEY)).toBe(
        JSON.stringify({ kind: "tomorrow" })
      )
    );
  });

  it("cancelling the snooze sheet leaves the reminder untouched", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId } = renderScreen();

    fireEvent.press(await findByTestId("snooze-button"));
    fireEvent.press(await findByTestId("snooze-sheet-cancel"));

    expect(mockBack).not.toHaveBeenCalled();
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].datetime).toBe(FUTURE);
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
