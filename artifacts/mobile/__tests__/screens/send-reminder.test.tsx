import React from "react";
import { Linking, StyleSheet, useColorScheme } from "react-native";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import lightColors from "@/constants/colors";
import SendReminderScreen from "@/app/send-reminder";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import {
  INVITE_NUDGE_COUNT_KEY,
  INVITE_NUDGE_ENABLED_KEY,
  STORAGE_KEY,
  USER_NAME_KEY,
  type Reminder,
} from "@/services/ReminderService";

jest.mock("expo-haptics");

const mockBack = jest.fn();
let mockSearchParams: { id?: string } = { id: "s1" };

jest.mock("expo-router", () => ({
  router: {
    back: (...args: any[]) => mockBack(...args),
    push: jest.fn(),
    replace: jest.fn(),
  },
  useLocalSearchParams: () => mockSearchParams,
}));

const FUTURE = new Date(Date.now() + 3600_000).toISOString();

function makeSendReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "s1",
    title: "Pick up milk",
    description: "",
    datetime: FUTURE,
    completed: false,
    recipient: { name: "Priya", phone: "+91 98765 43210", contactId: "c1" },
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
      <ThemeProvider>
        <RemindersProvider>
          <SendReminderScreen />
        </RemindersProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockSearchParams = { id: "s1" };
  await (AsyncStorage as any).clear();
  (getLocales as jest.Mock).mockReturnValue([
    { languageTag: "en-IN", languageCode: "en", regionCode: "IN" },
  ]);
  jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
});

describe("SendReminderScreen", () => {
  it("shows the recipient and a message prefilled from the reminder", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeSendReminder()]));
    const { findByText, findByTestId } = renderScreen();
    expect(await findByText("Priya")).toBeTruthy();
    expect((await findByTestId("message-input")).props.value).toContain(
      "Pick up milk"
    );
  });

  it("includes the first-stage invite nudge by default", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeSendReminder()]));
    const { findByTestId } = renderScreen();
    const input = await findByTestId("message-input");
    await waitFor(() => expect(input.props.value).toMatch(/\(.*Reminders.*\)/));
  });

  it("omits the nudge when the global setting is off", async () => {
    await AsyncStorage.setItem(INVITE_NUDGE_ENABLED_KEY, "false");
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeSendReminder()]));
    const { findByTestId } = renderScreen();
    const input = await findByTestId("message-input");
    await waitFor(() => expect(input.props.value).toBe("Pick up milk"));
  });

  it("removes the nudge from the message when the per-send toggle is turned off", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeSendReminder()]));
    const { findByTestId } = renderScreen();
    const input = await findByTestId("message-input");
    await waitFor(() => expect(input.props.value).toContain("("));

    fireEvent(await findByTestId("nudge-toggle"), "valueChange", false);
    await waitFor(() => expect(input.props.value).toBe("Pick up milk"));
  });

  it("opens WhatsApp with a wa.me link carrying the message", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeSendReminder()]));
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("send-whatsapp"));

    await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());
    const url = (Linking.openURL as jest.Mock).mock.calls[0][0];
    expect(url).toContain("https://wa.me/919876543210");
    expect(url).toContain("Pick%20up%20milk");
  });

  it("offers SMS as well, never as an automatic fallback", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeSendReminder()]));
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("send-sms"));
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());
    expect((Linking.openURL as jest.Mock).mock.calls[0][0]).toContain("sms:");
  });

  it("explains itself and hides WhatsApp when the number cannot be normalized", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeSendReminder({ recipient: { name: "Priya", phone: "12345" } }),
      ])
    );
    const { findByText, queryByTestId, findByTestId } = renderScreen();
    await findByTestId("send-sms");
    expect(queryByTestId("send-whatsapp")).toBeNull();
    expect(await findByText(/SMS will be used/i)).toBeTruthy();
  });

  it("advances the per-contact nudge count only on an actual send", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeSendReminder()]));
    const { findByTestId } = renderScreen();
    await findByTestId("message-input");

    // Rendering alone must not burn a stage.
    expect(await AsyncStorage.getItem(INVITE_NUDGE_COUNT_KEY)).toBeNull();

    fireEvent.press(await findByTestId("send-whatsapp"));
    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(INVITE_NUDGE_COUNT_KEY);
      expect(JSON.parse(raw as string)["919876543210"]).toBe(1);
    });
  });

  it("never auto-completes the reminder on send", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeSendReminder()]));
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("send-whatsapp"));
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].completed).toBe(false);
  });

  it("marks the reminder done only when the user says so", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeSendReminder()]));
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("mark-done"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(stored[0].completed).toBe(true);
    });
  });

  it("renders send buttons when the reminder is already completed", async () => {
    // Covers mis-taps and re-sends: a completed send reminder must stay
    // openable and sendable.
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeSendReminder({ completed: true })])
    );
    const { findByTestId } = renderScreen();
    expect(await findByTestId("send-whatsapp")).toBeTruthy();
    expect(await findByTestId("send-sms")).toBeTruthy();
  });

  it("uses the edited message text rather than the original when sending", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeSendReminder()]));
    const { findByTestId } = renderScreen();
    fireEvent.changeText(await findByTestId("message-input"), "Totally rewritten");
    fireEvent.press(await findByTestId("send-whatsapp"));

    await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());
    expect((Linking.openURL as jest.Mock).mock.calls[0][0]).toContain(
      "Totally%20rewritten"
    );
  });

  it("disables the nudge toggle when the user edited the nudge line away", async () => {
    // A failed string match must disable the control, never mangle their text.
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeSendReminder()]));
    const { findByTestId } = renderScreen();
    const input = await findByTestId("message-input");
    await waitFor(() => expect(input.props.value).toContain("("));

    fireEvent.changeText(input, "I rewrote everything myself");
    const toggle = await findByTestId("nudge-toggle");
    await waitFor(() => expect(toggle.props.disabled).toBe(true));
  });

  it("shows a not-found state for an unknown id instead of crashing", async () => {
    mockSearchParams = { id: "does-not-exist" };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    const { findByTestId } = renderScreen();
    expect(await findByTestId("send-not-found")).toBeTruthy();
  });
});

describe("dark mode", () => {
  const mockScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;

  afterEach(() => {
    mockScheme.mockReturnValue("light");
  });

  it("paints the recipient name with the dark foreground", async () => {
    mockScheme.mockReturnValue("dark");
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeSendReminder()]));
    const { findByText } = renderScreen();

    const name = await findByText("Priya");
    const flat = StyleSheet.flatten(name.props.style);
    // Assert the LITERAL value, not `=== colors.dark.foreground`: comparing
    // against the token follows it anywhere, so it would still pass if the
    // dark palette held light-mode values.
    expect(flat.color).toBe("#e8e8f0");
    expect(flat.color).not.toBe(lightColors.light.foreground);
  });

  it("paints the message input with the dark card surface", async () => {
    mockScheme.mockReturnValue("dark");
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeSendReminder()]));
    const { findByTestId } = renderScreen();

    const flat = StyleSheet.flatten((await findByTestId("message-input")).props.style);
    expect(flat.backgroundColor).toBe("#1c1c25");
    expect(flat.backgroundColor).not.toBe(lightColors.light.card);
  });

  it("uses the light palette when the device is in light mode", async () => {
    mockScheme.mockReturnValue("light");
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeSendReminder()]));
    const { findByText } = renderScreen();

    const flat = StyleSheet.flatten((await findByText("Priya")).props.style);
    expect(flat.color).toBe(lightColors.light.foreground);
    expect(flat.color).not.toBe("#e8e8f0");
  });
});

describe("SendReminderScreen — sender signature", () => {
  it("signs the seeded message with the user's name", async () => {
    await AsyncStorage.setItem(USER_NAME_KEY, "Anand");
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeSendReminder({ title: "Call the plumber", description: "" })])
    );
    const { findByTestId } = renderScreen();
    await waitFor(async () =>
      expect((await findByTestId("message-input")).props.value).toContain("— Anand")
    );
  });

  it("leaves the message unsigned when no name is stored", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeSendReminder({ title: "Call the plumber", description: "" })])
    );
    const { findByTestId } = renderScreen();
    await waitFor(async () =>
      expect((await findByTestId("message-input")).props.value).toContain(
        "Call the plumber"
      )
    );
    expect((await findByTestId("message-input")).props.value).not.toContain("—");
  });
});
