import colors from "@/constants/colors";

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The unchecked complete-circle used `border`, which sat at 1.24:1 on a dark
// card: the control was there, and nobody could see it. WCAG 1.4.11 asks 3:1
// of a control's boundary, 4.5:1 of text.
describe.each(["light", "dark"] as const)("%s palette contrast", (scheme) => {
  const p = colors[scheme];

  it("draws controls (check rings, outline buttons) at 3:1 on a card", () => {
    expect(contrast(p.control, p.card)).toBeGreaterThanOrEqual(3);
  });

  it("draws controls at 3:1 on the page background", () => {
    expect(contrast(p.control, p.background)).toBeGreaterThanOrEqual(3);
  });

  it("draws action-row icons at 4.5:1 on a card", () => {
    expect(contrast(p.icon, p.card)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps muted text readable at 4.5:1 on a card and on a muted fill", () => {
    expect(contrast(p.mutedForeground, p.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.mutedForeground, p.muted)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the primary fill's own label readable", () => {
    expect(contrast(p.primaryForeground, p.primary)).toBeGreaterThanOrEqual(3);
  });
});

describe("dark palette card edges", () => {
  it("separates a card from the page more than the old 1.2:1 border did", () => {
    expect(contrast(colors.dark.border, colors.dark.card)).toBeGreaterThanOrEqual(1.6);
  });

  it("gives the text field an edge that reads against the card", () => {
    expect(contrast(colors.dark.input, colors.dark.card)).toBeGreaterThanOrEqual(2);
  });
});
