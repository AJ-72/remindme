import React from "react";
import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AboutScreen from "@/app/(tabs)/about";

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AboutScreen />
    </SafeAreaProvider>
  );
}

describe("AboutScreen", () => {
  it("shows the company name, tagline, and app version", () => {
    const { getByText } = renderScreen();
    expect(getByText("CuriousMind Labs")).toBeTruthy();
    expect(getByText("Be Curious")).toBeTruthy();
    expect(getByText("Version 1.0.0")).toBeTruthy();
  });
});
