import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const mockGetInputs = jest.fn();
const mockApplyFix = jest.fn();
const mockTestFire = jest.fn();
jest.mock("@/services/DeliveryHealthService", () => ({
  getDeliveryInputs: () => mockGetInputs(),
  applyFix: (f: string) => mockApplyFix(f),
  testFireNotification: () => mockTestFire(),
}));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));

import DeliveryCheckScreen from "@/app/delivery-check";

const allGood = {
  notificationsGranted: true,
  channelLevel: "normal",
  exactAlarm: true,
  ignoringBatteryOptimizations: true,
};

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <DeliveryCheckScreen />
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetInputs.mockResolvedValue(allGood);
});

describe("DeliveryCheckScreen", () => {
  it("shows an all-clear summary when every check passes", async () => {
    const { findByTestId, queryByTestId } = renderScreen();
    expect(await findByTestId("delivery-overall-ok")).toBeTruthy();
    expect(queryByTestId("delivery-fix-battery")).toBeNull();
  });

  it("shows a problem summary and a working fix button per failing check", async () => {
    mockGetInputs.mockResolvedValue({
      ...allGood,
      exactAlarm: false,
      ignoringBatteryOptimizations: false,
    });
    const { findByTestId } = renderScreen();
    expect(await findByTestId("delivery-overall-problem")).toBeTruthy();
    fireEvent.press(await findByTestId("delivery-fix-battery"));
    expect(mockApplyFix).toHaveBeenCalledWith("battery_settings");
    fireEvent.press(await findByTestId("delivery-fix-exact_alarm"));
    expect(mockApplyFix).toHaveBeenCalledWith("exact_alarm_settings");
  });

  it("marks unreadable checks as unknown rather than passing them", async () => {
    mockGetInputs.mockResolvedValue({ ...allGood, ignoringBatteryOptimizations: null });
    const { findByTestId } = renderScreen();
    expect(await findByTestId("delivery-status-battery-unknown")).toBeTruthy();
    expect(await findByTestId("delivery-overall-unknown")).toBeTruthy();
  });

  it("test-fire reports arrival", async () => {
    let resolve!: (v: string) => void;
    mockTestFire.mockReturnValue(new Promise((r) => (resolve = r)));
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("delivery-test-fire"));
    expect(await findByTestId("delivery-test-waiting")).toBeTruthy();
    await act(async () => resolve("arrived"));
    expect(await findByTestId("delivery-test-arrived")).toBeTruthy();
  });

  it("test-fire reports a timeout as a failure and re-checks conditions", async () => {
    mockTestFire.mockResolvedValue("timeout");
    const { findByTestId } = renderScreen();
    await findByTestId("delivery-overall-ok");
    const callsBefore = mockGetInputs.mock.calls.length;
    fireEvent.press(await findByTestId("delivery-test-fire"));
    expect(await findByTestId("delivery-test-timeout")).toBeTruthy();
    expect(mockGetInputs.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
