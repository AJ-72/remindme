import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import PersonaComparisonSheet from "./PersonaComparisonSheet";
import { PersonaType } from "@/types/persona";

const initialMetrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderSheet(props: {
  visible: boolean;
  activePersona: PersonaType;
  onSelectPersona?: (p: PersonaType) => void;
  onClose: () => void;
}) {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <PersonaComparisonSheet {...props} />
    </SafeAreaProvider>
  );
}

describe("PersonaComparisonSheet", () => {
  const onSelectPersona = jest.fn();
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders all 4 persona profiles and marks the active one", () => {
    const { getByTestId, getByText } = renderSheet({
      visible: true,
      activePersona: "step_by_step_doer",
      onSelectPersona,
      onClose,
    });

    expect(getByText("Reminder Styles & Adaptations")).toBeTruthy();
    expect(getByTestId("persona-card-busy_juggler")).toBeTruthy();
    expect(getByTestId("persona-card-step_by_step_doer")).toBeTruthy();
    expect(getByTestId("persona-card-quick_finisher")).toBeTruthy();
    expect(getByTestId("persona-card-deep_focuser")).toBeTruthy();

    expect(getByText("Active")).toBeTruthy();
  });

  it("calls onSelectPersona when a different profile is tapped", () => {
    const { getByTestId } = renderSheet({
      visible: true,
      activePersona: "step_by_step_doer",
      onSelectPersona,
      onClose,
    });

    fireEvent.press(getByTestId("persona-card-quick_finisher"));
    expect(onSelectPersona).toHaveBeenCalledWith("quick_finisher");
  });

  it("calls onClose when close or done button is pressed", () => {
    const { getByTestId } = renderSheet({
      visible: true,
      activePersona: "step_by_step_doer",
      onSelectPersona,
      onClose,
    });

    fireEvent.press(getByTestId("persona-comparison-close"));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId("persona-comparison-done"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
