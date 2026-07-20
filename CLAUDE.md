# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Reminders** — a mobile app (React Native/Expo) for scheduling reminders with local notifications. Reminders are stored locally on-device via AsyncStorage; the API server exists but the mobile app does not yet use it.

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

**Mobile data layer**: `RemindersContext` (React context) wraps `ReminderService` which owns all AsyncStorage reads/writes and `expo-notifications` scheduling. All reminder CRUD goes through the context — screens never call the service directly.

**TypeScript project references**: `tsconfig.json` at root uses `references` for `lib/` packages. `pnpm run typecheck:libs` runs `tsc --build` over these; `pnpm run typecheck` also typechecks artifacts.

**Supply-chain protection**: `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (packages must be 1 day old before install). Do not disable this. To bypass for a specific trusted package temporarily, add it to `minimumReleaseAgeExclude`.

## Mobile app routing

Expo Router with file-based routing under `artifacts/mobile/app/`:
- `(tabs)/index.tsx` — main reminder list (home screen)
- `add-reminder.tsx` — add/edit reminder modal
- `index.tsx` — redirect to tabs

Screens import from `@/` which maps to the project root (configured in tsconfig paths).

## Gotchas

- The mobile app uses `AsyncStorage` for persistence, not the API server. The `@workspace/api-client-react` hooks exist but are not wired into the mobile app yet.
- `expo-notifications` is loaded via dynamic `require()` wrapped in try/catch to avoid crashes in non-native environments.
- Android requires explicit notification channel setup; see `setupNotificationChannel()` in `ReminderService.ts` — there's a legacy channel migration to handle.
- Use `pnpm` only — the root `package.json` preinstall hook rejects npm/yarn.
- `react` and `react-dom` are pinned to `19.1.0` exactly (Expo requires specific versions); do not bump without checking Expo SDK compatibility.
- expo.dev's GitHub App integration (triggering builds from the dashboard instead of the `eas-cli` CLI) fails with `ERR_PNPM_NO_LOCKFILE` when "Base directory" is set to `artifacts/mobile` — it only exposes that subdirectory to the build, but `pnpm-lock.yaml`/`pnpm-workspace.yaml` live at the repo root (pnpm workspace). Build from the CLI (`eas-cli build`, see above) instead; this is a known rough edge (matches expo/eas-cli#3247), not something fixable via eas.json/app.json config.

## Pointers

- See `replit.md` for the canonical run/operate reference and stack summary.
