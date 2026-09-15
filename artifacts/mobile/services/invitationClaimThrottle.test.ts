import { shouldClaimNow, CLAIM_COOLDOWN_MS } from "./invitationClaimThrottle";

describe("invitationClaimThrottle", () => {
  describe("shouldClaimNow", () => {
    it("claims on a fresh install (lastClaimAt === null)", () => {
      const now = Date.now();
      expect(shouldClaimNow(null, now, false)).toBe(true);
    });

    it("skips if inside the cooldown and no push pending", () => {
      const lastClaimAt = 1000;
      const now = lastClaimAt + CLAIM_COOLDOWN_MS / 2; // halfway through the cooldown
      expect(shouldClaimNow(lastClaimAt, now, false)).toBe(false);
    });

    it("claims after the cooldown expires", () => {
      const lastClaimAt = 1000;
      const now = lastClaimAt + CLAIM_COOLDOWN_MS + 1; // just past the cooldown
      expect(shouldClaimNow(lastClaimAt, now, false)).toBe(true);
    });

    it("claims at exactly the cooldown boundary", () => {
      const lastClaimAt = 1000;
      const now = lastClaimAt + CLAIM_COOLDOWN_MS;
      expect(shouldClaimNow(lastClaimAt, now, false)).toBe(true);
    });

    it("claims immediately if pushPending is true, even inside cooldown", () => {
      const lastClaimAt = 1000;
      const now = lastClaimAt + 1000; // only 1 second later
      expect(shouldClaimNow(lastClaimAt, now, true)).toBe(true);
    });

    it("claims immediately if pushPending is true and lastClaimAt is null", () => {
      const now = Date.now();
      expect(shouldClaimNow(null, now, true)).toBe(true);
    });
  });
});
