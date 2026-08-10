import { useColorScheme } from "react-native";
import { renderHook } from "@testing-library/react-native";

import { useColors } from "@/hooks/useColors";
import colors from "@/constants/colors";

jest.mock("react-native/Libraries/Utilities/useColorScheme");

const mockScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;

function colorsFor(scheme: "light" | "dark" | null) {
  mockScheme.mockReturnValue(scheme);
  return renderHook(() => useColors()).result.current;
}

describe("useColors", () => {
  it("returns the light palette when the device is in light mode", () => {
    expect(colorsFor("light").background).toBe(colors.light.background);
  });

  it("returns the light palette when the device reports no preference", () => {
    expect(colorsFor(null).background).toBe(colors.light.background);
  });

  it("returns the dark palette when the device is in dark mode", () => {
    expect(colorsFor("dark").background).toBe(colors.dark.background);
  });

  it("returns a different background in dark mode than light mode", () => {
    expect(colorsFor("dark").background).not.toBe(colorsFor("light").background);
  });

  it("exposes radius tokens in both schemes", () => {
    expect(colorsFor("light").radius).toBe(colors.radius);
    expect(colorsFor("dark").radius).toBe(colors.radius);
  });
});

describe("dark palette completeness", () => {
  const lightKeys = Object.keys(colors.light).sort();
  const darkKeys = Object.keys(colors.dark).sort();

  it("defines exactly the same tokens as the light palette", () => {
    // A token present in light but missing in dark renders as `undefined`,
    // which React Native treats as "no colour" — usually black text on a
    // black background, and only on dark-mode devices.
    expect(darkKeys).toEqual(lightKeys);
  });

  it.each(lightKeys)("defines a valid hex colour for %s", (key) => {
    const value = (colors.dark as Record<string, string>)[key];
    expect(value).toMatch(/^#[0-9a-fA-F]{3,8}$/);
  });

  it("does not reuse the light background in dark mode", () => {
    expect(colors.dark.background).not.toBe(colors.light.background);
  });

  it("keeps foreground and background distinct in dark mode", () => {
    expect(colors.dark.foreground).not.toBe(colors.dark.background);
  });

  it("keeps card and foreground distinct in dark mode", () => {
    expect(colors.dark.cardForeground).not.toBe(colors.dark.card);
  });

  it("uses a dark background and a light foreground", () => {
    const luminance = (hex: string) => {
      const h = hex.replace("#", "");
      const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    };

    expect(luminance(colors.dark.background)).toBeLessThan(0.5);
    expect(luminance(colors.dark.foreground)).toBeGreaterThan(0.5);
    expect(luminance(colors.light.background)).toBeGreaterThan(0.5);
    expect(luminance(colors.light.foreground)).toBeLessThan(0.5);
  });
});
