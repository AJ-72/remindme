# Forward a WhatsApp message to create a reminder — design

**Date:** 2026-09-22
**Status:** draft — confirmed with the user across a short design conversation, 2026-09-22. Ready for an implementation plan.
**Scope:** a user forwards any WhatsApp message to the app's WhatsApp Business number. The message is parsed into a title/date and offered to the user as a reminder, on their own phone, exactly like an M4 Tier 2 "remind someone else" invitation.

---

## Problem

Users type or dictate reminders into the app today. Many reminder-worthy things arrive as WhatsApp messages instead — a delivery slot, a friend's plan, a bill due date — and today there is no way to get that text into the app without retyping it.

Prior art exists (Any.do's WhatsApp Reminders is a paid feature built on the same shape: forward a message to a bot number, get a task back). This is a validated pattern, not a novel one.

## Non-goals

- **No server-side reminder storage.** Reminders remain AsyncStorage-only, on the device. The server never becomes a second source of truth for reminder content — consistent with M4 Tier 2's "mailbox, not a runtime" decision.
- **No new UI screens.** The accept/decline experience reuses the existing "remind someone else" invitation-response screens verbatim, with only the sender label changed (e.g. "Sent via WhatsApp" instead of a person's name).
- **No public REST API surface in this iteration.** MCP and other future integrations are designed for, but their own auth/API-key surface is deferred until that work actually starts (see "API layer" below).
- **No group/broadcast forwarding handling beyond what WhatsApp itself does.** A forwarded message is handled the same regardless of its original source.

## The shape of the thing

**Generalize the existing invitation mailbox, don't replace it.**

M4 Tier 2 already has: phone-hash user resolution, a pending-item mailbox (`invitations`), push delivery to a device (`devices` + `sendExpoPush`), and an accept/decline screen. All four are reused unchanged in kind, generalized in one dimension: *where the pending item came from*.

```
WhatsApp message ──▶ Meta webhook ──▶ whatsapp-webhook Edge Function
                                              │
                                              ▼
                              create_pending_reminder() [SECURITY DEFINER]
                                              │
                              ┌───────────────┴───────────────┐
                              ▼                                ▼
                    autoAcceptExternalReminders           (default) review
                    → silent-save push                    → same invitation-
                      (app saves to AsyncStorage             response push/screen
                       on next open/foreground)               (Accept/Edit/Decline)
```

Nothing here is on the critical path of a reminder actually firing — same property M4 Tier 2 already relies on. Once accepted, the reminder is scheduled locally through `expo-notifications` like any other.

## Schema

A new table, not a repurposed `invitations`, because the sender here is not an app user — `invitations.senderId` is `NOT NULL references users`, and that constraint is load-bearing (see that table's own comments). Forcing a WhatsApp message through it would mean either a fake sender row or a nullable FK that weakens a security-relevant column for every other consumer.

```
pendingReminders
  id                uuid primary key
  recipientId       uuid not null references users(id)   -- resolved via phone_hash
  source            enum('whatsapp', 'mcp', ...)          -- extensible; one value used today
  sourceRef         text                                   -- e.g. WhatsApp message id; dedupe key
  rawText           text
  parsedTitle       text
  parsedDatetime    timestamptz
  status            enum('pending','accepted','declined','expired')
  createdAt         timestamptz
  expiresAt         timestamptz                            -- same short-TTL pattern as invitations
```

RLS: recipient-only select, matching `invitations_select_involved`. No insert/update policy or privilege for any role — same reasoning as `invitations`: creation and transition are server operations enforced by the `SECURITY DEFINER` function below, not by policy.

`users.autoAcceptExternalReminders` — new boolean column, default `false`, same family as `discoverable`/`acceptingReminders`.

## The shared function: the actual "API layer"

One `SECURITY DEFINER` SQL function, `create_pending_reminder(recipient_phone_hash, source, source_ref, raw_text, parsed_title, parsed_datetime)`, is the **single write path** for every current and future source. It:

1. Resolves `recipient_phone_hash` → `recipientId` (reusing the same lookup as `hash_lookup()`).
2. Inserts the `pendingReminders` row.
3. Reads `autoAcceptExternalReminders` for that user and returns which push variant to send.
4. Is idempotent on `(recipientId, source, sourceRef)` — a webhook retry must not create a duplicate.

This is the answer to "should we build an API layer now": **yes, at this internal layer, no further.** Every integration (WhatsApp today, MCP later, anything after that) becomes a thin Edge Function that authenticates its own way and then calls this one function. The business logic — dedup, auto-accept branching, push dispatch — is written once. What is deliberately *not* built yet is a public-facing authenticated REST endpoint for third parties to call directly; MCP's auth model (per-user API key or OAuth) is a different problem from WhatsApp's (phone-number possession) or the mobile app's (Supabase JWT), and designing it now with no real client to test against repeats the mistake ADR 0001 warns against — adding surface before it is needed.

## WhatsApp-specific piece

New Edge Function `whatsapp-webhook`:
- No user JWT (like `expire-invitations-cron`) — authenticated by Meta's webhook signature instead.
- Extracts sender E.164 number + message text, computes `phone_hash` (reuses `_shared/phoneHash.ts`).
- Parses text using `parseNaturalLanguage.ts` / `malayalamDateParser.ts` — these need porting to run under Deno (pure TS + `chrono-node`, expected to be portable via an esm.sh import, matching how `_shared/supabaseClient.ts` already imports `@supabase/supabase-js` that way).
- Calls `create_pending_reminder()`.
- Replies on WhatsApp confirming what happened ("Reminder set: Call mom, tomorrow 5pm" / "Got it — check your app to confirm").

Requires: Meta Business verification and WhatsApp Business Cloud API app review (external dependency, days–weeks, should start in parallel with schema work).

## Mobile app changes

- Settings: new toggle "Auto-accept reminders forwarded from WhatsApp" (`autoAcceptExternalReminders`).
- Reuse invitation accept/decline screen: generalize its "who sent this" label to read from `source` (`"Amma"` vs `"via WhatsApp"`) instead of always assuming a person.
- Auto-accept path: on app foreground/open, check for `pending` items with `autoAcceptExternalReminders = true` at receive time and save directly, same as the silent path already implied by the settings toggle.

## Known open items for the implementation plan

- Exact retry/idempotency behavior of Meta's webhook (it retries on non-2xx; `sourceRef` dedup must be airtight).
- Whether `autoAcceptExternalReminders` is a single global toggle or per-source (this design assumes global, matching how `acceptingReminders` is global today; revisit if a second source needs its own default).
- Content-expiry policy for `pendingReminders` — likely mirrors `invitations.contentExpiresAt` (30-day cap), not designed in full here.
