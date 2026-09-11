# ADR 0002 — Phase 0 decision record (T0.5)

**Date:** 2026-09-08
**Status:** accepted
**Context:** M4 Tier 2 ([spec](../superpowers/specs/2026-08-30-remind-someone-else-tier2-design.md), [plan](../superpowers/plans/2026-08-30-remind-someone-else-tier2.md)) — closes T0.5, the plan's "Two decisions this plan needs before Phase 0."

## Decision

This ADR is the closing record the plan's T0.5 asks for. It does not make new
decisions — it points at where each of the plan's two Phase 0 questions was
actually settled, since both were resolved piecemeal (in the plan body and in
ADR 0001) rather than in one place, and T0.5 exists so a later reader isn't
left to reconstruct that.

**1. How does the mobile app talk to the backend?**
Settled by [ADR 0001](0001-client-talks-to-edge-functions-not-postgrest.md):
Edge Functions only, RLS underneath as defence in depth, functions act as the
calling user except the two that structurally cannot (claim, lookup).

**2. Is there a server-side test harness?**
Settled in the plan itself (see "Two decisions this plan needs before Phase
0," item 2, and T0.1): PGlite, in-process, no Docker/CLI. Landed 2026-08-30 as
`lib/db/src/testing/rlsHarness.ts`, run via `pnpm --filter @workspace/db run
test`.

## What T0.4 added to this record

T0.4 (OTP provider) surfaced a decision that is related but distinct from the
two above, and is recorded here rather than a third ADR since it does not
change the client/backend boundary — it is a fact discovered while trying to
honor it:

**MSG91 (the spec's preferred ~₹0.15–0.20/OTP Indian domestic provider) is not
one of Supabase Auth's natively supported SMS providers.** Confirmed against
Supabase's docs 2026-09-08: native support is Twilio, MessageBird, Vonage, and
TextLocal (community-supported) only. This means the spec's own fallback
applies (plan, T0.4: "if not, this lives in an Edge Function") — using MSG91
means routing through Supabase's Send SMS Hook to a custom Edge Function,
rather than configuring a native provider in the Supabase dashboard. Twilio's
India route remains available natively but at roughly 3x the per-OTP cost the
spec costs against.

**This ADR does not choose between them.** Creating a live MSG91 or Twilio
account is an operational/billing decision for a human, not something to
default into while executing the plan. `artifacts/mobile/services/OtpService.ts`
(T0.4) is built against a provider-agnostic `OtpProvider` interface
(`send`/`verify`) so either choice — or the custom Edge Function path — slots
in without changing call sites. No call site exists yet — that is T2.3's job.
Until the provider choice is made, T2.3 wires the client to
`unconfiguredOtpProvider`, which refuses every call rather than silently
pretending to send an SMS.

**Follow-up, not blocking the rest of Phase 0/1:** before T2.3 (rung 2 OTP
binding flow) can be built end-to-end, a human needs to pick MSG91-via-hook or
Twilio-native and create the corresponding account/credentials. Everything
else in Phases 0–1 (identity, schema, RLS, the claim and bind functions) does
not depend on this choice.

## Consequences

- T0.5 is closed: both Phase 0 questions have a durable record, and this file
  is now what a later reader should be pointed to instead of reconstructing
  the answer from commit history.
- T2.3 has a documented, non-blocking prerequisite (provider choice + account)
  that was not previously written down anywhere.
