import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NameOnboarding from "@/components/NameOnboarding";
import { RemindersProvider } from "@/contexts/RemindersContext";
import {
  NAME_PROMPT_KEY,
  REGISTERED_PHONE_KEY,
  STORAGE_KEY as REMINDERS_KEY,
  USER_NAME_KEY,
} from "@/services/ReminderService";

jest.mock("expo-haptics");
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
// Unconfigured by default, like a Jest/dev build; the B3 block opts in.
jest.mock("@/services/DriveBackupService", () => ({
  getDriveBackup: jest.fn(() => ({ isConfigured: () => false })),
}));

function renderOnboarding(enabled = true) {
  return render(
    <RemindersProvider>
      <NameOnboarding enabled={enabled} />
    </RemindersProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
});

describe("NameOnboarding", () => {
  it("prompts on a first launch and stores the name", async () => {
    const { findByTestId } = renderOnboarding();
    fireEvent.changeText(await findByTestId("name-sheet-input"), "Anand");
    fireEvent.press(await findByTestId("name-sheet-save"));

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(USER_NAME_KEY)).toBe("Anand")
    );
    expect(await AsyncStorage.getItem(NAME_PROMPT_KEY)).toBe("1");
  });

  // Skipping is a one-time answer too. Re-asking on every cold start is how a
  // friendly prompt turns into nagging.
  it("records the prompt as seen when skipped, without storing a name", async () => {
    const { findByTestId, queryByTestId } = renderOnboarding();
    fireEvent.press(await findByTestId("name-sheet-dismiss"));

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(NAME_PROMPT_KEY)).toBe("1")
    );
    expect(await AsyncStorage.getItem(USER_NAME_KEY)).toBeNull();
    await waitFor(() => expect(queryByTestId("name-sheet-input")).toBeNull());
  });

  it("does not prompt again once the prompt has been seen", async () => {
    await AsyncStorage.setItem(NAME_PROMPT_KEY, "1");
    const { queryByTestId } = renderOnboarding();
    await waitFor(() => expect(queryByTestId("name-sheet-input")).toBeNull());
  });

  // The gate exists so the sheet never renders behind the system permission
  // dialog, where the tap dismissing that dialog would skip it for good.
  it("stays closed until the permission onboarding gate opens", async () => {
    const { queryByTestId } = renderOnboarding(false);
    await waitFor(() => expect(queryByTestId("name-sheet-input")).toBeNull());
    expect(await AsyncStorage.getItem(NAME_PROMPT_KEY)).toBeNull();
  });
});

// Rule 04 of the first-run study: an invited install never sees onboarding.
// That user tapped a link to read somebody else's reminder, and this sheet
// would render over the bind screen, in front of the thing they came for.
// Their name ask waits on the home screen behind Accept.
describe("NameOnboarding — an install opened by an invite link", () => {
  function launchedFrom(url: string | null) {
    return jest.spyOn(Linking, "getInitialURL").mockResolvedValue(url);
  }

  it("stays away when the app was opened by a bind-invite link", async () => {
    const spy = launchedFrom("mobile://bind-invite?token=abc-123");
    const { queryByTestId } = renderOnboarding();

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(queryByTestId("name-sheet-input")).toBeNull();
    spy.mockRestore();
  });

  // Not marked as seen, only skipped for this launch: a bind that failed
  // must not cost the user their name prompt for good.
  it("leaves the prompt unspent, so an ordinary launch still asks", async () => {
    const spy = launchedFrom("mobile://bind-invite?token=abc-123");
    renderOnboarding();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(await AsyncStorage.getItem(NAME_PROMPT_KEY)).toBeNull();

    spy.mockResolvedValue(null);
    const { findByTestId } = renderOnboarding();
    expect(await findByTestId("name-sheet-input")).toBeTruthy();
    spy.mockRestore();
  });

  it("asks as usual on a launch from any other link", async () => {
    const spy = launchedFrom("mobile://reminder-detail?id=r1");
    const { findByTestId } = renderOnboarding();

    expect(await findByTestId("name-sheet-input")).toBeTruthy();
    spy.mockRestore();
  });
});

// B3: an empty install may be someone coming back; offer the Drive restore
// there and nowhere else. An Auto-Backup-restored install is not empty.
describe("NameOnboarding — welcome-back offer (B3)", () => {
  const { getDriveBackup } = jest.requireMock("@/services/DriveBackupService") as {
    getDriveBackup: jest.Mock;
  };
  const { router } = jest.requireMock("expo-router") as { router: { push: jest.Mock } };

  beforeEach(() => {
    getDriveBackup.mockReturnValue({ isConfigured: () => true });
  });

  it("offers a restore on an empty install and routes to welcome-back", async () => {
    const { findByTestId } = renderOnboarding();
    fireEvent.press(await findByTestId("name-sheet-restore"));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/welcome-back"));
    expect(await AsyncStorage.getItem(NAME_PROMPT_KEY)).toBe("1");
  });

  it("does not offer it once the install has reminders", async () => {
    await AsyncStorage.setItem(
      REMINDERS_KEY,
      JSON.stringify([{ id: "a", title: "x", description: "", datetime: "2030-01-01T00:00:00.000Z", completed: false }])
    );
    const { findByTestId, queryByTestId } = renderOnboarding();
    await findByTestId("name-sheet-input");
    expect(queryByTestId("name-sheet-restore")).toBeNull();
  });

  it("does not offer it once a number is registered here", async () => {
    await AsyncStorage.setItem(REGISTERED_PHONE_KEY, "+919876543210");
    const { findByTestId, queryByTestId } = renderOnboarding();
    await findByTestId("name-sheet-input");
    expect(queryByTestId("name-sheet-restore")).toBeNull();
  });

  it("does not offer it when Drive backup is unavailable in this build", async () => {
    getDriveBackup.mockReturnValue({ isConfigured: () => false });
    const { findByTestId, queryByTestId } = renderOnboarding();
    await findByTestId("name-sheet-input");
    expect(queryByTestId("name-sheet-restore")).toBeNull();
  });
});
