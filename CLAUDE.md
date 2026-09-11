# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Token discipline

Before starting any non-trivial task, state:
- **Estimated token budget** (rough order of magnitude: small ~5-15k / medium ~15-50k / large 50k+), and
- **Model recommendation** (current model vs. a cheaper one, e.g. Haiku for mechanical/low-reasoning work) with one line of rationale.

Confirm both with the user before proceeding. Once confirmed, work economically toward that budget: minimize exploratory tool calls, keep thinking terse, avoid re-reading files already in context, and prefer targeted edits over broad rewrites. If actual usage is tracking to exceed the stated budget mid-task, flag it rather than silently continuing.

Skip this for trivial one-shot asks (a single question, a one-line lookup).

**Why:** token spend should be a visible, agreed-on tradeoff, not an invisible default — even though the estimate is necessarily approximate (no live token metering is available mid-task) and the model itself can't be switched by the agent (`/model` is a user action; report actual spend via `/cost`).

## What this is

**Reminders** — a mobile app (React Native/Expo) for scheduling reminders with local notifications. Reminders are stored locally on-device via AsyncStorage. A Supabase backend for the "remind someone else" Tier 2 work (M4) is now deployed and live — see "The M4 Tier 2 backend is deployed" below for what that covers and what's still local-only. Supports voice dictation (English/Malayalam, user-selectable in Settings) and Malayalam-script text input/rendering throughout.

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
# ...then the functions and grants, which drizzle-kit push does NOT manage.
# Both commands, every time.
pnpm --filter @workspace/db run push:sql

# RLS / schema tests (real Postgres via PGlite, in-process — no Docker needed)
pnpm --filter @workspace/db run test

# Deploy one Edge Function (requires SUPABASE_ACCESS_TOKEN, see supabase.com -> Account -> Access Tokens)
$env:SUPABASE_ACCESS_TOKEN = '<token>'
.\scripts\deploy-edge-functions.ps1 -Function <lookup|send-invitation|claim-invitations|respond-invitation|expire-invitations-cron>
```

Mobile dev runs via Expo on Replit with specific env vars (`REPLIT_EXPO_DEV_DOMAIN`, `REPL_ID`, etc.) — local dev of the mobile app requires those to be set.

Android builds use EAS: `pnpm --filter @workspace/mobile run build:android` (preview), `build:android:prod` (production), `build:android:dev` (dev client).

**Running locally without EAS (no build-quota usage):** `npx expo start` (press `a`) serves JS to an already-installed dev client/emulator via Metro — no native build. For a full native build straight to a connected emulator/device, use `npx expo run:android` from `artifacts/mobile` — this compiles locally via Gradle and never touches EAS. On Windows this requires several environment fixes beyond what Android Studio sets up by default; see "Local Android builds on Windows" below.

### Local Android builds on Windows

`npx expo run:android` needs all of the following on Windows, or it fails in ways that look unrelated to each other:

1. **`JAVA_HOME` must point to a JDK the RN/Kotlin Gradle toolchain supports (JDK 17–21).** If the system `java` on PATH is newer (e.g. JDK 26, increasingly common as a system default), Gradle fails with a cryptic `Error resolving plugin [id: 'com.facebook.react.settings'] > 26.0.2` — that "26.0.2" is actually your Java version being mis-parsed by Kotlin's `JavaVersion.parse`, not a plugin version. Fix: set `JAVA_HOME` to Android Studio's bundled JBR (`C:\Program Files\Android\Android Studio\jbr`, JDK 21) before running the build.
2. **CMake must be upgraded past the AGP default (3.22.1).** CMake 3.22.1 bundles Ninja 1.10, which has a real bug in its Windows long-path handling (fixed in Ninja 1.12, see [ninja-build/ninja#1900](https://github.com/ninja-build/ninja/issues/1900)). Windows' own `LongPathsEnabled` registry setting does **not** fix this — Ninja's 260-char check is internal to the tool, independent of the OS long-path opt-in. Symptom: `ninja: error: Stat(...): Filename longer than 260 characters` or `manifest 'build.ninja' still dirty after 100 tries`, deep into an otherwise-successful build (typically on a native module with a long file tree, e.g. `react-native-keyboard-controller`, `react-native-worklets`). Fix: install a newer CMake (e.g. 4.1.x) via Android Studio → Settings → Languages & Frameworks → Android SDK → SDK Tools, then pin it explicitly in `artifacts/mobile/android/app/build.gradle`:
   ```gradle
   android {
     externalNativeBuild {
       cmake {
         version "4.1.2"  // match whatever you installed
       }
     }
   }
   ```
   Note: some individual native modules' own `android/build.gradle` (e.g. `react-native-worklets`) read a `CMAKE_VERSION` env var for their own build, but the **`:app` module itself does not** — it needs the explicit `externalNativeBuild.cmake.version` block above, or it silently keeps using 3.22.1 even with `CMAKE_VERSION` set in the shell. Since `android/` is prebuild-generated, this edit may need reapplying after a fresh `expo prebuild`.

   **The `:app`-level pin above is NOT sufficient by itself** (confirmed 2026-09-11: a build with only this fix still failed with `ninja: error: manifest 'build.ninja' still dirty after 100 tries` inside `react-native-screens` and `expo-modules-core`'s own `.cxx` dirs — their own `android/build.gradle` under `node_modules` has its own `externalNativeBuild` block, doesn't inherit `:app`'s pin, and doesn't honor `CMAKE_VERSION` either, so it silently falls back to AGP's buggy 3.22.1 default). Fix: force it repo-wide via a `subprojects` block in `artifacts/mobile/android/build.gradle` (top-level, not `android/app/build.gradle`), added after the existing `allprojects` block:
   ```gradle
   subprojects {
     afterEvaluate { project ->
       if (project.hasProperty("android")) {
         def androidExt = project.android
         if (androidExt.hasProperty("externalNativeBuild")) {
           androidExt.externalNativeBuild {
             cmake {
               version "4.1.2"  // match whatever you installed
             }
           }
         }
       }
     }
   }
   ```
   Also prebuild-generated, so it needs reapplying alongside the `:app`-level pin after every `expo prebuild --clean`. Do both, not just the `:app` one, or a clean prebuild silently regresses to this exact failure the next time a module without its own explicit pin gets rebuilt.

   After changing the CMake version, delete stale caches or the old absolute paths / broken ninja manifests persist: `android/app/.cxx`, `android/app/build`, `android/build`, `android/.gradle`.
3. **pnpm's `.pnpm` store path adds nesting that makes marginal path-length cases worse** (not the root cause — real cause is #2 above — but it lowers the threshold at which the Ninja bug bites). If still hitting path-length issues after fixing CMake/Ninja, a repo living under a very long path (e.g. deeply nested user folders) compounds the problem further.

Order of operations for a clean local build: fix JDK → fix CMake/Ninja version → clean `.cxx`/`build` caches → `npx expo run:android`.

**Deploying from a local machine (not Replit):** `EXPO_TOKEN` used to come from a Replit Secret and isn't present outside Replit. Get a token from expo.dev → your account → Settings → Access Tokens, then:
```bash
export EXPO_TOKEN=<your-token>
cd artifacts/mobile && npx eas-cli build --platform android --profile preview --non-interactive
```
`export` only lasts for the current shell session — add it to `~/.zshrc` (or your shell's profile) if you want it to persist across sessions. `npx eas-cli` works without installing it as a project dependency. Note: building via expo.dev's GitHub integration (rather than the CLI) doesn't work out of the box here — see the "Gotchas" section below.

**CI pipeline:** `.github/workflows/eas-build.yml` is manually triggered (`workflow_dispatch`) — pick platform/profile in the Actions UI. It runs `pnpm --filter @workspace/mobile run typecheck` and `run test` first, then calls `eas build` only if both pass. Requires an `EXPO_TOKEN` repo secret (same token as local builds, see above).

Required env: `DATABASE_URL` — Postgres connection string (for api-server and db push; for `remindme-tier2` specifically, `postgresql://postgres:<password>@db.zeeanhbvcjslzirftass.supabase.co:5432/postgres` — get the password from the Supabase dashboard, never commit it). `SUPABASE_ACCESS_TOKEN` — for `scripts/deploy-edge-functions.ps1` (Edge Function deploys only; not needed for `db run push`/`push:sql`, which use `DATABASE_URL` directly).

### Android/Expo device workflow

- Metro runs on port **3011** in this repo (see `build-and-install-android.ps1`,
  `$MetroPort`). After any device reconnect or fresh `adb` session, run
  `adb reverse tcp:3011 tcp:3011` before expecting the app to reach Metro —
  a "stuck on splash screen, no crash in logcat" symptom is usually this, not a
  code bug.
- Launch the **dev client**, never Expo Go — Expo Go can't load this project's
  native modules and fails in confusing ways that look like a Metro problem.
- If `adb devices` shows a device as `unauthorized` or `offline`, stop and ask
  the user to reconnect/re-approve rather than retrying blindly — retries don't
  fix an auth prompt sitting unanswered on the device.
- Prefer `adb shell uiautomator dump` (or Maestro's own element selectors — see
  Testing below) over guessing tap coordinates from a screenshot; screenshot
  scale factors are easy to get wrong and burn time.
- `scripts/dev-device.ps1` (repo root) wraps the adb-device-check →
  build/install → `adb reverse` → Metro-launch sequence — prefer it over
  re-deriving these steps by hand each session.

## Architecture decisions

**API codegen flow**: Edit `lib/api-spec/openapi.yaml` → run `codegen` → `lib/api-client-react` and `lib/api-zod` regenerate. Never edit files inside `generated/` directories directly. The OpenAPI `info.title` **must stay "Api"** — the orval config enforces this and import paths break if it changes. Note the spec currently declares a single path (`/healthz`), so the generated client has one hook; this is a working pipeline with nothing yet flowing through it.

**DB schema source of truth**: `lib/db/src/schema/` — one file per table, each exporting a Drizzle table, `insertXSchema` (via `drizzle-zod`), and `InsertX`/`X` types. `lib/db/src/schema/index.ts` re-exports all tables; a table file that is never re-exported is absent from the generated DDL, so it goes both untested and unpushed (there is a test pinning the table list for exactly this reason).

Five tables exist, all for M4 Tier 2: `users`, `devices`, `blocks`, `invitations`, `link_codes` — deployed and reachable by the app via the Edge Functions below (see Gotchas). `invitations.bind_token` (uuid, unique) is the rung-1 verification credential — possession of the link carrying it is proof of number control. Consumption is tracked on `bound_by`/`bound_at` on the same row, not inferred from `users.phone_hash` — an account is user-deletable, so a proxy inferred from it dies with the account, which an independent review caught in the first version of `bind_via_invite_token()`.

**RLS policies live in the schema too**, via `pgPolicy` — and Drizzle enables RLS on a table *only* if that table declares a policy, so **a new table with no policy is wide open to every authenticated caller** while looking perfectly ordinary in review. Two things guard that: a test asserting `tablesWithoutRls()` is empty, and `privileges.sql` starting from `revoke all`.

**RLS is row-level; some rules here are column-shaped.** Whoever can write `users.phone_hash` owns that phone number, whichever row they are permitted to write. No policy can say that, so table and column privileges live in `lib/db/src/schema/privileges.sql`.

**`drizzle-kit push` manages neither grants nor functions** — `push:sql` is a second, required deploy step, not an optional one. It applies `lib/db/src/functions/*.sql` (in `manifest.json` order) then `privileges.sql`, and the manifest is read by the test harness too so the two cannot drift.

**`SECURITY DEFINER` functions bypass RLS entirely** — that is what they are for here (an unclaimed invitation is owned by nobody, so no policy can reach it), and it is also why they are the most dangerous code in the package. Two exist: `claim_invitations()` and `bind_via_invite_token()` (`lib/db/src/functions/`). Rules, learned the hard way building them: take **no argument the caller could lie about** — `claim_invitations()` reads `auth.uid()`'s own row rather than accepting a hash; `bind_via_invite_token()` does take a token, but it is an unguessable uuid never read aloud, so possessing it (not asserting it) is the whole proof; pin `search_path` **and** schema-qualify every name (the pin alone proves nothing — it turns a silent hijack into a crash, qualification is what makes it correct); `revoke all ... from public, anon, authenticated` before granting, naming every role explicitly — `revoke ... from public` alone is NOT enough **on Supabase specifically**: every new project ships an `ALTER DEFAULT PRIVILEGES` that grants `EXECUTE` directly to `anon`/`authenticated` on any function created in schema `public`, independent of the `PUBLIC` pseudo-role, so revoking only from `PUBLIC` leaves both roles able to call it (confirmed live on `remindme-tier2` 2026-09-07 via `mcp__Supabase__get_advisors` — `anon` had `EXECUTE` on both functions despite `revoke ... from public`, saved only by the in-body check below; the PGlite test harness cannot catch this class of bug since it never runs Supabase's default-privilege setup, only Supabase's own advisor can); and keep an in-body auth check with a test that actually reaches it, or it rots into a comment.

**RLS tests** (`lib/db`, vitest + PGlite) run a real Postgres compiled to WASM, in-process: no Docker, no Supabase CLI, no daemon. Note a superuser bypasses RLS and PGlite's default connection *is* a superuser, which is why `rlsHarness.ts` exposes only `asUser`/`asAnon`/`asService` and documents `asService` as unusable for assertions. When adding a policy test, sabotage-check it: remove the protection and confirm the test fails *for the right reason*.

**Mobile data layer**: `RemindersContext` (`contexts/RemindersContext.tsx`) wraps `ReminderService` (`services/ReminderService.ts`), which is the single source of truth for AsyncStorage reads/writes, all persisted settings, and `expo-notifications` scheduling/permissions/channels. All reminder CRUD and settings access goes through the context — screens never call the service directly. `RemindersProvider` must wrap `SharedTextProvider` in the provider tree (see Testing below) since `SharedTextContext` reads settings via `useReminders()`.

**Speech-to-text & dictation language**: `services/SpeechService.ts` wraps `expo-speech-recognition` for both live mic dictation (`startListening`/`stopListening`, used by `QuickAddInput`) and file-based transcription of shared audio (`transcribeAudioFile`, used by `SharedTextContext` for `expo-share-intent` audio payloads, e.g. WhatsApp voice notes). Which language it recognizes is **not** tied to the phone's system locale — it's a persisted app setting (`dictationLanguage`, `"en-US" | "ml-IN"`, in `ReminderService.ts`/`RemindersContext.tsx`, user-editable in Settings) explicitly threaded into both call sites. Defaults to Malayalam only if the device locale itself is Malayalam; otherwise English. Android additionally requires an offline model download per locale (`ensureOfflineModelReady`) — this is triggered automatically before each recording.

**Malayalam text handling**: `utils/parseNaturalLanguage.ts` is the single entry point for extracting a title/date from free text (typed or dictated) — it detects Malayalam script via the `MALAYALAM_RANGE` regex (exported from that file; do not redefine this regex elsewhere) and routes to either `chrono-node` (English) or `utils/malayalamDateParser.ts` (a from-scratch parser: relative days, weekdays, clock times incl. half-past, period-of-day AM/PM inference, relative durations, digit and spelled-out-number-word support). For rendering, `utils/getFontFamily.ts` picks Inter vs. the bundled Noto Sans Malayalam font per string, since Inter has no Malayalam glyphs — apply this wherever *user-entered* reminder content is rendered (title/description), not to static English UI chrome.

**TypeScript project references**: `tsconfig.json` at root uses `references` for `lib/` packages. `pnpm run typecheck:libs` runs `tsc --build` over these; `pnpm run typecheck` also typechecks artifacts.

**Supply-chain protection**: `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (packages must be 1 day old before install). Do not disable this. To bypass for a specific trusted package temporarily, add it to `minimumReleaseAgeExclude`.

## Supabase Edge Functions

`supabase/functions/` — Deno, deployed to `remindme-tier2` (see Gotchas). One directory per function, each with its own `index.ts` + `index.test.ts`; `_shared/` holds cross-function helpers, imported via relative paths (`../_shared/...`), not an import map.

- `_shared/supabaseClient.ts` — `getAuthedClient(req)` builds a supabase-js client scoped to the caller's own forwarded JWT (never the service role) and returns a ready-to-return 401 `Response` on any auth failure. Every function except `expire-invitations-cron` calls this first, per ADR 0001: privileged operations act as the calling user, with `SECURITY DEFINER` SQL (not a service-role client) crossing the boundary where a user structurally cannot act as themselves (lookup's hash match, claim's self-claim).
- `_shared/cors.ts` / `_shared/errors.ts` — shared `handleCors()` preflight short-circuit and `jsonOk`/`jsonError` response helpers. Every function calls `handleCors(req)` first, even `expire-invitations-cron` which never receives a real preflight, for consistency.
- `_shared/expoPush.ts` — `sendExpoPush()`, batches up to 100 tokens/request against Expo's push API; a dead token or failed batch reports in `failed`, never throws, so it can't block delivery to the rest of a batch or the invitation send itself.
- `lookup` — phone-number reachability check. Hashes the input with an HMAC pepper (`PHONE_HASH_PEPPER` env var — server-side only, never derivable client-side) matching the mobile app's own `normalizeForIdentity()` output, then calls `hash_lookup()`. Rate-limited via `check_lookup_rate_limit()`.
- `send-invitation` — creates an invitation via `send_invitation()` (the single enforcement point for the block-list check and 30-day content cap), then best-effort pushes every device registered for the recipient via `get_push_tokens_for_user()` + `sendExpoPush()`. A missing/dead device never fails the send — the recipient still collects the invitation on next auth via `claim-invitations` regardless of push.
- `claim-invitations` — pulls every pending invitation for the caller's own bound phone number via `claim_invitations()`, which reads `auth.uid()` itself rather than trusting anything caller-supplied.
- `respond-invitation` — accept/decline via `respond_to_invitation()`.
- `expire-invitations-cron` — the one function with no user JWT at all; runs on a schedule (see Gotchas for the `pg_cron`/`pg_net`/Vault wiring), authenticated by a `x-cron-secret` header checked in-body (`checkCronAuth()`, fails closed on a missing/unset `CRON_SECRET` — final-review Fix 4). Uses the service-role key deliberately, the one place in this codebase that does.

Each `index.ts` separates pure request-handling logic (`handleLookup`, `handleSendInvitation`, etc. — exported, testable against a fake `SupabaseClient`) from the `Deno.serve()` wiring, matching this repo's general preference for logic that doesn't require spinning up the actual runtime to test.

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
- **Verify before claiming done** (see also the global Verification rule): after any change to `artifacts/mobile`, run `pnpm --filter @workspace/mobile run typecheck` and `pnpm --filter @workspace/mobile run test` (or `cd artifacts/mobile && npx jest <pattern>` for a targeted subset) and quote the actual pass/fail output — don't report a fix as working from code inspection alone. For anything touching device behavior (notifications, alarms, dictation, Maestro flows), Jest passing is necessary but not sufficient — see `device-tests/README.md`.

### End-to-end tests (Maestro)

- **Always use the Maestro CLI for on-device/emulator e2e flows** — never raw `adb`/`uiautomator`. Flows live in `Maestro/` at the repo root (`Maestro/*.yaml`), one file per flow, run individually: `maestro test Maestro/<file>.yaml`. Requires a running emulator/device with the app installed (a dev-client or release build — Metro alone is not enough).
- Select elements by `id:` (the component's `testID` prop) wherever one exists — check the source for `testID="..."` before falling back to `text:`. Text selectors are brittle against copy changes and, for Malayalam-script text, against font-rendering quirks; `id:` selectors avoid both.
- **Stay token-efficient**: keep each flow to the minimum steps needed to prove the behavior, assert on specific expected/forbidden strings (`assertVisible`/`assertNotVisible`) rather than dumping the view hierarchy, and don't reach for `maestro studio` or a hierarchy dump unless a flow is actually failing and you need to see why. Prefer several short single-purpose flows over one long one — a failure in a 20-step flow is expensive to localize.
- Default to non-destructive flows (no `clearState`, don't tap Save) when the assertion doesn't require persistence — see `Maestro/smoke_malayalam_text.yaml`. Use `clearState: true` only when the test needs a known-empty list, e.g. to assert on a freshly created card.
- **`inputText` does not support Unicode on Android — Malayalam script cannot be typed by a Maestro flow.** Maestro drives Android text entry via `adb shell input text`, which is ASCII-only at the ADB layer — a raw `adb shell input text` call with a non-ASCII string throws `java.lang.NullPointerException: Attempt to get length of null array` on-device (confirmed in a prior session), not something Maestro's own code can work around. Long-standing upstream limitation: [maestro#146](https://github.com/mobile-dev-inc/maestro/issues/146), open since 2022, no built-in fix. `assertVisible`/`assertNotVisible` on Malayalam text already on screen works fine regardless of how it got there — only *typing* Malayalam via `inputText` is blocked. Confirmed 2026-09-03 via upstream docs/issue research, not by reproducing the failure on-device this session (the connected emulator was stuck on its splash screen for an unrelated reason — no crash in logcat, worth checking Metro connectivity separately before trusting further on-device runs).
  - **Do not confuse this with Jest.** The extensive Malayalam parser coverage (`malayalamDateParser.test.ts`, `QuickAddInput.test.tsx` — e.g. the ambiguous-numeral test typing `"രാവിലെ 5 ആപ്പിൾ വാങ്ങണം"`) uses React Native Testing Library's `fireEvent.changeText`, which sets a text input's value via a synthetic JS event in jsdom — it never runs on a device or goes through `adb`, so this limitation doesn't apply to it at all. Jest/RNTL can exercise Malayalam freely; only a real on-device `inputText` cannot.
  - **The workaround, working example in this repo: ADBKeyboard.** [senzhk/ADBKeyBoard](https://github.com/senzhk/ADBKeyBoard) is a helper IME that accepts arbitrary Unicode via a broadcast intent and commits it straight into the focused field, bypassing keystroke synthesis entirely. It cannot be driven from inside a Maestro YAML — there's no raw shell/exec step in the DSL — so `run-malayalam-maestro-flow.ps1` (repo root) sits outside Maestro and sequences three pieces: **(1)** `Maestro/malayalam_flow_a_focus.yaml` — pure Maestro, launches the app and taps the field into focus, **(2)** the PowerShell script itself — switches the active IME to ADBKeyboard, broadcasts the text (`adb shell am broadcast -a ADB_INPUT_TEXT --es msg "'<text>'"` — the nested single-quotes matter: `adb shell` rejoins args with spaces before the device re-parses them, so an unquoted multi-word string gets split and only the first word lands), then restores the original IME in a `finally` so the device is left clean even if a step fails — **(3)** `Maestro/malayalam_flow_b_verify.yaml` — pure Maestro, continues from wherever focus/cursor landed (save, assert on the Malayalam text and the numeral-time it should parse to). Run with `.\run-malayalam-maestro-flow.ps1 -Device <serial>`; requires ADBKeyboard already installed on that device (`adb install` the APK from its releases page once). Trade-offs, confirmed while building this: loses Maestro's "one self-contained flow, runs anywhere" property, ties the test to ADBKeyboard being pre-installed on that specific device/serial, and isn't CI-portable as written — only worth it for flows that must *type* Malayalam; anything that only navigates to or asserts on existing Malayalam-titled content stays pure Maestro (like `smoke_malayalam_text.yaml`). **Not yet verified end-to-end**: the script's own logic (device targeting, ADBKeyboard-presence check, IME save/restore, error propagation) ran correctly in testing, but flow A itself couldn't get past `com.curios.remindme`'s splash screen on the one device tried (2026-09-03) — `MainActivity` was focused, no crash in logcat, no React Native log lines at all, which points at a stale/release build with no reachable Metro rather than anything in this script or flow. Get a debug build with Metro actually running before trusting a full pass/fail from this.

## Gotchas

- **The M4 Tier 2 backend is deployed, live on a real Supabase project.** Project `remindme-tier2` (ref `zeeanhbvcjslzirftass`, `ap-south-1`), deployed 2026-09-09. Schema (5 tables, all RLS-enabled), all 10 SQL functions (`lib/db/src/functions/`, applied via `push:sql`), and all 5 Edge Functions (`supabase/functions/` — `lookup`, `send-invitation`, `claim-invitations`, `respond-invitation`, `expire-invitations-cron`) are live and confirmed via `mcp__Supabase__get_advisors`/direct SQL — not just pushed-and-assumed-working. `expire-invitations-cron` runs hourly via a `pg_cron` + `pg_net` job (`expire-invitations-hourly`, id 1) that pulls its `x-cron-secret` from Supabase Vault (`cron_secret`) rather than embedding it in the job body — do the same for any future scheduled job, not a hardcoded secret in `cron.schedule()`'s SQL text, which is both a plaintext-in-DB problem and (confirmed this session) something the Claude Code permission classifier itself blocks. `PHONE_HASH_PEPPER` and `CRON_SECRET` are set as Edge Function secrets (dashboard → Project Settings → Edge Functions → Secrets); **`PHONE_HASH_PEPPER` must never be rotated once set** — every existing `phone_hash` depends on it, and changing it breaks all lookups/matching silently, with no error anywhere.

  The mobile client already points at this project by default — `artifacts/mobile/constants/supabase.ts` hardcodes `SUPABASE_URL`/`SUPABASE_ANON_KEY` for `remindme-tier2` (overridable via `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` env vars at build time). No mobile-side config change is needed to reach it.

  **What this does NOT mean**: `artifacts/api-server` still serves one health route, `openapi.yaml` still declares one path, and the mobile app's core reminder CRUD still persists entirely in `AsyncStorage` — only the M4 Tier 2 "remind someone else" surface (invitations/binding/blocks) talks to this backend, via Edge Functions, never PostgREST directly (`docs/adr/0001`). `artifacts/api-server` is still slated for deletion per that ADR and has not been deleted. Device sync, accounts-for-their-own-sake, MCP (backlog M8), and group RSVP (M7) are all still unbuilt and still start from zero if scoped.

  **Redeploying after a schema/function/Edge-Function change**: this session had no working `supabase` CLI or `SUPABASE_ACCESS_TOKEN`/`gh` in its environment, so `scripts/deploy-edge-functions.ps1` (which needs both) was bypassed — Edge Functions were deployed directly via the `mcp__Supabase__deploy_edge_function` tool instead, reading each function's `index.ts` plus its `_shared/*.ts` deps and inlining them into the `files` array (no import-map needed, all deps came from `esm.sh` URL imports already in the source). If that MCP tool isn't available in a future session, fall back to `scripts/deploy-edge-functions.ps1` with a real `SUPABASE_ACCESS_TOKEN`. Either way, `push:sql` (DB functions/grants) is a separate step from Edge Function deploys — both are required after a change to either, and were found out of sync with each other this session (functions/grants were stale from before commit `a8c5bd9`, plus several later ones, until re-run).

- **The "remind someone else" flow was tested live, end-to-end, on two physical devices on 2026-09-11 and confirmed working** — invitation created via `send-invitation`, claimed via `claim-invitations`, visible on the recipient's device (invitation `7eb79c78`'s `recipient_id` populated, confirmed via direct DB read, not just the client UI). Getting there surfaced and fixed three real bugs beyond the app code itself — see `system_learnings.md` ("Remind someone else — three real bugs found live-testing on two devices" entry, 2026-09-11) for full root causes/fixes:
  1. `lookup_rate_limits` table was missing from the live `remindme-tier2` database — defined correctly in Drizzle schema source and re-exported, but never actually applied via `push:sql`/`drizzle-kit push` (a stronger version of the grants-drift risk already documented above — this time a whole table, not just grants). Recreated live via a direct migration matching the schema source exactly.
  2. `register-number.tsx` (the self-registration screen) never called `claimPendingInvitations()` — only `bind-invite.tsx` (the invite-link binding screen) did. Since `self_register()` proves phone ownership the same way binding does, any invitation already sent to a self-registering number was permanently stranded (`recipient_id` staying null forever). Fixed by wiring the same claim to `register-number.tsx`'s `submit()`, mirroring `bind-invite.tsx`'s pattern (see `artifacts/mobile/app/register-number.tsx`); 3 new tests added in `__tests__/screens/register-number.test.tsx`.
  3. Not a code bug: a test device's **system locale region** (`en-GB`) differed from its actual SIM/carrier country (`IN`), and `normalizeForIdentity()`'s device-region-guessing branch (`artifacts/mobile/utils/phoneNumber.ts`) used the wrong one, silently normalizing the same typed digits to a different E.164 number (and therefore a different `phone_hash`) than the sender expected. An explicit leading `+` on the typed number bypasses region-guessing entirely and is the reliable workaround/diagnostic when reachability lookups mysteriously miss for a real recipient.

  Local native build note from the same session: `expo run:android --device <name>` needs a device **name** (the interactive-picker label), not an adb serial — use `ANDROID_SERIAL=<serial> npx expo run:android` to target a specific device non-interactively. Also, once a debug APK is built for one device, `adb install -r` onto a second compatible-ABI device works without a second full native build.

- **Android push (FCM) is now fully wired and confirmed live-delivering, as of 2026-09-11** — closing the gap this file used to describe as deferred. Two separate credentials were needed, not one:
  1. **`google-services.json`** (client-side Firebase config) — a real Firebase project (`reminders-app-3de05`) was created, the Android app registered under it (`com.curios.remindme`, must match exactly), and the downloaded file placed at `artifacts/mobile/google-services.json`. It's real-project-specific and gitignored (`.gitignore`); `artifacts/mobile/google-services.json.example` documents the shape for a future setup. `app.json`'s `expo.android.googleServicesFile` points at it — this is the entire Expo-side wiring needed; **do not** hand-edit `android/build.gradle`/`android/app/build.gradle` per Firebase console's own generic Gradle instructions, `expo prebuild` generates the Google Services plugin wiring (`com.google.gms.google-services`) automatically and a manual edit fights it.
  2. **An FCM service-account credential uploaded to Expo's own dashboard** (expo.dev → project → Credentials/Configuration → Android → FCM V1) — a *separate* step `google-services.json` does NOT cover. Missing this produces a specific, previously-confusing symptom: `registerDeviceForPush()` succeeds (a real `ExponentPushToken[...]` gets written to `devices`), `send-invitation` returns 200, but no notification ever arrives — because Expo's push service itself rejects the send server-side with `{"status":"error","message":"Unable to retrieve the FCM server key for the recipient's app.","details":{"error":"InvalidCredentials","fault":"developer"}}`. This is invisible from this repo's own logs (`sendExpoPush()` doesn't log ticket status) — diagnosed by `curl`-ing `https://exp.host/--/api/v2/push/send` directly with a real captured token and reading the ticket. Fix: generate a service-account key (Firebase Console → Project Settings → Service Accounts → Generate new private key) and upload that JSON to Expo's dashboard; the same diagnostic curl then returns `{"status":"ok",...}`.
  A native rebuild (`expo prebuild --clean` then a full `npx expo run:android`) is required after adding `google-services.json` — the Google Services plugin only activates via the regenerated native project, not just the JS/Metro bundle. See "Local Android builds on Windows" above for the CMake pin needed to get that rebuild to succeed at all (this rebuild is what surfaced the "`:app`-level pin alone is not sufficient" gap documented there).
- `expo-notifications` is loaded via dynamic `require()` wrapped in try/catch to avoid crashes in non-native environments.
- Android requires explicit notification channel setup; see `setupNotificationChannel()` in `ReminderService.ts` — there's a legacy channel migration to handle.
- Use `pnpm` only — the root `package.json` preinstall hook rejects npm/yarn.
- `react` and `react-dom` are pinned to `19.1.0` exactly (Expo requires specific versions); do not bump without checking Expo SDK compatibility.
- expo.dev's GitHub App integration (triggering builds from the dashboard instead of the `eas-cli` CLI) fails with `ERR_PNPM_NO_LOCKFILE` when "Base directory" is set to `artifacts/mobile` — it only exposes that subdirectory to the build, but `pnpm-lock.yaml`/`pnpm-workspace.yaml` live at the repo root (pnpm workspace). Build from the CLI (`eas-cli build`, see above) instead; this is a known rough edge (matches expo/eas-cli#3247), not something fixable via eas.json/app.json config.
- Android speech recognition needs a per-locale offline model; switching the dictation-language setting to a locale used for the first time triggers a download prompt (`ensureOfflineModelReady` in `SpeechService.ts`) — expect a "Preparing voice recognition" state on first use.

## Pointers

- `README.md` is the public-facing entry point, aimed at someone evaluating the repo (including how it was built with AI). This file (`CLAUDE.md`) remains the canonical run/operate reference — keep run instructions here, not there. A `replit.md` template was removed on 2026-08-09; ignore any lingering references to it.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` hold design specs and implementation plans for past features (dated filenames) — useful history/precedent when working in an area they cover.
- `handoffs/` holds dated handoff docs for some past features.
- `system_learnings.md` — a running ledger of non-obvious fixes and config changes made while working in this repo, with root causes. Check it before debugging something that smells like it may have been hit before.
- `device-tests/` — the canonical list of things that are green in Jest but **unproven on hardware**, with a pass/fail/pending status each, split by area (`README.md` is the index). Jest runs in jsdom: no viewport, no keyboard, no system chrome, no notification tray, no OEM power manager, so anything failing as "off-screen", "behind something", "never fired", or "wrong colour on a real background" cannot be caught by the suite. **When a feature lands, add its device-only checks to the relevant file in that folder in the same change** — green tests are not evidence a feature works. Never mark an item `PASS` yourself; a pass comes from a human who watched it happen.
