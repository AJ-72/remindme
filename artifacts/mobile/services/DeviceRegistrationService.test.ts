import { registerDeviceForPush } from "./DeviceRegistrationService";
import * as SessionService from "./SessionService";

jest.mock("./SessionService");

// expo-notifications is dynamically require()'d inside the service (matches
// ReminderService.ts's own pattern), so mock the module the way the manual
// mock at __mocks__/expo-notifications.ts does.
jest.mock("expo-notifications");
import * as Notifications from "expo-notifications";

const FAKE_SESSION = { user: { id: "user-1" } } as unknown as import("@supabase/supabase-js").Session;

/**
 * Mocks the client for the insert-first, update-on-conflict flow (see
 * DeviceRegistrationService.ts's own comment on why this replaced a single
 * upsert). `insertResult` drives the INSERT call; `updateResult`, if given,
 * drives the UPDATE call that only runs after a 23505 from the insert.
 */
function mockDbResult(
  insertResult: { error: unknown },
  updateResult?: { data: unknown; error: unknown }
) {
  const insert = jest.fn().mockResolvedValue(insertResult);
  const eq = jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue(updateResult ?? { data: null, error: null }),
  });
  const update = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ insert, update });
  (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ from });
  return { from, insert, update };
}

describe("registerDeviceForPush", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns not_authenticated and never requests permissions when there is no session", async () => {
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue(null);

    const result = await registerDeviceForPush();

    expect(result).toEqual({ ok: false, error: "not_authenticated" });
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("returns permission_denied when permission is not granted", async () => {
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue(FAKE_SESSION);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "denied" });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: "denied" });

    const result = await registerDeviceForPush();

    expect(result).toEqual({ ok: false, error: "permission_denied" });
  });

  it("returns push_token_error when getExpoPushTokenAsync throws", async () => {
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue(FAKE_SESSION);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValue(
      new Error("unsupported environment")
    );

    const result = await registerDeviceForPush();

    expect(result).toEqual({ ok: false, error: "push_token_error" });
  });

  it("inserts the token with this session's user_id and returns ok:true on success", async () => {
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue(FAKE_SESSION);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: "ExponentPushToken[abc123]",
    });
    const { insert, update } = mockDbResult({ error: null });

    const result = await registerDeviceForPush();

    expect(result).toEqual({ ok: true });
    expect(insert).toHaveBeenCalled();
    const [payload] = insert.mock.calls[0];
    // The regression this test guards: an insert missing user_id passes
    // every mock-based assertion that only checks expo_push_token, but fails
    // devices_insert_own's RLS check (`user_id = auth.uid()`) against the
    // real table, since devices.user_id is NOT NULL with no default.
    expect(payload.user_id).toBe("user-1");
    expect(payload.expo_push_token).toBe("ExponentPushToken[abc123]");
    expect(update).not.toHaveBeenCalled();
  });

  it("re-registering the same device updates instead of erroring", async () => {
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue(FAKE_SESSION);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: "ExponentPushToken[abc123]",
    });
    // Insert 23505s (the row already exists - this account's own prior
    // registration), and the update path finds and updates exactly that row.
    mockDbResult(
      { error: { code: "23505", message: "duplicate key value violates unique constraint" } },
      { data: [{ id: "device-1" }], error: null }
    );

    const result = await registerDeviceForPush();

    expect(result).toEqual({ ok: true });
  });

  it("returns token_conflict when the token belongs to a different account", async () => {
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue(FAKE_SESSION);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: "ExponentPushToken[abc123]",
    });
    // Insert 23505s, but the update matches zero rows - RLS filtered it out
    // because devices_update_own only sees rows this account owns. That's
    // what actually distinguishes "mine, refresh it" from "already claimed
    // by someone else": no error, just zero rows updated.
    mockDbResult(
      { error: { code: "23505", message: "duplicate key value violates unique constraint" } },
      { data: [], error: null }
    );

    const result = await registerDeviceForPush();

    expect(result).toEqual({ ok: false, error: "token_conflict" });
  });

  it("returns registration_failed on a generic insert error", async () => {
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue(FAKE_SESSION);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: "ExponentPushToken[abc123]",
    });
    mockDbResult({ error: { code: "500", message: "network blip" } });

    const result = await registerDeviceForPush();

    expect(result).toEqual({ ok: false, error: "registration_failed" });
  });

  it("returns registration_failed if the update-on-conflict path itself errors", async () => {
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue(FAKE_SESSION);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: "ExponentPushToken[abc123]",
    });
    mockDbResult(
      { error: { code: "23505", message: "duplicate key value violates unique constraint" } },
      { data: null, error: { code: "500", message: "network blip" } }
    );

    const result = await registerDeviceForPush();

    expect(result).toEqual({ ok: false, error: "registration_failed" });
  });

  it("never throws even if the client throws synchronously", async () => {
    (SessionService.getCurrentSession as jest.Mock).mockRejectedValue(new Error("boom"));

    await expect(registerDeviceForPush()).resolves.toEqual({
      ok: false,
      error: "registration_failed",
    });
  });
});
