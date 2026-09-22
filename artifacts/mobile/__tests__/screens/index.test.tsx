import React from "react";
import { render, waitFor, fireEvent, act, within } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import HomeScreen from "@/app/(tabs)/index";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { SharedTextProvider } from "@/contexts/SharedTextContext";
import {
  INVITE_NAME_ASK_KEY,
  MAX_REGISTER_PROMPTS,
  REGISTERED_PHONE_KEY,
  REGISTER_PROMPT_COUNT_KEY,
  resetRegisterPromptSession,
  STORAGE_KEY,
  USER_NAME_KEY,
  type Reminder,
} from "@/services/ReminderService";
import { formatHeaderDate } from "@/utils/formatHeaderDate";
import { TAB_BAR_HEIGHT } from "@/constants/tabBar";
import * as ReminderServiceModule from "@/services/ReminderService";
import type { RecurrenceRule } from "@/utils/recurrence";

jest.mock("expo-haptics");
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    title: "Test reminder",
    description: "",
    datetime: FUTURE,
    completed: false,
    notificationId: "notif-r1",
    ...overrides,
  };
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
        <SharedTextProvider>
          <HomeScreen />
        </SharedTextProvider>
      </RemindersProvider>
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
  // The "one offer per session" guard is a module-level flag, so without this
  // the first test to see an offer silences it for every test after it.
  resetRegisterPromptSession();
});

describe("HomeScreen", () => {
  it("shows the empty state when there are no reminders", async () => {
    const { findByText } = renderScreen();
    expect(await findByText("No reminders yet")).toBeTruthy();
  });

  it("shows the greeting header with a date and upcoming-count subtitle", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({ id: "r1", title: "Task one", completed: false, datetime: FUTURE }),
        makeReminder({ id: "r2", title: "Task two", completed: false, datetime: FUTURE }),
      ])
    );
    const { findByText, findByTestId } = renderScreen();
    expect(await findByText("Hi there")).toBeTruthy();
    expect(await findByText("2 upcoming")).toBeTruthy();
    // This test was named "with a date" from the start but never asserted one,
    // which is how the header shipped without it.
    expect((await findByTestId("header-date")).props.children).toBe(
      formatHeaderDate(new Date())
    );
  });

  it("shows today's date beside the Today title", async () => {
    const { findByTestId } = renderScreen();
    const dateEl = await findByTestId("header-date");
    // Matches the mockup's "08, August 2026" shape.
    expect(dateEl.props.children).toMatch(
      /^\d{2}, (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/
    );
  });

  it("shows 'All caught up!' as the subtitle when there are no upcoming reminders", async () => {
    const { findByText } = renderScreen();
    expect(await findByText("Hi there")).toBeTruthy();
    expect(await findByText("All caught up!")).toBeTruthy();
  });

  it("lists reminder titles loaded from storage", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1", title: "Buy milk" })])
    );
    const { findByText } = renderScreen();
    expect(await findByText("Buy milk")).toBeTruthy();
  });

  it("puts incomplete reminders under Upcoming and completed under Completed", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({ id: "r1", title: "Not done", completed: false, datetime: FUTURE }),
        makeReminder({ id: "r2", title: "Done", completed: true, datetime: PAST }),
      ])
    );
    const { findByText } = renderScreen();
    expect(await findByText("Upcoming")).toBeTruthy();
    expect(await findByText("Completed")).toBeTruthy();
    expect(await findByText("Not done")).toBeTruthy();
    expect(await findByText("Done")).toBeTruthy();
  });

  it("a completed recurring reminder never comes to rest in Completed — it advances and stays in Upcoming", async () => {
    // PAST, not FUTURE: advanceRecurringReminder only advances a reminder
    // whose occurrence has actually fired (Task 4's contract) — completing a
    // recurring reminder early, before its scheduled time, is a different,
    // deliberately-unhandled case that falls through to a plain complete.
    //
    // The mount-time rescheduleAllFutureReminders sweep (Task 5's own
    // catch-up pass) would otherwise race this: it advances any past-due
    // recurring reminder on its own, before this test's toggle press ever
    // fires, so by the time the tap lands the reminder is already at its
    // NEXT (future) occurrence — completing THAT is "early", not "the fired
    // occurrence", and the test would observe a plain complete instead of
    // an advance. No-op the sweep here so the test can control this
    // deterministically and actually exercise toggleComplete's own advance
    // path, which is the thing this test means to prove.
    jest.spyOn(ReminderServiceModule, "rescheduleAllFutureReminders").mockResolvedValue(undefined);
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({
          id: "r1",
          title: "Take tablet",
          completed: false,
          datetime: PAST,
          recurrence: { freq: "daily", interval: 1 },
        }),
      ])
    );
    const { findByText, getByTestId, queryByText } = renderScreen();
    expect(await findByText("Take tablet")).toBeTruthy();
    expect(await findByText("Upcoming")).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId("complete-toggle"));
    });

    // Still visible (advanced to its next occurrence), still under Upcoming,
    // and never visibly parked in Completed at any point.
    await waitFor(() => expect(queryByText("Take tablet")).toBeTruthy());
    expect(queryByText("Completed")).toBeNull();
  });

  it("upcomingCount reflects the post-advance state of a completed recurring reminder", async () => {
    // Same mount-sweep race as above — no-op it so the toggle itself is the
    // thing under test.
    jest.spyOn(ReminderServiceModule, "rescheduleAllFutureReminders").mockResolvedValue(undefined);
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({
          id: "r1",
          title: "Take tablet",
          completed: false,
          datetime: PAST,
          recurrence: { freq: "daily", interval: 1 },
        }),
      ])
    );
    const { findByText, getByTestId } = renderScreen();
    await findByText("Take tablet");
    expect(await findByText("1 upcoming")).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId("complete-toggle"));
    });

    // Still 1 upcoming — the series advanced rather than dropping to 0.
    await waitFor(async () => expect(await findByText("1 upcoming")).toBeTruthy());
  });

  it("sorts completed reminders newest-first, independent of upcoming's earliest-first order", async () => {
    const OLDER = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const NEWER = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({ id: "r1", title: "Completed older", completed: true, datetime: OLDER }),
        makeReminder({ id: "r2", title: "Completed newer", completed: true, datetime: NEWER }),
      ])
    );
    const { findByText, UNSAFE_getAllByType } = renderScreen();
    await findByText("Completed newer");

    const Text = require("react-native").Text;
    const titles = UNSAFE_getAllByType(Text)
      .map((node: any) => node.props.children)
      .filter((c: any) => c === "Completed older" || c === "Completed newer");
    expect(titles).toEqual(["Completed newer", "Completed older"]);
  });

  it("deleting a reminder shows a styled confirm sheet, then removes it from the visible list on confirm", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1", title: "Delete me" })])
    );
    const { findByText, findByTestId, queryByText, UNSAFE_getAllByType } = renderScreen();
    await findByText("Delete me");

    const Feather = require("@expo/vector-icons").Feather;
    const trashIcon = UNSAFE_getAllByType(Feather).find(
      (node: any) => node.props.name === "trash-2"
    );
    fireEvent.press(trashIcon.parent);

    expect(await findByText("Delete Reminder")).toBeTruthy();
    const confirmButton = await findByTestId("confirm-sheet-confirm");
    await act(async () => {
      fireEvent.press(confirmButton);
    });

    await waitFor(() => expect(queryByText("Delete me")).toBeNull(), { timeout: 5000 });
  });

  it("deleting a recurring reminder offers skip-this-occurrence vs delete-the-series, and skip keeps it on the list at its next occurrence", async () => {
    const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({
          id: "r1",
          title: "Recurring task",
          datetime: PAST,
          recurrenceAnchor: PAST,
          recurrence: dailyRule,
        }),
      ])
    );
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("delete-reminder-r1"));

    const skipButton = await findByTestId("confirm-sheet-extra");
    await act(async () => {
      fireEvent.press(skipButton);
    });

    // Still exactly one stored reminder (the series continues), advanced
    // to a future occurrence rather than removed entirely.
    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(1);
      expect(new Date(stored[0].datetime).getTime()).toBeGreaterThan(Date.now());
    });
  });

  it("choosing delete-the-series for a recurring reminder removes it entirely", async () => {
    const dailyRule: RecurrenceRule = { freq: "daily", interval: 1 };
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({
          id: "r1",
          title: "Recurring task",
          datetime: PAST,
          recurrenceAnchor: PAST,
          recurrence: dailyRule,
        }),
      ])
    );
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("delete-reminder-r1"));

    const confirmButton = await findByTestId("confirm-sheet-confirm");
    await act(async () => {
      fireEvent.press(confirmButton);
    });

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored).toHaveLength(0);
    });
  });

  it("cancelling the delete confirm sheet keeps the reminder", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1", title: "Keep me" })])
    );
    const { findByText, findByTestId, UNSAFE_getAllByType } = renderScreen();
    await findByText("Keep me");

    const Feather = require("@expo/vector-icons").Feather;
    const trashIcon = UNSAFE_getAllByType(Feather).find(
      (node: any) => node.props.name === "trash-2"
    );
    fireEvent.press(trashIcon.parent);

    const cancelButton = await findByTestId("confirm-sheet-cancel");
    fireEvent.press(cancelButton);

    await waitFor(async () => {
      expect(await findByText("Keep me")).toBeTruthy();
    });
  });
});

describe("HomeScreen — Upcoming grouped by date", () => {
  const iso = (daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  };

  it("labels a same-day reminder Today", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1", title: "Today task", datetime: iso(0) })])
    );
    const { findByText } = renderScreen();
    expect(await findByText("Today")).toBeTruthy();
    expect(await findByText("Today task")).toBeTruthy();
  });

  it("labels a next-day reminder Tomorrow", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1", title: "Tomorrow task", datetime: iso(1) })])
    );
    const { findByText } = renderScreen();
    expect(await findByText("Tomorrow")).toBeTruthy();
  });

  it("labels a reminder 7+ days out as Later", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1", title: "Distant task", datetime: iso(30) })])
    );
    const { findByText } = renderScreen();
    expect(await findByText("Later")).toBeTruthy();
  });

  it("groups reminders across several buckets under one Upcoming section", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({ id: "r1", title: "Today task", datetime: iso(0) }),
        makeReminder({ id: "r2", title: "Tomorrow task", datetime: iso(1) }),
        makeReminder({ id: "r3", title: "Distant task", datetime: iso(30) }),
      ])
    );
    const { findByText } = renderScreen();
    expect(await findByText("Upcoming")).toBeTruthy();
    expect(await findByText("Today")).toBeTruthy();
    expect(await findByText("Tomorrow")).toBeTruthy();
    expect(await findByText("Later")).toBeTruthy();
  });
});

describe("HomeScreen — clear all completed", () => {
  it("shows a Clear all action next to the Completed section", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1", title: "Done task", completed: true })])
    );
    const { findByTestId } = renderScreen();
    expect(await findByTestId("clear-completed-button")).toBeTruthy();
  });

  it("does not show Clear all when there are no completed reminders", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1", title: "Pending task", completed: false })])
    );
    const { queryByTestId, findByText } = renderScreen();
    await findByText("Pending task");
    expect(queryByTestId("clear-completed-button")).toBeNull();
  });

  it("deletes every completed reminder, and none of the incomplete ones, on confirm", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({ id: "r1", title: "Done one", completed: true }),
        makeReminder({ id: "r2", title: "Done two", completed: true }),
        makeReminder({ id: "r3", title: "Still pending", completed: false }),
      ])
    );
    const { findByText, findByTestId, queryByText } = renderScreen();
    await findByText("Done one");

    fireEvent.press(await findByTestId("clear-completed-button"));
    expect(await findByText("Delete All Completed")).toBeTruthy();

    await act(async () => {
      fireEvent.press(await findByTestId("confirm-sheet-confirm"));
    });

    await waitFor(() => expect(queryByText("Done one")).toBeNull());
    expect(queryByText("Done two")).toBeNull();
    expect(await findByText("Still pending")).toBeTruthy();

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored.map((r: Reminder) => r.id)).toEqual(["r3"]);
  });

  it("cancelling the clear-all confirm sheet keeps every completed reminder", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1", title: "Done task", completed: true })])
    );
    const { findByText, findByTestId } = renderScreen();
    await findByText("Done task");

    fireEvent.press(await findByTestId("clear-completed-button"));
    fireEvent.press(await findByTestId("confirm-sheet-cancel"));

    expect(await findByText("Done task")).toBeTruthy();
  });
});

describe("HomeScreen — Remind Someone section", () => {
  it("puts an incomplete send reminder in Remind Someone, not Upcoming", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({ id: "s1", title: "Message Priya", recipient: { name: "Priya", phone: "9876543210" } }),
        makeReminder({ id: "p1", title: "Buy milk" }),
      ])
    );
    const { findByText, getAllByText } = renderScreen();
    expect(await findByText("Remind Someone")).toBeTruthy();
    // Each reminder appears exactly once across all sections.
    expect(getAllByText("Message Priya")).toHaveLength(1);
    expect(getAllByText("Buy milk")).toHaveLength(1);
  });

  it("hides the Remind Someone section when there are no send reminders", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "p1", title: "Buy milk" })])
    );
    const { findByText, queryByText } = renderScreen();
    await findByText("Buy milk");
    expect(queryByText("Remind Someone")).toBeNull();
  });

  it("keeps a completed send reminder in Completed, not Remind Someone", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({
          id: "s1",
          title: "Message Priya",
          completed: true,
          recipient: { name: "Priya", phone: "9876543210" },
        }),
      ])
    );
    const { findByText, queryByText, getAllByText } = renderScreen();
    await findByText("Completed");
    expect(queryByText("Remind Someone")).toBeNull();
    expect(getAllByText("Message Priya")).toHaveLength(1);
  });

  it("treats a recipient with no usable phone as an ordinary reminder", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({ id: "s1", title: "No phone", recipient: { name: "X", phone: "" } }),
      ])
    );
    const { findByText, queryByText } = renderScreen();
    await findByText("No phone");
    expect(queryByText("Remind Someone")).toBeNull();
  });

  it("counts send reminders in the header subtitle alongside upcoming ones", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({ id: "s1", title: "Message Priya", recipient: { name: "Priya", phone: "9876543210" } }),
        makeReminder({ id: "p1", title: "Buy milk" }),
      ])
    );
    const { findByText } = renderScreen();
    expect(await findByText("2 upcoming")).toBeTruthy();
  });
});

describe("HomeScreen — personal greeting", () => {
  async function renderWithName(name: string) {
    await AsyncStorage.setItem(USER_NAME_KEY, name);
    return renderScreen();
  }

  it("greets by name, with the time of day", async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 23, 9, 0, 0));
    try {
      const { findByTestId } = await renderWithName("Anand");
      expect((await findByTestId("header-greeting")).props.children).toBe(
        "Good morning, Anand"
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("falls back to 'Hi there' with no name stored", async () => {
    const { findByTestId } = renderScreen();
    expect((await findByTestId("header-greeting")).props.children).toBe("Hi there");
  });

  it("shows initials in the avatar once a name is set", async () => {
    const { findByTestId } = await renderWithName("Anand Jayaram");
    expect((await findByTestId("header-initials")).props.children).toBe("AJ");
  });

  // The count is the only status on this screen. An unnamed user must not lose
  // it to the name prompt — that would make skipping onboarding a downgrade.
  it("keeps the upcoming count in the unnamed state", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1" }), makeReminder({ id: "r2" })])
    );
    const { findByText } = renderScreen();
    expect(await findByText("2 upcoming")).toBeTruthy();
  });

  it("names the user in the all-caught-up subtitle", async () => {
    const { findByText } = await renderWithName("Anand");
    expect(await findByText("All caught up, Anand!")).toBeTruthy();
  });

  it("saves a name typed into the sheet opened from the header", async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("header-avatar"));
    fireEvent.changeText(await findByTestId("name-sheet-input"), "Anand");
    fireEvent.press(await findByTestId("name-sheet-save"));

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(USER_NAME_KEY)).toBe("Anand")
    );
    expect((await findByTestId("header-greeting")).props.children).toContain("Anand");
  });

  it("renders a Malayalam name in the Malayalam font", async () => {
    const { findByTestId } = await renderWithName("ആനന്ദ്");
    const greeting = await findByTestId("header-greeting");
    const flat = Array.isArray(greeting.props.style)
      ? Object.assign({}, ...greeting.props.style)
      : greeting.props.style;
    expect(flat.fontFamily).toBe("NotoSansMalayalam_700Bold");
  });
});


// "Good morn.." on a real device: the greeting shared a row with the date and
// truncated. The date now sits on the subtitle line so the greeting owns the
// full width, and it greets by first name only.
describe("HomeScreen — header fits a long name", () => {
  it("greets by first name, not the full stored name", async () => {
    await AsyncStorage.setItem(USER_NAME_KEY, "Anand Jayaram");
    const { findByTestId } = renderScreen();
    await waitFor(async () =>
      expect((await findByTestId("header-greeting")).props.children).toContain("Anand")
    );
    expect((await findByTestId("header-greeting")).props.children).not.toContain(
      "Jayaram"
    );
  });

  it("still shows full initials in the avatar", async () => {
    await AsyncStorage.setItem(USER_NAME_KEY, "Anand Jayaram");
    const { findByTestId } = renderScreen();
    await waitFor(async () =>
      expect((await findByTestId("header-initials")).props.children).toBe("AJ")
    );
  });

  it("shrinks rather than truncating when the name is still long", async () => {
    await AsyncStorage.setItem(USER_NAME_KEY, "Bartholomew");
    const { findByTestId } = renderScreen();
    const greeting = await findByTestId("header-greeting");
    expect(greeting.props.numberOfLines).toBe(1);
    expect(greeting.props.adjustsFontSizeToFit).toBe(true);
    expect(greeting.props.minimumFontScale).toBeLessThan(1);
  });

  it("keeps the date visible on its own line", async () => {
    await AsyncStorage.setItem(USER_NAME_KEY, "Anand Jayaram");
    const { findByTestId } = renderScreen();
    expect((await findByTestId("header-date")).props.children).toBe(
      formatHeaderDate(new Date())
    );
  });
});

describe("the insights button in the header", () => {
  it("opens the adherence screen", async () => {
    const { router } = jest.requireMock("expo-router");
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("header-insights-button"));
    expect(router.push).toHaveBeenCalledWith("/insights");
  });
});


// Frame 13 of the first-run study. The number ask left first run entirely,
// where it was seen by everybody and meant nothing to anybody. It comes back
// here, to a user who has saved three reminders and therefore has a habit the
// offer can argue about.
describe("HomeScreen — the number offer, once the app has earned it", () => {
  async function seed(count: number) {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        Array.from({ length: count }, (_, i) =>
          makeReminder({ id: `r${i}`, title: `Task ${i}`, notificationId: `n${i}` })
        )
      )
    );
  }

  it("offers once the third reminder is there", async () => {
    await seed(3);
    const { findByTestId } = renderScreen();
    expect(await findByTestId("register-number-nudge")).toBeTruthy();
  });

  it("says what the number buys, without a person to name", async () => {
    await seed(3);
    const { findByText } = renderScreen();
    expect(await findByText("Remind someone else?")).toBeTruthy();
  });

  it("stays away before the third", async () => {
    await seed(2);
    const { findByTestId, queryByTestId } = renderScreen();
    await findByTestId("header-greeting");
    await waitFor(() => expect(queryByTestId("register-number-nudge")).toBeNull());
  });

  it("stays away once a number is already registered", async () => {
    await seed(3);
    await AsyncStorage.setItem(REGISTERED_PHONE_KEY, "+919876543210");
    const { findByTestId, queryByTestId } = renderScreen();
    await findByTestId("header-greeting");
    await waitFor(() => expect(queryByTestId("register-number-nudge")).toBeNull());
  });

  it("stays away once the cap is spent, two refusals being an answer", async () => {
    await seed(3);
    await AsyncStorage.setItem(REGISTER_PROMPT_COUNT_KEY, String(MAX_REGISTER_PROMPTS));
    const { findByTestId, queryByTestId } = renderScreen();
    await findByTestId("header-greeting");
    await waitFor(() => expect(queryByTestId("register-number-nudge")).toBeNull());
  });

  it("counts the offer when it is shown, since a refusal is still an answer", async () => {
    await seed(3);
    const { findByTestId } = renderScreen();
    await findByTestId("register-number-nudge");
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(REGISTER_PROMPT_COUNT_KEY)).toBe("1")
    );
  });

  it("goes away for good on No thanks", async () => {
    await seed(3);
    const { findByTestId, queryByTestId } = renderScreen();
    fireEvent.press(await findByTestId("register-number-nudge-later"));
    await waitFor(() => expect(queryByTestId("register-number-nudge")).toBeNull());
  });

  // Two asks in one sitting read as nagging however well each is placed.
  it("spends only one offer per run of the app", async () => {
    await seed(3);
    const first = renderScreen();
    await first.findByTestId("register-number-nudge");
    first.unmount();

    const second = renderScreen();
    await second.findByTestId("header-greeting");
    await waitFor(() => expect(second.queryByTestId("register-number-nudge")).toBeNull());
  });
});

// Frame I3 of the first-run study. An invited install skips the first-run
// name sheet - it would have rendered over the bind screen, in front of the
// reminder the user tapped a link to read. The ask lands here instead, where
// it can name the person who will actually read the answer.
describe("HomeScreen — the name ask an invited install gets instead", () => {
  it("names the sender who is waiting to read it", async () => {
    await AsyncStorage.setItem(INVITE_NAME_ASK_KEY, "Priya");
    const { findByTestId, findByText } = renderScreen();

    expect(await findByTestId("invite-name-ask")).toBeTruthy();
    expect(await findByText(/Priya sees that someone accepted/)).toBeTruthy();
  });

  it("stays away when nothing recorded an ask", async () => {
    const { queryByTestId, findByText } = renderScreen();
    await findByText(formatHeaderDate(new Date()));
    expect(queryByTestId("invite-name-ask")).toBeNull();
  });

  // The question is already answered. Asking anyway reads as an app that is
  // not listening.
  it("stays away once the user has a name, whatever is recorded", async () => {
    await AsyncStorage.setItem(INVITE_NAME_ASK_KEY, "Priya");
    await AsyncStorage.setItem(USER_NAME_KEY, "Anand");
    const { queryByTestId, findByText } = renderScreen();

    await findByText(formatHeaderDate(new Date()));
    await waitFor(() => expect(queryByTestId("invite-name-ask")).toBeNull());
  });

  it("opens the name sheet from Add name", async () => {
    await AsyncStorage.setItem(INVITE_NAME_ASK_KEY, "Priya");
    const { findByTestId } = renderScreen();

    fireEvent.press(await findByTestId("invite-name-ask-add"));
    expect(await findByTestId("name-sheet-input")).toBeTruthy();
  });

  it("stores the name and spends the ask", async () => {
    await AsyncStorage.setItem(INVITE_NAME_ASK_KEY, "Priya");
    const { findByTestId, queryByTestId } = renderScreen();

    fireEvent.press(await findByTestId("invite-name-ask-add"));
    fireEvent.changeText(await findByTestId("name-sheet-input"), "Anand");
    fireEvent.press(await findByTestId("name-sheet-save"));

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(USER_NAME_KEY)).toBe("Anand")
    );
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(INVITE_NAME_ASK_KEY)).toBeNull()
    );
    await waitFor(() => expect(queryByTestId("invite-name-ask")).toBeNull());
  });

  // One ask, not a standing banner. A skip is an answer.
  it("spends the ask on Skip too, with no name stored", async () => {
    await AsyncStorage.setItem(INVITE_NAME_ASK_KEY, "Priya");
    const { findByTestId, queryByTestId } = renderScreen();

    fireEvent.press(await findByTestId("invite-name-ask-skip"));

    await waitFor(() => expect(queryByTestId("invite-name-ask")).toBeNull());
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(INVITE_NAME_ASK_KEY)).toBeNull()
    );
    expect(await AsyncStorage.getItem(USER_NAME_KEY)).toBeNull();
  });

  // Inter carries no Malayalam glyphs, so the sender's own name would render
  // as boxes in the one sentence that exists to name them.
  it("renders a Malayalam sender name in the Malayalam face", async () => {
    await AsyncStorage.setItem(INVITE_NAME_ASK_KEY, "\u0D05\u0D2E\u0D4D\u0D2E");
    const { findByText } = renderScreen();

    const line = await findByText(/sees that someone accepted/);
    expect(StyleSheet.flatten(line.props.style).fontFamily).toBe(
      "NotoSansMalayalam_400Regular"
    );
  });
});

// A recurring series is one Reminder record, not one row per occurrence, so
// the home list has to synthesize read-only preview cards for its next
// couple of occurrences (utils/recurrencePreviews.ts) -- otherwise a
// recurring reminder vanishes from every day but the one its live datetime
// happens to be on, and disappears from view entirely the moment today's
// occurrence is marked done.
describe("HomeScreen — recurring reminder previews", () => {
  const NOW = new Date(2026, 8, 19, 9, 0, 0); // Saturday

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows read-only preview cards for a recurring reminder's next occurrences", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({
          id: "r1",
          title: "Take medicine",
          datetime: NOW.toISOString(),
          recurrence: { freq: "daily", interval: 1 },
          recurrenceAnchor: NOW.toISOString(),
        }),
      ])
    );
    const { findAllByText, queryByTestId } = renderScreen();

    // The live card (today's own occurrence) plus 2 read-only previews.
    expect(await findAllByText("Take medicine")).toHaveLength(3);
    expect(queryByTestId("recurrence-preview-r1-preview-0")).toBeTruthy();
    expect(queryByTestId("recurrence-preview-r1-preview-1")).toBeTruthy();
  });

  it("keeps showing previews once today's occurrence is marked done", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({
          id: "r1",
          title: "Take medicine",
          datetime: NOW.toISOString(),
          completed: true,
          recurrence: { freq: "daily", interval: 1 },
          recurrenceAnchor: NOW.toISOString(),
        }),
      ])
    );
    const { findByTestId, queryByTestId } = renderScreen();

    expect(await findByTestId("recurrence-preview-r1-preview-0")).toBeTruthy();
    expect(queryByTestId("recurrence-preview-r1-preview-1")).toBeTruthy();
  });

  it("shows a continuation label on the last preview only", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeReminder({
          id: "r1",
          title: "Take medicine",
          datetime: NOW.toISOString(),
          recurrence: { freq: "daily", interval: 1 },
          recurrenceAnchor: NOW.toISOString(),
        }),
      ])
    );
    const { findByTestId, queryAllByTestId } = renderScreen();

    const lastPreview = await findByTestId("recurrence-preview-r1-preview-1");
    expect(within(lastPreview).getByTestId("recurrence-preview-continues")).toBeTruthy();
    expect(queryAllByTestId("recurrence-preview-continues")).toHaveLength(1);
  });

  it("never shows a preview card for a non-recurring reminder", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1", title: "Buy milk", datetime: NOW.toISOString() })])
    );
    const { findByText, queryByTestId } = renderScreen();

    expect(await findByText("Buy milk")).toBeTruthy();
    expect(queryByTestId("recurrence-preview-r1-preview-0")).toBeNull();
  });
});

// The tab bar is absolutely positioned, so it paints over this list. Without
// enough bottom padding the last card, or the number offer under it, stays
// behind the tabs - which is what a user reported on a real device.
describe("clearance under the tab bar", () => {
  it("pads the list past the tab bar, not just the gesture area", async () => {
    const { findByTestId } = renderScreen();

    const scroll = await findByTestId("home-scroll");
    const padding = StyleSheet.flatten(
      scroll.props.contentContainerStyle
    ).paddingBottom;

    expect(padding).toBeGreaterThan(TAB_BAR_HEIGHT);
  });
});
