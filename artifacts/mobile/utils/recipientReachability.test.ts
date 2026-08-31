import { isReachabilityFresh } from "@/utils/recipientReachability";

const NOW = new Date("2026-08-30T12:00:00Z").getTime();

describe("isReachabilityFresh", () => {
  it("treats a recent lookup as fresh and an old one as stale", () => {
    expect(
      isReachabilityFresh(
        { lookedUpAt: "2026-08-30T11:59:00Z", reachable: true },
        NOW
      )
    ).toBe(true);
    expect(
      isReachabilityFresh(
        { lookedUpAt: "2026-08-23T12:00:00Z", reachable: true },
        NOW
      )
    ).toBe(false);
  });
  it("lets a miss go stale far sooner than a hit", () => {
    // Both looked up two hours ago. A slightly stale "they have the app" is
    // harmless - the send degrades gracefully. A stale "they don't" is the bug
    // that makes the feature look permanently broken the day they install, so
    // it must be re-checked much sooner.
    const twoHoursAgo = "2026-08-30T10:00:00Z";
    expect(
      isReachabilityFresh({ lookedUpAt: twoHoursAgo, reachable: true }, NOW)
    ).toBe(true);
    expect(
      isReachabilityFresh({ lookedUpAt: twoHoursAgo, reachable: false }, NOW)
    ).toBe(false);
  });
  it("never reuses a miss that came from an ambiguous number", () => {
    // The number needed a region to resolve, so the hash may have been for a
    // different country's number entirely. A miss proves nothing at all, and
    // caching it would bake the NRI normalization mismatch in permanently.
    expect(
      isReachabilityFresh(
        {
          lookedUpAt: "2026-08-30T11:59:59Z",
          reachable: false,
          ambiguous: true,
        },
        NOW
      )
    ).toBe(false);
  });

  it("still trusts an ambiguous HIT, because matching proves the hash was right", () => {
    expect(
      isReachabilityFresh(
        {
          lookedUpAt: "2026-08-30T11:59:59Z",
          reachable: true,
          ambiguous: true,
        },
        NOW
      )
    ).toBe(true);
  });
  it("treats a missing or unreadable timestamp as needing a fresh lookup", () => {
    // Failing open here is the safe direction: an extra lookup costs a request,
    // whereas wrongly reusing nothing costs the feature.
    expect(isReachabilityFresh(undefined, NOW)).toBe(false);
    expect(isReachabilityFresh(null, NOW)).toBe(false);
    expect(isReachabilityFresh({}, NOW)).toBe(false);
    expect(isReachabilityFresh({ reachable: true }, NOW)).toBe(false);
    expect(
      isReachabilityFresh({ lookedUpAt: "not a date", reachable: true }, NOW)
    ).toBe(false);
  });

  it("does not treat a lookup dated in the future as fresh", () => {
    // A device with a skewed clock could otherwise pin a stale answer forever.
    expect(
      isReachabilityFresh(
        { lookedUpAt: "2027-01-01T00:00:00Z", reachable: false },
        NOW
      )
    ).toBe(false);
  });
});
