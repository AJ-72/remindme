import React from "react";
import { Text } from "react-native";
import { render, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { TourProvider, useTour } from "@/contexts/TourContext";
import { FEATURE_TOUR_STEPS } from "@/constants/featureTour";
import { FEATURE_TOUR_KEY, hasSeenFeatureTour } from "@/services/ReminderService";

function Probe() {
  const { active, step, stepIndex, isLastStep, start, next, skip } = useTour();
  return (
    <>
      <Text testID="active">{String(active)}</Text>
      <Text testID="step-id">{step?.id ?? ""}</Text>
      <Text testID="step-index">{stepIndex}</Text>
      <Text testID="is-last">{String(isLastStep)}</Text>
      <Text testID="start" onPress={start}>
        start
      </Text>
      <Text testID="next" onPress={next}>
        next
      </Text>
      <Text testID="skip" onPress={skip}>
        skip
      </Text>
    </>
  );
}

function renderProbe() {
  return render(
    <TourProvider>
      <Probe />
    </TourProvider>,
  );
}

describe("TourContext", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("is inactive until start() is called", () => {
    const { getByTestId } = renderProbe();
    expect(getByTestId("active").props.children).toBe("false");
  });

  it("starts at the first step and advances through next()", () => {
    const { getByTestId } = renderProbe();
    act(() => fireEvent.press(getByTestId("start")));
    expect(getByTestId("active").props.children).toBe("true");
    expect(getByTestId("step-id").props.children).toBe(FEATURE_TOUR_STEPS[0].id);

    act(() => fireEvent.press(getByTestId("next")));
    expect(getByTestId("step-index").props.children).toBe(1);
    expect(getByTestId("step-id").props.children).toBe(FEATURE_TOUR_STEPS[1].id);
  });

  it("marks the tour seen and deactivates when next() is called past the last step", async () => {
    const { getByTestId } = renderProbe();
    act(() => fireEvent.press(getByTestId("start")));
    for (let i = 0; i < FEATURE_TOUR_STEPS.length; i++) {
      act(() => fireEvent.press(getByTestId("next")));
    }
    expect(getByTestId("active").props.children).toBe("false");
    expect(await hasSeenFeatureTour()).toBe(true);
  });

  it("skip() deactivates immediately and persists the seen flag", async () => {
    const { getByTestId } = renderProbe();
    act(() => fireEvent.press(getByTestId("start")));
    act(() => fireEvent.press(getByTestId("skip")));
    expect(getByTestId("active").props.children).toBe("false");
    expect(await AsyncStorage.getItem(FEATURE_TOUR_KEY)).not.toBeNull();
  });

  it("start() can replay the tour even after it was already seen", async () => {
    await AsyncStorage.setItem(FEATURE_TOUR_KEY, "1");
    const { getByTestId } = renderProbe();
    act(() => fireEvent.press(getByTestId("start")));
    expect(getByTestId("active").props.children).toBe("true");
    expect(getByTestId("step-index").props.children).toBe(0);
  });
});
