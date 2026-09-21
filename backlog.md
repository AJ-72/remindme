# Backlog

**Open work only.** Grouped by **dependency** first (independent items before
ones that build on something else), then by **effort** within a group
(cheapest first). Every item has a stable ID (`B#`/`M#`) — reference these in
commits, code comments and `device-tests/`, not the row position.

## Where things live

| Question | File |
| --- | --- |
| What's left to do? | **This file.** |
| What can the app do today? | [docs/features.md](docs/features.md) |
| What shipped, and how do I announce it? | [docs/shipped.md](docs/shipped.md) |
| Why is a feature designed this way? | [docs/roadmap.md](docs/roadmap.md) |
| Why did this bug happen? | [system_learnings.md](system_learnings.md) |
| What's unproven on hardware? | [device-tests/](device-tests/) |

**The rule that keeps this file short:** when an item ships, delete its row
here and add an entry to [docs/shipped.md](docs/shipped.md) **in the same
commit**. Traceability lives in git (`git log --grep B17`), not in a `DONE`
row. Any lesson worth keeping goes to `system_learnings.md`.

**Legacy numbers:** this file was renumbered on 2026-09-04 for scannability.
Old plain-numbered items (referenced from code comments, tests, and other
docs as "backlog item N") map to the new IDs in the **Legacy #** column below
— old references still resolve via that column, do not renumber again.

## Status legend

| Status | Meaning |
| --- | --- |
| `OPEN` | Not started. |
| `IN PROGRESS` | Partially built — see notes. |
| `BLOCKED` | Can't proceed until a dependency or decision lands. |
| `PARTIAL` | Core done, edge cases outstanding. |
| `DEFERRED` | Deliberately postponed, not forgotten. |

## Effort legend

| Effort | Meaning |
| --- | --- |
| S | Small — hours, single file/area, no new native module. |
| M | Medium — a day or more, several files, may need tests across layers. |
| L | Large — needs its own spec/plan, touches architecture, or needs a native build/backend. |

---

## Tier 0 — independent, no prerequisites

Ordered cheapest-first within the tier.

| # | Legacy # | Item | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| B1 | 3 | Calendar integration | S (scope only) | `OPEN` | "Integrate with calendars?" — still just a question. Needs scoping: read-events vs. create-reminder-from-event. Folds into [M5](docs/roadmap.md#m5-forward-to-remind) rather than standing alone. |
| B21 | — | Design skins: finish or delete the 3 unwired palettes | S | `OPEN` | Architecture review found `design/skins/palettes.ts` (repo root, not `artifacts/mobile`) and 6 static HTML mockups for 3 palettes (ink-sky, emerald-brass, indigo-saffron) that are never imported anywhere — only "Ink & Coral" is wired into `constants/colors.ts`. Not a deepening candidate as-is (no real seam exists to deepen — `useColors()` hardcodes one palette rather than being parameterized by a skin id); this is dead exploratory work, not friction in the shipped app. Deletion test passes in the useful direction: removing the 3 unused palettes/mockups today changes nothing at runtime. Needs a decision: delete them, or commit to building a skin-picker (which would need `constants/colors.ts` restructured into a `{skinId: {light, dark}}` map first). Not started. |
| B3 | 1 | Google Drive backup / migration | M (pending D1), else L | `BLOCKED` | Manual JSON export/import shipped 2026-08-10. **Check [device-tests/cross-cutting.md#d1](device-tests/cross-cutting.md#d1) first** — Android Auto Backup may already cover phone migration and make Drive sync unnecessary; that test is cheap and changes this item's scope entirely. |
| B4 | 17 | Manglish support (regional language typed in English) | M | `OPEN` | Support for reminders typed in English letters but Malayalam words/grammar. Not started; no research done yet. |
| B5 | 18 | Rename `SNOOZE_ACTION_ID` tech debt | M | `OPEN` | String is `"SNOOZE_10"` but snooze durations are now user-configurable (5/15/30/60 min/tomorrow) — misleading name, left as-is deliberately because it's embedded in the `categoryIdentifier` of notifications already scheduled on devices. Needs a migration story (e.g. register both old and new action IDs for one release, then drop the old one). |
| B6 | 2 | Image support in shared/dictated input | M | `OPEN` | Audio half done (mic + WhatsApp voice-note forwarding, Android only — see B7). Image support not started. Part of the [M5](docs/roadmap.md#m5-forward-to-remind) "forward-to-remind" area. |
| B24 | — | Full-screen-intent alarm notifications ("ring like a call") | M (native rebuild + manifest change) | `OPEN` | User asked if reminders could ring as an actual phone call — not feasible without Android telecom `ConnectionService` or a paid VoIP backend (out of scope, this app has no reminder-delivery backend). What's realistic: the `reminders-alarm` Android channel (`ReminderService.ts`'s `setupNotificationChannel()`) already has MAX importance, `bypassDnd: true`, a custom `alarm.wav` sound, and vibration — genuinely alarm-grade. The one missing piece for it to *look* like an incoming call (wake and take over a locked screen, not just a heads-up banner) is `fullScreenIntent` — zero references in the codebase today. Needs: `expo-notifications` full-screen-intent category/action, the `USE_FULL_SCREEN_INTENT` Android manifest permission, and a native rebuild to test (manifest change, not JS-only) — see CLAUDE.md's Android build notes for the CMake/JDK gotchas that rebuild will hit. |
| B9 | — | Recipient phone lookup silently misses on ambiguous numbers | M | `OPEN` | Found live-testing 2026-09-11 (two-device Tier 2 test — see `system_learnings.md`): a contact saved as local digits with no leading `+`, on a device whose system region doesn't match the number's real country, gets misnormalized to a different E.164/`phone_hash` than the same person's own registration — `normalizeForIdentity()` (`artifacts/mobile/utils/phoneNumber.ts`) currently just returns `ambiguous: true` and hopes both sides agree, with no repair. Symptom is a bare "not reachable" badge (no error, no hint) — indistinguishable from the recipient genuinely not having the app, which is the exact failure mode `recipientReachability.ts`'s own doc comment already calls out as the harmful one. Workaround today: type the number with an explicit leading `+` and full country code (bypasses region-guessing entirely, `normalizeForIdentity`'s `hasPlus` branch) — but this is a manual burden most contacts won't have, and most users won't think to do. **Fix should be in normalization, not in asking users to type numbers correctly**: on an ambiguous miss, retry against a small set of plausible alternate regions (e.g. the app's own configured default region if set, or a short fixed list of likely candidates) before giving up, rather than guessing once from device locale and stopping. Needs a design pass, not a one-line fix — touches `normalizeForIdentity`, the `lookup` Edge Function's hash matching (currently exact-match on one hash), and possibly storing more than one normalization candidate's hash per lookup call. |
| B18b | — | Re-extract QuickAddInput's mic/dictation seam | M | `OPEN` | The original B18 extraction was **reverted 2026-09-17** while merging `main` into PR #11 — `main` had since grown a much larger dictation surface in `QuickAddInput.tsx` (listening surface, `AppState` interruption handling, tour target, mic telemetry) that the extracted hook predated and did not cover, so keeping it would have deleted those features. `main`'s inline implementation was kept and `hooks/useSharedAwareDictation.ts` (plus its test) deleted. Re-extraction against the current surface is open. Recipient/invitation logic remains inline deliberately (low ongoing risk — self-contained, stable history, not a repeat bug source). |
| M9 | — | Smart re-nudge (re-alert ladder) | L | `OPEN` | Prerequisite (real `snoozeCount` data) is now met; ready to spec. See [roadmap.md#m9](docs/roadmap.md#m9-smart-re-nudge). |
| M3 | — | Location-based reminders | L | `OPEN` | See [roadmap.md#m3](docs/roadmap.md#m3-location-based-reminders). |

---

## Tier 1 — needs a native build (blocked only on that, otherwise ready)

| # | Legacy # | Item | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| B7 | 2 | Ship next native build with current audio-transcription fixes | S (build only) | `BLOCKED` | Voice-to-text via mic + WhatsApp-audio forwarding is code-complete (Android only). Needs a native/EAS build to reach devices — see CLAUDE.md's Android build instructions. |
| B8 | — | M4 Tier 1 device sign-off | S | `PARTIAL` | The **core loop passed on device 2026-08-30** — contact picked, message sent by WhatsApp and SMS. What remains is D9's edge-case list (App-Links install order, not-on-WhatsApp numbers, other OEM messaging apps, permission denied→re-granted, 1000+ contacts, cold-start tap), each worth its own run: [device-tests/feature-e2e.md#d9](device-tests/feature-e2e.md#d9). No longer blocks shipping Tier 1. |

---

## Tier 2 — builds on the deployed backend

The M4 Tier 2 backend is **live** (Supabase `remindme-tier2`) — see CLAUDE.md.
These items inherit it rather than paying for it.

| # | Legacy # | Item | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| B16 | — | Auto-accept from trusted contacts, with visibility into what was added | — | `DEFERRED` | Raised 2026-09-11, deliberately not scoped yet: depends on a not-yet-built "trusted contacts" / auto-accept setting (who counts as trusted, where it's configured, whether it's per-sender or global) that doesn't exist. Once that setting exists, the agreed notification behavior (approved 2026-09-11, to apply then) is: an auto-accepted reminder skips the accept/decline push entirely — it's silently added to the recipient's list (home screen sender chip already marks provenance) — but still fires a low-priority, non-actionable confirmation notification ("{name} added: {title}") so the recipient notices without having to act. Tapping that notification opens `reminder-detail.tsx` (view/edit/delete, since it's already on their list), never accept/decline. Do not build the notification behavior in isolation before the trusted-contacts setting itself is designed. |
| M7 | — | Group reminders with RSVP | L | `OPEN` (needs spec) | Shares M4 Tier 2's backend. See [roadmap.md#m7](docs/roadmap.md#m7-group-reminders-with-rsvp) — the strategic reframe of Tier 2's read from the 2026-08-09 adoption assessment. |
| M8 | — | MCP server for the app | L, or S for read-only variant | `DEFERRED` | See [roadmap.md#m8](docs/roadmap.md#m8-mcp-server) — a cheap read-only variant (query an exported backup JSON) exists and doesn't need the backend, but privacy trade-offs need a decision first. |
| B25 | — | Meta Muse connector | M (pending M8) | `BLOCKED` on M8 | Build a connector so Meta's Muse assistant can query/create reminders via this app's MCP server. Depends entirely on M8 above (no MCP server exists yet) — not scoped further until M8's privacy trade-offs are decided and a variant is built. Needs research once unblocked: what connector/plugin mechanism Muse actually exposes for third-party MCP servers (unconfirmed as of 2026-09-21). |
| M6 | — | Remind a contact from natural language | M | `DEFERRED` | Builds on M4 Tier 1's contact picker — resolves recipients from free text instead. See [roadmap.md#m6](docs/roadmap.md#m6-remind-a-contact-from-natural-language). |
| M-persona | 22 | Persona-based personalization onboarding | L | `DEFERRED` | ~half-built on unreviewed branch `feature/persona-onboarding` (tip `ae47295`), tagged `[NOT REVIEWED — do not ship as-is]`. Not merged, not in any build. Full status breakdown: [roadmap.md#persona](docs/roadmap.md#persona-based-personalization-onboarding). |

---

## Open device-test debt

Shipped code that is **not proven on hardware**. Full checklists live in
[device-tests/](device-tests/); this is the index of what's outstanding.

| Area | Checks | Note |
| --- | --- | --- |
| Recurring reminders | D85-D90 | Killed-app re-arm across occurrences, tray mark-done advancing the series, DST. |
| Dark mode | D8 | Needs a fresh walk — Smart Alerts, Why tasks slip, quiet-hours/name sheets shipped after the last pass. |
| Telemetry | D79-D81 | PostHog/Sentry never exercised on a device. |
| Malayalam parsing | D24, numeral/ambiguous sections | Parser green in Jest; device runs blocked on Metro connectivity at the time. |
| M4 Tier 1 edge cases | D9 | See B8. |

---

## Unscoped / needs a decision before it's an item

| Legacy # | Item | Notes |
| --- | --- | --- |
| 7 | Better app icon | "How to publish to Play Store for beta" (item 8) is related packaging work — bundle these when picked up. |
| 13 | Longer-text UX in reminder box + discoverability that time is auto-parsed | Needs a brainstorm — not yet scoped into a concrete change. |
| 14 | Stronger natural-language time parsing | Ongoing direction rather than a single item — most recent work under this heading is the Malayalam numeral/ambiguous-numeral work. Re-scope if picked up again as a distinct research task. |
