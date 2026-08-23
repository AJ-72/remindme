import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ReminderCard from "./ReminderCard";
import { RemindersProvider } from "@/contexts/RemindersContext";
import type { Reminder } from "@/services/ReminderService";

jest.mock("expo-haptics");
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    title: "English title",
    description: "",
    datetime: new Date(Date.now() + 3600_000).toISOString(),
    completed: false,
    notificationId: "notif-r1",
    ...overrides,
  };
}

function renderCard(reminder: Reminder) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <RemindersProvider>
        <ReminderCard reminder={reminder} onDelete={jest.fn()} />
      </RemindersProvider>
    </SafeAreaProvider>
  );
}

describe("ReminderCard — font selection", () => {
  it("renders an English title with Inter", () => {
    const { getByText } = renderCard(makeReminder({ title: "English title" }));
    const titleNode = getByText("English title");
    const flatStyle = Array.isArray(titleNode.props.style)
      ? Object.assign({}, ...titleNode.props.style)
      : titleNode.props.style;
    expect(flatStyle.fontFamily).toBe("Inter_600SemiBold");
  });

  it("renders a Malayalam title with Noto Sans Malayalam", () => {
    const { getByText } = renderCard(makeReminder({ title: "നാളെ മീറ്റിംഗ്" }));
    const titleNode = getByText("നാളെ മീറ്റിംഗ്");
    const flatStyle = Array.isArray(titleNode.props.style)
      ? Object.assign({}, ...titleNode.props.style)
      : titleNode.props.style;
    expect(flatStyle.fontFamily).toBe("NotoSansMalayalam_600SemiBold");
  });
});

describe("ReminderCard — send reminders", () => {
  it("shows the recipient chip for a reminder with a recipient", () => {
    const { getByTestId, getByText } = renderCard(
      makeReminder({ recipient: { name: "Priya", phone: "9876543210" } })
    );
    expect(getByTestId("recipient-chip")).toBeTruthy();
    expect(getByText("Priya")).toBeTruthy();
  });

  it("shows no chip for an ordinary reminder", () => {
    const { queryByTestId } = renderCard(makeReminder());
    expect(queryByTestId("recipient-chip")).toBeNull();
  });

  it("shows no chip when the recipient has an empty phone", () => {
    // Must match isSendReminder, or the card advertises a send the send screen
    // cannot perform.
    const { queryByTestId } = renderCard(
      makeReminder({ recipient: { name: "Priya", phone: "" } })
    );
    expect(queryByTestId("recipient-chip")).toBeNull();
  });

  it("lets the chip and the bell-off icon coexist", () => {
    const { getByTestId } = renderCard(
      makeReminder({
        alarm: false,
        recipient: { name: "Priya", phone: "9876543210" },
      })
    );
    expect(getByTestId("recipient-chip")).toBeTruthy();
    expect(getByTestId("alarm-off-icon")).toBeTruthy();
  });

  it("renders a Malayalam recipient name in the Malayalam font", () => {
    const { getByText } = renderCard(
      makeReminder({ recipient: { name: "പ്രിയ", phone: "9876543210" } })
    );
    const el = getByText("പ്രിയ");
    expect(el.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fontFamily: expect.stringContaining("NotoSansMalayalam"),
        }),
      ])
    );
  });
});

describe("ReminderCard — tap routing", () => {
  const { router } = require("expo-router");

  it("opens the editor for a plain reminder", async () => {
    const { getByText } = renderCard(makeReminder({ title: "Plain task" }));
    fireEvent.press(getByText("Plain task"));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: "/add-reminder",
        params: { id: "r1" },
      })
    );
  });

  // The send screen holds this reminder's only actions - the WhatsApp/SMS
  // handoff and the explicit "Mark as done". Routing the card to the editor
  // left a tray notification as the sole way to reach them.
  it("opens the send screen for a send reminder", async () => {
    const { getByText } = renderCard(
      makeReminder({
        title: "Send task",
        recipient: { name: "Priya", phone: "9876543210" },
      })
    );
    fireEvent.press(getByText("Send task"));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: "/send-reminder",
        params: { id: "r1" },
      })
    );
  });
});
