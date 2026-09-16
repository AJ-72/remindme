import React from "react";
import { Linking } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getPermissionsAsync,
  requestPermissionsAsync,
} from "expo-notifications";

import NotificationNudge from "@/components/NotificationNudge";
import { resetNotificationPermissionCache } from "@/hooks/useNotificationPermission";
import {
  MAX_NOTIF_PROMPTS,
  NOTIF_PROMPT_COUNT_KEY,
} from "@/services/ReminderService";

function denied(canAskAgain = true) {
  (getPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "denied",
    canAskAgain,
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
  resetNotificationPermissionCache();
});

describe("NotificationNudge", () => {
  it("stays hidden while notifications are granted", async () => {
    (getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "granted",
      canAskAgain: true,
    });
    const { queryByTestId } = render(
      <NotificationNudge hasMissedRing={false} onDismiss={() => {}} />
    );
    await waitFor(() => expect(getPermissionsAsync).toHaveBeenCalled());
    expect(queryByTestId("notification-nudge")).toBeNull();
  });

  it("warns once the permission is missing", async () => {
    denied();
    const { findByTestId, getByText } = render(
      <NotificationNudge hasMissedRing={false} onDismiss={() => {}} />
    );
    await findByTestId("notification-nudge");
    expect(getByText("Notifications are off. Your reminders will not ring.")).toBeTruthy();
  });

  it("names the missed ring once a reminder has already passed", async () => {
    denied();
    const { findByTestId, getByText } = render(
      <NotificationNudge hasMissedRing onDismiss={() => {}} />
    );
    await findByTestId("notification-nudge");
    expect(
      getByText("A reminder passed without ringing. Notifications are off.")
    ).toBeTruthy();
  });

  it("asks the OS when it may still ask", async () => {
    denied();
    (requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
    const { findByTestId } = render(
      <NotificationNudge hasMissedRing={false} onDismiss={() => {}} />
    );
    fireEvent.press(await findByTestId("notification-nudge-fix"));
    await waitFor(() => expect(requestPermissionsAsync).toHaveBeenCalled());
  });

  it("opens system settings instead of a dialog once the cap is spent", async () => {
    denied();
    await AsyncStorage.setItem(NOTIF_PROMPT_COUNT_KEY, String(MAX_NOTIF_PROMPTS));
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue();
    const { findByTestId } = render(
      <NotificationNudge hasMissedRing onDismiss={() => {}} />
    );
    fireEvent.press(await findByTestId("notification-nudge-fix"));
    await waitFor(() => expect(openSettings).toHaveBeenCalled());
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("never opens a dialog after a permanent refusal", async () => {
    denied(false);
    const { findByTestId } = render(
      <NotificationNudge hasMissedRing onDismiss={() => {}} />
    );
    fireEvent.press(await findByTestId("notification-nudge-fix"));
    await waitFor(() => expect(getPermissionsAsync).toHaveBeenCalled());
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("dismisses on request", async () => {
    denied();
    const onDismiss = jest.fn();
    const { findByTestId } = render(
      <NotificationNudge hasMissedRing={false} onDismiss={onDismiss} />
    );
    fireEvent.press(await findByTestId("notification-nudge-dismiss"));
    expect(onDismiss).toHaveBeenCalled();
  });
});
