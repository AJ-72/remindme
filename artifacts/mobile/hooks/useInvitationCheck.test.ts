import { AppState } from "react-native";
import { renderHook } from "@testing-library/react-native";

import { useInvitationCheck } from "@/hooks/useInvitationCheck";
import * as InvitationService from "@/services/InvitationService";

jest.mock("@/services/InvitationService");

const mockCheck = InvitationService.checkForInvitations as jest.Mock;

describe("useInvitationCheck", () => {
  let activeListener: ((state: string) => void) | undefined;

  beforeEach(() => {
    mockCheck.mockReset();
    mockCheck.mockResolvedValue([]);
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

  it("checks for invitations once on mount", () => {
    renderHook(() => useInvitationCheck());
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  it("passes a navigate callback and a navigateToList callback through to checkForInvitations", () => {
    renderHook(() => useInvitationCheck());
    expect(mockCheck).toHaveBeenCalledWith(expect.any(Function), expect.any(Function));
  });

  it("checks again when the app returns to the foreground", () => {
    renderHook(() => useInvitationCheck());
    mockCheck.mockClear();

    activeListener?.("active");
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  it("does not check again on a transition to a non-active state", () => {
    renderHook(() => useInvitationCheck());
    mockCheck.mockClear();

    activeListener?.("background");
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("removes the AppState subscription on unmount", () => {
    const remove = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockReturnValue({ remove } as ReturnType<
      typeof AppState.addEventListener
    >);
    const { unmount } = renderHook(() => useInvitationCheck());
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
