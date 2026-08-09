import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import SnoozeSheet from "@/components/SnoozeSheet";

describe("SnoozeSheet", () => {
  it("renders all five presets", () => {
    const { getByText } = render(
      <SnoozeSheet
        visible
        current={{ kind: "minutes", minutes: 15 }}
        onSelect={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(getByText("5 minutes")).toBeTruthy();
    expect(getByText("15 minutes")).toBeTruthy();
    expect(getByText("30 minutes")).toBeTruthy();
    expect(getByText("1 hour")).toBeTruthy();
    expect(getByText("Tomorrow, same time")).toBeTruthy();
  });

  it("marks the current preset as selected for accessibility", () => {
    const { getByTestId } = render(
      <SnoozeSheet
        visible
        current={{ kind: "minutes", minutes: 30 }}
        onSelect={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(getByTestId("snooze-option-30").props.accessibilityState.selected).toBe(true);
    expect(getByTestId("snooze-option-15").props.accessibilityState.selected).toBe(false);
  });

  it("marks the tomorrow option as selected when it is current", () => {
    const { getByTestId } = render(
      <SnoozeSheet
        visible
        current={{ kind: "tomorrow" }}
        onSelect={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(getByTestId("snooze-option-tomorrow").props.accessibilityState.selected).toBe(
      true
    );
    expect(getByTestId("snooze-option-15").props.accessibilityState.selected).toBe(false);
  });

  it("calls onSelect with the chosen preset", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <SnoozeSheet
        visible
        current={{ kind: "minutes", minutes: 15 }}
        onSelect={onSelect}
        onCancel={jest.fn()}
      />
    );
    fireEvent.press(getByTestId("snooze-option-60"));
    expect(onSelect).toHaveBeenCalledWith({ kind: "minutes", minutes: 60 });
  });

  it("calls onSelect with the tomorrow preset", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <SnoozeSheet
        visible
        current={{ kind: "minutes", minutes: 15 }}
        onSelect={onSelect}
        onCancel={jest.fn()}
      />
    );
    fireEvent.press(getByTestId("snooze-option-tomorrow"));
    expect(onSelect).toHaveBeenCalledWith({ kind: "tomorrow" });
  });

  it("calls onCancel from the cancel button", () => {
    const onCancel = jest.fn();
    const { getByTestId } = render(
      <SnoozeSheet
        visible
        current={{ kind: "minutes", minutes: 15 }}
        onSelect={jest.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.press(getByTestId("snooze-sheet-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });
});
