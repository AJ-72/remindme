import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AddReminderScreen from "@/app/add-reminder";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { STORAGE_KEY, type Reminder } from "@/services/ReminderService";

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
