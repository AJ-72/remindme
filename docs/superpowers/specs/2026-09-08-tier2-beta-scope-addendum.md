# M4 Tier 2 — beta scope addendum (invite-link-only, no OTP)

**Date:** 2026-09-08
**Status:** approved by user 2026-09-08 (via brainstorming dialogue, this session)
**Relationship to the main spec:** does not change [`2026-08-30-remind-someone-else-tier2-design.md`](2026-08-30-remind-someone-else-tier2-design.md) — narrows this pass's build to a subset of it, for a beta release. Every architectural decision in the main spec still holds; nothing here contradicts it.

---

## Why this addendum exists

The user asked to bypass OTP verification for binding, behind a revertible flag, to get the app live for beta testing sooner. Working through it (this session, brainstorming dialogue) found that request doesn't need new code:

- **Rung 1 of the verification ladder (invite-link binding) already requires no OTP.** `bind_via_invite_token()` is built, tested (18 tests, sabotage-checked, independently reviewed), and deployed to the live `remindme-tier2` Supabase project. Possession of the link **is** the proof of number control — that's the whole design of rung 1, not a gap in it.
- **OTP (rung 2) is only reachable by two paths**: a user self-registering with no invite link, and re-verification on a new/reset phone (T2.6's 45-day rebind window).
- The user confirmed beta doesn't need either path: they will seed the very first invitation by hand (direct DB write, one time), and every subsequent beta tester joins via a real invite link sent from inside the app by an existing user.

**Consequence:** no OTP-bypass flag is built. Building one would mean writing a fake, insecure rung 2 (accept a typed phone number as proof of ownership — the exact number-squatting defect the main spec's identity model exists to close) purely to have a flag to flip off later. Not building rung 2 at all is simpler and carries none of that risk. **T2.3, T2.6, T2.7, T2.8's OTP-dependent pieces, and T2.9's OTP fallback stay `NOT DONE` and out of scope for beta** — not stubbed, not flagged, just not started.

---

## What beta scope actually is

Everything needed for a reminder sent via **invite link** to reach a recipient's phone and fire there, using only rung 1. This is Phase 3 (lookup), Phase 4 (invitation send/claim), and Phase 5 (accept and schedule locally) from the main plan, built in full — none of these exist yet (no Edge Functions exist at all currently; only DB schema, RLS, and the two `SECURITY DEFINER` SQL functions are deployed).

**In scope for this pass:**
- T1.10 — close the recycled-number gap in `claim_invitations()` (DB-only, unblocked, do first)
- Phase 3 — lookup Edge Function, rate limiting, contact-picker integration, reachability cache (T3.1–T3.5)
- Phase 4 — invitation creation on send, 30-day retention cap, Expo push delivery, self-claiming registration, first-contact UI, first-contact rate limiting (T4.1–T4.6)
- Phase 5 — accept → local reminder, content nulled on accept, decline, expiry (T5.1–T5.4)
- The onboarding UI needed to *send* an invitation and to *bind via a received link* — i.e., the parts of T2.9 that don't depend on OTP. A user who taps "let people remind you" with no OTP provider configured gets no self-serve path; that's expected, not a bug, for this pass.

**Explicitly out of scope for this pass** (per the main plan, deferred, no flag):
- T2.3 (OTP screen), T2.6 (rebind window), T2.7 (token revocation on rebind) — all of rung 2
- Phase 6 (status flow UI polish) through Phase 10 (deletion/compliance) — the plan already says these "could ship in a later release without the feature being incoherent"
- The OTP provider account decision itself (ADR 0002) — remains open, revisit before rung 2 is ever built

## What must be true before beta users can use this

Two things need a human, same as before:
1. **Edge Function deploy access** — Supabase project `remindme-tier2` (`zeeanhbvcjslzirftass`), Edge Functions need to be created and deployed. This session can draft function code and use the Supabase MCP tools where available; deploying likely still needs your confirmation given it's a live, outward-facing change.
2. **Expo push / FCM v1 credentials** (T4.3) — needed regardless of OTP status, per the main plan.

## Verification bar (unchanged from the main plan)

Same as every other phase: mobile Jest (typecheck + test, quoted output, not inspection), `pnpm --filter @workspace/db run test` for anything touching RLS/functions, `mcp__Supabase__get_advisors` after any `push:sql` given the T1.9 finding that PGlite tests cannot see platform-specific grant behavior. D27–D37 device tests stay `BLOCKED` until this ships to a real device, per the main plan's Verification section — Jest passing is necessary, not sufficient, for anything touching notifications/push.
