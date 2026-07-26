import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SettingsScreen from "@/app/(tabs)/settings";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { DEFAULT_ALARM_KEY, SHOW_DESCRIPTION_KEY } from "@/services/ReminderService";
import { logDebug } from "@/services/DebugLogService";

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
    const { findByText, findByTestId } = renderScreen();
    expect(await findByText("Notification will play a sound")).toBeTruthy();
    const switchEl = await findByTestId("default-alarm-switch");
    expect(switchEl.props.value).toBe(true);
  });

  it("shows the alarm switch off, with 'silent' copy, when the stored default is false", async () => {
    await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(false));
    const { findByText, findByTestId } = renderScreen();
    expect(await findByText("Notification will be silent")).toBeTruthy();
    const switchEl = await findByTestId("default-alarm-switch");
    expect(switchEl.props.value).toBe(false);
  });

  it("toggling the switch persists the new default to storage", async () => {
    const { findByTestId } = renderScreen();
    const switchEl = await findByTestId("default-alarm-switch");

    fireEvent(switchEl, "valueChange", false);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        DEFAULT_ALARM_KEY,
        JSON.stringify(false)
      )
    );
  });

  it("shows the description switch off, with title-only copy, when no setting is stored", async () => {
    const { findByText, findByTestId } = renderScreen();
    expect(await findByText("Notification shows only the reminder title")).toBeTruthy();
    const switchEl = await findByTestId("show-description-switch");
    expect(switchEl.props.value).toBe(false);
  });

  it("shows the description switch on, with lock-screen copy, when the stored setting is true", async () => {
    await AsyncStorage.setItem(SHOW_DESCRIPTION_KEY, JSON.stringify(true));
    const { findByText, findByTestId } = renderScreen();
    expect(
      await findByText("Description appears on the lock screen and notification shade")
    ).toBeTruthy();
    const switchEl = await findByTestId("show-description-switch");
    expect(switchEl.props.value).toBe(true);
  });

  it("toggling the description switch persists the new setting to storage", async () => {
    const { findByTestId } = renderScreen();
    const switchEl = await findByTestId("show-description-switch");

    fireEvent(switchEl, "valueChange", true);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        SHOW_DESCRIPTION_KEY,
        JSON.stringify(true)
      )
    );
  });

  it("shows a placeholder when the debug logs row is tapped with no logs recorded yet", async () => {
    const { findByTestId } = renderScreen();
    const row = await findByTestId("debug-logs-row");

    fireEvent.press(row);

    const text = await findByTestId("debug-logs-text");
    await waitFor(() => expect(text.props.children).toMatch(/no debug logs recorded/i));
  });

  it("shows recorded log entries when the debug logs row is tapped", async () => {
    await logDebug("share-intent test entry");

    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("debug-logs-row"));

    const text = await findByTestId("debug-logs-text");
    await waitFor(() => expect(text.props.children).toMatch(/share-intent test entry/));
  });
});
