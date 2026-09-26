import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

type DeliveryHealthNativeModule = {
  isIgnoringBatteryOptimizations: () => boolean | null;
  openBatteryOptimizationSettings: () => boolean;
};

// Absent on iOS, on the web, in Expo Go and under Jest, so every call site
// must tolerate `null` (reported as "unknown", never as "ok").
const nativeModule =
  Platform.OS === "android"
    ? requireOptionalNativeModule<DeliveryHealthNativeModule>("DeliveryHealth")
    : null;

export function isIgnoringBatteryOptimizations(): boolean | null {
  try {
    return nativeModule?.isIgnoringBatteryOptimizations() ?? null;
  } catch {
    return null;
  }
}

/** Returns false when the settings screen could not be opened. */
export function openBatteryOptimizationSettings(): boolean {
  try {
    return nativeModule?.openBatteryOptimizationSettings() ?? false;
  } catch {
    return false;
  }
}
