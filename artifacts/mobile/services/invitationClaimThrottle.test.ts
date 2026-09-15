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

    // A wall-clock epoch can move backwards: NTP correction, a carrier time
    // update, a hand-set clock. Without the guard the subtraction stays
    // negative and the user is locked out until real time catches up.
    it("claims when the clock has moved backwards past lastClaimAt", () => {
      const lastClaimAt = 5_000_000_000;
      const now = lastClaimAt - 24 * 60 * 60 * 1000; // a day earlier
      expect(shouldClaimNow(lastClaimAt, now, false)).toBe(true);
    });

    it("claims when lastClaimAt is only one millisecond in the future", () => {
      const now = 1_000_000;
      expect(shouldClaimNow(now + 1, now, false)).toBe(true);
    });

    // The cooldown is an upper bound on how long a recipient with broken push
    // stays blind, and invitations expire at their own reminder time. A
    // cooldown above an hour outlives the reminders people actually send.
    it("keeps the cooldown at or below one hour", () => {
      expect(CLAIM_COOLDOWN_MS).toBeLessThanOrEqual(60 * 60 * 1000);
    });
  });
});
