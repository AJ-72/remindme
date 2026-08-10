import { useColorScheme } from "react-native";

import colors from "@/constants/colors";
import { useThemePreference } from "@/contexts/ThemeContext";

/**
 * Returns the design tokens for the active color scheme.
 *
 * The scheme is the user's in-app preference (Settings -> Appearance), which
 * defaults to "system" and then follows `useColorScheme()`. An explicit
 * "light" or "dark" choice overrides the device setting.
 *
 * Safe to call with no ThemeProvider above it — `useThemePreference()` returns
 * the "system" default rather than throwing, so ErrorFallback (which renders
 * inside ErrorBoundary, above the providers) still gets sensible colours.
 *
 * Both palettes define the same token names; `hooks/useColors.test.ts`
 * enforces that, since a token missing from one palette resolves to
 * `undefined` and renders as no colour at all.
 */
export function useColors() {
  const systemScheme = useColorScheme();
  const { preference } = useThemePreference();

  const scheme = preference === "system" ? systemScheme : preference;
  const palette = scheme === "dark" ? colors.dark : colors.light;

  return {
    ...palette,
    radius: colors.radius,
    radiusCard: colors.radiusCard,
    radiusCapsule: colors.radiusCapsule,
    radiusFull: colors.radiusFull,
  };
}
