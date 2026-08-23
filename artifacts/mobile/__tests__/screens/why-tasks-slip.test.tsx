import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import WhyTasksSlipScreen from "@/app/why-tasks-slip";
import { ARTICLE_BODY, REFERENCES, SLIP_CARDS } from "@/constants/whyTasksSlip";

jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <WhyTasksSlipScreen />
    </SafeAreaProvider>
  );
}

describe("WhyTasksSlipScreen", () => {
  it("shows all four mechanism cards", async () => {
    const { findByText } = renderScreen();
    expect(SLIP_CARDS).toHaveLength(4);
    for (const card of SLIP_CARDS) {
      expect(await findByText(card.title)).toBeTruthy();
    }
  });

  it("keeps the full article collapsed until asked for", async () => {
    const { queryByTestId, findByTestId } = renderScreen();
    expect(queryByTestId("full-article")).toBeNull();

    fireEvent.press(await findByTestId("read-more"));
    expect(await findByTestId("full-article")).toBeTruthy();
  });

  it("shows the citations once expanded", async () => {
    const { findByTestId, findByText } = renderScreen();
    fireEvent.press(await findByTestId("read-more"));
    for (const ref of REFERENCES) {
      expect(await findByText(ref.citation)).toBeTruthy();
    }
  });
});

// The copy rule for this whole feature: describe the mechanism, never
// diagnose the reader. A sentence readable as an accusation fails.
describe("Why tasks slip — copy discipline", () => {
  it("never addresses the reader as the problem", () => {
    for (const card of SLIP_CARDS) {
      const text = `${card.title} ${card.body}`.toLowerCase();
      expect(text).not.toMatch(/\byou are\b|\byou're\b|\blazy\b|\bfailed\b/);
    }
  });

  // This screen is editorial content, not the deferred statistics screen. A
  // number here would be user data, which is exactly what it must not carry.
  it("states no figure that could read as a score", () => {
    const all = [
      ...SLIP_CARDS.map((c) => `${c.title} ${c.body} ${c.action}`),
      ...ARTICLE_BODY,
    ].join(" ");
    expect(all).not.toMatch(/\d+\s?%/);
  });

  // Every citation is paired with the claim it supports, so a later copy
  // change cannot quietly leave a source attached to a claim it never made.
  it("pairs every reference with a specific claim", () => {
    expect(REFERENCES.length).toBeGreaterThan(0);
    for (const ref of REFERENCES) {
      expect(ref.claim.trim().length).toBeGreaterThan(0);
      // Author, year in parens, and a venue - a bare title is not a citation.
      expect(ref.citation).toMatch(/\(\d{4}\)/);
    }
  });
});
