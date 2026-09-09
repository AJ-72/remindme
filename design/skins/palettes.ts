/**
 * Design-refresh skin palettes (2026-09-07).
 *
 * Four candidate skins from the visual refresh, kept so a future skin can be
 * swapped in without redoing the exploration. Each entry mirrors the token
 * names in `artifacts/mobile/constants/colors.ts` so a skin can be lifted into
 * that file directly — see `docs/design-skins.md` for the mapping and the
 * colour-role rules these were designed against.
 *
 * NOT imported by the app. `constants/colors.ts` remains the live source of
 * truth; this is a reference palette set.
 *
 * Colour roles (the rule the whole set is built on):
 *   accent      — routine actions and "on" state: Save, active toggles,
 *                 selected pills, AUTO flags, avatar initial.
 *   destructive — errors and destructive intent ONLY: overdue reminders,
 *                 delete confirmation, "Clear all". Never a routine control.
 *   warning     — advisory, non-error notices (the Android exact-alarm
 *                 banner). Deliberately amber, NOT red: it informs, it does
 *                 not report a failure. Keeping these distinct is why the
 *                 banner doesn't read as something being broken.
 */

export interface SkinSurface {
  background: string;
  card: string;
  cardRaised: string;
  border: string;
  divider: string;

  foreground: string;
  mutedForeground: string;
  subtleForeground: string;

  accent: string;
  accentForeground: string;

  destructive: string;
  destructiveBorder: string;

  warning: string;
  warningSurface: string;
  warningSurfaceForeground: string;
}

export interface Skin {
  name: string;
  description: string;
  light: SkinSurface;
  dark: SkinSurface;
}

/**
 * Ink & Coral — the selected direction.
 *
 * Cool ink surfaces with coral reserved entirely for attention. Unlike the
 * other three skins, the accent and the destructive colour are the SAME hue
 * family here: coral does double duty as the action colour and the alert
 * colour. That is deliberate for this skin's character, but it means an
 * overdue row and a Save button share a colour — the overdue state leans on
 * its dot plus label wording to separate them.
 */
export const inkCoral: Skin = {
  name: "Ink & Coral",
  description: "Cool ink surfaces, warm coral accent. The selected direction.",
  dark: {
    background: "#0E131E",
    card: "#1A2232",
    cardRaised: "#252E40",
    border: "#283245",
    divider: "#1E2637",

    foreground: "#F4F1EA",
    mutedForeground: "#98A2B3",
    subtleForeground: "#6B7689",

    accent: "#F4775A",
    accentForeground: "#141A26",

    destructive: "#F4775A",
    destructiveBorder: "#7A3B39",

    warning: "#FBBF24",
    warningSurface: "#2E2410",
    warningSurfaceForeground: "#FCD34D",
  },
  light: {
    background: "#EDEFF3",
    card: "#FBFCFD",
    cardRaised: "#E4E8EF",
    border: "#E3E6EC",
    divider: "#DFE3EA",

    foreground: "#131A28",
    mutedForeground: "#67728A",
    subtleForeground: "#8B95A8",

    accent: "#E85C3C",
    accentForeground: "#FFFFFF",

    destructive: "#D64E2E",
    destructiveBorder: "#F2C0B4",

    warning: "#F59E0B",
    warningSurface: "#FFFBEB",
    warningSurfaceForeground: "#92400E",
  },
};

/**
 * Ink & Sky — same ink surfaces, light-blue accent.
 * Closest in family to the app's current indigo (#6366f1), so it reads as a
 * refinement rather than a rebrand. Accent and destructive are fully separate.
 */
export const inkSky: Skin = {
  name: "Ink & Sky",
  description: "Ink surfaces with a light-blue accent; closest to today's indigo.",
  dark: {
    background: "#0E131E",
    card: "#1A2232",
    cardRaised: "#252E40",
    border: "#283245",
    divider: "#1E2637",

    foreground: "#F4F1EA",
    mutedForeground: "#98A2B3",
    subtleForeground: "#6B7689",

    accent: "#38BDF8",
    accentForeground: "#052A3D",

    destructive: "#F4775A",
    destructiveBorder: "#7A3B39",

    warning: "#FBBF24",
    warningSurface: "#2E2410",
    warningSurfaceForeground: "#FCD34D",
  },
  light: {
    background: "#EDEFF3",
    card: "#FBFCFD",
    cardRaised: "#E4E8EF",
    border: "#E3E6EC",
    divider: "#DFE3EA",

    foreground: "#131A28",
    mutedForeground: "#67728A",
    subtleForeground: "#8B95A8",

    accent: "#0284C7",
    accentForeground: "#FFFFFF",

    destructive: "#D64E2E",
    destructiveBorder: "#F2C0B4",

    warning: "#F59E0B",
    warningSurface: "#FFFBEB",
    warningSurfaceForeground: "#92400E",
  },
};

/**
 * Refined Emerald & Brass — deep emerald ground, antique brass accent.
 * The most distinctive of the four. Brass darkens to #A87C10 for text and
 * hairlines in light mode; the #D6A928 fill is reserved for solid controls.
 */
export const emeraldBrass: Skin = {
  name: "Emerald & Brass",
  description: "Deep emerald surfaces with an antique brass accent.",
  dark: {
    background: "#071E1A",
    card: "#0D2B26",
    cardRaised: "#17403A",
    border: "#17403A",
    divider: "#123029",

    foreground: "#F4F0E7",
    mutedForeground: "#8DA6A0",
    subtleForeground: "#5D7B75",

    accent: "#D6A928",
    accentForeground: "#071E1A",

    destructive: "#F0857A",
    destructiveBorder: "#6E3138",

    warning: "#FBBF24",
    warningSurface: "#2E2410",
    warningSurfaceForeground: "#FCD34D",
  },
  light: {
    background: "#F5F1E6",
    card: "#FFFDF7",
    cardRaised: "#EFE9D9",
    border: "#E9E2D0",
    divider: "#E2DBC8",

    foreground: "#0B2620",
    mutedForeground: "#6C837C",
    subtleForeground: "#8D9E97",

    accent: "#A87C10",
    accentForeground: "#2A1F00",

    destructive: "#C0392B",
    destructiveBorder: "#E8B4B8",

    warning: "#F59E0B",
    warningSurface: "#FFFBEB",
    warningSurfaceForeground: "#92400E",
  },
};

/**
 * Midnight Indigo & Saffron — indigo ground, saffron accent, sage secondary.
 * Carries a signature detail the others don't: a thin saffron "day rail"
 * beside the Today/Tomorrow group labels — solid for today, dimmed for later.
 * `accentSecondary` (sage) is unique to this skin and has no counterpart in
 * the other three, so a component using it must fall back when skins swap.
 */
export const indigoSaffron: Skin & {
  dark: SkinSurface & { accentSecondary: string };
  light: SkinSurface & { accentSecondary: string };
} = {
  name: "Indigo & Saffron",
  description: "Midnight indigo with a saffron accent and sage secondary.",
  dark: {
    background: "#111827",
    card: "#1C2638",
    cardRaised: "#28344B",
    border: "#2B3750",
    divider: "#1E293C",

    foreground: "#F8F5ED",
    mutedForeground: "#94A3B8",
    subtleForeground: "#697A96",

    accent: "#E6B84A",
    accentForeground: "#1A1405",
    accentSecondary: "#86AFA5",

    destructive: "#F0857A",
    destructiveBorder: "#6E3138",

    warning: "#FBBF24",
    warningSurface: "#2E2410",
    warningSurfaceForeground: "#FCD34D",
  },
  light: {
    background: "#F3F1EB",
    card: "#FCFBF7",
    cardRaised: "#E8E5DB",
    border: "#E7E4DA",
    divider: "#E2DFD5",

    foreground: "#141C2E",
    mutedForeground: "#5F6C82",
    subtleForeground: "#8A94A6",

    accent: "#96700B",
    accentForeground: "#3A2C05",
    accentSecondary: "#4F7A70",

    destructive: "#C0392B",
    destructiveBorder: "#E8B4B8",

    warning: "#F59E0B",
    warningSurface: "#FFFBEB",
    warningSurfaceForeground: "#92400E",
  },
};

export const skins = {
  inkCoral,
  inkSky,
  emeraldBrass,
  indigoSaffron,
} as const;

export type SkinName = keyof typeof skins;

/** The direction selected on 2026-09-07. */
export const SELECTED_SKIN: SkinName = "inkCoral";
