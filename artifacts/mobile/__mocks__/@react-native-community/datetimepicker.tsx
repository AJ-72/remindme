// Manual mock for @react-native-community/datetimepicker.
//
// No jest-expo default mock exists for this native module, and it was never
// exercised via a real onChange in any test in this repo - only via the
// sheet's own Confirm/Cancel buttons, which read component state directly
// and never touch the picker's own callback. That gap is how a real bug in
// QuickAddInput's Android date-then-time chaining logic shipped invisibly:
// see the B23 pill-editing RCA. Rendered as a Pressable with a fixed testID
// so a test can fire the exact event shape @react-native-community/
// datetimepicker's real onChange hands back ({ type, nativeEvent }, date).
import React from "react";
import { Pressable } from "react-native";

export type DateTimePickerEvent = { type: string; nativeEvent: object };

type Props = {
  value: Date;
  mode?: "date" | "time" | "datetime";
  onChange?: (event: DateTimePickerEvent, date?: Date) => void;
};

// Tests drive this mock by finding testID="mock-date-time-picker" and
// calling onPress with the Date they want the picker to report, e.g.:
//   fireEvent(await findByTestId("mock-date-time-picker"), "press", newDate)
function MockDateTimePicker({ value, onChange }: Props) {
  return (
    <Pressable
      testID="mock-date-time-picker"
      onPress={(pickedOrEvent?: unknown) => {
        const picked =
          pickedOrEvent instanceof Date ? pickedOrEvent : value;
        onChange?.({ type: "set", nativeEvent: {} }, picked);
      }}
    />
  );
}

export default MockDateTimePicker;
