import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SettingsScreen from "@/app/(tabs)/settings";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { DEFAULT_ALARM_KEY } from "@/services/ReminderService";

jest.mock("expo-haptics");

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <RemindersProvider>
        <SettingsScreen />
      </RemindersProvider>
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
});

describe("SettingsScreen", () => {
  it("shows the alarm switch on, with 'plays a sound' copy, when no default is stored", async () => {
    const { findByText, findByRole } = renderScreen();
    expect(await findByText("Notification will play a sound")).toBeTruthy();
    const switchEl = await findByRole("switch");
    expect(switchEl.props.value).toBe(true);
  });

  it("shows the alarm switch off, with 'silent' copy, when the stored default is false", async () => {
    await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(false));
    const { findByText, findByRole } = renderScreen();
    expect(await findByText("Notification will be silent")).toBeTruthy();
    const switchEl = await findByRole("switch");
    expect(switchEl.props.value).toBe(false);
  });

  it("toggling the switch persists the new default to storage", async () => {
    const { findByRole } = renderScreen();
    const switchEl = await findByRole("switch");

    fireEvent(switchEl, "valueChange", false);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        DEFAULT_ALARM_KEY,
        JSON.stringify(false)
      )
    );
  });
});
