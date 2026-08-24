import { StatusBar } from "expo-status-bar";
import React from "react";

import { useResolvedScheme } from "@/hooks/useColors";

/**
 * Status-bar icons matched to the app's own background.
 *
 * `<StatusBar style="auto" />` cannot do this: "auto" resolves from the DEVICE
 * colour scheme, while the app paints itself from the user's in-app Appearance
 * preference. Set the app to Light on a phone in dark mode and "auto" draws
 * light icons on a light background - an invisible clock and battery. Deciding
 * from the resolved app scheme keeps the two in agreement by construction.
 *
 * Must render INSIDE ThemeProvider, or the preference is invisible to it.
 */
export default function ThemedStatusBar() {
  const scheme = useResolvedScheme();
  // Dark app background needs light icons, and vice versa.
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}
