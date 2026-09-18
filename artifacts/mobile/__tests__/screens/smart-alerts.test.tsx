import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SmartAlertsScreen from "@/app/smart-alerts";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { QUIET_HOURS_KEY } from "@/services/ReminderService";

jest.mock("expo-haptics");
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <RemindersProvider>
        <SmartAlertsScreen />
      </RemindersProvider>
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
});

describe("SmartAlertsScreen", () => {
  it("shows the default quiet-hours window", async () => {
    const { findByTestId } = renderScreen();
    expect((await findByTestId("quiet-hours-start")).props.children).toBe("22:00");
    expect((await findByTestId("quiet-hours-end")).props.children).toBe("08:00");
  });

  it("shows a stored window", async () => {
    await AsyncStorage.setItem(
      QUIET_HOURS_KEY,
      JSON.stringify({ startMinute: 9 * 60, endMinute: 17 * 60 })
    );
    const { findByTestId } = renderScreen();
    await waitFor(async () =>
      expect((await findByTestId("quiet-hours-start")).props.children).toBe("09:00")
    );
    expect((await findByTestId("quiet-hours-end")).props.children).toBe("17:00");
  });

  it("offers a way into the explainer", async () => {
    const { findByTestId } = renderScreen();
    expect(await findByTestId("why-tasks-slip-row")).toBeTruthy();
  });

  // The footer states an automatic behaviour that would otherwise read as a
  // bug when observed: alerts stopping for a task that keeps being postponed.
  // The old copy here promised that alerts go quiet on a repeatedly postponed
  // task, which nothing implemented. The screen now describes what the app
  // actually does -- offer to shrink the task, on the task's own screen.
  it("describes the postponement behaviour that is actually implemented", async () => {
    const { findByText } = renderScreen();
    expect(await findByText(/postpone three times or more/i)).toBeTruthy();
  });

  it("does not claim that alerts stop on their own", async () => {
    const { queryByText, findByTestId } = renderScreen();
    await findByTestId("quiet-hours-start");
    expect(queryByText(/stops sending alerts/i)).toBeNull();
  });

  it("links to the adherence screen", async () => {
    const { findByTestId } = renderScreen();
    expect(await findByTestId("smart-alerts-insights-row")).toBeTruthy();
  });
});
