import { isReachabilityStale, checkReachability } from "./RecipientLookupService";
import * as SessionService from "./SessionService";

jest.mock("./SessionService");

describe("isReachabilityStale", () => {
  it("is stale when never looked up", () => {
    expect(isReachabilityStale(undefined)).toBe(true);
  });

  it("is not stale within the default TTL", () => {
    const recent = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1h ago
    expect(isReachabilityStale(recent)).toBe(false);
  });

  it("is stale past the default TTL (24h)", () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(); // 25h ago
    expect(isReachabilityStale(old)).toBe(true);
  });

  it("respects a custom TTL", () => {
    const fiveMinAgo = new Date(Date.now() - 1000 * 60 * 5).toISOString();
    expect(isReachabilityStale(fiveMinAgo, 1000 * 60)).toBe(true); // 1min TTL
    expect(isReachabilityStale(fiveMinAgo, 1000 * 60 * 10)).toBe(false); // 10min TTL
  });
});

describe("checkReachability", () => {
  const mockFetch = jest.fn();
  beforeEach(() => {
    mockFetch.mockReset();
    // @ts-ignore
    global.fetch = mockFetch;
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue({
      access_token: "test-token",
    });
  });

  it("returns null when the phone cannot be normalized", async () => {
    const result = await checkReachability({ phone: "not-a-number" }, "IN");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null when there is no session", async () => {
    (SessionService.getCurrentSession as jest.Mock).mockResolvedValue(null);
    const result = await checkReachability({ phone: "9876543210" }, "IN");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls the lookup endpoint with a normalized E.164 number and returns the result", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ exists: true, appUserId: "user-123" }),
    });
    const result = await checkReachability({ phone: "9876543210" }, "IN");
    expect(result?.appUserId).toBe("user-123");
    expect(result?.lookedUpAt).toBeTruthy();
    const [, options] = mockFetch.mock.calls[0];
    const sentBody = JSON.parse(options.body);
    expect(sentBody.phoneE164).toBe("+919876543210");
  });

  it("returns appUserId: null when the lookup finds no match", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ exists: false, appUserId: null }),
    });
    const result = await checkReachability({ phone: "9876543210" }, "IN");
    expect(result?.appUserId).toBeNull();
  });

  it("returns null (not a thrown error) when the request fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const result = await checkReachability({ phone: "9876543210" }, "IN");
    expect(result).toBeNull();
  });
});
