import { sendInvitation, claimPendingInvitations, bindViaInviteToken } from "./InvitationService";
import * as SessionService from "./SessionService";

jest.mock("./SessionService");

describe("sendInvitation", () => {
  const mockFetch = jest.fn();
  beforeEach(() => {
    mockFetch.mockReset();
    // @ts-ignore
    global.fetch = mockFetch;
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue({
      access_token: "test-token",
    });
  });

  it("returns ok:true with the invitation id on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ invitation: { id: "inv-1" } }),
    });
    const result = await sendInvitation("user-1", "Take BP tablets", "After breakfast", "2026-09-09T08:00:00.000Z");
    expect(result).toEqual({ ok: true, invitationId: "inv-1" });
  });

  it("returns ok:false with the server's error code when blocked", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: "blocked", message: "..." } }),
    });
    const result = await sendInvitation("user-1", "X", "Y", "2026-09-09T08:00:00.000Z");
    expect(result).toEqual({ ok: false, error: "blocked" });
  });

  it("returns ok:false when there is no session", async () => {
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue(null);
    const result = await sendInvitation("user-1", "X", "Y", "2026-09-09T08:00:00.000Z");
    expect(result).toEqual({ ok: false, error: "not_authenticated" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns ok:false on a network failure without throwing", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));
    const result = await sendInvitation("user-1", "X", "Y", "2026-09-09T08:00:00.000Z");
    expect(result).toEqual({ ok: false, error: "network_error" });
  });
});

describe("claimPendingInvitations", () => {
  const mockFetch = jest.fn();
  beforeEach(() => {
    mockFetch.mockReset();
    // @ts-ignore
    global.fetch = mockFetch;
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue({
      access_token: "test-token",
    });
  });

  it("returns the claimed invitations", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        claimed: [{ id: "inv-1", title: "X", description: "Y", datetime: "2026-09-09T08:00:00Z", senderId: "sender-1" }],
      }),
    });
    const result = await claimPendingInvitations();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("inv-1");
  });

  it("returns an empty array when there is no session, without calling fetch", async () => {
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue(null);
    const result = await claimPendingInvitations();
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns an empty array (not a throw) on failure", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));
    const result = await claimPendingInvitations();
    expect(result).toEqual([]);
  });
});

describe("bindViaInviteToken", () => {
  beforeEach(() => {
    (SessionService.ensureSession as jest.Mock).mockReset();
    (SessionService.getSupabaseClient as jest.Mock).mockReset();
  });

  it("establishes a session and returns ok:true on a successful bind", async () => {
    (SessionService.ensureSession as jest.Mock).mockResolvedValue({ access_token: "t" });
    const rpcMock = jest.fn().mockResolvedValue({ data: [{ id: "user-1" }], error: null });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });

    const result = await bindViaInviteToken("some-token");

    expect(result).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith("bind_via_invite_token", { token: "some-token" });
  });

  it("returns ok:false with the server error when the token is invalid or spent", async () => {
    (SessionService.ensureSession as jest.Mock).mockResolvedValue({ access_token: "t" });
    const rpcMock = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "invalid token" },
    });
    (SessionService.getSupabaseClient as jest.Mock).mockReturnValue({ rpc: rpcMock });

    const result = await bindViaInviteToken("bad-token");

    expect(result).toEqual({ ok: false, error: "invalid token" });
  });

  it("returns ok:false when ensureSession itself fails", async () => {
    (SessionService.ensureSession as jest.Mock).mockRejectedValue(new Error("network down"));

    const result = await bindViaInviteToken("some-token");

    expect(result).toEqual({ ok: false, error: "network_error" });
  });
});
