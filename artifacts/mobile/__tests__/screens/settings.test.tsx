import React from "react";
import { Alert, Linking, Platform, Share, StyleSheet, useColorScheme } from "react-native";
import { router } from "expo-router";
import { APP_SHARE_BLURB, buildAppShareMessage } from "@/utils/appShare";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SettingsScreen from "@/app/(tabs)/settings";
import { RemindersProvider } from "@/contexts/RemindersContext";
import {
  INVITE_NUDGE_ENABLED_KEY,
  DEFAULT_ALARM_KEY,
  DEFAULT_EXACT_TIMING_KEY,
  SHOW_DESCRIPTION_KEY,
  DICTATION_LANGUAGE_KEY,
  VIBRATION_KEY,
  STORAGE_KEY,
  USER_NAME_KEY,
} from "@/services/ReminderService";
import darkColors from "@/constants/colors";
import { ThemeProvider, THEME_PREFERENCE_KEY } from "@/contexts/ThemeContext";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("expo-haptics");
jest.mock("react-native/Libraries/Utilities/useColorScheme");

jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);

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
          <SettingsScreen />
        </RemindersProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
});

// The Settings toggle is a DEFAULT for new reminders — nothing in the
// scheduling path reads it — so existing reminders keep their own alarm value
// and keep ringing after it goes off. That surprise (a lit status-bar icon
// with the setting off) is what these tests lock down: the default always
// changes, the retroactive sweep is offered, and it is never automatic.
describe("SettingsScreen retroactive alarm prompt", () => {
  const FUTURE = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const seedReminders = async (alarms: boolean[]) =>
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        alarms.map((alarm, i) => ({
          id: `r${i}`,
          title: `Reminder ${i}`,
          description: "",
          datetime: FUTURE(),
          completed: false,
          alarm,
        }))
      )
    );

  it("offers to silence existing alarm reminders when switching off", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(true));
    await seedReminders([true, true]);
    const { findByTestId } = renderScreen();

    fireEvent(await findByTestId("default-alarm-switch"), "valueChange", false);

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(alertSpy.mock.calls[0][0]).toContain("2 existing reminders");
  });

  it("offers to turn alarm on for existing silent reminders when switching on", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(false));
    await seedReminders([false]);
    const { findByTestId } = renderScreen();

    fireEvent(await findByTestId("default-alarm-switch"), "valueChange", true);

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(alertSpy.mock.calls[0][0]).toContain("1 existing reminder");
  });

  it("does not prompt when no pending reminder would change", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(true));
    await seedReminders([false]);
    const { findByTestId } = renderScreen();

    fireEvent(await findByTestId("default-alarm-switch"), "valueChange", false);

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(DEFAULT_ALARM_KEY)).toBe("false")
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });

  // The switch means "change the default" — that must happen whether or not
  // the user accepts the retroactive sweep, and before they answer.
  it("changes the default even while the prompt is unanswered", async () => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(true));
    await seedReminders([true]);
    const { findByTestId } = renderScreen();

    fireEvent(await findByTestId("default-alarm-switch"), "valueChange", false);

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(DEFAULT_ALARM_KEY)).toBe("false")
    );
  });

  // A dismissed alert must never mass-rewrite reminders, so the button that
  // changes nothing carries the cancel role.
  it("puts the cancel role on the leave-them-alone button", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(true));
    await seedReminders([true]);
    const { findByTestId } = renderScreen();

    fireEvent(await findByTestId("default-alarm-switch"), "valueChange", false);

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    const buttons = alertSpy.mock.calls[0][2] as { text: string; style?: string }[];
    expect(buttons[0].style).toBe("cancel");
    expect(buttons[0].text).toBe("Keep them as they are");
  });

  it("rewrites the pending reminders only when the sweep is accepted", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(true));
    await seedReminders([true]);
    const { findByTestId } = renderScreen();

    fireEvent(await findByTestId("default-alarm-switch"), "valueChange", false);
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    const buttons = alertSpy.mock.calls[0][2] as { onPress?: () => void }[];
    buttons[1].onPress!();

    await waitFor(async () => {
      const stored = JSON.parse(
        (await AsyncStorage.getItem(STORAGE_KEY)) as string
      );
      expect(stored[0].alarm).toBe(false);
    });
  });
});

describe("SettingsScreen", () => {
  it("shows the alarm switch on when no default is stored", async () => {
    const { findByText, findByTestId } = renderScreen();
    expect(await findByText("Rings out loud")).toBeTruthy();
    const switchEl = await findByTestId("default-alarm-switch");
    expect(switchEl.props.value).toBe(true);
  });

  // The alarm toggle used to decide punctuality as well as sound, so its "off"
  // copy warned about arriving ~20 minutes late. Exact timing is now its own
  // setting, so a silent reminder is punctual and that warning would be a lie.
  it("shows the alarm switch off, with copy promising silence but not lateness", async () => {
    await AsyncStorage.setItem(DEFAULT_ALARM_KEY, JSON.stringify(false));
    const { findByText, findByTestId, queryByText } = renderScreen();
    expect(await findByText("Silent — arrives without a sound")).toBeTruthy();
    expect(queryByText(/late/i)).toBeNull();
    const switchEl = await findByTestId("default-alarm-switch");
    expect(switchEl.props.value).toBe(false);
  });

  // The switch is negated relative to the stored setting: it reads "Do not
  // use Android Alarm feature", so OFF (the default) means the alarm feature
  // is in use, i.e. defaultExactTimingEnabled stays true underneath.
  it("shows the exact-timing switch off by default (alarm feature enabled), with on-time copy", async () => {
    const { findByText, findByTestId } = renderScreen();
    expect(await findByText("Reminders fire at exactly the time you set")).toBeTruthy();
    const switchEl = await findByTestId("default-exact-timing-switch");
    expect(switchEl.props.value).toBe(false);
  });

  it("toggling the negated switch on persists the underlying default as off", async () => {
    const { findByTestId } = renderScreen();
    const switchEl = await findByTestId("default-exact-timing-switch");

    fireEvent(switchEl, "valueChange", true);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        DEFAULT_EXACT_TIMING_KEY,
        JSON.stringify(false)
      )
    );
  });

  it("toggling the switch persists the new default to storage", async () => {
    const { findByTestId } = renderScreen();
    const switchEl = await findByTestId("default-alarm-switch");

    fireEvent(switchEl, "valueChange", false);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        DEFAULT_ALARM_KEY,
        JSON.stringify(false)
      )
    );
  });

  it("shows the description switch off, with title-only copy, when no setting is stored", async () => {
    const { findByText, findByTestId } = renderScreen();
    expect(await findByText("Notification shows only the reminder title")).toBeTruthy();
    const switchEl = await findByTestId("show-description-switch");
    expect(switchEl.props.value).toBe(false);
  });

  it("shows the description switch on, with lock-screen copy, when the stored setting is true", async () => {
    await AsyncStorage.setItem(SHOW_DESCRIPTION_KEY, JSON.stringify(true));
    const { findByText, findByTestId } = renderScreen();
    expect(
      await findByText("Description appears on the lock screen and notification shade")
    ).toBeTruthy();
    const switchEl = await findByTestId("show-description-switch");
    expect(switchEl.props.value).toBe(true);
  });

  it("toggling the description switch persists the new setting to storage", async () => {
    const { findByTestId } = renderScreen();
    const switchEl = await findByTestId("show-description-switch");

    fireEvent(switchEl, "valueChange", true);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        SHOW_DESCRIPTION_KEY,
        JSON.stringify(true)
      )
    );
  });

  // Regression: these titles rendered in the tree but were invisible on device.
  // The shared alarmLabel style carried flex:1, which is right for a row child
  // but wrong here — each title sits in a nested column View next to its
  // sub-label, and flex:1 in a column collapses it to zero height. A text query
  // alone can't catch that, so assert the style too.
  it.each([
    ["Alarm sound"],
    ["Do not use Android Alarm feature"],
    ["Vibrate"],
    ["Show description in notifications"],
  ])("renders the %s row title without a height-collapsing flex", async (title) => {
    const { findByText } = renderScreen();
    const label = await findByText(title);
    const style = StyleSheet.flatten(label.props.style);
    expect(style.flex).toBeUndefined();
  });

  describe("status-bar alarm icon explainer (Android only)", () => {
    // jest.replaceProperty does NOT auto-restore without restoreMocks, and a
    // leaked Platform.OS changes which native Switch renders, breaking every
    // later test in this file. Restore the handle explicitly rather than
    // calling restoreAllMocks, which would also kill the module-level
    // Share.share spy.
    let replaced: { restore: () => void }[] = [];
    const setPlatform = (os: string) => {
      replaced.push(jest.replaceProperty(Platform, "OS", os as any));
    };
    afterEach(() => {
      replaced.forEach((r) => r.restore());
      replaced = [];
    });

    it("is not rendered on iOS, which has no such icon", async () => {
      setPlatform("ios");
      const { queryByTestId, findByTestId } = renderScreen();
      await findByTestId("default-alarm-switch");
      expect(queryByTestId("alarm-icon-explainer")).toBeNull();
    });

    it("is collapsed on Android until tapped", async () => {
      setPlatform("android");
      const { findByTestId, queryByText } = renderScreen();
      await findByTestId("alarm-icon-explainer");
      expect(queryByText(/armed to go off at exactly its time/)).toBeNull();
    });

    it("explains the icon when tapped", async () => {
      setPlatform("android");
      const { findByTestId, findByText } = renderScreen();

      fireEvent.press(await findByTestId("alarm-icon-explainer"));

      expect(
        await findByText(/armed to go off at exactly its time/)
      ).toBeTruthy();
    });

    // Verified on device 2026-08-29: the app does NOT appear in Android's
    // "Alarms & reminders" screen, because it holds USE_EXACT_ALARM — a normal,
    // auto-granted, non-revocable permission that supersedes
    // SCHEDULE_EXACT_ALARM on targetSdk 34+. There is no per-app OS switch to
    // point at, so the copy must not claim one, and must not offer a button
    // onto a screen the app is absent from.
    it("does not claim an Android per-app switch that does not exist", async () => {
      setPlatform("android");
      const { findByTestId, queryByText } = renderScreen();

      fireEvent.press(await findByTestId("alarm-icon-explainer"));

      expect(queryByText(/Allow setting alarms and reminders/)).toBeNull();
      expect(queryByText(/Settings . Apps . Reminders/)).toBeNull();
    });

    it("points at the app's own exact-timing toggle as the real escape hatch", async () => {
      setPlatform("android");
      const { findByTestId, findByText } = renderScreen();

      fireEvent.press(await findByTestId("alarm-icon-explainer"));

      expect(
        await findByText(/Do not use Android\s+Alarm feature.+switch above/s)
      ).toBeTruthy();
    });

    // The button used to open Android's Alarms & reminders screen. Removed:
    // this app is not listed there (see the USE_EXACT_ALARM note above), so it
    // dropped the user onto a long list their app was absent from.
    it("offers no button onto the alarms & reminders screen", async () => {
      setPlatform("android");
      const { findByTestId, queryByTestId } = renderScreen();

      fireEvent.press(await findByTestId("alarm-icon-explainer"));

      expect(queryByTestId("alarm-icon-explainer-settings")).toBeNull();
    });
  });

  // Vibration is independent of sound: the reported bug was that turning off
  // "play sound" also killed the buzz, with no way to get it back.
  it("shows the vibration switch on by default", async () => {
    const { findByTestId, findByText } = renderScreen();
    const switchEl = await findByTestId("vibration-switch");
    await waitFor(() => expect(switchEl.props.value).toBe(true));
    expect(await findByText("Vibrates, even when sound is off")).toBeTruthy();
  });

  it("reflects a stored false vibration setting", async () => {
    await AsyncStorage.setItem(VIBRATION_KEY, JSON.stringify(false));
    const { findByTestId, findByText } = renderScreen();
    const switchEl = await findByTestId("vibration-switch");
    await waitFor(() => expect(switchEl.props.value).toBe(false));
    expect(await findByText("Does not vibrate")).toBeTruthy();
  });

  it("toggling vibration persists the new setting to storage", async () => {
    const { findByTestId } = renderScreen();
    const switchEl = await findByTestId("vibration-switch");

    fireEvent(switchEl, "valueChange", false);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        VIBRATION_KEY,
        JSON.stringify(false)
      )
    );
  });

  it("leaves vibration on when the alarm sound is switched off", async () => {
    const { findByTestId } = renderScreen();
    const alarmSwitch = await findByTestId("default-alarm-switch");

    fireEvent(alarmSwitch, "valueChange", false);

    const vibrationSwitch = await findByTestId("vibration-switch");
    await waitFor(() => expect(vibrationSwitch.props.value).toBe(true));
  });

  it("highlights English by default when no dictation language is stored (mocked device locale is en-US)", async () => {
    const { findByTestId } = renderScreen();
    const enPill = await findByTestId("dictation-language-en");
    const mlPill = await findByTestId("dictation-language-ml");
    await waitFor(() => expect(enPill.props.accessibilityState?.selected).toBe(true));
    expect(mlPill.props.accessibilityState?.selected).toBe(false);
  });

  it("highlights Malayalam when it's the stored dictation language", async () => {
    await AsyncStorage.setItem(DICTATION_LANGUAGE_KEY, "ml-IN");
    const { findByTestId } = renderScreen();
    const mlPill = await findByTestId("dictation-language-ml");
    await waitFor(() => expect(mlPill.props.accessibilityState?.selected).toBe(true));
  });

  it("tapping the Malayalam pill persists the new dictation language to storage", async () => {
    const { findByTestId } = renderScreen();
    const mlPill = await findByTestId("dictation-language-ml");

    fireEvent.press(mlPill);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(DICTATION_LANGUAGE_KEY, "ml-IN")
    );
  });

  it("tapping the English pill persists the new dictation language to storage", async () => {
    await AsyncStorage.setItem(DICTATION_LANGUAGE_KEY, "ml-IN");
    const { findByTestId } = renderScreen();
    const enPill = await findByTestId("dictation-language-en");

    fireEvent.press(enPill);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(DICTATION_LANGUAGE_KEY, "en-US")
    );
  });
});

// Backup, restore, and debug logs moved to their own screen (app/backup.tsx)
// on 2026-09-06 — see __tests__/screens/backup.test.tsx. This screen now only
// carries a single entry row into it (see "SettingsScreen — More" below).

describe("dark mode", () => {
  const mockScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;

  afterEach(() => {
    mockScheme.mockReturnValue("light");
  });

  it("paints the screen with the dark background when the device is in dark mode", async () => {
    mockScheme.mockReturnValue("dark");
    const { findByText } = renderScreen();

    const header = await findByText("Settings");
    const flat = StyleSheet.flatten(header.props.style);
    // Assert the rendered value directly, not `=== colors.dark.foreground`:
    // comparing against the token makes the test follow the token anywhere,
    // so it would still pass if the dark palette were given light-mode
    // values. Verified by temporarily setting dark.foreground to the light
    // value — the token-comparison version passed, this one fails.
    expect(flat.color).toBe("#F4F1EA");
    expect(flat.color).not.toBe(darkColors.light.foreground);
  });

  it("paints the screen with the light background in light mode", async () => {
    mockScheme.mockReturnValue("light");
    const { findByText } = renderScreen();

    const header = await findByText("Settings");
    const flat = StyleSheet.flatten(header.props.style);
    expect(flat.color).toBe("#131A28");
    expect(flat.color).not.toBe(darkColors.dark.foreground);
  });
});

describe("appearance override", () => {
  const mockScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;

  it("defaults to System when nothing is stored", async () => {
    const { findByTestId } = renderScreen();
    const systemPill = await findByTestId("theme-system");
    expect(systemPill.props.accessibilityState.selected).toBe(true);
  });

  it("reflects a stored dark preference", async () => {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, "dark");
    const { findByTestId } = renderScreen();

    await waitFor(async () => {
      const darkPill = await findByTestId("theme-dark");
      expect(darkPill.props.accessibilityState.selected).toBe(true);
    });
  });

  it("persists the chosen preference", async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("theme-dark"));

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(THEME_PREFERENCE_KEY)).toBe("dark")
    );
  });

  it("repaints immediately when Dark is chosen on a light device", async () => {
    mockScheme.mockReturnValue("light");
    const { findByTestId, findByText } = renderScreen();

    expect(StyleSheet.flatten((await findByText("Settings")).props.style).color).toBe(
      "#131A28"
    );

    fireEvent.press(await findByTestId("theme-dark"));

    await waitFor(async () =>
      expect(
        StyleSheet.flatten((await findByText("Settings")).props.style).color
      ).toBe("#F4F1EA")
    );
  });

  it("returns to the device setting when System is chosen", async () => {
    mockScheme.mockReturnValue("dark");
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, "light");
    const { findByTestId, findByText } = renderScreen();

    await waitFor(async () =>
      expect(
        StyleSheet.flatten((await findByText("Settings")).props.style).color
      ).toBe("#131A28")
    );

    fireEvent.press(await findByTestId("theme-system"));

    await waitFor(async () =>
      expect(
        StyleSheet.flatten((await findByText("Settings")).props.style).color
      ).toBe("#F4F1EA")
    );
  });
});

describe("invite nudge setting", () => {
  it("shows the nudge switch on by default", async () => {
    const { findByTestId } = renderScreen();
    const switchEl = await findByTestId("invite-nudge-switch");
    expect(switchEl.props.value).toBe(true);
  });

  it("shows the nudge switch off when the stored value is false", async () => {
    await AsyncStorage.setItem(INVITE_NUDGE_ENABLED_KEY, "false");
    const { findByTestId } = renderScreen();
    const switchEl = await findByTestId("invite-nudge-switch");
    await waitFor(() => expect(switchEl.props.value).toBe(false));
  });

  it("toggling the switch persists the new value", async () => {
    const { findByTestId } = renderScreen();
    const switchEl = await findByTestId("invite-nudge-switch");

    fireEvent(switchEl, "valueChange", false);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        INVITE_NUDGE_ENABLED_KEY,
        "false"
      )
    );
  });

  it("the row label never implies the app delivers the message", async () => {
    // Tier 1 cannot deliver to the recipient. No user-facing string may imply
    // otherwise - this is the top risk on the feature and it is a copy risk.
    const { findByText } = renderScreen();
    expect(await findByText("Mention this app when messaging")).toBeTruthy();
  });
});

describe("SettingsScreen — share this app", () => {
  it("shares the app blurb, with no dead link while the store URL is unset", async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("share-app-row"));

    await waitFor(() => expect(Share.share).toHaveBeenCalled());
    const shared = (Share.share as jest.Mock).mock.calls[0][0].message;
    expect(shared).toBe(buildAppShareMessage());
    expect(shared).toContain(APP_SHARE_BLURB);
    // APP_STORE_URL is a documented placeholder until first publish.
    expect(shared).not.toMatch(/https?:\/\//);
  });
});

describe("SettingsScreen — your name", () => {
  it("shows a not-set hint until a name exists", async () => {
    const { findByTestId } = renderScreen();
    expect((await findByTestId("user-name-value")).props.children).toBe(
      "Not set — used to greet you and sign your messages"
    );
  });

  it("saves an edited name and reflects it in the row", async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("user-name-row"));
    fireEvent.changeText(await findByTestId("name-sheet-input"), "  Anand  ");
    fireEvent.press(await findByTestId("name-sheet-save"));

    await waitFor(async () =>
      // Trimmed on the way to storage, so the greeting can concatenate it
      // without producing a double space.
      expect(await AsyncStorage.getItem(USER_NAME_KEY)).toBe("Anand")
    );
    expect((await findByTestId("user-name-value")).props.children).toBe("Anand");
  });

  it("leaves the stored name untouched when the sheet is cancelled", async () => {
    await AsyncStorage.setItem(USER_NAME_KEY, "Anand");
    const { findByTestId } = renderScreen();
    await waitFor(async () =>
      expect((await findByTestId("user-name-value")).props.children).toBe("Anand")
    );

    fireEvent.press(await findByTestId("user-name-row"));
    fireEvent.changeText(await findByTestId("name-sheet-input"), "Someone else");
    fireEvent.press(await findByTestId("name-sheet-dismiss"));

    expect(await AsyncStorage.getItem(USER_NAME_KEY)).toBe("Anand");
    expect((await findByTestId("user-name-value")).props.children).toBe("Anand");
  });
});


describe("SettingsScreen — Smart Alerts entry", () => {
  it("offers a row into the Smart Alerts screen", async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("smart-alerts-row"));
    expect(router.push).toHaveBeenCalledWith("/smart-alerts");
  });
});


// The screen outgrew one viewport when Smart Alerts was added, and its root
// was a plain View - everything below the fold was unreachable on a device
// with no error, no clipping indicator, and nothing visible in tests.
describe("SettingsScreen — scrolling", () => {
  it("puts its content in a scroll view", async () => {
    const { findByTestId } = renderScreen();
    expect(await findByTestId("settings-scroll")).toBeTruthy();
  });

  it("renders the last row, which sits below the fold", async () => {
    const { findByTestId } = renderScreen();
    expect(await findByTestId("backup-troubleshooting-row")).toBeTruthy();
  });
});

describe("SettingsScreen — Backup & troubleshooting entry", () => {
  it("offers a row into the Backup & troubleshooting screen", async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("backup-troubleshooting-row"));
    expect(router.push).toHaveBeenCalledWith("/backup");
  });
});
