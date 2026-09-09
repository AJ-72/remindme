/**
 * Ink & Coral — the design-refresh palette (see `design/skins/` for the four
 * candidate skins this was chosen from, and its README for the colour-role
 * rules and the token mapping).
 *
 * Colour roles, and the reason they are kept separate:
 *   primary     — routine actions and "on" state: Save, active toggles,
 *                 selected pills, parsed-value highlights, the avatar initial.
 *   destructive — errors and destructive intent ONLY: overdue reminders,
 *                 delete confirmation, "Clear all".
 *   warning     — advisory, non-error notices (the Android exact-alarm
 *                 banner). Deliberately amber, NOT red: it informs, it does
 *                 not report a failure, and red would make a working app look
 *                 broken.
 *
 * Note for this skin specifically: `primary` and `destructive` sit in the same
 * hue family, so a Save button and an overdue row share a colour. That is a
 * deliberate character choice — the overdue state leans on its own icon and
 * label wording to stay distinguishable. The `ink-sky` skin in `design/skins/`
 * splits the two hues fully if that ever reads badly on device.
 */
const colors = {
  light: {
    text: "#131A28",
    tint: "#E85C3C",

    // Cool pale grey, deliberately not pure white — the refresh's light mode
    // is meant to sit slightly back from the raised card surfaces.
    background: "#EDEFF3",
    foreground: "#131A28",

    card: "#FBFCFD",
    cardForeground: "#131A28",

    primary: "#E85C3C",
    primaryForeground: "#FFFFFF",

    secondary: "#FDEAE5",
    secondaryForeground: "#B8431F",

    muted: "#E4E8EF",
    mutedForeground: "#67728A",

    accent: "#F08768",
    accentForeground: "#FFFFFF",

    destructive: "#D64E2E",
    destructiveForeground: "#FFFFFF",
    // Softened destructive, used for the overdue card border so an overdue
    // reminder reads as urgent without shouting.
    destructiveBorder: "#F2C0B4",

    border: "#E3E6EC",
    input: "#E3E6EC",

    success: "#0D9488",
    successForeground: "#FFFFFF",

    warning: "#F59E0B",
    warningForeground: "#FFFFFF",
    // Warning *surface* pair, for the exact-alarm banner: a tinted background
    // with readable text on it. Distinct from warning/warningForeground,
    // which are for a solid warning-coloured control. Amber, not red — see
    // the colour-role note above.
    warningSurface: "#FFFBEB",
    warningSurfaceForeground: "#92400E",
  },
  // Dark palette. Must define EXACTLY the same token names as `light` — a
  // missing key resolves to `undefined`, which React Native renders as no
  // colour at all (typically black on black), and only on dark-mode devices.
  // `hooks/useColors.test.ts` enforces that parity.
  //
  // Derived from the light tokens rather than inverted: the coral accent is
  // lightened (#E85C3C -> #F4775A) because the light-mode coral is too dark to
  // read on a near-black ground. Surfaces step up in lightness with elevation
  // (background < card < muted), which is how depth reads in dark mode —
  // shadows are invisible against a dark ground.
  dark: {
    text: "#F4F1EA",
    tint: "#F4775A",

    background: "#0E131E",
    foreground: "#F4F1EA",

    card: "#1A2232",
    cardForeground: "#F4F1EA",

    primary: "#F4775A",
    primaryForeground: "#141A26",

    secondary: "#3A2620",
    secondaryForeground: "#FBC0AE",

    muted: "#252E40",
    mutedForeground: "#98A2B3",

    accent: "#F79B84",
    accentForeground: "#141A26",

    destructive: "#F4775A",
    destructiveForeground: "#141A26",
    destructiveBorder: "#7A3B39",

    border: "#283245",
    input: "#283245",

    success: "#2DD4BF",
    successForeground: "#062A26",

    warning: "#FBBF24",
    warningForeground: "#141A26",
    warningSurface: "#2E2410",
    warningSurfaceForeground: "#FCD34D",
  },
  radius: 14,
  radiusCard: 20,
  radiusCapsule: 20,
  radiusFull: 999,
};

export default colors;
