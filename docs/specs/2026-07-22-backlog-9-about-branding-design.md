# Backlog item 9 — About tab & CuriousMind Labs branding — design

## Problem

No screen in the app identifies who publishes it. Backlog item 9 asks for a
company-branding pass ("CuriousMind Labs") and a new About tab showing that
branding.

## Scope

- **New tab**: "About", third position in the tab bar (Home, Settings, About).
- **Not in scope**: renaming the app itself (it stays "Reminders" everywhere
  — home header, `app.json` `name`, splash screen), changing the app icon
  (tracked separately as backlog item 7), or changing the Android package id
  (`com.curios.remindme` — a breaking, post-launch change, out of scope here).

## Design

### New screen: `app/(tabs)/about.tsx`

Structural clone of `app/(tabs)/settings.tsx`'s pattern (`useColors()`,
`useSafeAreaInsets()`, same header treatment: `headerTitle` = "About").

Content, centered in the body below the header:
1. A placeholder circular icon badge (Feather `"compass"`, matching the
   empty state pattern already used in `app/(tabs)/index.tsx:95-103`) — not
   the real app icon, since no final company logo exists yet. (Distinct from
   the tab-bar icon below, which uses `"info"`/`"info.circle"` — the two are
   intentionally different glyphs for different UI locations.)
2. **"CuriousMind Labs"** — heading, `Inter_700Bold`.
3. **"Be Curious"** — tagline, muted-foreground, smaller text below the
   heading.
4. **"Version X.Y.Z"** — read via a direct `app.json` import (not
   `expo-constants`'s `Constants.expoConfig?.version`, which resolves to
   `undefined` under this project's Jest setup with no manifest available —
   confirmed by direct experiment during planning). Reflects `app.json`'s
   `expo.version` (currently `1.0.0`) — the user-facing version, not
   `package.json`'s internal `0.0.0`.

### Tab registration: `app/(tabs)/_layout.tsx`

Add an `about` entry to both existing tab-layout paths, third position:
- `NativeTabLayout` (iOS 26 liquid-glass path): `NativeTabs.Trigger
  name="about"` with `Icon sf={{ default: "info.circle", selected:
  "info.circle.fill" }}` and `Label>About`.
- `ClassicTabLayout` (older iOS / Android / web): `Tabs.Screen name="about"`
  with `title: "About"` and a `tabBarIcon` following the existing
  `SymbolView`/`Feather` split (`"info.circle"` SF Symbol on iOS, Feather
  `"info"` elsewhere).

### Testing

`__tests__/screens/about.test.tsx`, matching `settings.test.tsx`'s render
harness — asserts "CuriousMind Labs", "Be Curious", and a "Version …" string
all render.
