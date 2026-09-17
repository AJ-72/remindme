import React from "react";
import { render, waitFor, act } from "@testing-library/react-native";
import { Text } from "react-native";

import TourOverlay, { normalizeRoute } from "./TourOverlay";
import { TourProvider, useTour, useTourTarget } from "@/contexts/TourContext";
import { FEATURE_TOUR_STEPS } from "@/constants/featureTour";

const mockPush = jest.fn();
let mockPathname = "/";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

// The overlay only draws a spotlight for a target it can measure. A plain
// View in jsdom measures as 0x0, so register a measurable stub instead.
function TourTarget({ id }: { id: string }) {
  const setRef = useTourTarget(id);
  return (
    <Text
      ref={((node: unknown) => {
        if (!node) return;
        (node as { measureInWindow: unknown }).measureInWindow = (
          cb: (x: number, y: number, w: number, h: number) => void,
        ) => cb(10, 20, 100, 40);
        setRef(node as never);
      }) as never}
    >
      target
    </Text>
  );
}

function Starter() {
  const { start } = useTour();
  React.useEffect(() => {
    start();
  }, [start]);
  return null;
}

function renderTour() {
  return render(
    <TourProvider>
      <Starter />
      <TourTarget id={FEATURE_TOUR_STEPS[0].targetId!} />
      <TourOverlay />
    </TourProvider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  mockPathname = "/";
});

describe("normalizeRoute", () => {
  it("strips group segments", () => {
    expect(normalizeRoute("/(tabs)")).toBe("/");
    expect(normalizeRoute("/(tabs)/settings")).toBe("/settings");
    expect(normalizeRoute("/")).toBe("/");
    expect(normalizeRoute("/settings")).toBe("/settings");
    expect(normalizeRoute("/add-reminder")).toBe("/add-reminder");
  });
});

describe("feature tour steps", () => {
  // The regression guard: a step whose route never equals any real pathname
  // makes the tour invisible AND bounces every navigation back to it.
  const REAL_PATHNAMES = ["/", "/settings"];

  it.each(FEATURE_TOUR_STEPS.map((s) => [s.id, s.route] as const))(
    "step %s declares a route that matches a real pathname",
    (_id, route) => {
      expect(REAL_PATHNAMES).toContain(normalizeRoute(route));
    },
  );
});

describe("TourOverlay navigation", () => {
  it("does not navigate when the pathname is the step route without its group", async () => {
    mockPathname = "/";
    renderTour();
    await waitFor(() => expect(mockPush).not.toHaveBeenCalled());
  });

  it("shows the coach mark on the home pathname instead of staying blank", async () => {
    mockPathname = "/";
    const { getByTestId } = renderTour();
    await waitFor(() => expect(getByTestId("tour-overlay")).toBeTruthy());
  });

  it("navigates back to the step route from another screen", async () => {
    mockPathname = "/add-reminder";
    renderTour();
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(FEATURE_TOUR_STEPS[0].route),
    );
  });
});
