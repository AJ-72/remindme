import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import { RemindersProvider } from "@/contexts/RemindersContext";
import {
  USER_PERSONA_KEY,
  USER_NAME_KEY,
  ONBOARDING_COMPLETED_KEY,
} from "@/services/ReminderService";

jest.mock("expo-haptics");

const initialMetrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderWizard(props: {
  enabled: boolean;
  forceVisible?: boolean;
  onDismiss?: () => void;
}) {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <RemindersProvider>
        <OnboardingWizard {...props} />
      </RemindersProvider>
    </SafeAreaProvider>
  );
}

describe("OnboardingWizard", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it("does not display when enabled is false", async () => {
    const { queryByTestId } = renderWizard({ enabled: false });
    await act(async () => {});
    expect(queryByTestId("onboarding-name-input")).toBeNull();
  });

  it("displays step 1 (name prompt) on fresh install when enabled is true", async () => {
    const { getByTestId, getByText } = renderWizard({ enabled: true });
    await waitFor(() => expect(getByTestId("onboarding-name-input")).toBeTruthy());
    expect(getByText("Welcome to Reminders")).toBeTruthy();
    expect(getByTestId("onboarding-name-continue")).toBeTruthy();
    expect(getByTestId("onboarding-name-skip")).toBeTruthy();
  });

  it("progresses from name to quiz to reveal and completes onboarding", async () => {
    const onDismiss = jest.fn();
    const { getByTestId, getByText } = renderWizard({
      enabled: true,
      onDismiss,
    });

    await waitFor(() => expect(getByTestId("onboarding-name-input")).toBeTruthy());

    // Enter name
    fireEvent.changeText(getByTestId("onboarding-name-input"), "Anand");
    await act(async () => {
      fireEvent.press(getByTestId("onboarding-name-continue"));
    });

    // Quiz Question 1
    await waitFor(() =>
      expect(
        getByText("When a reminder rings, what usually happens?")
      ).toBeTruthy()
    );

    // Pick Quick Finisher (choice 4)
    fireEvent.press(getByTestId("quiz-choice-r4"));

    // Quiz Question 2
    await waitFor(() =>
      expect(
        getByText("What is the biggest reason tasks slip for you?")
      ).toBeTruthy()
    );

    // Pick Quick Finisher (choice 4)
    fireEvent.press(getByTestId("quiz-choice-q4"));

    // Quiz Question 3
    await waitFor(() =>
      expect(
        getByText("How would you like RemindMe to help you most?")
      ).toBeTruthy()
    );

    // Pick Quick Finisher (choice 4)
    fireEvent.press(getByTestId("quiz-choice-h4"));

    // Reveal step
    await waitFor(() => expect(getByText("Quick Finisher")).toBeTruthy());
    expect(getByText("Your Reminder Style")).toBeTruthy();
    expect(getByTestId("onboarding-finish-btn")).toBeTruthy();

    // Finish onboarding
    await act(async () => {
      fireEvent.press(getByTestId("onboarding-finish-btn"));
    });

    await waitFor(async () => {
      expect(await AsyncStorage.getItem(USER_NAME_KEY)).toBe("Anand");
      expect(await AsyncStorage.getItem(USER_PERSONA_KEY)).toBe("quick_finisher");
      expect(await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBe("1");
      expect(onDismiss).toHaveBeenCalled();
    });
  });

  it("handles skipping quiz directly to default persona", async () => {
    const { getByTestId, getByText } = renderWizard({ enabled: true });

    await waitFor(() => expect(getByTestId("onboarding-name-skip")).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId("onboarding-name-skip"));
    });

    await waitFor(() => expect(getByTestId("onboarding-quiz-skip")).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId("onboarding-quiz-skip"));
    });

    await waitFor(() => expect(getByText("Step-by-Step Doer")).toBeTruthy());
  });

  it("opens directly to quiz when forceVisible is true", async () => {
    const { getByTestId, getByText } = renderWizard({
      enabled: true,
      forceVisible: true,
    });

    await waitFor(() =>
      expect(
        getByText("When a reminder rings, what usually happens?")
      ).toBeTruthy()
    );
  });
});
