import { useColorScheme } from "react-native";

import colors from "@/constants/colors";

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * `useColorScheme()` returns null when the device expresses no preference,
 * which is treated as light. Both palettes define the same token names —
 * `hooks/useColors.test.ts` enforces that, since a token missing from one
 * palette resolves to `undefined` and renders as no colour at all.
 *
 * Note this follows the SYSTEM setting; there is no in-app override. Adding
 * one means persisting a setting and reading it here instead.
 */
export function useColors() {
  const scheme = useColorScheme();
  const palette = scheme === "dark" ? colors.dark : colors.light;
  return {
    ...palette,
    radius: colors.radius,
    radiusCard: colors.radiusCard,
    radiusCapsule: colors.radiusCapsule,
    radiusFull: colors.radiusFull,
  };
}
