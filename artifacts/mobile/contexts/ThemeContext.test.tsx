import React from "react";
import { Text, useColorScheme } from "react-native";
import { render, waitFor, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  THEME_PREFERENCE_KEY,
  ThemeProvider,
  useThemePreference,
  isThemePreference,
} from "@/contexts/ThemeContext";
import { useColors } from "@/hooks/useColors";
import colors from "@/constants/colors";

jest.mock("react-native/Libraries/Utilities/useColorScheme");
const mockScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;

function Probe() {
  const { preference } = useThemePreference();
  const c = useColors();
  return (
    <>
      <Text testID="pref">{preference}</Text>
      <Text testID="bg">{c.background}</Text>
    </>
  );
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
  mockScheme.mockReturnValue("light");
});

describe("isThemePreference", () => {
  it.each(["light", "dark", "system"])("accepts %s", (value) => {
    expect(isThemePreference(value)).toBe(true);
  });

  it.each([null, undefined, "", "Dark", "auto", 1, {}])(
    "rejects %p",
    (value) => {
      expect(isThemePreference(value)).toBe(false);
    }
  );
});

describe("ThemeProvider", () => {
  it("defaults to following the system when nothing is stored", async () => {
    const { findByTestId } = renderProbe();
    expect((await findByTestId("pref")).props.children).toBe("system");
  });

  it("uses the dark palette when the system is dark and the preference is system", async () => {
    mockScheme.mockReturnValue("dark");
    const { findByTestId } = renderProbe();
    await waitFor(async () =>
      expect((await findByTestId("bg")).props.children).toBe(colors.dark.background)
    );
  });

  it("uses the light palette when the system is light and the preference is system", async () => {
    mockScheme.mockReturnValue("light");
    const { findByTestId } = renderProbe();
    await waitFor(async () =>
      expect((await findByTestId("bg")).props.children).toBe(colors.light.background)
    );
  });

  it("forces dark even when the system is light", async () => {
    mockScheme.mockReturnValue("light");
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, "dark");

    const { findByTestId } = renderProbe();
    await waitFor(async () =>
      expect((await findByTestId("bg")).props.children).toBe(colors.dark.background)
    );
  });

  it("forces light even when the system is dark", async () => {
    mockScheme.mockReturnValue("dark");
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, "light");

    const { findByTestId } = renderProbe();
    await waitFor(async () =>
      expect((await findByTestId("bg")).props.children).toBe(colors.light.background)
    );
  });

  it("falls back to system when the stored value is corrupt", async () => {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, "chartreuse");
    const { findByTestId } = renderProbe();
    await waitFor(async () =>
      expect((await findByTestId("pref")).props.children).toBe("system")
    );
  });

  it("persists a new preference", async () => {
    let setPreference: (p: "light" | "dark" | "system") => Promise<void>;

    function Setter() {
      setPreference = useThemePreference().setPreference;
      return null;
    }

    render(
      <ThemeProvider>
        <Setter />
      </ThemeProvider>
    );

    await act(async () => {
      await setPreference!("dark");
    });

    expect(await AsyncStorage.getItem(THEME_PREFERENCE_KEY)).toBe("dark");
  });

  it("applies a new preference without a reload", async () => {
    mockScheme.mockReturnValue("light");
    let setPreference: (p: "light" | "dark" | "system") => Promise<void>;

    function Setter() {
      setPreference = useThemePreference().setPreference;
      const c = useColors();
      return <Text testID="bg">{c.background}</Text>;
    }

    const { findByTestId } = render(
      <ThemeProvider>
        <Setter />
      </ThemeProvider>
    );

    await act(async () => {
      await setPreference!("dark");
    });

    expect((await findByTestId("bg")).props.children).toBe(colors.dark.background);
  });
});

describe("useColors outside a ThemeProvider", () => {
  // ErrorFallback renders inside ErrorBoundary, which wraps the providers —
  // so it can render when no ThemeProvider exists. Throwing there would turn
  // any caught error into a crash-on-crash.
  it("falls back to the system scheme instead of throwing", () => {
    mockScheme.mockReturnValue("dark");
    function Bare() {
      const c = useColors();
      return <Text testID="bg">{c.background}</Text>;
    }

    const { getByTestId } = render(<Bare />);
    expect(getByTestId("bg").props.children).toBe(colors.dark.background);
  });
});
