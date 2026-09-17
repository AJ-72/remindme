import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import InsightsScreen from "@/app/insights";
import { RemindersProvider } from "@/contexts/RemindersContext";
import type { Reminder } from "@/services/ReminderService";
import { STORAGE_KEY } from "@/services/ReminderService";

jest.mock("expo-haptics");

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: (...a: any[]) => mockPush(...a) },
}));

/** Local-time ISO, offset from now: the hour buckets are local. */
function at(daysFromNow: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

let seq = 0;
function reminder(over: Partial<Reminder> = {}): Reminder {
  seq += 1;
  return {
    id: `r${seq}`,
    title: `Task ${seq}`,
    description: "",
    datetime: at(-1, 9),
    completed: false,
    ...over,
  };
}

async function seed(reminders: Reminder[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
}

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <RemindersProvider>
        <InsightsScreen />
      </RemindersProvider>
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
});

describe("InsightsScreen with no history", () => {
  it("says nothing has come due rather than showing a zero rate", async () => {
    const { findByTestId, queryByTestId } = renderScreen();
    expect((await findByTestId("insights-headline")).props.children).toMatch(
      /Nothing has come due/
    );
    expect(queryByTestId("insights-rate")).toBeNull();
  });

  it("explains what is still needed before it can name a best hour", async () => {
    const { findByTestId } = renderScreen();
    expect((await findByTestId("insights-hour-blocker")).props.children).toMatch(
      /more finished or missed/
    );
  });
});

describe("InsightsScreen with a small sample", () => {
  it("withholds the percentage below the rate floor", async () => {
    await seed([
      reminder({ completed: true, completedAt: at(-1, 9) }),
      reminder({ completed: true, completedAt: at(-1, 9) }),
    ]);
    const { findByTestId } = renderScreen();
    await waitFor(async () =>
      expect((await findByTestId("insights-rate")).props.children).toBe("—")
    );
  });
});

describe("InsightsScreen with enough history", () => {
  /** 8 AM always finished, 10 PM never: a clear, well-sampled split. */
  async function seedMorningVsNight() {
    await seed([
      ...Array.from({ length: 5 }, () =>
        reminder({ completed: true, datetime: at(-2, 8), completedAt: at(-2, 8) })
      ),
      ...Array.from({ length: 5 }, () => reminder({ datetime: at(-2, 22) })),
    ]);
  }

  it("shows the completion rate", async () => {
    await seedMorningVsNight();
    const { findByTestId } = renderScreen();
    await waitFor(async () =>
      expect((await findByTestId("insights-rate")).props.children).toBe("50%")
    );
  });

  it("names the strongest and the weakest hour", async () => {
    await seedMorningVsNight();
    const { findByText } = renderScreen();
    expect(await findByText("8 AM–9 AM")).toBeTruthy();
    expect(await findByText("10 PM–11 PM")).toBeTruthy();
  });

  it("lists a task that keeps being postponed", async () => {
    await seed([reminder({ id: "stuck1", title: "Do taxes", snoozeCount: 4 })]);
    const { findByTestId } = renderScreen();
    expect(await findByTestId("insights-stuck-stuck1")).toBeTruthy();
    expect((await findByTestId("insights-stuck-headline")).props.children).toBe(
      "1 task keeps moving"
    );
  });

  it("does not list a finished task however often it was postponed", async () => {
    await seed([
      reminder({ id: "done1", snoozeCount: 9, completed: true, completedAt: at(-1, 9) }),
    ]);
    const { queryByTestId } = renderScreen();
    await waitFor(() => expect(queryByTestId("insights-stuck-done1")).toBeNull());
  });
});
