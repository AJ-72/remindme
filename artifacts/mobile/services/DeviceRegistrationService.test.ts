import { registerDeviceForPush } from "./DeviceRegistrationService";
import * as SessionService from "./SessionService";

jest.mock("./SessionService");

// expo-notifications is dynamically require()'d inside the service (matches
// ReminderService.ts's own pattern), so mock the module the way the manual
// mock at __mocks__/expo-notifications.ts does.
jest.mock("expo-notifications");
import * as Notifications from "expo-notifications";

function mockUpsertResult(result: { data: unknown; error: unknown }) {
  const upsert = jest.fn().mockResolvedValue(result);
  const from = jest.fn().mockReturnValue({ upsert });
  (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ from });
  return { from, upsert };
}

describe("registerDeviceForPush", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns not_authenticated and never requests permissions when there is no session", async () => {
    (SessionService.hasSession as jest.Mock).mockResolvedValue(false);

    const result = await registerDeviceForPush();

    expect(result).toEqual({ ok: false, error: "not_authenticated" });
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("returns permission_denied when permission is not granted", async () => {
    (SessionService.hasSession as jest.Mock).mockResolvedValue(true);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "denied" });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: "denied" });

    const result = await registerDeviceForPush();

    expect(result).toEqual({ ok: false, error: "permission_denied" });
  });

  it("returns push_token_error when getExpoPushTokenAsync throws", async () => {
    (SessionService.hasSession as jest.Mock).mockResolvedValue(true);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValue(
      new Error("unsupported environment")
    );

    const result = await registerDeviceForPush();

    expect(result).toEqual({ ok: false, error: "push_token_error" });
  });

  it("upserts the token and returns ok:true on success", async () => {
    (SessionService.hasSession as jest.Mock).mockResolvedValue(true);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: "ExponentPushToken[abc123]",
    });
    const { upsert } = mockUpsertResult({ data: [{ id: "device-1" }], error: null });

    const result = await registerDeviceForPush();

    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalled();
    const [payload] = upsert.mock.calls[0];
    expect(payload.expo_push_token).toBe("ExponentPushToken[abc123]");
  });

  it("returns token_conflict when the token is already registered to a different account", async () => {
    (SessionService.hasSession as jest.Mock).mockResolvedValue(true);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: "ExponentPushToken[abc123]",
    });
    mockUpsertResult({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    const result = await registerDeviceForPush();

    expect(result).toEqual({ ok: false, error: "token_conflict" });
  });

  it("returns registration_failed on a generic upsert error", async () => {
    (SessionService.hasSession as jest.Mock).mockResolvedValue(true);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: "ExponentPushToken[abc123]",
    });
    mockUpsertResult({ data: null, error: { code: "500", message: "network blip" } });

    const result = await registerDeviceForPush();

    expect(result).toEqual({ ok: false, error: "registration_failed" });
  });

  it("never throws even if the client throws synchronously", async () => {
    (SessionService.hasSession as jest.Mock).mockRejectedValue(new Error("boom"));

    await expect(registerDeviceForPush()).resolves.toEqual({
      ok: false,
      error: "registration_failed",
    });
  });
});
