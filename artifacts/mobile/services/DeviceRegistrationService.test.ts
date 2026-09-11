import { registerDeviceForPush } from "./DeviceRegistrationService";
import * as SessionService from "./SessionService";
import { logDebug } from "./DebugLogService";

jest.mock("./SessionService");
// The whole point of this service is a fire-and-forget call site (no
// .then/.catch at either call site in bind-invite.tsx/register-number.tsx) -
// every outcome, including ok:true, must reach the debug log or a real
// failure (e.g. push_token_error from a misconfigured native FCM setup, the
// actual production cause of an empty `devices` table) is invisible even in
// DebugLogService's own ring buffer.
jest.mock("./DebugLogService", () => ({ logDebug: jest.fn().mockResolvedValue(undefined) }));

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
    expect(logDebug).toHaveBeenCalledWith(
      expect.stringContaining("not_authenticated")
    );
  });

  it("returns permission_denied when permission is not granted", async () => {
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue(FAKE_SESSION);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "denied" });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: "denied" });

    const result = await registerDeviceForPush();

    expect(result).toEqual({ ok: false, error: "permission_denied" });
    expect(logDebug).toHaveBeenCalledWith(
      expect.stringContaining("permission_denied")
    );
  });

  it("returns push_token_error when getExpoPushTokenAsync throws, and logs the native error", async () => {
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue(FAKE_SESSION);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValue(
      new Error("unsupported environment")
    );

    const result = await registerDeviceForPush();

    expect(result).toEqual({ ok: false, error: "push_token_error" });
    // The message itself (e.g. a missing google-services.json on Android)
    // is the whole diagnostic value here - a bare "push_token_error" string
    // gives no lead on which of several native failure modes actually fired.
    expect(logDebug).toHaveBeenCalledWith(
      expect.stringContaining("push_token_error")
    );
    expect(logDebug).toHaveBeenCalledWith(
      expect.stringContaining("unsupported environment")
    );
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
    expect(logDebug).toHaveBeenCalledWith(expect.stringContaining("ok"));
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
    expect(logDebug).toHaveBeenCalledWith(
      expect.stringContaining("token_conflict")
    );
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
    expect(logDebug).toHaveBeenCalledWith(
      expect.stringContaining("registration_failed")
    );
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
    expect(logDebug).toHaveBeenCalledWith(
      expect.stringContaining("registration_failed")
    );
  });
});
