import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const mockBattery = jest.fn<boolean | null, []>(() => true);
jest.mock("@/modules/delivery-health", () => ({
  isIgnoringBatteryOptimizations: () => mockBattery(),
  openBatteryOptimizationSettings: jest.fn(),
}));

import { getDeliveryInputs, channelLevelFromImportance } from "./DeliveryHealthService";

const N = Notifications as unknown as {
  getPermissionsAsync: jest.Mock;
  getNotificationChannelAsync?: jest.Mock;
  AndroidImportance: Record<string, number>;
};

describe("channelLevelFromImportance", () => {
  const imp = { NONE: 2, MIN: 3, LOW: 4, DEFAULT: 5, HIGH: 6 };
  it("maps NONE to blocked, MIN/LOW to quiet, DEFAULT+ to normal", () => {
    expect(channelLevelFromImportance(2, imp)).toBe("blocked");
    expect(channelLevelFromImportance(3, imp)).toBe("quiet");
    expect(channelLevelFromImportance(4, imp)).toBe("quiet");
    expect(channelLevelFromImportance(5, imp)).toBe("normal");
    expect(channelLevelFromImportance(6, imp)).toBe("normal");
  });
  it("returns null for a missing importance", () => {
    expect(channelLevelFromImportance(undefined, imp)).toBeNull();
  });
});

describe("getDeliveryInputs (android)", () => {
  const origOS = Platform.OS;
  const origVersion = Platform.Version;
  beforeEach(() => {
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    Object.defineProperty(Platform, "Version", { value: 34, configurable: true });
    N.AndroidImportance = { NONE: 2, MIN: 3, LOW: 4, DEFAULT: 5, HIGH: 6, MAX: 7 };
    N.getNotificationChannelAsync = jest.fn().mockResolvedValue({ importance: 7 });
    mockBattery.mockReturnValue(true);
  });
  afterAll(() => {
    Object.defineProperty(Platform, "OS", { value: origOS, configurable: true });
    Object.defineProperty(Platform, "Version", { value: origVersion, configurable: true });
  });

  it("reads all four conditions", async () => {
    N.getPermissionsAsync.mockResolvedValue({ status: "granted", android: { alarm: false } });
    mockBattery.mockReturnValue(false);
    await expect(getDeliveryInputs()).resolves.toEqual({
      notificationsGranted: true,
      channelLevel: "normal",
      exactAlarm: false,
      ignoringBatteryOptimizations: false,
    });
  });

  it("reads the channel the user's current alarm/vibration settings select", async () => {
    N.getPermissionsAsync.mockResolvedValue({ status: "granted", android: { alarm: true } });
    await getDeliveryInputs();
    expect(N.getNotificationChannelAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^reminders-/)
    );
  });

  it("reports a deleted/missing channel as unknown, not ok", async () => {
    N.getPermissionsAsync.mockResolvedValue({ status: "granted", android: { alarm: true } });
    N.getNotificationChannelAsync = jest.fn().mockResolvedValue(null);
    const r = await getDeliveryInputs();
    expect(r.channelLevel).toBeNull();
  });

  it("a missing native module reads as unknown battery state", async () => {
    N.getPermissionsAsync.mockResolvedValue({ status: "denied", android: { alarm: true } });
    mockBattery.mockReturnValue(null);
    const r = await getDeliveryInputs();
    expect(r.notificationsGranted).toBe(false);
    expect(r.ignoringBatteryOptimizations).toBeNull();
  });
});
