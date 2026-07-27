import React from "react";
import { render } from "@testing-library/react-native";
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
