import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import QuickAddInput from "@/components/QuickAddInput";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { SharedTextProvider } from "@/contexts/SharedTextContext";
import { STORAGE_KEY } from "@/services/ReminderService";

jest.mock("expo-haptics");

function renderComponent() {
  return render(
    <SharedTextProvider>
      <RemindersProvider>
        <QuickAddInput />
      </RemindersProvider>
    </SharedTextProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
});

describe("QuickAddInput", () => {
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
});
