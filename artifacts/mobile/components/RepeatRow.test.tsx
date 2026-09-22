import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import RepeatRow from "@/components/RepeatRow";
import type { RecurrenceRule } from "@/utils/recurrence";

const THURSDAY = new Date(2026, 8, 17);
const rowStyle = { flexDirection: "row" as const };
const rowLastStyle = { flexDirection: "row" as const, borderBottomWidth: 0 };

describe("RepeatRow", () => {
  it("shows 'Doesn't repeat' with the tap-to-set badge when no rule is set", () => {
    const { getByText } = render(
      <RepeatRow
        value={undefined}
        anchorDate={THURSDAY}
        onChange={jest.fn()}
        wasParsed={false}
        previewRowStyle={rowStyle}
        previewRowLastStyle={rowLastStyle}
      />
    );
    expect(getByText("Doesn't repeat")).toBeTruthy();
    expect(getByText("tap to set")).toBeTruthy();
  });

  it("shows the describeRecurrence label and the auto badge when parsed", () => {
    const rule: RecurrenceRule = { freq: "daily", interval: 1 };
    const { getByText } = render(
      <RepeatRow
        value={rule}
        anchorDate={THURSDAY}
        onChange={jest.fn()}
        wasParsed
        previewRowStyle={rowStyle}
        previewRowLastStyle={rowLastStyle}
      />
    );
    expect(getByText("Daily")).toBeTruthy();
    expect(getByText("auto")).toBeTruthy();
  });

  it("shows tap-to-set badge for a manually-set rule, not auto", () => {
    const rule: RecurrenceRule = { freq: "daily", interval: 1 };
    const { getByText, queryByText } = render(
      <RepeatRow
        value={rule}
        anchorDate={THURSDAY}
        onChange={jest.fn()}
        wasParsed={false}
        previewRowStyle={rowStyle}
        previewRowLastStyle={rowLastStyle}
      />
    );
    expect(getByText("tap to set")).toBeTruthy();
    expect(queryByText("auto")).toBeNull();
  });

  it("expands the picker inline on tap, matching the screen's inline-picker idiom", () => {
    const { getByTestId, queryByTestId } = render(
      <RepeatRow
        value={undefined}
        anchorDate={THURSDAY}
        onChange={jest.fn()}
        wasParsed={false}
        previewRowStyle={rowStyle}
        previewRowLastStyle={rowLastStyle}
      />
    );
    expect(queryByTestId("repeat-option-daily")).toBeNull();
    fireEvent.press(getByTestId("repeat-row"));
    expect(getByTestId("repeat-option-daily")).toBeTruthy();
  });

  it("collapses the picker on a second tap", () => {
    const { getByTestId, queryByTestId } = render(
      <RepeatRow
        value={undefined}
        anchorDate={THURSDAY}
        onChange={jest.fn()}
        wasParsed={false}
        previewRowStyle={rowStyle}
        previewRowLastStyle={rowLastStyle}
      />
    );
    fireEvent.press(getByTestId("repeat-row"));
    fireEvent.press(getByTestId("repeat-row"));
    expect(queryByTestId("repeat-option-daily")).toBeNull();
  });

  it("forwards a selection from the embedded picker to onChange", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <RepeatRow
        value={undefined}
        anchorDate={THURSDAY}
        onChange={onChange}
        wasParsed={false}
        previewRowStyle={rowStyle}
        previewRowLastStyle={rowLastStyle}
      />
    );
    fireEvent.press(getByTestId("repeat-row"));
    fireEvent.press(getByTestId("repeat-option-daily"));
    expect(onChange).toHaveBeenCalledWith({ freq: "daily", interval: 1 });
  });
});
