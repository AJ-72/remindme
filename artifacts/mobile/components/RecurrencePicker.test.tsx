import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import RecurrencePicker from "@/components/RecurrencePicker";
import type { RecurrenceRule } from "@/utils/recurrence";

// A Thursday, so the weekly preset label is deterministic across machines.
const THURSDAY = new Date(2026, 8, 17); // Sep 17 2026 is a Thursday

describe("RecurrencePicker", () => {
  it("renders 'Doesn't repeat' as selected when value is undefined", () => {
    const { getByTestId } = render(
      <RecurrencePicker value={undefined} anchorDate={THURSDAY} onChange={jest.fn()} />
    );
    expect(getByTestId("repeat-option-none").props.accessibilityState.selected).toBe(true);
  });

  it("generates preset labels from the anchor date, not hardcoded", () => {
    const { getByText } = render(
      <RecurrencePicker value={undefined} anchorDate={THURSDAY} onChange={jest.fn()} />
    );
    expect(getByText("Daily")).toBeTruthy();
    expect(getByText("Weekly on Thu")).toBeTruthy();
    expect(getByText("Monthly on the 17th")).toBeTruthy();
    expect(getByText("Yearly on 17 Sep")).toBeTruthy();
  });

  it("calls onChange with the daily preset rule", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <RecurrencePicker value={undefined} anchorDate={THURSDAY} onChange={onChange} />
    );
    fireEvent.press(getByTestId("repeat-option-daily"));
    expect(onChange).toHaveBeenCalledWith({ freq: "daily", interval: 1 });
  });

  it("calls onChange with the weekly preset rule pinned to the anchor's weekday", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <RecurrencePicker value={undefined} anchorDate={THURSDAY} onChange={onChange} />
    );
    fireEvent.press(getByTestId("repeat-option-weekly"));
    expect(onChange).toHaveBeenCalledWith({ freq: "weekly", interval: 1, byWeekday: [4] });
  });

  it("marks the currently-selected preset", () => {
    const rule: RecurrenceRule = { freq: "monthly", interval: 1 };
    const { getByTestId } = render(
      <RecurrencePicker value={rule} anchorDate={THURSDAY} onChange={jest.fn()} />
    );
    expect(getByTestId("repeat-option-monthly").props.accessibilityState.selected).toBe(true);
    expect(getByTestId("repeat-option-none").props.accessibilityState.selected).toBe(false);
  });

  it("clears back to 'Doesn't repeat' with undefined", () => {
    const onChange = jest.fn();
    const rule: RecurrenceRule = { freq: "daily", interval: 1 };
    const { getByTestId } = render(
      <RecurrencePicker value={rule} anchorDate={THURSDAY} onChange={onChange} />
    );
    fireEvent.press(getByTestId("repeat-option-none"));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("entering custom mode with no existing rule starts a sensible default", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <RecurrencePicker value={undefined} anchorDate={THURSDAY} onChange={onChange} />
    );
    fireEvent.press(getByTestId("repeat-option-custom"));
    expect(onChange).toHaveBeenCalledWith({ freq: "daily", interval: 2 });
  });

  it("custom interval stepper increments and decrements", () => {
    const onChange = jest.fn();
    const rule: RecurrenceRule = { freq: "daily", interval: 3 };
    const { getByTestId, rerender } = render(
      <RecurrencePicker value={rule} anchorDate={THURSDAY} onChange={onChange} />
    );
    fireEvent.press(getByTestId("repeat-option-custom"));
    fireEvent.press(getByTestId("repeat-interval-plus"));
    expect(onChange).toHaveBeenCalledWith({ freq: "daily", interval: 4 });

    rerender(
      <RecurrencePicker value={rule} anchorDate={THURSDAY} onChange={onChange} />
    );
    fireEvent.press(getByTestId("repeat-option-custom"));
    fireEvent.press(getByTestId("repeat-interval-minus"));
    expect(onChange).toHaveBeenCalledWith({ freq: "daily", interval: 2 });
  });

  it("custom interval stepper never goes below 1", () => {
    const onChange = jest.fn();
    const rule: RecurrenceRule = { freq: "daily", interval: 1 };
    const { getByTestId } = render(
      <RecurrencePicker value={rule} anchorDate={THURSDAY} onChange={onChange} />
    );
    fireEvent.press(getByTestId("repeat-option-custom"));
    fireEvent.press(getByTestId("repeat-interval-minus"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("switching the custom unit changes freq and keeps the interval", () => {
    const onChange = jest.fn();
    const rule: RecurrenceRule = { freq: "daily", interval: 3 };
    const { getByTestId } = render(
      <RecurrencePicker value={rule} anchorDate={THURSDAY} onChange={onChange} />
    );
    fireEvent.press(getByTestId("repeat-option-custom"));
    fireEvent.press(getByTestId("repeat-unit-weeks"));
    expect(onChange).toHaveBeenCalledWith({ freq: "weekly", interval: 3, byWeekday: [] });
  });

  it("shows the weekday strip only for a custom weekly rule", () => {
    const weeklyRule: RecurrenceRule = { freq: "weekly", interval: 2, byWeekday: [] };
    const { getByTestId, queryByTestId } = render(
      <RecurrencePicker value={weeklyRule} anchorDate={THURSDAY} onChange={jest.fn()} />
    );
    fireEvent.press(getByTestId("repeat-option-custom"));
    expect(getByTestId("repeat-weekday-0")).toBeTruthy();
    expect(getByTestId("repeat-weekday-6")).toBeTruthy();

    const dailyRule: RecurrenceRule = { freq: "daily", interval: 2 };
    const { getByTestId: getByTestId2, queryByTestId: queryByTestId2 } = render(
      <RecurrencePicker value={dailyRule} anchorDate={THURSDAY} onChange={jest.fn()} />
    );
    fireEvent.press(getByTestId2("repeat-option-custom"));
    expect(queryByTestId2("repeat-weekday-0")).toBeNull();
  });

  it("toggling a weekday adds it to byWeekday", () => {
    const onChange = jest.fn();
    const rule: RecurrenceRule = { freq: "weekly", interval: 1, byWeekday: [1] };
    const { getByTestId } = render(
      <RecurrencePicker value={rule} anchorDate={THURSDAY} onChange={onChange} />
    );
    fireEvent.press(getByTestId("repeat-option-custom"));
    fireEvent.press(getByTestId("repeat-weekday-4"));
    expect(onChange).toHaveBeenCalledWith({ freq: "weekly", interval: 1, byWeekday: [1, 4] });
  });

  it("toggling a selected weekday removes it from byWeekday", () => {
    const onChange = jest.fn();
    const rule: RecurrenceRule = { freq: "weekly", interval: 1, byWeekday: [1, 4] };
    const { getByTestId } = render(
      <RecurrencePicker value={rule} anchorDate={THURSDAY} onChange={onChange} />
    );
    fireEvent.press(getByTestId("repeat-option-custom"));
    fireEvent.press(getByTestId("repeat-weekday-1"));
    expect(onChange).toHaveBeenCalledWith({ freq: "weekly", interval: 1, byWeekday: [4] });
  });

  it("multi-weekday selection: selecting Mon, Wed, Fri in sequence", () => {
    const onChange = jest.fn();
    let rule: RecurrenceRule = { freq: "weekly", interval: 1, byWeekday: [] };
    const { getByTestId, rerender } = render(
      <RecurrencePicker value={rule} anchorDate={THURSDAY} onChange={onChange} />
    );
    fireEvent.press(getByTestId("repeat-option-custom"));

    fireEvent.press(getByTestId("repeat-weekday-1"));
    expect(onChange).toHaveBeenLastCalledWith({ freq: "weekly", interval: 1, byWeekday: [1] });
    rule = { freq: "weekly", interval: 1, byWeekday: [1] };
    rerender(<RecurrencePicker value={rule} anchorDate={THURSDAY} onChange={onChange} />);
    fireEvent.press(getByTestId("repeat-option-custom"));

    fireEvent.press(getByTestId("repeat-weekday-3"));
    expect(onChange).toHaveBeenLastCalledWith({ freq: "weekly", interval: 1, byWeekday: [1, 3] });
    rule = { freq: "weekly", interval: 1, byWeekday: [1, 3] };
    rerender(<RecurrencePicker value={rule} anchorDate={THURSDAY} onChange={onChange} />);
    fireEvent.press(getByTestId("repeat-option-custom"));

    fireEvent.press(getByTestId("repeat-weekday-5"));
    expect(onChange).toHaveBeenLastCalledWith({ freq: "weekly", interval: 1, byWeekday: [1, 3, 5] });
  });

  it("a custom rule that happens to match a preset shape is not shown as that preset", () => {
    // interval-1 daily built via Custom mode is structurally identical to
    // the Daily preset rule, but the picker's own mode (not just the value)
    // decides which option is highlighted while Custom is open.
    const rule: RecurrenceRule = { freq: "daily", interval: 1 };
    const { getByTestId } = render(
      <RecurrencePicker value={rule} anchorDate={THURSDAY} onChange={jest.fn()} />
    );
    fireEvent.press(getByTestId("repeat-option-custom"));
    expect(getByTestId("repeat-option-custom").props.accessibilityState.selected).toBe(true);
    expect(getByTestId("repeat-option-daily").props.accessibilityState.selected).toBe(false);
  });
});
