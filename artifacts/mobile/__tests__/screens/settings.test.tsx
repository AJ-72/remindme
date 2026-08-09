import React from "react";
import { StyleSheet } from "react-native";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SettingsScreen from "@/app/(tabs)/settings";
import { RemindersProvider } from "@/contexts/RemindersContext";
import {
  DEFAULT_ALARM_KEY,
  SHOW_DESCRIPTION_KEY,
  DICTATION_LANGUAGE_KEY,
} from "@/services/ReminderService";
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

  // Regression: these titles rendered in the tree but were invisible on device.
  // The shared alarmLabel style carried flex:1, which is right for a row child
  // but wrong here — each title sits in a nested column View next to its
  // sub-label, and flex:1 in a column collapses it to zero height. A text query
  // alone can't catch that, so assert the style too.
  it.each([
    ["Play alarm sound by default"],
    ["Show description in notifications"],
    ["Debug logs"],
  ])("renders the %s row title without a height-collapsing flex", async (title) => {
    const { findByText } = renderScreen();
    const label = await findByText(title);
    const style = StyleSheet.flatten(label.props.style);
    expect(style.flex).toBeUndefined();
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

  it("highlights English by default when no dictation language is stored (mocked device locale is en-US)", async () => {
    const { findByTestId } = renderScreen();
    const enPill = await findByTestId("dictation-language-en");
    const mlPill = await findByTestId("dictation-language-ml");
    await waitFor(() => expect(enPill.props.accessibilityState?.selected).toBe(true));
    expect(mlPill.props.accessibilityState?.selected).toBe(false);
  });

  it("highlights Malayalam when it's the stored dictation language", async () => {
    await AsyncStorage.setItem(DICTATION_LANGUAGE_KEY, "ml-IN");
    const { findByTestId } = renderScreen();
    const mlPill = await findByTestId("dictation-language-ml");
    await waitFor(() => expect(mlPill.props.accessibilityState?.selected).toBe(true));
  });

  it("tapping the Malayalam pill persists the new dictation language to storage", async () => {
    const { findByTestId } = renderScreen();
    const mlPill = await findByTestId("dictation-language-ml");

    fireEvent.press(mlPill);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(DICTATION_LANGUAGE_KEY, "ml-IN")
    );
  });

  it("tapping the English pill persists the new dictation language to storage", async () => {
    await AsyncStorage.setItem(DICTATION_LANGUAGE_KEY, "ml-IN");
    const { findByTestId } = renderScreen();
    const enPill = await findByTestId("dictation-language-en");

    fireEvent.press(enPill);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(DICTATION_LANGUAGE_KEY, "en-US")
    );
  });
});
