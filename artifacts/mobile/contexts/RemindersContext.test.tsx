import React from "react";
import { AppState, Text, View } from "react-native";
import { render, waitFor, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  RemindersProvider,
  useReminders,
  type Reminder,
} from "@/contexts/RemindersContext";
import { DEFAULT_ALARM_KEY, STORAGE_KEY } from "@/services/ReminderService";

jest.mock("expo-haptics");

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

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

function Probe() {
  const {
    reminders,
    loading,
    addReminder,
    editReminder,
    deleteReminder,
    toggleComplete,
    snoozeReminder,
    defaultAlarmEnabled,
    setDefaultAlarmEnabled,
  } = useReminders();
  return (
    <View>
      <Text testID="loading">{String(loading)}</Text>
      <Text testID="count">{reminders.length}</Text>
      <Text testID="default-alarm-enabled">{String(defaultAlarmEnabled)}</Text>
      <Text
        testID="disable-default-alarm"
        onPress={() => setDefaultAlarmEnabled(false)}
      >
        disable default alarm
      </Text>
      {reminders.map((r) => (
        <Text key={r.id} testID={`reminder-${r.id}`}>
          {r.title}|{String(r.completed)}
        </Text>
      ))}
      <Text
        testID="add"
        onPress={() =>
          addReminder({ title: "New", description: "", datetime: FUTURE, alarm: true })
        }
      >
        add
      </Text>
      <Text
        testID="edit-r1"
        onPress={() =>
          editReminder("r1", { title: "Edited", description: "", datetime: FUTURE, alarm: true })
        }
      >
        edit
      </Text>
      <Text testID="delete-r1" onPress={() => deleteReminder("r1")}>
        delete
      </Text>
      <Text testID="toggle-r1" onPress={() => toggleComplete("r1")}>
        toggle
      </Text>
      <Text testID="snooze-r1" onPress={() => snoozeReminder("r1")}>
        snooze
      </Text>
    </View>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
});

describe("RemindersProvider", () => {
  it("starts loading and finishes with reminders read from storage", async () => {
    const seeded = [makeReminder({ id: "r1", title: "Seeded" })];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));

    const { getByTestId } = render(
      <RemindersProvider>
        <Probe />
      </RemindersProvider>
    );

    expect(getByTestId("loading").props.children).toBe("true");

    await waitFor(() => {
      expect(getByTestId("loading").props.children).toBe("false");
    });
    expect(getByTestId("count").props.children).toBe(1);
    expect(getByTestId("reminder-r1").props.children.join("")).toBe("Seeded|false");
  });

  it("addReminder appends a new reminder to state", async () => {
    const { getByTestId, queryAllByText } = render(
      <RemindersProvider>
        <Probe />
      </RemindersProvider>
    );
    await waitFor(() => expect(getByTestId("loading").props.children).toBe("false"));
    expect(getByTestId("count").props.children).toBe(0);

    await act(async () => {
      getByTestId("add").props.onPress();
    });

    await waitFor(() => expect(getByTestId("count").props.children).toBe(1));
    expect(queryAllByText("New|false").length).toBe(1);
  });

  it("editReminder updates the correct item in state", async () => {
    const seeded = [
      makeReminder({ id: "r1", title: "Original" }),
      makeReminder({ id: "r2", title: "Other" }),
    ];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));

    const { getByTestId } = render(
      <RemindersProvider>
        <Probe />
      </RemindersProvider>
    );
    await waitFor(() => expect(getByTestId("loading").props.children).toBe("false"));

    await act(async () => {
      getByTestId("edit-r1").props.onPress();
    });

    await waitFor(() =>
      expect(getByTestId("reminder-r1").props.children.join("")).toBe("Edited|false")
    );
    expect(getByTestId("reminder-r2").props.children.join("")).toBe("Other|false");
  });

  it("deleteReminder removes the correct item from state", async () => {
    const seeded = [makeReminder({ id: "r1" }), makeReminder({ id: "r2" })];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));

    const { getByTestId, queryByTestId } = render(
      <RemindersProvider>
        <Probe />
      </RemindersProvider>
    );
    await waitFor(() => expect(getByTestId("loading").props.children).toBe("false"));

    await act(async () => {
      getByTestId("delete-r1").props.onPress();
    });

    await waitFor(() => expect(queryByTestId("reminder-r1")).toBeNull());
    expect(getByTestId("reminder-r2")).toBeTruthy();
  });

  it("toggleComplete flips the completed flag in state", async () => {
    const seeded = [makeReminder({ id: "r1", completed: false })];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));

    const { getByTestId } = render(
      <RemindersProvider>
        <Probe />
      </RemindersProvider>
    );
    await waitFor(() => expect(getByTestId("loading").props.children).toBe("false"));

    await act(async () => {
      getByTestId("toggle-r1").props.onPress();
    });

    await waitFor(() =>
      expect(getByTestId("reminder-r1").props.children.join("")).toBe("Test reminder|true")
    );
  });

  it("defaultAlarmEnabled defaults to true when nothing is stored", async () => {
    const { getByTestId } = render(
      <RemindersProvider>
        <Probe />
      </RemindersProvider>
    );
    await waitFor(() => expect(getByTestId("loading").props.children).toBe("false"));

    expect(getByTestId("default-alarm-enabled").props.children).toBe("true");
  });

  it("defaultAlarmEnabled reflects a previously stored false value on load", async () => {
    await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(false));

    const { getByTestId } = render(
      <RemindersProvider>
        <Probe />
      </RemindersProvider>
    );
    await waitFor(() => expect(getByTestId("loading").props.children).toBe("false"));

    expect(getByTestId("default-alarm-enabled").props.children).toBe("false");
  });

  it("setDefaultAlarmEnabled updates context state and persists to storage", async () => {
    const { getByTestId } = render(
      <RemindersProvider>
        <Probe />
      </RemindersProvider>
    );
    await waitFor(() => expect(getByTestId("loading").props.children).toBe("false"));

    await act(async () => {
      getByTestId("disable-default-alarm").props.onPress();
    });

    await waitFor(() =>
      expect(getByTestId("default-alarm-enabled").props.children).toBe("false")
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      DEFAULT_ALARM_KEY,
      JSON.stringify(false)
    );
  });

  it("snoozeReminder updates the reminder's datetime and notificationId in storage", async () => {
    const seeded = [makeReminder({ id: "r1", notificationId: "old-notif" })];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));

    const { getByTestId } = render(
      <RemindersProvider>
        <Probe />
      </RemindersProvider>
    );
    await waitFor(() => expect(getByTestId("loading").props.children).toBe("false"));

    await act(async () => {
      getByTestId("snooze-r1").props.onPress();
    });

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored[0].notificationId).toBe("mock-notif-id");
    });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].datetime).not.toBe(FUTURE);
  });

  it("reloads reminders from storage when the app returns to foreground", async () => {
    const seeded = [makeReminder({ id: "r1", title: "Before" })];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));

    let foregroundListener: ((state: string) => void) | undefined;
    const addEventListenerSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((event: string, listener: any) => {
        if (event === "change") foregroundListener = listener;
        return { remove: jest.fn() } as any;
      });

    const { getByTestId } = render(
      <RemindersProvider>
        <Probe />
      </RemindersProvider>
    );
    await waitFor(() => expect(getByTestId("loading").props.children).toBe("false"));
    expect(getByTestId("reminder-r1").props.children.join("")).toBe("Before|false");

    // Simulate a headless tray action (Mark Done/Snooze) writing directly to
    // AsyncStorage while the app is backgrounded, bypassing context state.
    const updated = [makeReminder({ id: "r1", title: "After" })];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    expect(foregroundListener).toBeDefined();
    await act(async () => {
      foregroundListener!("active");
    });

    await waitFor(() =>
      expect(getByTestId("reminder-r1").props.children.join("")).toBe("After|false")
    );

    addEventListenerSpy.mockRestore();
  });
});
