import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ReminderCard from "./ReminderCard";
import colors from "@/constants/colors";
import fc from "fast-check";
import { RemindersProvider } from "@/contexts/RemindersContext";
import type { Reminder } from "@/services/ReminderService";
import { getPermissionsAsync } from "expo-notifications";
import { resetNotificationPermissionCache } from "@/hooks/useNotificationPermission";

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
        <ReminderCard reminder={reminder} />
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

  it("shows a 'Moved by' note when the recipient changed the time", () => {
    const { getByTestId, getByText } = renderCard(
      makeReminder({
        recipient: { name: "Priya", phone: "9876543210" },
        recipientTimeChange: {
          from: "2026-09-09T23:00:00.000Z",
          to: "2026-09-10T08:00:00.000Z",
          by: "Priya",
        },
      })
    );
    expect(getByTestId("recipient-time-change-note")).toBeTruthy();
    expect(getByText("Moved by Priya")).toBeTruthy();
  });

  it("shows no time-change note when the recipient never moved it", () => {
    const { queryByTestId } = renderCard(
      makeReminder({ recipient: { name: "Priya", phone: "9876543210" } })
    );
    expect(queryByTestId("recipient-time-change-note")).toBeNull();
  });

  it("never shows the time-change note on an ordinary (non-send) reminder", () => {
    // isSendReminder gates this the same as the recipient chip - a plain
    // reminder has no recipient to have moved anything.
    const { queryByTestId } = renderCard(
      makeReminder({
        recipientTimeChange: {
          from: "2026-09-09T23:00:00.000Z",
          to: "2026-09-10T08:00:00.000Z",
          by: "Priya",
        },
      })
    );
    expect(queryByTestId("recipient-time-change-note")).toBeNull();
  });
});

describe("ReminderCard — received reminders (B13)", () => {
  it("shows the sender chip for a reminder with a senderName", () => {
    const { getByTestId, getByText } = renderCard(makeReminder({ senderName: "Amma" }));
    expect(getByTestId("sender-chip")).toBeTruthy();
    expect(getByText("From Amma")).toBeTruthy();
  });

  it("shows no sender chip for an ordinary reminder", () => {
    const { queryByTestId } = renderCard(makeReminder());
    expect(queryByTestId("sender-chip")).toBeNull();
  });

  it("lets the sender chip and recipient chip coexist without collision", () => {
    // Not a realistic combination in practice, but the two badges mark
    // opposite directions and must not be mutually exclusive by accident.
    const { getByTestId } = renderCard(
      makeReminder({
        senderName: "Amma",
        recipient: { name: "Priya", phone: "9876543210" },
      })
    );
    expect(getByTestId("sender-chip")).toBeTruthy();
    expect(getByTestId("recipient-chip")).toBeTruthy();
  });

  it("renders a Malayalam sender name in the Malayalam font", () => {
    const { getByText } = renderCard(makeReminder({ senderName: "അമ്മ" }));
    const el = getByText("From അമ്മ");
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

describe("ReminderCard — the will-not-ring chip", () => {
  beforeEach(() => {
    resetNotificationPermissionCache();
    (getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "denied",
      canAskAgain: true,
    });
  });

  afterEach(() => {
    (getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "granted",
      android: { alarm: true },
    });
    resetNotificationPermissionCache();
  });

  it("marks a future reminder that cannot ring", async () => {
    const { findByTestId } = renderCard(makeReminder());
    expect(await findByTestId("will-not-ring-chip")).toBeTruthy();
  });

  // Granting permission now cannot rescue a ring that already failed, so the
  // chip would be a label the user can do nothing about.
  it("stays off an overdue reminder", async () => {
    const { queryByTestId } = renderCard(
      makeReminder({ datetime: new Date(Date.now() - 3600_000).toISOString() })
    );
    await waitFor(() => expect(getPermissionsAsync).toHaveBeenCalled());
    expect(queryByTestId("will-not-ring-chip")).toBeNull();
  });

  it("stays off a completed reminder", async () => {
    const { queryByTestId } = renderCard(makeReminder({ completed: true }));
    await waitFor(() => expect(getPermissionsAsync).toHaveBeenCalled());
    expect(queryByTestId("will-not-ring-chip")).toBeNull();
  });

  it("stays off entirely once permission is granted", async () => {
    (getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "granted",
      canAskAgain: true,
    });
    const { queryByTestId } = renderCard(makeReminder());
    await waitFor(() => expect(getPermissionsAsync).toHaveBeenCalled());
    expect(queryByTestId("will-not-ring-chip")).toBeNull();
  });
});

describe("ReminderCard — recurring reminders", () => {
  it("shows no repeat marker for a one-shot reminder", () => {
    const { queryByTestId } = renderCard(makeReminder());
    expect(queryByTestId("repeat-marker")).toBeNull();
  });

  it("shows the repeat marker with describeRecurrence's label inside the time row", () => {
    const { getByTestId, getByText } = renderCard(
      makeReminder({ recurrence: { freq: "daily", interval: 1 } })
    );
    expect(getByTestId("repeat-marker")).toBeTruthy();
    expect(getByText("Daily")).toBeTruthy();
  });

  it("coexists with the overdue destructive time styling", () => {
    const { getByTestId } = renderCard(
      makeReminder({
        datetime: new Date(Date.now() - 3600_000).toISOString(),
        recurrence: { freq: "weekly", interval: 1 },
      })
    );
    expect(getByTestId("repeat-marker")).toBeTruthy();
  });

  it("coexists with the sender chip on a received recurring reminder", () => {
    const { getByTestId, getByTestId: getById2 } = renderCard(
      makeReminder({ senderName: "Priya", recurrence: { freq: "daily", interval: 1 } })
    );
    expect(getById2("sender-chip")).toBeTruthy();
    expect(getByTestId("repeat-marker")).toBeTruthy();
  });

  it("coexists with the will-not-ring chip", async () => {
    resetNotificationPermissionCache();
    (getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: "denied",
      canAskAgain: true,
    });
    const { findByTestId, getByTestId } = renderCard(
      makeReminder({ recurrence: { freq: "daily", interval: 1 } })
    );
    expect(await findByTestId("will-not-ring-chip")).toBeTruthy();
    expect(getByTestId("repeat-marker")).toBeTruthy();
  });
});

// Most people hold the phone in the right hand, and the check sat under the
// left edge, the far side of the screen from the thumb. The trash button that
// used to sit on the right went to the detail screen at the same time: a
// destructive control next to the one people tap most is a mis-tap waiting.
describe("ReminderCard — complete toggle on the thumb side", () => {
  it("puts the complete toggle last in the card, on the right", () => {
    const { getByTestId } = renderCard(makeReminder());
    // Host nodes in document order: in a row, later means further right.
    const order = getByTestId("reminder-card-r1")
      .findAll((n: any) => typeof n.type === "string")
      .map((n: any) => n.props.testID ?? (n.props.children === "English title" ? "title" : null))
      .filter(Boolean);
    expect(order.indexOf("complete-toggle")).toBeGreaterThan(order.indexOf("title"));
    expect(order.indexOf("title")).toBeGreaterThanOrEqual(0);
  });

  it("has no delete button on the card", () => {
    const { queryByTestId } = renderCard(makeReminder());
    expect(queryByTestId("delete-reminder-r1")).toBeNull();
  });

  it("gives the toggle a 48pt touch target", () => {
    const { getByTestId } = renderCard(makeReminder());
    const style = StyleSheet.flatten(getByTestId("complete-toggle").props.style);
    expect(style.width).toBeGreaterThanOrEqual(48);
    expect(style.height).toBeGreaterThanOrEqual(48);
  });

  it("draws the unchecked ring in the control colour, not the quiet border", () => {
    const { getByTestId } = renderCard(makeReminder());
    const ring = StyleSheet.flatten(getByTestId("complete-toggle-ring").props.style);
    expect(ring.borderColor).toBe(colors.light.control);
    expect(ring.backgroundColor).toBe("transparent");
  });

  it("fills the ring once done", () => {
    const { getByTestId } = renderCard(makeReminder({ completed: true }));
    const ring = StyleSheet.flatten(getByTestId("complete-toggle-ring").props.style);
    expect(ring.borderColor).toBe(colors.light.primary);
    expect(ring.backgroundColor).toBe(colors.light.primary);
  });

  it("says what it is and what state it is in to a screen reader", () => {
    const open = renderCard(makeReminder());
    const toggle = open.getByTestId("complete-toggle");
    expect(toggle.props.accessibilityRole).toBe("checkbox");
    expect(toggle.props.accessibilityState).toEqual({ checked: false });
    expect(toggle.props.accessibilityLabel).toBe("Mark English title as done");
    open.unmount();

    const done = renderCard(makeReminder({ completed: true }));
    expect(done.getByTestId("complete-toggle").props.accessibilityState).toEqual({
      checked: true,
    });
  });
});

// The examples above pin one reminder each. The layout rules must hold for
// every reminder the list can show: any title in either script, done or not,
// overdue or not, alarm or silent, one-shot or repeating.
describe("ReminderCard — toggle properties over any reminder", () => {
  const malayalamChar = fc.integer({ min: 0x0d05, max: 0x0d39 }).map((c) => String.fromCharCode(c));
  const title = fc.oneof(
    fc.string({ minLength: 1, maxLength: 40 }).filter((t) => t.trim().length > 0),
    fc.array(malayalamChar, { minLength: 1, maxLength: 20 }).map((cs) => cs.join(""))
  );
  const reminderArb = fc.record({
    title,
    completed: fc.boolean(),
    hoursFromNow: fc.integer({ min: -72, max: 72 }).filter((h) => h !== 0),
    alarm: fc.boolean(),
    repeats: fc.boolean(),
  });

  it("keeps the toggle right of the title, with no trash, and a state that matches the reminder", () => {
    fc.assert(
      fc.property(reminderArb, (r) => {
        const utils = renderCard(
          makeReminder({
            title: r.title,
            completed: r.completed,
            datetime: new Date(Date.now() + r.hoursFromNow * 3600_000).toISOString(),
            alarm: r.alarm,
            recurrence: r.repeats ? { freq: "daily", interval: 1 } : undefined,
          })
        );
        try {
          const order = utils
            .getByTestId("reminder-card-r1")
            .findAll((n: any) => typeof n.type === "string")
            .map((n: any) => n.props.testID ?? (n.props.children === r.title ? "title" : null))
            .filter(Boolean);
          expect(order.indexOf("title")).toBeGreaterThanOrEqual(0);
          expect(order.indexOf("complete-toggle")).toBeGreaterThan(order.indexOf("title"));
          expect(utils.queryByTestId("delete-reminder-r1")).toBeNull();

          const toggle = utils.getByTestId("complete-toggle");
          expect(toggle.props.accessibilityState).toEqual({ checked: r.completed });
          expect(toggle.props.accessibilityLabel).toContain(r.title);

          const ring = StyleSheet.flatten(utils.getByTestId("complete-toggle-ring").props.style);
          expect(ring.borderColor).toBe(r.completed ? colors.light.primary : colors.light.control);
        } finally {
          utils.unmount();
        }
      }),
      { numRuns: 40 }
    );
  });
});
