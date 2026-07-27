import { MALAYALAM_RANGE } from "./parseNaturalLanguage";

export type FontWeight = "400Regular" | "500Medium" | "600SemiBold" | "700Bold";

const INTER_WEIGHTS: Record<FontWeight, string> = {
  "400Regular": "Inter_400Regular",
  "500Medium": "Inter_500Medium",
  "600SemiBold": "Inter_600SemiBold",
  "700Bold": "Inter_700Bold",
};

const NOTO_SANS_MALAYALAM_WEIGHTS: Record<FontWeight, string> = {
  "400Regular": "NotoSansMalayalam_400Regular",
  "500Medium": "NotoSansMalayalam_500Medium",
  "600SemiBold": "NotoSansMalayalam_600SemiBold",
  "700Bold": "NotoSansMalayalam_700Bold",
};

export function getFontFamily(text: string, weight: FontWeight): string {
  return (MALAYALAM_RANGE.test(text) ? NOTO_SANS_MALAYALAM_WEIGHTS : INTER_WEIGHTS)[weight];
}
