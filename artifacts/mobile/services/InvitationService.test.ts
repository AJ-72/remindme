import { sendInvitation } from "./InvitationService";
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
