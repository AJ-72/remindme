// Public Supabase project config for the mobile client (T0.3, M4 Tier 2 —
// "remind someone else"). See
// docs/superpowers/plans/2026-08-30-remind-someone-else-tier2.md,
// "Supabase project reference".
//
// The anon/publishable key below is safe to embed client-side by design:
// RLS and Edge Functions are the actual authorization boundary (see
// docs/adr/0001-client-talks-to-edge-functions-not-postgrest.md), not
// keeping this key secret. The service-role key is a completely different
// matter and must never appear in this repo.
//
// Importing this file makes no network call by itself — it only resolves a
// URL and a key. Nothing in services/SessionService.ts touches the network
// until a session is actually requested; see that module's header.
//
// EXPO_PUBLIC_-prefixed env vars, if set at build time, override these —
// e.g. to point a local/staging build at a different Supabase project.

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://zeeanhbvcjslzirftass.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_ZKMC7VDK6_xnFoppRd7ViQ_7JyujWL_";
