import AsyncStorage from "@react-native-async-storage/async-storage";
import { renderHook, waitFor } from "@testing-library/react-native";

import { useInvitationCheck } from "@/hooks/useInvitationCheck";
import * as InvitationService from "@/services/InvitationService";
import {
  CLAIM_COOLDOWN_MS,
  getLastClaimAt,
  getPushPending,
  setLastClaimAt,
  setPushPending,
} from "@/services/invitationClaimThrottle";

/**
 * Companion to useInvitationCheck.test.ts, which stubs the whole throttle
 * module and therefore proves nothing about the wiring between the hook and
 * the real gate. Every defect found in review lived in exactly that seam: the
 * hook read a stubbed shouldClaimNow, so the branch that decided whether to
 * write lastClaimAt was never executed against real storage.
 *
 * Here ONLY InvitationService is mocked. The throttle module and AsyncStorage
 * are real.
 */
jest.mock("@/services/InvitationService");

const mockCheck = InvitationService.checkForInvitations as jest.Mock;

/** One mount-and-settle cycle, standing in for a cold start. */
async function mountOnce() {
  const { unmount } = renderHook(() => useInvitationCheck());
  // The effect's storage reads are async, so let the microtask queue drain
  // before the caller asserts on what it did.
  await waitFor(() => {}, { timeout: 200 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  unmount();
}

beforeEach(async () => {
  await (AsyncStorage as unknown as { clear: () => Promise<void> }).clear();
  mockCheck.mockReset();
  mockCheck.mockResolvedValue({ ok: true, claimed: [] });
});

describe("useInvitationCheck against the real throttle", () => {
  it("claims on a first launch and records the time", async () => {
    await mountOnce();

    expect(mockCheck).toHaveBeenCalledTimes(1);
    expect(await getLastClaimAt()).toEqual(expect.any(Number));
  });

  it("skips a second launch inside the cooldown", async () => {
    await mountOnce();
    mockCheck.mockClear();

    await mountOnce();

    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("claims again once the cooldown has passed", async () => {
    await setLastClaimAt(Date.now() - CLAIM_COOLDOWN_MS - 1000);

    await mountOnce();

    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  // Defect 1. A failed claim must not consume the window.
  it("retries on the next launch when the first claim never reached the server", async () => {
    mockCheck.mockResolvedValue({ ok: false, claimed: [] });

    await mountOnce();
    expect(mockCheck).toHaveBeenCalledTimes(1);
    expect(await getLastClaimAt()).toBeNull();

    mockCheck.mockClear();
    mockCheck.mockResolvedValue({ ok: true, claimed: [] });

    await mountOnce();

    expect(mockCheck).toHaveBeenCalledTimes(1);
    expect(await getLastClaimAt()).toEqual(expect.any(Number));
  });

  // Defect 3. The headless task claims the row, so the launch that follows
  // sees an empty list; the flag must still clear or the throttle is dead.
  it("clears pushPending after a successful but empty claim", async () => {
    await setLastClaimAt(Date.now()); // inside the cooldown
    await setPushPending(true);

    await mountOnce();

    expect(mockCheck).toHaveBeenCalledTimes(1); // the flag beat the cooldown
    expect(await getPushPending()).toBe(false);

    mockCheck.mockClear();
    await mountOnce();

    expect(mockCheck).not.toHaveBeenCalled(); // throttle is alive again
  });

  it("keeps pushPending set when the claim it triggered failed", async () => {
    await setLastClaimAt(Date.now());
    await setPushPending(true);
    mockCheck.mockResolvedValue({ ok: false, claimed: [] });

    await mountOnce();

    expect(await getPushPending()).toBe(true);
  });

  // Defect 4. A future timestamp must not lock the user out, and the next
  // successful claim must repair it.
  it("claims and repairs the stored time when the clock has moved backwards", async () => {
    const future = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await setLastClaimAt(future);

    await mountOnce();

    expect(mockCheck).toHaveBeenCalledTimes(1);
    const repaired = await getLastClaimAt();
    expect(repaired).not.toBeNull();
    expect(repaired as number).toBeLessThan(future);
  });
});
