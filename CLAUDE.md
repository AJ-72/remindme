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

## Pointers

- See `replit.md` for the canonical run/operate reference and stack summary.
