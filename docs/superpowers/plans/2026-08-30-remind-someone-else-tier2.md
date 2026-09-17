# Remind Someone Else (Tier 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A reminder created for someone else fires on *their* phone. They accept it once, it becomes a real reminder in their own app, and the sender is told it landed.

**Architecture:** The server is a **store-and-forward mailbox, not a runtime**. The reminder is transferred at send time and scheduled locally by the recipient's own `expo-notifications`, so nothing fires from the server and the backend can be down without anyone missing a reminder. Identity separates *having an account* (a device key) from *binding a phone number* (what makes you discoverable); binding needs proof of number control.

**Tech Stack:** React Native / Expo, TypeScript, AsyncStorage, `expo-secure-store` (new), `supabase-js` (new), Supabase (Postgres + RLS + Edge Functions), Expo Push Service, Drizzle + drizzle-zod, Jest.

**Design spec:** [`docs/superpowers/specs/2026-08-30-remind-someone-else-tier2-design.md`](../specs/2026-08-30-remind-someone-else-tier2-design.md) — settled over eleven interview rounds, then revised after an adversarial review found three P0 defects. **Read the spec's "Known defects and resolutions" before starting.** Several obvious-looking simplifications in here are load-bearing security decisions.

**Backlog:** M4 Tier 2 (`backlog.md`).

**Status:** drafted 2026-08-30, not approved, not started.

---

## Context

This is the first backend this project has ever had. Verified again at drafting time:

- `artifacts/api-server` serves exactly one route, `GET /api/healthz`.
- `lib/db/src/schema/index.ts` defines **zero tables** — a commented template ending in `export {}`.
- `threat_model.md` states there is no implemented authentication boundary at all.

CLAUDE.md's warning is the right frame: **this is not "wiring up the existing API."** The scaffolding builds and typechecks, which makes it look like there is something to develop against. There is not.

Tier 1 shipped 2026-08-17 and was device-verified 2026-08-30 (D9). It is **not** superseded by this work — the spec leans on it in three places (bootstrap, fallback, recovery), and rung 1 of the verification ladder depends on it. Do not delete it.

## Two decisions this plan needs before Phase 0

**1. ~~How does the mobile app talk to the backend?~~ Settled 2026-08-30 — see [ADR 0001](../../adr/0001-client-talks-to-edge-functions-not-postgrest.md).** Edge Functions only; PostgREST is not exposed to the client. RLS on every table underneath as defence in depth. Functions act **as the calling user**, never as the service role, except the two operations that structurally cannot (claim and lookup). `artifacts/api-server` is deleted; the OpenAPI pipeline is kept for the Edge Function endpoints. The reasoning, kept because it will otherwise be re-litigated:

*Recommendation, to confirm before starting:* the mobile app uses **`supabase-js` directly** for auth and RLS-protected reads/writes, and **Edge Functions only for privileged operations** — number binding, OTP, hash lookup, and invitation claim. Those Edge Function endpoints are the only things worth describing in `openapi.yaml`.

The consequence is that **`artifacts/api-server` has no remaining purpose** and should be deleted rather than left as a decoy. That is a real call and should be made deliberately, not by drift.

**2. ~~There is no server-side test harness~~ — built 2026-08-30, and the approach changed.** The plan assumed a local Supabase stack via Docker and the Supabase CLI. It uses **PGlite** instead — real Postgres compiled to WASM, running in-process — so RLS tests run inside an ordinary `vitest run` with **no Docker daemon, no CLI, and nothing to start**. That matters beyond convenience: a harness needing infrastructure is a harness people skip, and this one is the gate on every security property in the design.

**The trap it is built to prevent:** a superuser bypasses RLS entirely, and PGlite's default connection is one. A harness that forgot to switch roles would report every policy as working while enforcing nothing — false confidence, which is worse than no tests. So `rlsHarness.ts` exposes no way to run a query as the superuser; everything goes through `asUser` or `asAnon`, identity is transaction-scoped so it cannot leak between queries, and one test asserts `current_user = 'authenticated'` against a table with RLS on and no policy. All three tests were verified to fail when the role switch is deliberately removed — so they have teeth rather than merely existing.

Edge Functions still need their own tests; that is not yet built.

## Scope

**In:** identity, number binding, discovery, invitations, accept/decline, transfer-and-fire-locally, status flow back, blocking, reschedule, cancel, link codes, account deletion.

**Out** (each deferred with a reason in the spec): E2E encryption, Truecaller verification, multiple numbers per account, recurring send-reminders (blocked on M2), Malayalam personality copy, iOS, M7's group UI. `invitations` is shaped for N recipients from day one; **no group UI is built.**

## The walking skeleton

**Phases 0–5 are the skeleton.** At the end of Phase 5 a reminder created on one phone fires on another. Everything from Phase 6 on could ship in a later release without the feature being incoherent.

Resist reordering to do the visible parts first. Phases 0–2 produce nothing a user can see and are where every security property lives.

---

## Phase 0 — Identity and authentication

The spec's build-order step 0. The first draft folded this into "schema" and understated a subsystem (Known defects #9).

| # | Task | Notes |
|---|---|---|
| T0.1 | **Server-side test harness** | **DONE 2026-08-30.** `lib/db/src/testing/rlsHarness.ts`, run by `pnpm --filter @workspace/db run test`. **No Docker, no Supabase CLI** — see below. Every later RLS task depends on it. |
| T0.2 | Device key generation + `expo-secure-store` | **DONE 2026-09-07.** `services/DeviceIdentityService.ts` — `getOrCreateDeviceKey()` generates a uuid via `expo-crypto` (local, no network) on first call, persists it with `expo-secure-store`, and is idempotent under concurrent callers. Tests simulate a restart (fresh module instances, same underlying storage) and a fresh install (empty storage) — see `DeviceIdentityService.test.ts`. Device-only follow-up tracked as D38 (`device-tests/remind-others.md`) since Jest's SecureStore mock can't prove the real native keystore persists/doesn't-persist the same way |
| T0.3 | Session handling in the mobile client | **DONE 2026-09-07.** `services/SessionService.ts` — the `supabase-js` client is constructed lazily and never at import time; `getCurrentSession()`/`hasSession()` only ever call `auth.getSession()` (local-storage read, no network for a user with no session); `ensureSession()` is the only function that can reach the network (`auth.signInAnonymously()`) and nothing calls it yet — it's meant to run at the moment binding actually begins, not at app launch. Concurrent `ensureSession()` callers share one in-flight sign-in rather than each minting a separate anonymous account. Tests mock `@supabase/supabase-js` per case and assert `signInAnonymously` is never called unless `ensureSession()` runs — see `SessionService.test.ts`. The device key (T0.2) is deliberately NOT threaded through this yet — see both files' headers |
| T0.4 | OTP provider account + send/verify wrapper | **Wrapper DONE 2026-09-08** as `artifacts/mobile/services/OtpService.ts` — `OtpProvider` interface (`send`/`verify`), swappable, plus `unconfiguredOtpProvider` which refuses every call. **Provider account NOT chosen** — confirmed MSG91 (the spec's ~₹0.15-0.20 pick) is not one of Supabase Auth's native providers (Twilio/MessageBird/Vonage/TextLocal only), so it needs the Edge Function fallback the spec already names. See ADR 0002 |
| T0.5 | Decision record for the two questions above | **DONE 2026-09-08** — [ADR 0002](../../adr/0002-phase-0-decision-record.md) closes this, pointing at ADR 0001 (question 1) and T0.1/PGlite (question 2), and records the T0.4 OTP-provider finding as a non-blocking follow-up before T2.3 |

## Phase 1 — Schema and RLS

| # | Task | Notes |
|---|---|---|
| T1.1 | Supabase project, `ap-south-1`, new (not `letsplan`) | **DONE 2026-09-07.** `remindme-tier2`, ref `zeeanhbvcjslzirftass`, `CuriosMind` org, free tier ($0/mo — confirmed before creating). `letsplan` (the existing project) was left alone: it is `INACTIVE` — auto-paused from disuse, precisely the failure mode this row warns about. **Pro from the first real user**, same reasoning. See "Supabase project reference" below for URL/keys and what's still needed from a human |
| T1.2 | `users` table + `insertUserSchema` | **DONE.** Adds `accepting_reminders` (the global mute, deliberately not the same switch as `discoverable`) and `last_active_at` (what the 45-day rebind window is measured from) |
| T1.3 | `devices` table | **DONE.** `expo_push_token` is `UNIQUE` across all accounts — one handset, one home, so "forgot to clear the old row" is an error rather than a phone quietly receiving two people's reminders |
| T1.4 | `blocks` table | **DONE.** Composite PK; unblock is a `DELETE`. Every policy keys on `blocker_id` and none on `blocked_id` — being on a list grants no sight of it |
| T1.5 | `invitations` table | **DONE.** `recipient_phone_hash` is not a foreign key, and is indexed because the claim lookup is the one query every new registration runs. Carries `content_expires_at` = `least(datetime, created_at + 30 days)` as a column, so the 30-day cap is structural rather than a predicate a cleanup job has to compute correctly |
| T1.6 | `link_codes` table | **DONE.** Short-lived, single-use |
| T1.7 | RLS policies on every table | **DONE.** 41 tests. Plus two things the task did not anticipate — see below |
| T1.8 | **`SECURITY DEFINER` claim function** | **DONE.** 13 tests, every guard sabotage-checked. The load-bearing decision: **it takes no argument** — it reads the caller's own `users.phone_hash`, which only the verified bind can write. A hash parameter would reinstate Known defects #1 wholesale *and* make the function an enumeration oracle for every number in India. See below for what the sabotage pass found |
| T1.10 | **Bind must purge unclaimed invitations on a fresh account** | **NOT DONE — carried into Phase 2.** Found while building T1.8. An unclaimed invitation has a null `recipient_id`, so it does **not** cascade when the account for that number is deleted. A recycled number's new owner could otherwise claim mail addressed to their predecessor. `claim_invitations()` now refuses rows whose content has already been purged, which covers the realistic case (recycling takes 45+ days, content is gone by 30) — but the complete fix is deleting unclaimed rows for a hash when a **fresh** account binds it |
| T1.9 | `drizzle-kit push` wired and documented | **DONE 2026-09-08 (second time — see history below).** Marked done 2026-09-07, reopened same-week when every RLS policy on the live project was found deployed with `USING (true)` despite `push`/`push:sql` reporting clean. Closed for real by `lib/db/src/verifyRls.ts` — an executable check (`pg_policy` joined to `pg_class`, per-command nullness, expression text, `polcmd`/`polpermissive`/`polroles`, all pinned by unit tests in `verifyRls.normalize.test.ts` and a live run against `remindme-tier2`) wired as `pnpm --filter @workspace/db run verify:rls`, chained into a new `deploy` script (`push` → `push:sql` → `verify:rls`, stopping at first failure). **`push`/`push:sql` must never be run bare again — always `deploy`.** **Root cause of the original corruption is still NOT established** (see bug #3 below) — this closes T1.9 by making the failure mode structurally unable to ship silently again, not by explaining why it happened once. See `system_learnings.md`'s 2026-09-08 entries. |

### Two things Phase 1 turned up that the plan did not have

**1. RLS is row-level, and two of the sharpest rules here are column-shaped.**
Whoever can write `users.phone_hash` owns that phone number, whichever row they
are allowed to write — which is Known defects #1 arriving through a second
door. No policy can express that, so table and column privileges live in
`lib/db/src/schema/privileges.sql` and are applied by
`pnpm --filter @workspace/db run push:privileges`. **`drizzle-kit push` does not
manage grants**, so this is a second deploy step, not an optional one.

**2. Clients get almost no write access at all, which moves work into Phase 3.**
The design already said sending must consult a block list the sender cannot
read, and that transitions are asymmetric — the sender may only cancel, the
recipient may reschedule. Enforcing the asymmetry means comparing the old row
to the new one, which RLS cannot see. Rather than grant writes and police them
with a trigger, `invitations` is **read-only to clients**: every mutation is a
server function. Same for creating a `users` row, minting a `link_code`, and
binding a number.

So Phase 3 needs more Edge Functions than the task list implies — send, accept,
decline, reschedule, cancel, complete — and each is the enforcement point for
the rules on that transition. This is the correct trade (one place to get
right, and RLS is default-deny behind it), but it is more surface than the plan
costed, and each function is where a rule can be forgotten.

### T2.4/T2.5 — an independent review found two real bugs in the first version

The first `bind_via_invite_token()` passed 11 sabotage-checked tests and was
committed and pushed. It was then reviewed independently (a fresh model, told
to be adversarial, not to trust the tests just because they were green) —
which is what caught what sabotage-checking my own tests could not, since
sabotage only proves a test bites the thing it was written to check. It found:

**1. "Single-use" was not actually implemented.** It was *inferred*: the
function checked whether some `users` row already held the invitation's
phone hash, and refused if a different account did. That proxy is only as
durable as the account — and accounts are user-deletable (a Play Store
requirement), while binding doesn't also claim, so the invitation's
`recipient_id` stays null and the row never cascades on that delete. Reviewer
confirmed by running it: bind, delete the account, then bind again from a
different caller — **succeeds**, handing the deleted user's phone identity to
a stranger. Fixed by giving the invitation its own `bound_by`/`bound_at`,
which is a fact about the token and outlives whatever happens to the account
it created.

**2. There was no atomicity, and a comment claimed a mechanism that wasn't
there.** The original was a `SELECT` into a variable, branching logic, then a
plain `INSERT` — no lock across the read and the write. Two concurrent calls
with the same token can both pass every check before either commits, and only
`users_phone_hash_unique` catches the collision — with the wrong error
message leaking a raw constraint name. A comment even said "same caller,
`ON CONFLICT` below handles it," describing something the function never had.
PGlite runs one transaction at a time, so no test in this suite could ever
have caught this — it had to be reasoned about from Postgres MVCC semantics,
which is exactly the kind of check a from-scratch adversarial read does and a
green test suite cannot. Fixed by making the claim a single atomic `UPDATE`
whose `WHERE` clause folds in every security-relevant condition, so the row
lock it takes is what serializes concurrent callers.

**A third finding was a test that didn't test what it claimed.** The
search_path hijack test planted an *empty* attacker table — a hijacked read
and a correct read both come back with nothing distinguishing them, so the
test passed whether or not the qualification was doing anything. Sabotaging
the real function via this session's own process still passed it, which is
what exposed it. Fixed by planting a row that would answer *differently* if
read: same `bind_token`, a different phone hash. Re-sabotaging now fails it,
as it should have from the start.

**Lesson for this codebase, not just this function:** sabotage-checking a
test only proves the test detects the thing it was written to check. It
cannot catch a bug the author didn't think to write a test for, and it is
exactly as blind as the author to a race condition that a serial test harness
structurally cannot express. Both are worth an independent, adversarial read
before trusting `SECURITY DEFINER` code — this is now the second function in
a row where that step found something the sabotage pass missed.

### T2.4/T2.5 — what building the bind function found

`bind_via_invite_token()` is the same risk class as T1.8's claim function
(reads a row nobody's RLS policy protects, must be `SECURITY DEFINER`), and
was built with the same discipline: 11 tests, every guard sabotage-checked
before trusting it.

**One design question the tests forced an answer to.** Should a second,
different account be able to consume a token someone else already bound? No —
that is a takeover, not a re-tap, and re-verifying a lost device already has
its own path (rung 2, OTP; "there is no invite link on a migration" per the
spec). The function refuses with the same error whether the token is spent by
someone else or the caller already holds a *different* number — one check,
two attacks, deliberately: a second account grabbing a spent token and an
established account's number being silently reassigned by a link it didn't
ask for are the same shape of bug from the database's point of view.

**Scope was kept deliberately narrow**: this function binds identity and
nothing else. It does not also run `claim_invitations()`. Folding the two
together would have been more convenient for a client to call once, but it
would also mean "prove who I am" and "collect my mail" fail or succeed
together, when they are genuinely separate operations with separate failure
modes worth being able to reason about independently.

### What the T1.8 sabotage pass found

Every guard in the claim function was removed in turn to check its test fails
*for the right reason*. Two did not:

**1. The pinned `search_path` alone proves nothing.** Removing it broke no
test, because every name in the function is schema-qualified. The two defences
turn out to do different jobs: dropping `public.` while keeping the pin makes
the function unable to resolve its tables at all (nine tests fail loudly),
while dropping **both** makes it silently read a table the caller planted —
and only the one hijack test catches that. So the pin converts a silent
compromise into a crash; qualification is what makes it correct. Both stay,
and the test comment now says which is which.

**2. The in-body "not authenticated" check was unreachable.** `anon` has no
`EXECUTE`, so the grant layer refuses first and the check could be deleted
with nothing failing — a guard quietly rotting into a comment. Now covered by
a test that grants `EXECUTE` to `anon` and proves the body still refuses. That
is not hypothetical: a SECURITY DEFINER function called from a cron job or
another function has no JWT either, so `auth.uid()` is null.

A third thing surfaced rather than failed: **the global mute has to apply to
mail that arrived before the switch was flipped**, or "don't let anyone remind
me" reads as broken the moment it is turned on. Folded into the same lookup
that fetches the caller's hash; those rows are left to expire.

### Also landed

- **`schemaDdl`** — RLS tests generate their DDL from the Drizzle schema, so a
  test cannot pass against a hand-copied fixture the schema has since outgrown.
- **One manifest for server SQL.** `drizzle-kit push` manages neither
  functions nor grants, so both are applied by
  `pnpm --filter @workspace/db run push:sql` — a **required second deploy
  step**. `functions/manifest.json` is read by the test harness and the deploy
  script alike, with a test asserting it lists every `.sql` file present, so
  the two cannot drift into testing one thing and shipping another.
- **A structural guard.** Drizzle enables RLS only on a table that declares a
  policy, so a new table with none is wide open and looks entirely ordinary in
  review. `tablesWithoutRls()` must be empty, and a second test pins the exact
  table list — a table file never re-exported from `schema/index.ts` is absent
  from the DDL, so its policies would go untested *and* unpushed while every
  other test still passed.
- **`auth.uid()` returns `uuid` in the shim**, as it does on Supabase. A
  text-returning shim would let `id = auth.uid()` pass locally and fail on
  deploy.
- **Snapshot-backed test databases.** Each test still gets its own Postgres;
  the prepared schema is dumped once per run and reloaded, 2.5s → 0.6s each.
  A security suite slow enough to irritate is one that stops being run.
- **Every new test was sabotage-checked.** Removing a protection must make its
  test fail *for the right reason*. This caught a weak one: the phone-rebind
  test originally aimed at an existing user's hash, so it passed on the unique
  index whether the privilege held or not — and squatting an *unregistered*
  number is the actual attack.

### Supabase project reference

- **Project:** `remindme-tier2` (ref `zeeanhbvcjslzirftass`), `ap-south-1`, org `CuriosMind`, free tier.
- **URL:** `https://zeeanhbvcjslzirftass.supabase.co`
- **Publishable (anon) key:** `sb_publishable_ZKMC7VDK6_xnFoppRd7ViQ_7JyujWL_` — safe to embed client-side, this is what the mobile app's `supabase-js` client will use (T0.3).
- **Service-role key and DB password were NOT fetched or stored anywhere in this repo.** Both are secrets; the service-role key bypasses RLS entirely (see ADR 0001's warning) and has no business existing outside Supabase's own dashboard and whatever secret store the eventual Edge Functions use.

**What only a human can do next, to unblock T1.9:**
1. Dashboard → this project → Project Settings → Database → copy the connection string (or reset the password if it was never saved — it is not retrievable after creation, only resettable).
2. Set it as `DATABASE_URL` in the shell running the deploy commands.
3. Run, every time the schema or server SQL changes:
   ```
   pnpm --filter @workspace/db run deploy
   ```
   This chains `push` → `push:sql` → `verify:rls`, in that order, and **stops at the first failure** rather than reporting partial success as done. `push:sql` is not optional — it applies `claim_invitations()`, `bind_via_invite_token()`, and every table/column grant in `privileges.sql`; skipping it leaves RLS enabled with no policies actually applying the way the tests assume, since `push` alone does not carry functions or grants. `verify:rls` exists **because `push` alone is not proven to reliably carry policy *expressions* either** — see the 2026-09-08 finding below and in `system_learnings.md`: every policy on this project was once deployed with `USING (true)` while every other check stayed green. Do not run `push`/`push:sql` directly and skip `verify:rls` — that is exactly the sequence that shipped the bug undetected the first time.
4. Confirm with `pnpm --filter @workspace/db run test` pointed at nothing (that suite is PGlite-only and untouched by this) — the real confirmation is `deploy`'s own `verify:rls` step passing, plus `mcp__Supabase__list_tables`/`get_advisors` or the dashboard's Table Editor as a secondary sanity check (not sufficient alone — see below for why).

### T1.9 — two bugs found deploying against a real Supabase project

Both `push` and `push:sql` succeeded against `remindme-tier2` on 2026-09-07, but getting there, and verifying afterwards, found two real bugs neither the PGlite suite nor Windows-side testing had ever exercised:

1. **`drizzle-kit push` silently found zero schema files on Windows.** `drizzle.config.ts` built the schema path with `path.join(__dirname, ...)`, which produces backslashes on Windows. `drizzle-kit` resolves `schema` as a **glob pattern** internally, and glob syntax treats a backslash as an escape character — so the glob matched nothing and `push` failed with `No schema files found for path config [...]`. Worked every time in this sandbox (Linux) and would have worked on Mac too; only surfaced once a human ran it on their actual Windows machine. Fixed by building the path with forward slashes explicitly (`path.posix.join` over a slash-normalized `__dirname`) rather than `path.join`/`path.sep`.

2. **`anon` had `EXECUTE` on both `SECURITY DEFINER` functions despite `revoke all ... from public`.** Caught by `mcp__Supabase__get_advisors` right after the first successful `push:sql`, and confirmed directly with `has_function_privilege()`. Root cause: Supabase provisions every new project with an `ALTER DEFAULT PRIVILEGES IN SCHEMA public ... GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role` (visible in `pg_default_acl` for both the `postgres` and `supabase_admin` roles) — a grant made **directly to those roles**, independent of the `PUBLIC` pseudo-role. `revoke all on function ... from public` only strips what was granted to `PUBLIC`; it does nothing to a role's own explicit privilege record, so on Supabase specifically it leaves `anon` fully able to call the function. Both functions' in-body `auth.uid() is null` check was the only thing actually stopping an anonymous caller — exactly the single point of failure CLAUDE.md's `SECURITY DEFINER` rules warn could "rot into a comment," except here it had never been anything *but* that; the grant-level backstop it was meant to back up was never real on this platform. Fixed by naming `anon` and `authenticated` explicitly in the revoke (`revoke all on function ... from public, anon, authenticated`), matching the pattern `privileges.sql` already used for table grants (`revoke all on all tables in schema public from authenticated, anon`) — which is why the table side was never exposed to this bug and only the two function files were. Applied immediately via `mcp__Supabase__execute_sql` against the live project (closing the live window before the next `push:sql`), then committed to `bindViaInviteToken.sql`/`claimInvitations.sql` so the next deploy reapplies the same thing idempotently. Re-ran `get_advisors` afterward: clean except the two expected `authenticated_security_definer_function_executable` WARNs, which are correct — signed-in users are supposed to call these.

**Structural lesson, same shape as the T2.4/T2.5 one**: the PGlite test harness cannot catch bug #2 by construction — it runs vanilla Postgres with no Supabase-provisioned default privileges, so `anon` never has implicit `EXECUTE` there regardless of whether the revoke names roles correctly. A green PGlite suite is not evidence this class of privilege bug is absent; only a real Supabase project's own advisor (`mcp__Supabase__get_advisors`) can catch it, which is why **`get_advisors` should run once against the real project after every `push:sql`, not only at initial setup** — added to this checklist as step 5 below.

5. After `push:sql`, always run `mcp__Supabase__get_advisors` (type `security`) against the project and treat any `anon_security_definer_function_executable` finding as a real bug, not a false positive — verify with `has_function_privilege('anon', ...)` directly if in doubt.

**3. Every RLS policy on the live project had a NULL qualifier — `USING (true)`, enforcing nothing — and this stayed hidden until 2026-09-08. Root cause is NOT established, despite an earlier draft of this paragraph claiming it was.** Found by an adversarial review pass a day after T1.9 was first marked done, then independently confirmed by directly querying `pg_policy`, and confirmed a second time by a further review that also proved enforcement empirically (impersonated `authenticated` callers via forged JWT claims; reads/writes across accounts were genuinely blocked post-fix). All 13 policies across all five tables had `polqual`/`polwithcheck` = `NULL` — a NULL qualifier is unconditionally permissive, not "no policy" (which would default-deny). `rls_enabled` was `true` on every table and `get_advisors` showed nothing but the two expected `authenticated_security_definer_function_executable` WARNs throughout — **neither of the two checks step 4/5 above rely on can see this bug class at all.** Concretely, before the fix, any `authenticated` caller could `select * from invitations` and read every `bind_token` — the exact unguessable credential rung 1's single-use guarantee depends on nobody but the invited recipient possessing — reinstating Known defect #1 (number takeover) through neither verification rung; `devices_insert_own`/`devices_update_own` being unenforced also meant any caller could hijack another account's push token. Tables were empty (0 rows) when found, so nothing was actually exposed. Fixed by regenerating each policy's clause from the schema source and applying via `ALTER POLICY ... USING (...) WITH CHECK (...)` directly against the live project, then re-verified via `pg_policy` plus the impersonation probe.

**What this paragraph originally claimed and had to retract**: that this was "a documented, currently-open `drizzle-kit push` limitation," citing an upstream GitHub issue. A follow-up review tried to reproduce that specific mechanism against the installed `drizzle-kit` version by driving its diff engine directly (`generateMigration`, the same one `push` uses) and **could not** — simulating "remote already has these policies with weakened `true` qualifiers" as the *before* state produced correct `ALTER POLICY` statements in the repro, contradicting the blamed mechanism. A hand-run `CREATE POLICY` with no `USING` clause produces an identical live end state and cannot be excluded; `list_migrations` returns empty, so there is no provenance trail implicating or exonerating anything. **Do not repeat "known drizzle-kit bug" as fact** until the decisive test runs: push a throwaway/local project twice and see whether the same corruption reproduces in the actual `push` binary, not just its diff generator.

**New standing rule, extending step 5 — and now per-command, not blanket "non-null":** after any `push` that touches an existing table's policies, directly query `pg_policy` joined to `pg_class` (to also assert `relrowsecurity = true` — a correct expression on a table where RLS itself got disabled enforces nothing) for every affected table. Check **`polqual` non-null for SELECT/UPDATE/DELETE, `polwithcheck` non-null for INSERT/UPDATE** — a blanket "every expression non-null" check false-positives on INSERT-only policies like `blocks_insert_own`, which legitimately have `polqual = NULL` — and compare expression *text*, not just non-nullness, against the schema source. `rls_enabled` and `get_advisors` both looked clean the entire time this bug was live. **This belongs in an executable script gating `push`/`push:sql`, not a step recorded only in this markdown file** — that documentary control already existed (steps 4/5) and didn't catch this.

## Phase 2 — Number binding and the verification ladder

| # | Task | Notes |
|---|---|---|
| T2.1 | Server-side HMAC of E.164 numbers, pepper in secrets | Plaintext transits, is **never stored**. Pepper never reaches the client |
| T2.2 | Cross-device normalization agreement tests | **DONE** (2026-08-30, `phoneNumber.test.ts`'s `normalizeForIdentity` block) — an NRI sender (device region `US`) and the recipient's own `IN` phone are asserted to resolve `+91 98765 43210` to the identical `+919876543210`, and every ambiguous/unresolvable path is pinned separately. `utils/phoneNumber.ts` is load-bearing for **correctness**, not display — a hash only matches if both devices normalize identically |
| T2.3 | Rung 2: OTP binding flow | The screen, the send, the verify, the rate limit on attempts |
| T2.4 | Rung 1: bind via invite-link token | **DONE at the DB layer** as `bind_via_invite_token()`, 18 tests, sabotage-checked and independently reviewed (see below — that review found two real bugs in the first version, now fixed). Adds `invitations.bind_token` (uuid, unique, unguessable) plus `bound_by`/`bound_at` on the same table. **Deliberately narrow**: it only binds identity, and does not also claim mail — the caller calls `claim_invitations()` separately. The "no verification screen shown" assertion (Known defects #8) is a client/UI property and stays `BLOCKED` — see D34 |
| T2.5 | Single-use token semantics | **DONE, on the second attempt.** The first version inferred "spent" from `users.phone_hash` being unique — a proxy that dies with the account (see below). Fixed by giving the invitation its own durable `bound_by`/`bound_at`, set by a single atomic `UPDATE` rather than a select-then-branch, which is also what makes two concurrent claims of the same token serialize instead of racing. **"Consumed on claim, not `GET`" is still NOT this function's job** — that is a property of the HTTP endpoint WhatsApp's link-preview crawler fetches, which does not exist until Edge Functions do. `BLOCKED` on T1.1/T1.9 |
| T2.6 | Rebind on re-verification, 45-day window | Inside 45 days recovers blocks and links; past it, a fresh account and the old row deleted. **Deleting state applies only to the fresh-account path** |
| T2.7 | Token revocation + "recovered on a new device" notice | On **every** rebind to a new device key, regardless of window |
| T2.8 | Three separate settings | Account existence / discoverable / accepting-reminders. Mute **keeps** the row, blocks and links (Known defects #7) |
| T2.9 | Onboarding prompt in `app/_layout.tsx` | Decline writes **nothing to the server**; remembered locally so it can be re-offered once later |

## Phase 3 — Lookup

| # | Task | Notes |
|---|---|---|
| T3.1 | Lookup Edge Function | Returns a boolean plus an opaque user id. Never returns anything else about the user |
| T3.2 | Multi-dimensional rate limiting | Per account, **per device, per IP, and globally**, plus a daily ceiling. Per-account alone is bypassed by making more accounts (Known defects #5) |
| T3.3 | High-volume lookup logging | The enumeration alarm |
| T3.4 | Contact-picker integration | Reuses Tier 1's picker. **Resist bulk-checking the whole address book** |
| T3.5 | Reachability cache on `ReminderRecipient` | `appUserId` + `lookedUpAt`, short TTL, re-checked at send. **Derived, never stored as a durable fact** — persisting `hasApp: false` is the bug that makes the feature look permanently broken the day someone installs |

## Phase 4 — Invitation send and claim

| # | Task | Notes |
|---|---|---|
| T4.1 | Create invitation on send | Content stored plainly; `expiresAt` = the reminder's datetime |
| T4.2 | Absolute 30-day retention cap | Independent of datetime. Without it a far-future reminder holds content for months (Known defects #6) |
| T4.3 | Expo push delivery + receipt handling | Free, 600/sec. Needs FCM v1 credentials regardless of backend choice |
| T4.4 | Self-claiming registration | On binding, collect every pending invitation matching the hash. **This is why no deferred deep linking is needed** |
| T4.5 | First-contact invitation UI | Sender name, time, and the reminder text. **Block is one tap from this screen** (Known defects #4) |
| T4.6 | First-contact rate limiting | Per sender |

## Phase 5 — Accept and schedule locally

**The feature does its job here. Everything before this is plumbing.**

| # | Task | Notes |
|---|---|---|
| T5.1 | Accept → create a local `Reminder` | Reuses the existing scheduling path wholesale — that is the entire payoff of the mailbox architecture |
| T5.2 | Content nulled on accept; row survives | Status and timestamps retained so "it never arrived" stays debuggable (Known defects #11) |
| T5.3 | Decline = "not this one" | **Never overload decline with "never again"** — that is what blocking is for |
| T5.4 | Expiry at the reminder's datetime, sender told | "I sent it and assumed it landed" is the failure this whole tier exists to remove |

> **At this point, stop and run D28, D29 and D34.** D29 in particular — an accepted reminder firing correctly in aeroplane mode after a reboot — is the claim that justifies the entire architecture. If it fails, the mailbox design bought nothing and the shape is wrong. Finding that out here is cheap; finding it out after Phase 10 is not.

## Phase 6 — Status flow back and UI

| # | Task | Notes |
|---|---|---|
| T6.1 | `deliveryStatus` on `Reminder`, optional | `invited` → `accepted`/`declined`/`blocked`/`expired`, then `rescheduled`/`done`; `cancelled` terminal from any pre-terminal state |
| T6.2 | No queued-vs-delivered distinction | Unactionable, unexplainable, and invites "Delivered ✓✓" misreading |
| T6.3 | "Reminders for others" section, renamed from "Sending" | Now accurate — the recipient's phone genuinely rings |
| T6.4 | Split into "Waiting" and "Scheduled with them" | **Status is position, not a chip.** The sender's question is binary; position answers it without reading every row |
| T6.5 | Tier 1 rows coexist in the same section | Heading must stay honest for both |
| T6.6 | Malayalam for functional strings | Accept, Decline, Blocked, Waiting, Reminders for others, Let people remind you. **Personality strings wait for a native speaker** |

## Phase 7 — Blocking

| # | Task | Notes |
|---|---|---|
| T7.1 | Block / unblock, **server-enforced** | Verify from the **sender's app**, never by reading the DB. A block only the UI honours is not a block |
| T7.2 | Honest block message to the sender | "Amma isn't accepting reminders from you." Silent blocking was rejected: it makes the sender believe reminders are landing, and that is a broken reminder |
| T7.3 | Unblock re-delivers **nothing** | Anything sent during the block stays undelivered forever. No "you've been unblocked" push |
| T7.4 | Block confirmation copy states its limit | It cannot stop the sender opening WhatsApp — Tier 1 runs on the sender's own phone (Known defects #10). Same class as backlog item 20 |

## Phase 8 — Reschedule and cancel

| # | Task | Notes |
|---|---|---|
| T8.1 | Recipient reschedules; sender's copy moves | Original preserved for display — the `originalDatetime` precedent |
| T8.2 | Snoozes are **never** reported to the sender | The line between caregiving and surveillance. `snoozeCount` exists to help its owner, not to report them |
| T8.3 | Cancel: fire-first, check-in-parallel | The alarm is **never blocked on the network**. Dismiss the notification if cancelled. A blocking check inside `ALARM_EARLY_OFFSET_MS` would trade away what backlog items 19–23 bought |
| T8.4 | Honest cancel copy | "Cancel wins whenever it reaches the device. While the recipient is offline it is best-effort, and a cancelled reminder may still fire" (Known defects #2) |
| T8.5 | Concurrent edit: cancel wins, recipient told | **Order by server receive-time, never device timestamp** — two phones, and a skewed clock must not decide |

## Phase 9 — Link codes

| # | Task | Notes |
|---|---|---|
| T9.1 | Generate / redeem short single-use codes | The dual-SIM repair path. Links the pair by internal user id; the phone number stops mattering for them |
| T9.2 | Keep it a repair tool, not a primary path | Its awkwardness must land only on the minority who need it |

## Phase 10 — Deletion and compliance

| # | Task | Notes |
|---|---|---|
| T10.1 | In-app account deletion | Cascades — **except** reminders already transferred and armed on other people's devices, which **survive**. They are the recipient's reminders now; that is what transfer means |
| T10.2 | Public web deletion page + Edge Function | **A Play Store requirement**, enforced since April 2024, for any app allowing in-app account creation. There is no website today |
| T10.3 | Privacy policy | Phone numbers **in transit**, reminder content at rest, the retention window, and what survives deletion |
| T10.4 | Play Data Safety form | Must match T10.3 exactly |

---

## Verification

**Mobile Jest** (`npx jest` from `artifacts/mobile`) — 843 passing as of T0.2/T0.3 landing (2026-09-07); all must stay green. Covers the client: normalization agreement, status transitions, reachability caching, UI sections, copy, and now device-key/session handling.

**Server tests** — `pnpm --filter @workspace/db run test` (vitest + PGlite). RLS policies, the claim function, rate limiting. **This repo had never had these.** An untested RLS policy fails the way an untested alarm fails: silently, and only in production.

**Typecheck** — `pnpm run typecheck` from root.

**Device — Jest cannot see any of this.** D27–D37 in [`device-tests/remind-others.md`](../../../device-tests/remind-others.md), all `BLOCKED` until the backend exists. **Six need two handsets with two numbers**, which is a setup cost to plan for, not discover. D32 needs two people.

Highest-value early runs: **D34** (rung 1 shows no verification screen), **D35** (the WhatsApp link-preview token burn), **D29** (offline firing after reboot).

## Before Phase 0 — two cheap things worth more than they cost

1. **Run D1.** Android Auto Backup restoring reminders after a phone migration. `PENDING`, cheap, and now relevant to two features.
2. **Test onboarding with one real target user.** The cheapest suggestion in the adversarial review. Rung 1 is a *theory* that an older parent goes from WhatsApp message to bound account without friction. Watching one person do it would confirm or destroy that in twenty minutes, before any of this is built.

## What changed on `main` while this was being built (merged 2026-09-07)

Eighteen commits landed on `main` between the spec being written and Phase 1
finishing. Four of them touch this design.

**1. Punctuality and sound are now separate settings, and the spec answers
neither for a transferred reminder.** `88b60f4` added `exactTiming` (default
ON) alongside `alarm`, because ColorOS/OxygenOS was silently demoting
`setExactAndAllowWhileIdle()` to an inexact alarm — a silent reminder arrived
up to 20 minutes late with no error anywhere. Non-alarm reminders now route
through `setAlarmClock()` too. `Reminder` therefore carries **two**
independent flags, and an accepted Tier 2 reminder is a local record on the
recipient's device that needs both.

**Decision: the recipient's own defaults apply, and the sender cannot set
either flag.** This follows directly from the design's existing principle
that *nobody can silently alter another person's device*. A sender who could
force `alarm: true` could make a stranger's phone play an alarm tone at 6am,
which is the same hole accept-first exists to close. `RemindersContext`
already reads `getDefaultAlarmEnabled()`/`getDefaultExactTimingEnabled()` at
creation, so the accept path gets this by doing nothing special — but only if
nobody "helpfully" threads the sender's flags through the invitation. **The
invitation schema deliberately carries neither**, and should not gain them.

Second-order: every accepted reminder now claims the system's
next-alarm-clock display slot (that is the trade `88b60f4` documents). A
recipient with several accepted reminders has more contention for that slot
than a Tier 1 user ever did. Not a blocker; worth watching in D29.

**2. The home section shipped as "Remind Someone", not "Reminders for
others".** The spec's UI section says Tier 1's section is renamed to
"Reminders for others" at Tier 2. `ad4ac84` shipped it as **"Remind
Someone"**. The rename is still right for the reason the spec gives — at
Tier 2 the recipient's phone genuinely does ring — but it is now a *rename of
shipped copy*, not a naming decision, and the strings live in
`app/(tabs)/index.tsx`.

**3. Settings has a real section structure now**, also from `ad4ac84`: "You",
"When reminders go off", "What notifications show", "Voice input", then
ungrouped rows. Tier 2's settings — "Let people remind you", discoverability,
the blocked list, account deletion — need a home. **Put them under "You"**,
which is where identity already lives; a separate "People" section would
split account settings across two places.

**4. There is a device-test harness now.** `951ab66` added Maestro flows, a
`device-test` skill, and split `device-tests.md` into `device-tests/`. Two
consequences: the Tier 2 checks moved to
[`device-tests/remind-others.md`](../../../device-tests/remind-others.md) and
were **renumbered D25-D35 → D27-D37** (main had taken D24-D26 for other
things), and several of them are more automatable than "two handsets" implied
— the setup halves at least. Also note `clearState: true` and `pm clear` both
fail on the test device with a `CLEAR_APP_USER_DATA` permission error, so no
Tier 2 flow can assume a clean install.

**Not affecting this plan, but worth knowing:** `app/backup.tsx` now exists,
which gives T10.1 (in-app account deletion) somewhere obvious to live; the
mobile suite is at **830** tests, not the 567 quoted in the Verification
section below.

---

## Risks

1. **The identity model was wrong once already.** The first draft allowed permanent number squatting. The verification ladder fixes it, but T1.8 (the `SECURITY DEFINER` claim function) is where that fix lives or dies. Review it adversarially, not as ordinary code.
2. **No server-side testing culture exists here.** T0.1 is the mitigation and shipped first for that reason. The remaining risk is narrower but real: the harness exists, so every Phase 1 table task now has no excuse for landing without a test proving the wrong caller is refused. A table shipping without one is the single most likely way this ends up with an RLS hole.
3. **Cancel is not absolute and the copy must never say it is.** Backlog item 20 is a whole item about a label that promised more than the system delivered. Do not repeat it.
4. **The two-way sync is untested by anyone.** The adversarial review never attacked it. Read that silence as untested, not as approved.
5. **Operational commitment with no end date** — uptime, FCM rotation, backups, $25/month, for a free app with no monetisation. Most likely failure mode in year two.
6. **Tier 1 will look deletable.** It is load-bearing three times over. The plan and spec both say so; a future reader will still be tempted.
7. **45 days may prove too aggressive.** A user away seven weeks loses links and blocks. The escape hatch is a recovery PIN, which slots in without changing the model.
8. **Phases 0–2 produce nothing visible.** The temptation to reorder toward demoable work is real, and every security property in the design lives in those phases.
