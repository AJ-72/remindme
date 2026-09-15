import { AppState } from "react-native";
import { renderHook, waitFor } from "@testing-library/react-native";

import { useInvitationCheck } from "@/hooks/useInvitationCheck";
import * as InvitationService from "@/services/InvitationService";
import * as Throttle from "@/services/invitationClaimThrottle";

jest.mock("@/services/InvitationService");
jest.mock("@/services/invitationClaimThrottle");

const mockCheck = InvitationService.checkForInvitations as jest.Mock;
const mockGetLastClaimAt = Throttle.getLastClaimAt as jest.Mock;
const mockSetLastClaimAt = Throttle.setLastClaimAt as jest.Mock;
const mockGetPushPending = Throttle.getPushPending as jest.Mock;
const mockSetPushPending = Throttle.setPushPending as jest.Mock;
const mockShouldClaimNow = Throttle.shouldClaimNow as jest.Mock;

describe("useInvitationCheck", () => {
  let activeListener: ((state: string) => void) | undefined;

  beforeEach(() => {
    mockCheck.mockReset();
    mockCheck.mockResolvedValue([]);
    mockGetLastClaimAt.mockResolvedValue(null);
    mockSetLastClaimAt.mockResolvedValue(undefined);
    mockGetPushPending.mockResolvedValue(false);
    mockSetPushPending.mockResolvedValue(undefined);
    mockShouldClaimNow.mockReturnValue(true); // default to claiming
    activeListener = undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation(((
      event: string,
      handler: (state: string) => void
    ) => {
      if (event === "change") activeListener = handler;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("checks for invitations once on mount", async () => {
    renderHook(() => useInvitationCheck());
    await waitFor(() => expect(mockCheck).toHaveBeenCalledTimes(1));
  });

  it("passes a navigate callback and a navigateToList callback through to checkForInvitations", async () => {
    renderHook(() => useInvitationCheck());
    await waitFor(() =>
      expect(mockCheck).toHaveBeenCalledWith(expect.any(Function), expect.any(Function))
    );
  });

  it("checks again when the app returns to the foreground", async () => {
    renderHook(() => useInvitationCheck());

    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalledTimes(1);
    });

    mockCheck.mockClear();
    activeListener?.("active");

    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalled();
    });
  });

  it("does not check again on a transition to a non-active state", async () => {
    renderHook(() => useInvitationCheck());
    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalledTimes(1);
    });
    mockCheck.mockClear();

    activeListener?.("background");
    // Give async operations a moment, then verify no additional calls.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("removes the AppState subscription on unmount", async () => {
    const remove = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockReturnValue({ remove } as ReturnType<
      typeof AppState.addEventListener
    >);
    const { unmount } = renderHook(() => useInvitationCheck());
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("skips the claim on mount if inside the throttle cooldown", async () => {
    mockShouldClaimNow.mockReturnValue(false);
    renderHook(() => useInvitationCheck());

    await waitFor(() => {
      expect(mockCheck).not.toHaveBeenCalled();
    });
  });

  it("claims on mount if outside the throttle cooldown", async () => {
    mockShouldClaimNow.mockReturnValue(true);
    renderHook(() => useInvitationCheck());

    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalledTimes(1);
    });
  });

  it("skips the claim on foreground resume if inside the throttle cooldown", async () => {
    mockShouldClaimNow.mockReturnValue(false);
    renderHook(() => useInvitationCheck());
    mockCheck.mockClear();

    activeListener?.("active");

    await waitFor(() => {
      expect(mockCheck).not.toHaveBeenCalled();
    });
  });

  it("claims on foreground resume if outside the throttle cooldown", async () => {
    mockShouldClaimNow.mockReturnValue(true);
    renderHook(() => useInvitationCheck());

    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalledTimes(1);
    });

    mockCheck.mockClear();
    activeListener?.("active");

    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalledTimes(1);
    });
  });

  it("records lastClaimAt after a claim", async () => {
    mockShouldClaimNow.mockReturnValue(true);
    mockCheck.mockResolvedValue([{ id: "test" }]);
    renderHook(() => useInvitationCheck());

    await waitFor(() => {
      expect(mockSetLastClaimAt).toHaveBeenCalledWith(expect.any(Number));
    });
  });
});
