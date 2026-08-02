# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Reminders** — a mobile app (React Native/Expo) for scheduling reminders with local notifications. Reminders are stored locally on-device via AsyncStorage; the API server exists but the mobile app does not yet use it. Supports voice dictation (English/Malayalam, user-selectable in Settings) and Malayalam-script text input/rendering throughout.

## Run & Operate

```bash
# Full typecheck across all packages (run this before committing)
pnpm run typecheck

# Typecheck only the lib/ packages (faster, for lib changes)
pnpm run typecheck:libs

# Build all packages (typecheck + build)
pnpm run build

# API server dev (port 5000)
pnpm --filter @workspace/api-server run dev

# Regenerate React Query hooks + Zod schemas from openapi.yaml
pnpm --filter @workspace/api-spec run codegen

# Push DB schema to dev database (requires DATABASE_URL env var)
pnpm --filter @workspace/db run push
```

Mobile dev runs via Expo on Replit with specific env vars (`REPLIT_EXPO_DEV_DOMAIN`, `REPL_ID`, etc.) — local dev of the mobile app requires those to be set.

Android builds use EAS: `pnpm --filter @workspace/mobile run build:android` (preview), `build:android:prod` (production), `build:android:dev` (dev client).

**Deploying from a local machine (not Replit):** `EXPO_TOKEN` used to come from a Replit Secret and isn't present outside Replit. Get a token from expo.dev → your account → Settings → Access Tokens, then:
```bash
export EXPO_TOKEN=<your-token>
cd artifacts/mobile && npx eas-cli build --platform android --profile preview --non-interactive
```
`export` only lasts for the current shell session — add it to `~/.zshrc` (or your shell's profile) if you want it to persist across sessions. `npx eas-cli` works without installing it as a project dependency. Note: building via expo.dev's GitHub integration (rather than the CLI) doesn't work out of the box here — see the "Gotchas" section below.

**CI pipeline:** `.github/workflows/eas-build.yml` is manually triggered (`workflow_dispatch`) — pick platform/profile in the Actions UI. It runs `pnpm --filter @workspace/mobile run typecheck` and `run test` first, then calls `eas build` only if both pass. Requires an `EXPO_TOKEN` repo secret (same token as local builds, see above).

Required env: `DATABASE_URL` — Postgres connection string (for api-server and db push).

## Architecture decisions

**API codegen flow**: Edit `lib/api-spec/openapi.yaml` → run `codegen` → `lib/api-client-react` and `lib/api-zod` regenerate. Never edit files inside `generated/` directories directly. The OpenAPI `info.title` **must stay "Api"** — the orval config enforces this and import paths break if it changes.

**DB schema source of truth**: `lib/db/src/schema/` — one file per table, each exporting a Drizzle table, `insertXSchema` (via `drizzle-zod`), and `InsertX`/`X` types. The `lib/db/src/schema/index.ts` re-exports all tables.

**Mobile data layer**: `RemindersContext` (`contexts/RemindersContext.tsx`) wraps `ReminderService` (`services/ReminderService.ts`), which is the single source of truth for AsyncStorage reads/writes, all persisted settings, and `expo-notifications` scheduling/permissions/channels. All reminder CRUD and settings access goes through the context — screens never call the service directly. `RemindersProvider` must wrap `SharedTextProvider` in the provider tree (see Testing below) since `SharedTextContext` reads settings via `useReminders()`.

**Speech-to-text & dictation language**: `services/SpeechService.ts` wraps `expo-speech-recognition` for both live mic dictation (`startListening`/`stopListening`, used by `QuickAddInput`) and file-based transcription of shared audio (`transcribeAudioFile`, used by `SharedTextContext` for `expo-share-intent` audio payloads, e.g. WhatsApp voice notes). Which language it recognizes is **not** tied to the phone's system locale — it's a persisted app setting (`dictationLanguage`, `"en-US" | "ml-IN"`, in `ReminderService.ts`/`RemindersContext.tsx`, user-editable in Settings) explicitly threaded into both call sites. Defaults to Malayalam only if the device locale itself is Malayalam; otherwise English. Android additionally requires an offline model download per locale (`ensureOfflineModelReady`) — this is triggered automatically before each recording.

**Malayalam text handling**: `utils/parseNaturalLanguage.ts` is the single entry point for extracting a title/date from free text (typed or dictated) — it detects Malayalam script via the `MALAYALAM_RANGE` regex (exported from that file; do not redefine this regex elsewhere) and routes to either `chrono-node` (English) or `utils/malayalamDateParser.ts` (a from-scratch parser: relative days, weekdays, clock times incl. half-past, period-of-day AM/PM inference, relative durations, digit and spelled-out-number-word support). For rendering, `utils/getFontFamily.ts` picks Inter vs. the bundled Noto Sans Malayalam font per string, since Inter has no Malayalam glyphs — apply this wherever *user-entered* reminder content is rendered (title/description), not to static English UI chrome.

**TypeScript project references**: `tsconfig.json` at root uses `references` for `lib/` packages. `pnpm run typecheck:libs` runs `tsc --build` over these; `pnpm run typecheck` also typechecks artifacts.

**Supply-chain protection**: `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (packages must be 1 day old before install). Do not disable this. To bypass for a specific trusted package temporarily, add it to `minimumReleaseAgeExclude`.

## Mobile app structure

Expo Router with file-based routing under `artifacts/mobile/app/`. Screens import from `@/` which maps to the project root (configured in tsconfig paths).

**Screens (`app/`):**
- `_layout.tsx` — root layout: loads fonts (Inter + Noto Sans Malayalam), builds the provider tree, handles first-launch permission onboarding and the exact-alarm banner.
- `index.tsx` — redirect stub to `(tabs)`.
- `(tabs)/_layout.tsx` — tab layout (Home/Settings/About); uses `NativeTabs` (iOS 26 liquid glass) or classic `Tabs` depending on platform/OS version.
- `(tabs)/index.tsx` — main reminder list (home screen).
- `(tabs)/settings.tsx` — default-alarm toggle, show-description toggle, dictation-language picker.
- `(tabs)/about.tsx` — static About screen.
- `add-reminder.tsx` — add/edit reminder modal; hosts `QuickAddInput`, natural-language parsing, mic entry.
- `reminder-detail.tsx` — reminder detail modal (opened from the list or a notification tap).
- `+not-found.tsx` — unmatched-route screen.

**Services (`services/`):** each owns one concern; screens/contexts consume, never bypass.
- `ReminderService.ts` — AsyncStorage CRUD for reminders, all persisted settings (alarm/description/dictation-language), `expo-notifications` scheduling/permissions/Android channel setup (incl. legacy channel migration), boot-time reschedule.
- `SpeechService.ts` — `expo-speech-recognition` wrapper (see Architecture decisions above).
- `DebugLogService.ts` — persisted ring-buffer logger (`logDebug`, capped at 200 entries), used to trace the share-intent/transcription pipeline.
- `notificationResponseHandler.ts` — pure, injectable-deps logic for handling a tapped/actioned notification (mark-done, snooze, navigate); consumed by `components/NotificationResponseHandler.tsx`.

**Contexts (`contexts/`):**
- `RemindersContext.tsx` — see Architecture decisions above.
- `SharedTextContext.tsx` — handles incoming `expo-share-intent` payloads (text/webUrl/audio). For audio, calls `SpeechService.transcribeAudioFile` with the current `dictationLanguage` read fresh from `ReminderService.getDictationLanguage()` at call time (not via a prop/context value — avoids a stale-closure race on cold start).

**Key utils (`utils/`):** `parseNaturalLanguage.ts`, `malayalamDateParser.ts`, `getFontFamily.ts` — see Architecture decisions above. Also `formatDatetime.ts` (formats an ISO datetime as "Today · HH:MM" / "Tomorrow · HH:MM" / "Mon D · HH:MM").

**Notable components (`components/`):** `QuickAddInput.tsx` (largest/most complex — title input, mic/dictation button, natural-language preview, date/time picker), `ReminderCard.tsx` (list item), `NotificationResponseHandler.tsx`, `ExactAlarmBanner.tsx` (Android-only), `ErrorBoundary.tsx`/`ErrorFallback.tsx`.

## Testing

- Two test locations: colocated `*.test.ts(x)` next to source (services, contexts, utils, some components), and a top-level `__tests__/` tree for screens/integration (`__tests__/screens/`, `__tests__/components/`, `__tests__/contexts/`). Check both when looking for existing coverage of a file.
- Manual Jest mocks live in `artifacts/mobile/__mocks__/`: `expo-file-system.ts`, `expo-localization.ts`, `expo-notifications.ts`, `expo-share-intent.ts`, `expo-speech-recognition.ts`.
- **Provider nesting order matters and has broken tests before**: any test rendering `SharedTextProvider` must wrap it inside `RemindersProvider` (`<RemindersProvider><SharedTextProvider>{children}</SharedTextProvider></RemindersProvider>`), matching `app/_layout.tsx`. Getting this backwards throws `"useReminders must be used within RemindersProvider"` at render time — this exact bug has recurred across three different test files.
- `jest.config.js` relies on the `jest-expo` preset's default `transformIgnorePatterns` (pnpm-aware) — do not override it with a flat-node_modules pattern, it breaks under pnpm's `.pnpm` store layout.
- Mobile test/typecheck scripts (run from `artifacts/mobile/`, or via `pnpm --filter @workspace/mobile run <script>`): `test`, `test:watch`, `test:coverage`, `typecheck` (`tsc -p tsconfig.json --noEmit`). No dedicated `lint` script in this package.

## Gotchas

- The mobile app uses `AsyncStorage` for persistence, not the API server. The `@workspace/api-client-react` hooks exist but are not wired into the mobile app yet.
- `expo-notifications` is loaded via dynamic `require()` wrapped in try/catch to avoid crashes in non-native environments.
- Android requires explicit notification channel setup; see `setupNotificationChannel()` in `ReminderService.ts` — there's a legacy channel migration to handle.
- Use `pnpm` only — the root `package.json` preinstall hook rejects npm/yarn.
- `react` and `react-dom` are pinned to `19.1.0` exactly (Expo requires specific versions); do not bump without checking Expo SDK compatibility.
- expo.dev's GitHub App integration (triggering builds from the dashboard instead of the `eas-cli` CLI) fails with `ERR_PNPM_NO_LOCKFILE` when "Base directory" is set to `artifacts/mobile` — it only exposes that subdirectory to the build, but `pnpm-lock.yaml`/`pnpm-workspace.yaml` live at the repo root (pnpm workspace). Build from the CLI (`eas-cli build`, see above) instead; this is a known rough edge (matches expo/eas-cli#3247), not something fixable via eas.json/app.json config.
- Android speech recognition needs a per-locale offline model; switching the dictation-language setting to a locale used for the first time triggers a download prompt (`ensureOfflineModelReady` in `SpeechService.ts`) — expect a "Preparing voice recognition" state on first use.

## Pointers

- `replit.md` is currently an unfilled generic template — do not rely on it for run/operate info; this file (`CLAUDE.md`) is the canonical reference.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` hold design specs and implementation plans for past features (dated filenames) — useful history/precedent when working in an area they cover.
- `handoffs/` holds dated handoff docs for some past features.
