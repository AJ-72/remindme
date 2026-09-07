# Design skins

Four candidate visual directions from the 2026-09-07 visual refresh, kept so a
future skin can be swapped in without redoing the exploration.

**Selected:** Ink & Coral.

Nothing here is imported by the app. `artifacts/mobile/constants/colors.ts`
remains the live source of truth; this directory is reference material.

## Contents

| File | What it is |
|---|---|
| `palettes.ts` | The four palettes as typed token sets, named to mirror `colors.ts`. The reusable part. |
| `ink-coral-{dark,light}.html` | **Selected.** Cool ink surfaces, coral accent. |
| `ink-sky-{dark,light}.html` | Same surfaces, light-blue accent — closest to today's indigo. |
| `emerald-brass-{dark,light}.html` | Deep emerald, antique brass accent. |
| `indigo-saffron-{dark,light}.html` | Midnight indigo, saffron accent, sage secondary, saffron day rail. |

Each `.html` is a standalone mockup of three screens side by side — Home,
Add Reminder, Settings — openable directly in a browser. They were authored as
Claude Design artboards, so each carries an `<x-dc>` wrapper and a
`<script src="./support.js">` line that does nothing outside that editor;
neither affects rendering in a browser.

The mockups are **static HTML, not React Native**. They are a visual target,
not code to lift — the real screens live in `artifacts/mobile/app/`.

## Colour roles

The whole set is built on one rule, and it is the part worth preserving even if
the palettes change:

| Role | Used for | Never used for |
|---|---|---|
| `accent` | Routine actions and "on" state: Save, active toggles, selected pills, AUTO flags, avatar initial | Anything conveying a problem |
| `destructive` | Errors and destructive intent: overdue reminders, delete confirmation, "Clear all" | Routine controls |
| `warning` | Advisory, non-error notices — the Android exact-alarm banner | Errors |

`warning` is amber, not red, on purpose. The exact-alarm banner *informs*; it
does not report a failure, and colouring it red makes a working app look
broken. This distinction already exists in `colors.ts` (`warning` vs
`destructive`) and the skins preserve it.

One caveat specific to the selected skin: in Ink & Coral the accent and the
destructive colour are the same hue family, so a Save button and an overdue row
share a colour. The overdue state leans on its dot and label wording to stay
distinguishable. The other three skins separate the two hues fully.

## Layout conventions these were designed with

Beyond colour, the refresh settled three things worth keeping:

- **The reminder list is de-boxed** — reminders sit on hairline separators, not
  one bordered card each. Settings deliberately *keeps* its grouped cards: that
  screen has seven sections and the containers carry the grouping.
- **Completed reminders read quieter, not faded** — muted text and a hollow
  check rather than blanket `opacity`, so they recede without looking disabled.
- **Light mode is never pure white** — cool pale grey for the Ink skins, warm
  ivory for Emerald, warm off-white for Indigo.

Type is unchanged across all four: Fraunces for greetings and reminder titles,
Inter for controls and metadata.

## Applying a skin

`palettes.ts` token names map onto `colors.ts` mostly one-to-one
(`background`, `card`, `border`, `foreground`, `mutedForeground`,
`destructive`, `destructiveBorder`, `warning`, `warningSurface`,
`warningSurfaceForeground`). Three differences to reconcile:

- `accent` here corresponds to `primary` in `colors.ts` (and
  `accentForeground` to `primaryForeground`). `colors.ts` has its own separate
  `accent` token, which is a lighter tint of primary — not the same thing.
- `cardRaised` and `subtleForeground` are new; `colors.ts` has no equivalent.
  Closest existing tokens are `muted` and a dimmer `mutedForeground`.
- `indigoSaffron.accentSecondary` (sage) exists only in that skin. Any
  component using it needs a fallback for the other three.

`colors.ts` requires `light` and `dark` to define **exactly** the same key set —
a missing key resolves to `undefined`, which React Native renders as no colour
at all, and only on dark-mode devices. `hooks/useColors.test.ts` enforces this,
so run it after any palette change.
