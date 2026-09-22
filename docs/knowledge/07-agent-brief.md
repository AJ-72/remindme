# 07 — Agent brief

Dense rules for an agent working in this repo. Read this before you edit.
Every line here exists because something broke once.

## Before you start any non-trivial task

State two things and confirm them with the user:

1. **Estimated token budget** — small (~5–15k), medium (~15–50k), or large (50k+).
2. **Model recommendation** — this model, or a cheaper one, with one line of reason.

Skip this only for a single question or a one-line lookup.

## Before you report anything done

```bash
pnpm run typecheck
pnpm --filter @workspace/mobile run test
```

Both must pass. **Quote the real output.** Do not report a fix as working
from code inspection.

A failing test blocks completion even if it fails for a reason unrelated to
your change. Fix it in the same session. Say so when the fix is unrelated.

For anything touching device behaviour — notifications, alarms, dictation,
Maestro flows — Jest passing is necessary but not sufficient. See
[`device-tests/README.md`](../../device-tests/README.md).

## Hard rules — never do these

| Never | Because |
| --- | --- |
| Edit a file inside a `generated/` directory. | Codegen overwrites it. Edit `openapi.yaml`. |
| Change the OpenAPI `info.title` from `"Api"`. | Import paths break. |
| Use npm or yarn. | The root `preinstall` hook rejects them. |
| Disable `minimumReleaseAge` in `pnpm-workspace.yaml`. | It is supply-chain protection. |
| Rotate `PHONE_HASH_PEPPER`. | Every stored `phone_hash` depends on it. Rotation breaks all matching silently. |
| Bump `react` or `react-dom` off `19.1.0`. | Expo pins them. |
| Redefine `MALAYALAM_RANGE`. | Import it from `utils/parseNaturalLanguage.ts`. |
| Import `ReminderService` from a screen. | Go through `useReminders()`. |
| Import the PostHog or Sentry SDK from a screen. | Go through the two services. |
| Add a second store of a fact the reminder record already holds. | Two stores disagree, and the disagreement is not repairable. |
| Hardcode a secret in `cron.schedule()` SQL. | Use Supabase Vault. |
| Leave a `DONE` row in `backlog.md`. | Delete it and write to `docs/shipped.md`. |
| Mark a `device-tests/` item `PASS`. | Only a human who watched it may. |
| Run `drizzle-kit push` without `push:sql`. | Functions and grants are a separate, required step. |

## Invariants that are easy to break

### Provider nesting

```
RemindersProvider > TourProvider > SharedTextProvider
```

`SharedTextContext` reads settings through `useReminders()`. Reversing this
throws `"useReminders must be used within RemindersProvider"` at render time.
This has broken three separate test files.

### The three time fields

| Field | Never moved by |
| --- | --- |
| `recurrenceAnchor` | a snooze |
| `originalDatetime` | anything after the first snooze |
| `datetime` | — it is the one a snooze does move |

- Statistics bucket by `originalDatetime ?? datetime`. **Never by `datetime` alone.**
- Recurrence computes from `recurrenceAnchor`, fresh each time, with
  `computeNthOccurrence`. **Never chain from a previous candidate.**

### Statistics floors

`adherenceStats.ts` returns `null` rather than a number its sample cannot
support. The floors are `MIN_SCORED_FOR_RATE`, `MIN_SCORED_FOR_HOUR_ADVICE`
and `MIN_BUCKET_FOR_HOUR_ADVICE`. `adherenceCopy.ts` renders each `null` as an
em dash plus a sentence naming what is missing. Keep that pairing.

### RLS

A new table with **no `pgPolicy` has RLS off** and is open to every
authenticated caller, while looking ordinary in review. Two guards exist: a
test asserting `tablesWithoutRls()` is empty, and `privileges.sql` starting
from `revoke all`.

A table not re-exported from `lib/db/src/schema/index.ts` is absent from the
generated DDL, so it is untested **and** undeployed.

### `SECURITY DEFINER` functions

The most dangerous code in the repo. Rules:
- Take **no argument the caller could lie about**.
- Pin `search_path` **and** schema-qualify every name. The pin alone only
  turns a silent hijack into a crash.
- `revoke all ... from public, anon, authenticated`, naming every role.
  Revoking from `public` alone is **not enough on Supabase** — every project
  ships an `ALTER DEFAULT PRIVILEGES` granting `EXECUTE` to `anon` and
  `authenticated` directly.
- Keep an in-body auth check, with a test that actually reaches it.

The PGlite test harness cannot catch the default-privileges problem. Only
Supabase's own advisor can.

### Telemetry

- `AnalyticsProps` accepts primitives only. Passing a whole reminder fails to
  compile. That is the guard against leaking reminder content.
- `utils/analyticsProps.ts` is the only builder of reminder-shaped properties.
- `scrubEvent()` drops the user object and request bodies, and redacts
  Malayalam script and phone-number shapes.
- Event names live in one closed catalogue, `constants/analytics.ts`. A test
  fails the build if a catalogued event loses its last emitter.
- `nl_parse_result` fires at **save**, not at parse. The parser runs on every
  keystroke.

### Write serialization

`withWriteLock()` covers three writers only:
`rescheduleAllFutureReminders`, `markNotifiedById`, `markOpenedById`.
Widening it to the other writers is **unstarted, not done**. Do not assume it
is safe to add a concurrent writer.

## Where to look, by symptom

| Symptom | Look at |
| --- | --- |
| A date parses wrong | `utils/parseNaturalLanguage.ts`, then the branch it routes to |
| Malayalam renders as boxes | `utils/getFontFamily.ts` — it is not applied there |
| A notification did not fire | `ReminderService.scheduleNotification`, channels, exact-alarm permission |
| A tray action did nothing | `services/notificationResponseHandler.ts` |
| A series jumped to the wrong date | `advanceRecurringReminder`, and whether it read the anchor |
| A statistic shows an em dash | It is below the sample floor. That is correct. |
| "Not reachable" for a real user | B9 — region guessing in `utils/phoneNumber.ts`. Retry with a leading `+`. |
| A push never arrived | Expo's FCM credential in the expo.dev dashboard, not this repo's logs |
| The app sticks on the splash screen | `adb reverse tcp:3011 tcp:3011` |
| A Gradle error naming a plugin version like `26.0.2` | That is your JDK version. Fix `JAVA_HOME`. |
| `build.ninja still dirty after 100 tries` | Pin CMake in **both** gradle files. See page 05. |
| A test passes locally and fails elsewhere | A hardcoded date or a UTC assumption. See page 05. |

## Files to read before changing an area

| Area | Read first |
| --- | --- |
| Anything at all | [`CLAUDE.md`](../../CLAUDE.md) |
| A bug that smells familiar | [`system_learnings.md`](../../system_learnings.md) |
| Backend boundaries | [`docs/adr/0001`](../adr/0001-client-talks-to-edge-functions-not-postgrest.md) |
| Feature design reasoning | [`docs/roadmap.md`](../roadmap.md) |
| Security posture | [`threat_model.md`](../../threat_model.md) |
| Past specs and plans | `docs/superpowers/specs/`, `docs/superpowers/plans/` |

## When a feature lands

1. Delete its row from `backlog.md`.
2. Add an entry to `docs/shipped.md`, same commit, with a plain-language
   user-facing line.
3. Update `docs/features.md` if a capability changed.
4. Add device-only checks to the right file in `device-tests/`, same change.
5. Put any non-obvious lesson in `system_learnings.md`.
6. Update the matching page in `docs/knowledge/` if the architecture, a
   command, or a screen changed.
