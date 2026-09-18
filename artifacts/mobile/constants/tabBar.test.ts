import {
  TAB_BAR_CONTENT_GAP,
  TAB_BAR_HEIGHT,
  TAB_BAR_HEIGHT_WEB,
  tabBarContentInset,
} from "./tabBar";

describe("tabBarContentInset", () => {
  it("clears the tab bar as well as the gesture area", () => {
    expect(tabBarContentInset(24)).toBe(TAB_BAR_HEIGHT + 24 + TAB_BAR_CONTENT_GAP);
  });

  it("clears the tab bar on a device with no gesture area", () => {
    expect(tabBarContentInset(0)).toBe(TAB_BAR_HEIGHT + TAB_BAR_CONTENT_GAP);
  });

  it("takes a caller's own gap", () => {
    expect(tabBarContentInset(0, 24)).toBe(TAB_BAR_HEIGHT + 24);
  });

  it("is always taller than the bar it has to clear", () => {
    expect(tabBarContentInset(0, 0)).toBeGreaterThanOrEqual(TAB_BAR_HEIGHT);
    expect(TAB_BAR_HEIGHT_WEB).toBeGreaterThan(TAB_BAR_HEIGHT);
  });
});
