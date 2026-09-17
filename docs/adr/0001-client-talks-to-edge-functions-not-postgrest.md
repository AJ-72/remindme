# ADR 0001 — The app talks to Edge Functions, not directly to Postgres

**Date:** 2026-08-30
**Status:** accepted
**Context:** M4 Tier 2 ([spec](../superpowers/specs/2026-08-30-remind-someone-else-tier2-design.md), [plan](../superpowers/plans/2026-08-30-remind-someone-else-tier2.md)) — Phase 0 decision #1
**Supersedes:** the plan's initial recommendation of `supabase-js` direct, which was revised during design review.

## Decision

1. **The mobile app reaches the backend only through Supabase Edge Functions.** PostgREST is not exposed to the client.
2. **Row Level Security is applied to every table anyway**, as defence in depth rather than as the only boundary.
3. **Edge Functions act *as the calling user*** — they forward the user's JWT and let RLS enforce — **never as the service role**, except for the two operations that structurally cannot work that way (see below).
4. **`artifacts/api-server` is deleted.** Edge Functions supersede it; leaving it in place would be a decoy.
5. **The OpenAPI pipeline is kept** to describe the Edge Function endpoints. This is a convenience decision, not a security one.

## Why

### The surface argument

Supabase's anon key ships inside the app bundle — that is by design, not a mistake. If the client talks to PostgREST directly, **anyone who downloads the app can reach the database**, and correctness rests entirely on every RLS policy being right.

The blast radius of one wrong policy differs enormously between the two arrangements:

- **PostgREST exposed:** a missing or wrong policy is remotely exploitable by anyone with the app. One of the tables holds `blocks` — a record of who a person did not want to hear from, which the spec names as the most sensitive object in the database.
- **Edge Functions only:** a wrong policy is usually unreachable, because there is no path to the table that does not go through a function you wrote.

### Most of the work needs functions regardless

Number binding, OTP, phone-hash lookup and invitation claim all need a secret the client cannot hold (the HMAC pepper) or must read rows nobody owns yet (the claim). **These cannot be done through RLS at all.** So the Edge Function layer gets built either way.

Exposing PostgREST as well would not remove work — it would save writing perhaps six CRUD endpoints, in exchange for permanently opening a door that has to be right forever. That is a bad trade.

### The policies have never been tested

At the time of this decision there is no server-side test harness (T0.1) and this repo's entire test story is mobile Jest. "RLS protects us" is currently a belief, not a measurement. Choosing the arrangement whose failure mode is contained is the correct response to that uncertainty.

### The base rate

The first version of this feature's identity model allowed permanent phone-number squatting; it was caught by adversarial review, not by us (see the spec's "Known defects" #1). That is not unusual — first security models are typically wrong somewhere. It does mean the sensible planning assumption is *something else is also wrong*, and therefore to prefer the arrangement where being wrong costs less.

## The trap this decision must not fall into

**An Edge Function that uses the service-role key bypasses RLS entirely.** It is the easier thing to write, and the moment it is written the entire benefit of RLS is gone: the only thing protecting one user's rows from another is that the function author remembered to check.

That arrangement is **worse than exposing PostgREST**, because it has the same reliance on hand-written checks *and* none of the database-level enforcement.

So: **functions forward the caller's JWT and query as that user.** The only exceptions are the operations that cannot work that way:

- the `SECURITY DEFINER` **claim** function, which reads invitations addressed to a phone hash before any user owns them;
- the **lookup** function, which needs the server-held pepper and must return only a boolean.

Both are named in the spec as the highest-scrutiny code in the build. Any future exception needs its own ADR.

## What this rejects, and why RLS is still right

This is **not** a decision against RLS. RLS is the stronger authorization mechanism — it is enforced by the Postgres engine and cannot be forgotten, where an `if` statement can. That property is why Supabase was chosen over Firebase in the first place, since Firebase Security Rules are bypassed by its Admin SDK.

The rejected option is only the **open door**: letting the client reach PostgREST. Locks and doors are independent choices, and this decision takes both.

## Consequences

- Every client-facing operation needs an Edge Function. More code than direct PostgREST access.
- **Supabase Realtime is not available to the client.** Live "Amma accepted" updates would need push or polling. Acceptable: push is already in the design.
- Two test surfaces to cover, not one — Edge Functions *and* RLS policies. T0.1 must cover both.
- `openapi.yaml` becomes hand-maintained for real. **A contract that drifts from its implementation is worse than no contract**, because it is trusted. If that maintenance proves unrealistic, dropping the OpenAPI pipeline (and `lib/api-spec`, `lib/api-client-react`, `lib/api-zod` with it) is a reasonable follow-up — it carries no security weight.

## When to revisit

If T0.1 lands with genuine RLS coverage — every table proven to refuse the wrong caller — the surface argument weakens considerably, and exposing PostgREST for the CRUD subset becomes a reasonable choice made on evidence rather than hope. Revisit then, not before.
