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
| T0.2 | Device key generation + `expo-secure-store` | Key generated once, never leaves the device. Assert it survives app restart and is absent on a fresh install |
| T0.3 | Session handling in the mobile client | Anonymous-by-default; a session exists only after binding. A user who never binds must make **zero** network calls — assert this |
| T0.4 | OTP provider account + send/verify wrapper | Behind an interface so the provider is swappable. Check whether the chosen Indian provider is natively supported by Supabase Auth; if not, this lives in an Edge Function |
| T0.5 | Decision record for the two questions above | Committed to the plan or an ADR before Phase 1 |

## Phase 1 — Schema and RLS

| # | Task | Notes |
|---|---|---|
| T1.1 | Supabase project, `ap-south-1`, new (not `letsplan`) | Free tier for development. **Pro from the first real user** — a paused project silently drops invitations |
| T1.2 | `users` table + `insertUserSchema` | Follows the `lib/db/src/schema/` convention: table, drizzle-zod schema, `InsertX`/`X` types |
| T1.3 | `devices` table | One user, many devices. `expoPushToken`, `platform`, `lastSeenAt` |
| T1.4 | `blocks` table | Composite PK. **Unblock is a `DELETE`** — that is why it is rows, not a flag |
| T1.5 | `invitations` table | `recipientPhoneHash` is deliberately **not** a foreign key — that is what lets an invitation address someone who does not exist yet |
| T1.6 | `link_codes` table | Short-lived, single-use |
| T1.7 | RLS policies on every table | Each with a test proving a non-owner is refused. This is what T0.1 was for |
| T1.8 | **`SECURITY DEFINER` claim function** | **Highest-risk code in the build.** Ordinary RLS cannot protect it — it reads rows nobody owns yet. It is the function Known defects #1 abused. Test it adversarially: wrong hash, replayed token, concurrent claims |
| T1.9 | `drizzle-kit push` wired and documented | `pnpm --filter @workspace/db run push` against the new `DATABASE_URL` |

## Phase 2 — Number binding and the verification ladder

| # | Task | Notes |
|---|---|---|
| T2.1 | Server-side HMAC of E.164 numbers, pepper in secrets | Plaintext transits, is **never stored**. Pepper never reaches the client |
| T2.2 | Cross-device normalization agreement tests | `utils/phoneNumber.ts` is now load-bearing for **correctness**, not display — a hash only matches if both devices normalize identically |
| T2.3 | Rung 2: OTP binding flow | The screen, the send, the verify, the rate limit on attempts |
| T2.4 | Rung 1: bind via invite-link token | **The point of the whole ladder.** Assert **no verification screen is shown** on this path — that is the older-parent case and it is the resolution to Known defects #8 |
| T2.5 | Single-use token semantics | Three tests, one per trap: consumed on **claim, not `GET`** (the WhatsApp link-preview burn); a **second tap from the same device is idempotent**; a third device is **refused** |
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

> **At this point, stop and run D26, D27 and D32.** D27 in particular — an accepted reminder firing correctly in aeroplane mode after a reboot — is the claim that justifies the entire architecture. If it fails, the mailbox design bought nothing and the shape is wrong. Finding that out here is cheap; finding it out after Phase 10 is not.

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

**Mobile Jest** (`npx jest` from `artifacts/mobile`) — 567 passing at Tier 1; all must stay green. Covers the client: normalization agreement, status transitions, reachability caching, UI sections, copy.

**Server tests** — `pnpm --filter @workspace/db run test` (vitest + PGlite). RLS policies, the claim function, rate limiting. **This repo had never had these.** An untested RLS policy fails the way an untested alarm fails: silently, and only in production.

**Typecheck** — `pnpm run typecheck` from root.

**Device — Jest cannot see any of this.** D25–D35 in `device-tests.md`, all `BLOCKED` until the backend exists. **Six need two handsets with two numbers**, which is a setup cost to plan for, not discover. D30 needs two people.

Highest-value early runs: **D32** (rung 1 shows no verification screen), **D33** (the WhatsApp link-preview token burn), **D27** (offline firing after reboot).

## Before Phase 0 — two cheap things worth more than they cost

1. **Run D1.** Android Auto Backup restoring reminders after a phone migration. `PENDING`, cheap, and now relevant to two features.
2. **Test onboarding with one real target user.** The cheapest suggestion in the adversarial review. Rung 1 is a *theory* that an older parent goes from WhatsApp message to bound account without friction. Watching one person do it would confirm or destroy that in twenty minutes, before any of this is built.

## Risks

1. **The identity model was wrong once already.** The first draft allowed permanent number squatting. The verification ladder fixes it, but T1.8 (the `SECURITY DEFINER` claim function) is where that fix lives or dies. Review it adversarially, not as ordinary code.
2. **No server-side testing culture exists here.** T0.1 is the mitigation and shipped first for that reason. The remaining risk is narrower but real: the harness exists, so every Phase 1 table task now has no excuse for landing without a test proving the wrong caller is refused. A table shipping without one is the single most likely way this ends up with an RLS hole.
3. **Cancel is not absolute and the copy must never say it is.** Backlog item 20 is a whole item about a label that promised more than the system delivered. Do not repeat it.
4. **The two-way sync is untested by anyone.** The adversarial review never attacked it. Read that silence as untested, not as approved.
5. **Operational commitment with no end date** — uptime, FCM rotation, backups, $25/month, for a free app with no monetisation. Most likely failure mode in year two.
6. **Tier 1 will look deletable.** It is load-bearing three times over. The plan and spec both say so; a future reader will still be tempted.
7. **45 days may prove too aggressive.** A user away seven weeks loses links and blocks. The escape hatch is a recovery PIN, which slots in without changing the model.
8. **Phases 0–2 produce nothing visible.** The temptation to reorder toward demoable work is real, and every security property in the design lives in those phases.
