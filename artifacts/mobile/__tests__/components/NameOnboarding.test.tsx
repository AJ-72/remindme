import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NameOnboarding from "@/components/NameOnboarding";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { NAME_PROMPT_KEY, USER_NAME_KEY } from "@/services/ReminderService";

jest.mock("expo-haptics");

function renderOnboarding(enabled = true) {
  return render(
    <RemindersProvider>
      <NameOnboarding enabled={enabled} />
    </RemindersProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
});

describe("NameOnboarding", () => {
  it("prompts on a first launch and stores the name", async () => {
    const { findByTestId } = renderOnboarding();
    fireEvent.changeText(await findByTestId("name-sheet-input"), "Anand");
    fireEvent.press(await findByTestId("name-sheet-save"));

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(USER_NAME_KEY)).toBe("Anand")
    );
    expect(await AsyncStorage.getItem(NAME_PROMPT_KEY)).toBe("1");
  });

  // Skipping is a one-time answer too. Re-asking on every cold start is how a
  // friendly prompt turns into nagging.
  it("records the prompt as seen when skipped, without storing a name", async () => {
    const { findByTestId, queryByTestId } = renderOnboarding();
    fireEvent.press(await findByTestId("name-sheet-dismiss"));

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(NAME_PROMPT_KEY)).toBe("1")
    );
    expect(await AsyncStorage.getItem(USER_NAME_KEY)).toBeNull();
    await waitFor(() => expect(queryByTestId("name-sheet-input")).toBeNull());
  });

  it("does not prompt again once the prompt has been seen", async () => {
    await AsyncStorage.setItem(NAME_PROMPT_KEY, "1");
    const { queryByTestId } = renderOnboarding();
    await waitFor(() => expect(queryByTestId("name-sheet-input")).toBeNull());
  });

  // The gate exists so the sheet never renders behind the system permission
  // dialog, where the tap dismissing that dialog would skip it for good.
  it("stays closed until the permission onboarding gate opens", async () => {
    const { queryByTestId } = renderOnboarding(false);
    await waitFor(() => expect(queryByTestId("name-sheet-input")).toBeNull());
    expect(await AsyncStorage.getItem(NAME_PROMPT_KEY)).toBeNull();
  });
});
