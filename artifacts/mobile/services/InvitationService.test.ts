import {
  sendInvitation,
  claimPendingInvitations,
  checkForInvitations,
  bindViaInviteToken,
  respondToInvitation,
} from "./InvitationService";
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

describe("respondToInvitation", () => {
  const mockFetch = jest.fn();
  beforeEach(() => {
    mockFetch.mockReset();
    // @ts-ignore
    global.fetch = mockFetch;
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue({ access_token: "t" });
  });

  it("returns ok:true on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ invitation: { id: "inv-1", status: "accepted" } }),
    });
    const result = await respondToInvitation("inv-1", "accepted");
    expect(result).toEqual({ ok: true });
  });

  it("returns ok:false on server failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: "not_found", message: "..." } }),
    });
    const result = await respondToInvitation("inv-1", "declined");
    expect(result).toEqual({ ok: false, error: "not_found" });
  });
});

describe("checkForInvitations", () => {
  const mockFetch = jest.fn();
  beforeEach(() => {
    mockFetch.mockReset();
    // @ts-ignore
    global.fetch = mockFetch;
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue({ access_token: "t" });
  });

  it("navigates to invitation-preview when exactly one invitation is claimed", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        claimed: [
          {
            id: "inv-1",
            title: "Take BP tablets",
            description: "After breakfast",
            datetime: "2026-09-09T08:00:00.000Z",
            senderId: "sender-1",
          },
        ],
      }),
    });
    const navigate = jest.fn();
    await checkForInvitations(navigate);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({
      id: "inv-1",
      title: "Take BP tablets",
      description: "After breakfast",
      datetime: "2026-09-09T08:00:00.000Z",
      senderId: "sender-1",
    });
  });

  it("does not navigate when no invitations are claimed", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ claimed: [] }) });
    const navigate = jest.fn();
    await checkForInvitations(navigate);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not navigate when more than one invitation is claimed (list is a separate concern)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        claimed: [
          { id: "inv-1", title: "A", description: null, datetime: "2026-09-09T08:00:00.000Z", senderId: "s1" },
          { id: "inv-2", title: "B", description: null, datetime: "2026-09-10T08:00:00.000Z", senderId: "s2" },
        ],
      }),
    });
    const navigate = jest.fn();
    const result = await checkForInvitations(navigate);
    expect(navigate).not.toHaveBeenCalled();
    expect(result).toHaveLength(2);
  });

  it("swallows a missing session / network failure and never throws", async () => {
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue(null);
    const navigate = jest.fn();
    const result = await checkForInvitations(navigate);
    expect(result).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
  });
});
