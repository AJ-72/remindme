# 06 — Features and plans

**This page is a summary. It is not the source of truth.**

| Question | Authoritative file |
| --- | --- |
| What can the app do today, and how well is it proven? | [`docs/features.md`](../features.md) |
| What is still open? | [`backlog.md`](../../backlog.md) |
| What landed, and how do I announce it? | [`docs/shipped.md`](../shipped.md) |
| Why is a feature designed this way? | [`docs/roadmap.md`](../roadmap.md) |
| What is unproven on hardware? | [`device-tests/`](../../device-tests/) |

## Proof levels

Every capability carries a proof level. Read it before you claim anything
works.

| Level | Meaning |
| --- | --- |
| `device` | A human watched it work on real hardware. Logged in `device-tests/`. |
| `live` | Confirmed end to end against the deployed backend. |
| `jest` | Green in the suite. **Never run on a device.** Not evidence it works. |

Jest runs in jsdom. There is no viewport, no keyboard, no system chrome, no
notification tray, and no OEM power manager. Anything that fails as
"off-screen", "behind something", "never fired", or "wrong colour on a real
background" cannot be caught by the suite.

**Never mark an item `PASS` yourself.** A pass comes from a human who watched
it happen.

## Supported today — by area

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/06-features-1-dark.svg">
  <img alt="Supported today — by area — diagram" src="diagrams/06-features-1-light.svg">
</picture>

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
mindmap
  root((Reminders))
    Core
      Create · edit · delete
      Local notifications
      Alarm-style delivery
      Snooze from the tray
      Mark done from the tray
      Boot reschedule sweep
      JSON backup and restore
    Recurring
      daily · weekly · monthly · yearly
      Rule picker
      Rolls forward in place
      Next-3 preview
      English only
    Language
      English parsing
      Malayalam parsing
      Malayalam numerals
      Voice dictation both
      Per-string font
      Share sheet intake
      Text-selection menu
    Remind someone
      Tier 1 WhatsApp and SMS
      Tier 2 app to app
      Number registration
      Push naming the sender
      Accept or decline
      Blocking
    Insights
      Completion rate
      Best and worst hours
      Weekday load
      Typical slip
      Tasks that slip
      Quiet hours
    Platform
      Dark mode
      iOS 26 liquid glass tabs
      Analytics and crash reports
```

</details>

Full table with file paths and proof levels: [`docs/features.md`](../features.md).

## Deliberately absent

These are choices, not gaps.

- **No account for core reminders.** Tier 2 registration is optional and skippable.
- **No event log.** Statistics are derived from the reminder records.
- **No booking integration** (M7) and **no ride-request API** (M5). Deep links only.
- **No repeating OS trigger.** One-shot triggers only.

## Planned — the shape of the backlog

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/06-features-2-dark.svg">
  <img alt="Planned — the shape of the backlog — diagram" src="diagrams/06-features-2-light.svg">
</picture>

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
flowchart TB
    subgraph T0["Tier 0 — no prerequisites"]
        B21["B21 · decide on 3 unwired palettes"]
        B4["B4 · Manglish support"]
        B5["B5 · rename SNOOZE_ACTION_ID"]
        B6["B6 · image input"]
        B9["B9 · ambiguous phone lookup misses"]
        B18b["B18b · re-extract the dictation seam"]
        M9["M9 · smart re-nudge ladder"]
        M3["M3 · location reminders"]
        B1["B1 · calendar integration (scope only)"]
        B3["B3 · Drive backup (BLOCKED on D1)"]
    end

    subgraph T1["Tier 1 — needs a native build"]
        B7["B7 · ship audio-transcription fixes"]
        B8["B8 · Tier 1 device sign-off"]
        B24["B24 · Android home-screen widgets"]
    end

    subgraph T2["Tier 2 — builds on the live backend"]
        M7["M7 · group reminders with RSVP"]
        M6["M6 · remind a contact from free text"]
        M8["M8 · MCP server"]
        B16["B16 · auto-accept from trusted contacts"]
        MP["M-persona · onboarding (half-built branch)"]
    end

    T1 -.needs.-> NB["a native / EAS build"]
    T2 -.inherits.-> BE["Supabase remindme-tier2 (live)"]

    style B9 fill:#6b3d3d,color:#fff
    style B24 fill:#2d5f8a,color:#fff
```

</details>

Effort: S = hours. M = a day or more. L = needs its own spec, or touches
architecture, or needs a native build or backend.

Statuses in use: `OPEN`, `IN PROGRESS`, `BLOCKED`, `PARTIAL`, `DEFERRED`.

Read [`backlog.md`](../../backlog.md) for the notes on each item. They carry
the real reasoning, including the two items that are most likely to bite:

- **B9** — an ambiguous phone number silently misses. The user sees a bare
  "not reachable" badge, which looks the same as the recipient not having the
  app. Workaround: type the number with a leading `+` and country code.
- **B24** — widgets need native Android code. React Native cannot render a
  widget, and the widget process cannot read AsyncStorage.

## The work-tracking rule

Four files, one genre each. **Do not fold them together, and do not add a
fifth.**

When an item ships:
1. Delete its row from `backlog.md`.
2. Add an entry to `docs/shipped.md`, **in the same commit**.
3. Update `docs/features.md` if the app can now do something new.
4. Put any non-obvious lesson in `system_learnings.md`.

Do not leave `DONE` rows behind. Traceability lives in git
(`git log --grep B17`).

An entry in `docs/shipped.md` marked `jest only` is code-complete but
unproven. **Never announce it** until a device run logs a pass.
