import React from "react";
import { useColorScheme } from "react-native";
import { render, waitFor } from "@testing-library/react-native";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";

import ThemedStatusBar from "./ThemedStatusBar";
import { ThemeProvider, THEME_PREFERENCE_KEY } from "@/contexts/ThemeContext";

jest.mock("react-native/Libraries/Utilities/useColorScheme");
jest.mock("expo-status-bar", () => ({ StatusBar: jest.fn(() => null) }));

const mockScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;
const mockStatusBar = StatusBar as unknown as jest.Mock;

async function renderWith(
  device: "light" | "dark",
  preference: "light" | "dark" | "system"
) {
  mockScheme.mockReturnValue(device);
  await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);
  const view = render(
    <ThemeProvider>
      <ThemedStatusBar />
    </ThemeProvider>
  );
  return view;
}

function lastStyle(): string {
  const calls = mockStatusBar.mock.calls;
  return calls[calls.length - 1][0].style;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
});

describe("ThemedStatusBar", () => {
  it("uses dark icons on a light app background", async () => {
    await renderWith("light", "system");
    expect(lastStyle()).toBe("dark");
  });

  it("uses light icons on a dark app background", async () => {
    await renderWith("dark", "system");
    expect(lastStyle()).toBe("light");
  });

  // The reported bug: phone in dark mode, app set to Light. "auto" resolves
  // from the DEVICE scheme and drew light icons on a light background, making
  // the clock and battery invisible.
  it("follows an explicit Light preference on a dark device", async () => {
    await renderWith("dark", "light");
    // The preference loads from storage in an effect, so the first render
    // still reflects the device scheme.
    await waitFor(() => expect(lastStyle()).toBe("dark"));
  });

  it("follows an explicit Dark preference on a light device", async () => {
    await renderWith("light", "dark");
    await waitFor(() => expect(lastStyle()).toBe("light"));
  });
});
