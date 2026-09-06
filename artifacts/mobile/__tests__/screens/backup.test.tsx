import React from "react";
import { Share } from "react-native";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import BackupScreen from "@/app/backup";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { STORAGE_KEY } from "@/services/ReminderService";
import { logDebug } from "@/services/DebugLogService";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("expo-haptics");

jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <RemindersProvider>
        <BackupScreen />
      </RemindersProvider>
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
});

// Split out of the main Settings screen on 2026-09-06 — see
// __tests__/screens/settings.test.tsx for the single entry row into here.
describe("backup and restore", () => {
  it("shows a backup row", async () => {
    const { findByTestId } = renderScreen();
    expect(await findByTestId("backup-row")).toBeTruthy();
  });

  it("shares a backup containing the stored reminders when tapped", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "a",
          title: "Renew passport",
          description: "",
          datetime: "2034-01-01T00:00:00.000Z",
          completed: false,
        },
      ])
    );

    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("backup-row"));

    await waitFor(() => expect(Share.share).toHaveBeenCalled());
    const shared = (Share.share as jest.Mock).mock.calls[0][0].message;
    expect(JSON.parse(shared).reminders[0].title).toBe("Renew passport");
  });

  it("imports pasted backup text and reports what it added", async () => {
    const json = JSON.stringify({
      format: "curiousmind.reminders.backup",
      version: 1,
      exportedAt: "2026-08-10T00:00:00.000Z",
      reminders: [
        {
          id: "x",
          title: "Pay land tax",
          description: "",
          datetime: "2027-03-25T04:30:00.000Z",
          completed: false,
        },
      ],
      settings: {},
    });

    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("restore-row"));
    fireEvent.changeText(await findByTestId("restore-input"), json);
    fireEvent.press(await findByTestId("restore-confirm"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
      expect(stored).toHaveLength(1);
      expect(stored[0].title).toBe("Pay land tax");
    });
  });

  it("tells the user when the pasted text is not a backup, and changes nothing", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "keep", title: "Keep", description: "", datetime: "2027-01-01T00:00:00.000Z", completed: false },
      ])
    );

    const { findByTestId, findByText } = renderScreen();
    fireEvent.press(await findByTestId("restore-row"));
    fireEvent.changeText(await findByTestId("restore-input"), "{\"not\":\"a backup\"}");
    fireEvent.press(await findByTestId("restore-confirm"));

    expect(await findByText(/doesn't look like a Reminders backup/i)).toBeTruthy();
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
    expect(stored).toHaveLength(1);
  });
});

describe("debug logs", () => {
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
