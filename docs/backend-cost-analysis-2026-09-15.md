# Backend cost analysis: is Supabase a must-have?

Date: 2026-09-15. Scope: the M4 Tier 2 backend only.

> **Price warning.** This session had no network access to vendor pricing pages.
> All prices come from the author's knowledge and are approximate. Verify each
> price before you make a commercial decision.

---

## 1. What the backend actually does

Read of `lib/db/src/`, `supabase/functions/` and `artifacts/mobile/services/`
gives these facts.

| Item | Value |
|---|---|
| Tables | 6 (`users`, `devices`, `blocks`, `invitations`, `link_codes`, `lookup_rate_limits`) |
| SQL functions | 12, all in `lib/db/src/functions/` |
| Edge Functions | 6, about 400 lines of Deno in total |
| Auth | Supabase Auth, anonymous sign-in only (`SessionService.ts`) |
| Realtime | not used |
| Storage | not used |
| Push | Expo Push + FCM, both free, not a Supabase service |
| Core reminder CRUD | AsyncStorage on the device. No backend. |

Three points control the whole cost picture.

1. **The app is local-first.** A reminder fires from the device schedule. The
   server is a mailbox, not a runtime. A user who never sends a reminder to
   another person makes **zero** network calls.
2. **The data is small and it expires.** `invitations.content_expires_at` and
   `terminal_at` purge content and rows. The database does not grow forever.
3. **Supabase Auth gives this app only an anonymous UUID.** There is no
   password, no OTP, no social login, no SMS. This is important. See section 4.

## 2. Is Supabase a must-have?

**No. But it is the correct choice today, and you must not move now.**

Supabase supplies 4 things that you use:

| Service | Do you need Supabase for it? |
|---|---|
| Postgres + RLS | No. Any Postgres gives RLS. |
| PostgREST (`.from("devices")`, `.from("users")`) | No, but you must write the replacement. |
| Edge Functions (Deno) | No. Cloudflare Workers or Fly.io do the same. |
| Auth (`auth.uid()`) | No. You can issue your own JWT. |

**The migration cost is low, because of your own design.** All policies sit in
`lib/db/src/schema/*.ts`. All privileged SQL sits in
`lib/db/src/functions/*.sql`. A move off Supabase Auth replaces `auth.uid()`
with a session setting. Example:

```sql
-- before
using (sender_id = auth.uid())
-- after
using (sender_id = current_setting('app.user_id', true)::uuid)
```

The PGlite test harness (`rlsHarness.ts`) already sets the role by hand, so the
tests survive the change. This is a good position. Keep it: do not add
Realtime, Storage, or Supabase-only SQL.

## 3. Cheaper Postgres options

| Option | Strength | Weakness |
|---|---|---|
| **Neon** | Serverless Postgres, scale-to-zero, branching. Closest fit. | You must build auth and an API layer. |
| **Hetzner + self-managed Postgres** | Cheapest by a large factor. | You own backups, failover, patching, and the pager. |
| **AWS RDS / Aurora** | Mature, India region, managed failover. | Expensive. Complex to operate. |
| **Fly.io Postgres** | Cheap, near the app. | Failover is manual in practice. |
| **Cloudflare D1 / Hyperdrive** | Cheap edge access. | D1 is SQLite. Your RLS and SQL functions do not port. |

A realistic non-Supabase stack for this app:

- Postgres: Neon, or Hetzner CCX with a replica.
- API: Cloudflare Workers (the 6 Edge Functions port almost unchanged).
- Auth: a device keypair, and a JWT you sign yourself. Cost is zero.
- Push: Expo + FCM. No change. Cost stays zero.

## 4. The cost driver you must understand: MAU billing

Supabase bills per **monthly active auth user**. Your Pro plan includes about
100,000 MAU, then charges about **$0.00325 per extra MAU**.

You get an anonymous UUID for that money, and nothing else.

At 2.5M active Tier 2 users this one line is about **$7,800 per month**. It is
about 90% of your Supabase bill at scale. A self-signed JWT removes it
completely.

## 5. Cost model

### Assumptions

State these clearly, because the answer depends on them.

- 25% of installed users use Tier 2 in a month. They become billable MAU.
- Each active Tier 2 user makes about 50 backend requests per month
  (lookups, sends, claims, responses, device registration).
- An average response is about 2 KB.
- A live invitation row plus indexes is about 1 KB.
- Push stays free (Expo + FCM).

| Users | MAU | Requests/month | DB size |
|---|---|---|---|
| 1,000 | 250 | 12,500 | < 0.1 GB |
| 100,000 | 25,000 | 1.25M | ~0.5 GB |
| 1,000,000 | 250,000 | 12.5M | ~4 GB |
| 10,000,000 | 2,500,000 | 125M | ~40 GB |

### Option A: stay on Supabase

| Users | Plan | Compute | MAU overage | Edge Fn | Egress + storage | **Total/month** |
|---|---|---|---|---|---|---|
| 1,000 | Free | included | $0 | $0 | $0 | **$0** |
| 100,000 | Pro $25 | Micro/Small +$0-15 | $0 | $0 | $0 | **~$25-40** |
| 1,000,000 | Pro $25 | Large ~$110 | ~$490 | ~$21 | ~$10 | **~$650** |
| 10,000,000 | Team $599 | 2XL ~$410 | ~$7,800 | ~$250 | ~$60 | **~$9,100** |

Note: at 10M users you also want a read replica and a paid support plan. Add
about $400-600. Call it **$9,500-10,000 per month**.

### Option B: Neon + Cloudflare Workers + own JWT

| Users | Postgres | Workers | **Total/month** |
|---|---|---|---|
| 1,000 | Neon Free $0 | $0 | **$0** |
| 100,000 | Neon Launch ~$19 | $5 | **~$25** |
| 1,000,000 | Neon Scale ~$69 + usage ~$60 | ~$9 | **~$140** |
| 10,000,000 | Neon Business ~$700 + usage ~$300 | ~$42 | **~$1,050** |

### Option C: Hetzner self-managed + Workers + own JWT

| Users | Servers | Workers | **Total/month** |
|---|---|---|---|
| 1,000 | 1 small VPS ~$8 | $0 | **~$8** |
| 100,000 | 1 VPS ~$20 | $5 | **~$25** |
| 1,000,000 | primary + replica ~$90 | ~$9 | **~$100** |
| 10,000,000 | 2 large + replica + backups ~$400 | ~$42 | **~$450** |

Option C hides a real cost. Add one part-time SRE, about **$2,000-4,000 per
month** at the 10M level. That makes Option C more expensive than Option B in
true cost. Do not choose it for money alone.

### Summary table

| Users | Supabase | Neon + Workers | Hetzner + Workers |
|---|---|---|---|
| 1,000 | $0 | $0 | $8 |
| 100,000 | ~$35 | ~$25 | ~$25 |
| 1,000,000 | ~$650 | ~$140 | ~$100 (+ staff) |
| 10,000,000 | ~$9,500 | ~$1,050 | ~$450 (+ staff) |

## 6. What you must NOT forget in the total cost

These items are outside the Postgres decision. They can exceed it.

| Item | 1k users | 10M users |
|---|---|---|
| Push (Expo + FCM) | $0 | $0 |
| Google Play developer account | $25 once | $25 once |
| EAS build (Production plan) | $0-19 | ~$99 |
| Sentry / crash reporting | $0 | ~$100-300 |
| Speech recognition | $0 (on-device) | $0 (on-device) |
| Support and abuse handling staff | $0 | large |

Your two most expensive-looking features, voice dictation and notifications,
cost you nothing per user. This is a very strong position. Protect it. Do not
move speech to a cloud API, and do not move reminder firing to the server.

## 7. Recommendation

1. **Stay on Supabase now, and up to about 500,000 users.** Below that point
   the bill is under $200 per month. Engineering time is worth far more.
2. **Remove the MAU dependency before you pass 500,000 users.** This is the
   one change that matters. Replace anonymous Supabase Auth with a device
   keypair and a JWT you sign. Keep Supabase Postgres and Edge Functions. This
   alone cuts the 10M bill from about $9,500 to about $1,500 per month.
3. **Keep the migration cheap. Follow 3 rules.**
   - Do not use Supabase Realtime or Storage.
   - Keep every policy in `lib/db/src/schema/` and every privileged operation
     in `lib/db/src/functions/`.
   - Prefer an Edge Function over a direct PostgREST call. Two direct calls
     exist today (`DeviceRegistrationService.ts`, `InvitationService.ts`).
     Move them behind functions when you next touch them.
4. **Re-examine the decision at 500,000 users**, not before.

## 8. Answer in one line

Supabase is not a must-have, and a cheaper Postgres exists. But the vendor is
not your cost risk. Per-MAU auth billing is your cost risk, and you can remove
it without leaving Supabase.

---

# Addendum: a hard budget of Rs 1,000 per month

Added 2026-09-15, after the budget constraint was set.

Rs 1,000 per month is about **$11.5** at Rs 87 per USD.

## A1. Ceiling on Supabase Free

Supabase Free gives 500 MB database, 500,000 Edge Function invocations per
month, 50,000 MAU, and 5 GB egress. The **Edge Function invocation count is
the binding limit**, not MAU and not storage.

This app makes about 35 Edge Function calls per active Tier 2 user per month
(`lookup`, `send-invitation`, `claim-invitations`, `respond-invitation`).

| Limit | Ceiling |
|---|---|
| 500K calls / 35 | ~14,000 active Tier 2 users |
| At 25% Tier 2 adoption | **~55,000 installed users** |
| Database at that load | ~200 MB of 500 MB |
| Egress at that load | ~1.5 GB of 5 GB |

**You support about 50,000 to 60,000 installed users at Rs 0 per month.**

### The polling change raises this ceiling

`claim-invitations` is the largest contributor, because the client polls it.
Call it only when a push arrives, not on every app open. The count per user
falls from about 35 to about 12.

| Mode | Active users | Installed users |
|---|---|---|
| Polling (today) | 14,000 | ~55,000 |
| Push-triggered only | 41,000 | **~160,000** |

Database storage becomes the next limit, near 200,000 installed users.

### Supabase has no tier inside this budget

Free is Rs 0. Pro is $25, which is about Rs 2,175. There is nothing between
them. You pass from inside the budget to more than double it in one step.

## A2. Options that fit inside Rs 1,000

| Option | Rs/month | Installed users | Main risk |
|---|---|---|---|
| Supabase Free | 0 | 55k, or 160k after the polling fix | Hard cliff to Rs 2,175. No backups. |
| **Cloudflare Workers + Neon** | ~435 | ~200k on Neon Free | You write auth and the API layer. |
| Cloudflare Workers + Oracle Always Free | ~435 | 1M+ | Oracle reclaims idle instances. No SLA. |
| Cloudflare Workers + Hetzner CX22 | ~825 | 1-2M | You own backups and the pager. No India region. |
| Fly.io, unmanaged Postgres | ~520 | ~500k | Unmanaged. Manual failover. |
| Railway | ~3,200 | - | **Over budget.** |
| Cloudflare Workers + D1 | ~435 | 1M+ | D1 is SQLite. The 12 plpgsql functions and all RLS do not port. |

### Why Cloudflare Workers

- The paid plan is $5 (Rs 435) and includes 10 million requests per month.
  The 10M-user projection was 125M requests, so requests never drive the cost.
- The 6 Edge Functions are Deno. They port to Workers with small changes.
- Cloudflare has Indian points of presence. Latency improves.
- It removes the per-MAU auth charge, which section 4 named as the main risk.

### Why Railway does not fit

The $5 Hobby fee *includes* $5 of usage. It does not add to it. A container
running Postgres plus an API service uses much more. Measured Node plus
Postgres deployments land near $37 per month. Railway's default Postgres also
has no point-in-time recovery and no read replica.

### Why D1 does not fit

D1 is SQLite. Your RLS policies and your 12 `SECURITY DEFINER` plpgsql
functions have no equivalent. The rewrite costs more than it saves.

## A3. Decision

The user chose **managed Postgres** (2026-09-15). Safety and backups win over
the lowest price.

**Target stack: Cloudflare Workers + Neon.**

| Stage | Users | Action | Rs/month |
|---|---|---|---|
| 1. Now | 0 - 40k | Stay on Supabase Free. No change. | 0 |
| 2. Soon | 40k | Make the claim-polling change in the mobile client. | 0 |
| 3. | 40k - 160k | Stay on Supabase Free. | 0 |
| 4. | ~160k | Port the 6 Edge Functions to Cloudflare Workers. Move the database to Neon. Replace `auth.uid()` with a self-signed JWT. | ~435 |
| 5. | 160k - 1M | Neon Free (0.5 GB), then Neon Launch. | 435 - 2,100 |

The Rs 1,000 budget holds to roughly **500,000 installed users** on this path.
Neon storage breaks it first, not request volume.

### Rules that keep stage 4 cheap

1. Add no Supabase Realtime and no Supabase Storage.
2. Keep every policy in `lib/db/src/schema/` and every privileged operation in
   `lib/db/src/functions/`.
3. Prefer an Edge Function over a direct PostgREST call. Two direct calls
   exist today, in `DeviceRegistrationService.ts` and `InvitationService.ts`.
