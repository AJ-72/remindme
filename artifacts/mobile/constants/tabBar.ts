import { Platform } from "react-native";

/**
 * The tab bar sits on `position: "absolute"` (see `app/(tabs)/_layout.tsx`),
 * so it paints over the content of every tab screen rather than shortening it.
 * Nothing compensated for that, so the last item on a tab screen stayed behind
 * the tabs — visible on the home screen as a clipped "Remind someone else?"
 * banner.
 *
 * Each tab screen therefore pads its own bottom by `tabBarContentInset()`.
 *
 * The height is a constant rather than `useBottomTabBarHeight()` because
 * `@react-navigation/bottom-tabs` is a transitive dependency of expo-router,
 * not one this package declares — importing it here would be a phantom
 * dependency that pnpm's strict layout can break at any upgrade. It is also
 * wrong for the `NativeTabs` path on iOS 26, which is not that navigator at
 * all. A constant that is a few points too generous costs a little empty
 * space; one that is too small hides content, which is the bug being fixed.
 */
export const TAB_BAR_HEIGHT = 56;

/** The explicit height the classic tab bar is given on web. */
export const TAB_BAR_HEIGHT_WEB = 84;

/** The gap between the last item on a screen and the tab bar above it. */
export const TAB_BAR_CONTENT_GAP = 20;

/**
 * Bottom padding for a tab screen's scroll content.
 *
 * @param bottomInset the safe-area bottom inset (the gesture bar). The tab bar
 *   is laid out above it, so both are needed. Web reports no inset and uses a
 *   fixed bar height, so it ignores the argument.
 */
export function tabBarContentInset(
  bottomInset: number,
  gap: number = TAB_BAR_CONTENT_GAP,
): number {
  if (Platform.OS === "web") return TAB_BAR_HEIGHT_WEB + gap;
  return TAB_BAR_HEIGHT + bottomInset + gap;
}
