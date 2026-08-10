const colors = {
  light: {
    text: "#1a1a2e",
    tint: "#6366f1",

    background: "#F7F7F8",
    foreground: "#1a1a2e",

    card: "#ffffff",
    cardForeground: "#1a1a2e",

    primary: "#6366f1",
    primaryForeground: "#ffffff",

    secondary: "#ede9fe",
    secondaryForeground: "#4338ca",

    muted: "#F0F0F2",
    mutedForeground: "#7c7c9d",

    accent: "#818cf8",
    accentForeground: "#ffffff",

    destructive: "#ef4444",
    destructiveForeground: "#ffffff",
    // Softened destructive, used for the overdue card border so an overdue
    // reminder reads as urgent without shouting.
    destructiveBorder: "#fca5a5",

    border: "#E4E4E7",
    input: "#E4E4E7",

    success: "#10b981",
    successForeground: "#ffffff",

    warning: "#f59e0b",
    warningForeground: "#ffffff",
    // Warning *surface* pair, for the exact-alarm banner: a tinted background
    // with readable text on it. Distinct from warning/warningForeground,
    // which are for a solid warning-coloured control.
    warningSurface: "#fffbeb",
    warningSurfaceForeground: "#92400e",
  },
  // Dark palette. Must define EXACTLY the same token names as `light` — a
  // missing key resolves to `undefined`, which React Native renders as no
  // colour at all (typically black on black), and only on dark-mode devices.
  // `hooks/useColors.test.ts` enforces that parity.
  //
  // Derived from the light tokens rather than inverted: the indigo brand hue
  // is kept but lightened, because #6366f1 on a near-black ground is too low
  // in contrast to read. Surfaces step up in lightness with elevation
  // (background < card < muted), which is how depth reads in dark mode —
  // shadows are invisible against a dark ground.
  dark: {
    text: "#e8e8f0",
    tint: "#818cf8",

    background: "#121218",
    foreground: "#e8e8f0",

    card: "#1c1c25",
    cardForeground: "#e8e8f0",

    primary: "#818cf8",
    primaryForeground: "#12121a",

    secondary: "#2a2a3d",
    secondaryForeground: "#c7d2fe",

    muted: "#25252f",
    mutedForeground: "#9a9ab0",

    accent: "#a5b4fc",
    accentForeground: "#12121a",

    destructive: "#f87171",
    destructiveForeground: "#12121a",
    destructiveBorder: "#7f1d1d",

    border: "#2e2e3a",
    input: "#2e2e3a",

    success: "#34d399",
    successForeground: "#12121a",

    warning: "#fbbf24",
    warningForeground: "#12121a",
    warningSurface: "#2e2410",
    warningSurfaceForeground: "#fcd34d",
  },
  radius: 14,
  radiusCard: 20,
  radiusCapsule: 20,
  radiusFull: 999,
};

export default colors;
