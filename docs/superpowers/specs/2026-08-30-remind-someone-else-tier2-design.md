# Remind someone else, Tier 2 — design

**Date:** 2026-08-30
**Status:** approved — resolved across an eleven-round design interview, 2026-08-30, then revised the same day after an adversarial review found three P0 defects. Two of those reopened the identity decision. See "Known defects and resolutions". Ready for an implementation plan.
**Scope:** true app-to-app reminder delivery with acknowledgement flowing back. The recipient's own phone rings. Requires the first real backend this project has ever had: identity, consent, a device registry and a store-and-forward mailbox.

---

## Problem

M4 Tier 1 shipped in 2026-08-17 and was device-verified 2026-08-30 (see D9). It works, and its honest framing constrains it: **"remind me to message someone", not "remind someone else"**. At reminder time the *sender's* phone rings; they tap and send a pre-filled WhatsApp or SMS message. The recipient's phone never rings on its own.

That is the right design for a recipient who does not have the app. It is the wrong one for a recipient who does. If Amma has the app, the reminder should fire on Amma's phone, and Anand should know it landed.

### What makes this expensive

Nothing in the repo supports it. Verified again while writing this spec:

- `artifacts/api-server` serves exactly one route, `GET /api/healthz`.
- `lib/db/src/schema/index.ts` defines **zero tables** — it is a commented template ending in `export {}`.
- `lib/api-spec/openapi.yaml` declares one path.
- `threat_model.md` states there is no implemented authentication boundary at all.

So this feature's cost is the cost of building a backend, an identity model and a consent system. CLAUDE.md's warning applies directly: **do not scope this as "wire up the existing API".**

---

## Non-goals

- **No accounts for people who don't need them.** A user who only ever reminds themselves must be able to go on never making a network call. This is a hard constraint on every decision below, not a preference.
- ~~No OTP / phone verification in v1.~~ **Reversed.** The first draft claimed accept-first made verification unnecessary. It does not: without it, numbers can be squatted (see "Known defects" #1). OTP is now the fallback rung of the verification ladder, at ~₹0.20 once per number.
- **No compliance monitoring.** Snooze counts, completion rates and any other measure of whether the recipient *obeyed* are never reported to the sender. This is the fork between caregiving and surveillance, and it is settled in favour of caregiving.
- **No group RSVP (M7) UI.** The schema is shaped for N recipients; the product is built for one. See "What M7 inherits".
- **No recurring send-reminders.** Recurrence is M2 and does not exist. Anywhere this design would benefit from it is marked *blocked on M2*.
- **No end-to-end encryption in v1.** The storage policy is minimal-retention instead, with the schema shaped so E2E can be added later without a migration.
- **No booking, no deep links to third-party services.** Unchanged from M4/M7.

---

## The shape of the thing

**The server is a mailbox, not a runtime.**

The reminder is *transferred at send time*. Amma accepts, and it becomes a genuine reminder in her own app, scheduled locally through `expo-notifications` like every other reminder she has. The server's job ends there.

This is the single most important decision in the design, and everything good follows from it:

- **The backend can be down all night and nobody misses a reminder.** An accepted reminder is a local `AlarmManager` registration on Amma's device.
- It inherits every hard-won punctuality property from D19–D23 — `setAlarmClock()` exactness, the boot reschedule, the launch re-arm — for free.
- No cron, no scheduler, no reminder-time uptime requirement.
- The Supabase free tier's inactivity pause becomes survivable rather than catastrophic: a paused project blocks *new invitations*, not *armed reminders*.

The alternative — the server pushing the notification at 8am — would make every reminder's punctuality depend on server uptime. After backlog items 19, 20, 21 and 23, that is not a risk this project should take.

---

## Identity

### An account is not a bound phone number

Two things were conflated in the first draft of this spec, and separating them is
what makes the security model work:

- **Having an account** — a device-generated key. No phone number, no
  verification, no cost.
- **Binding a phone number to that account** — what makes you *discoverable and
  claimable*. This is the privileged operation, and it is the only one that
  needs proof you control the number.

**Why this matters:** the first draft bound numbers on assertion alone. That was
a complete break — an attacker could register with a target's number, self-claim
every invitation addressed to it, and, because `phone_hash` is `UNIQUE`,
permanently prevent the real owner from ever registering. Not interception:
identity squatting. See "Known defects" #1.

### The verification ladder

Binding requires proof of number control, taken by the cheapest available rung:

1. **Arrived via an invite link** — possession of the link *is* the proof, since
   the message was delivered to that number by WhatsApp or SMS. Silent, free, no
   screen.
2. **OTP SMS** — approximately **₹0.15-0.20** through an Indian domestic provider
   such as MSG91 (Twilio's India route is ~₹0.45). **Once per number, per
   lifetime**, not per session. A thousand users is roughly ₹200.

**Rung 1 exists for one reason: it removes the verification step from the user
who can least absorb it.** Amma taps Anand's WhatsApp link and is bound and
discoverable without ever seeing an OTP field. Anand, who went looking for the
feature, is the one who types six digits. This is also the resolution to
"Known defects" #8.

Note **OTP SMS is exempt from India's DLT registration regime** — the TRAI
entity/header/template registration that applies to transactional and
promotional SMS does not apply here. That removes a 2-7 day bureaucratic
prerequisite that would otherwise sit in front of step 0.

Truecaller's Verification SDK was considered and **rejected**. It is free in
India with no usage limits and would cover most users in one tap, but it is a
native dependency (no OTA path), and it exposes the user's number and Truecaller
identity to a third party whose product is crowdsourced caller ID built from
uploaded address books. Declaring that recipient in the Play Data Safety form,
for an app that sells on-device privacy, costs more than it saves. Revisit only
if OTP friction proves to be the binding constraint in real use.

### Invite link tokens are single-use credentials

Once the link is proof of number control, reuse is a takeover. Tokens are
single-use and expire with their invitation (see "Expiry"). Three traps, each of
which produces a bug that looks like something else:

- **Consume the token on *claim by the app*, never on link resolution.** WhatsApp
  fetches URLs to build link previews, so a token consumed on `GET` is burned
  before the human ever taps. The symptom is "the invite link never works".
- **Re-taps must be idempotent.** People tap, get lost in the store, and tap
  again. Bind the token to the account it created so a second tap from the same
  device succeeds silently rather than locking the recipient out.
- **Single-use is not enough on its own** — an unclaimed token still needs a time
  limit, tied to the invitation's own expiry.

### Reinstall, migration, and recycled numbers

**Re-verifying a number rebinds the existing account**, with its blocks, links
and accepted state. This is what makes a new phone work: install, verify by OTP
(there is no invite link on a migration, so it always takes rung 2), account
recovered.

It also makes rebinding a full account-takeover primitive gated on number
control alone — which is the model, and is why the window is bounded:

**N = 45 days.** A rebind within 45 days of the account's last activity recovers
it. Past that, verification creates a **fresh** account and the old one is
deleted along with its blocks, links and pending invitations.

45 is not arbitrary. Indian carriers recycle disconnected numbers from **45 to
90 days**; WhatsApp uses 45 for its own recycling heuristic precisely because
that is the *floor*. A 90-day window would leave a 45-day period in which a
number already reassigned by the carrier still reads as recoverable — and the
thing a stranger would inherit is a **block list**, a record of who someone did
not want to hear from. That is the most sensitive object in the database.

WhatsApp can afford a longer window because its two-step verification PIN makes
SMS possession insufficient. This app has deliberately avoided having any secret,
so it cannot. **If 45 days proves too aggressive in practice, the escape hatch is
a recovery PIN**, which slots in without changing the model.

Note WhatsApp's documented residual failure is exactly this design's risk: a
recycled number still inherits **group memberships**, because the wipe covers
profile data and not the social graph. Blocks and links are this app's social
graph.

**On every rebind to a new device key**, regardless of window: revoke all
existing device tokens, and notify any still-reachable device that the account
was recovered elsewhere. That notice is the only signal a real owner gets.

**Deleting state applies only to the fresh-account path.** A rebind inside N
recovers everything — otherwise legitimate phone migration would be punished to
defend against recycled numbers, and the two are indistinguishable at rebind
time, which is what N is for.

Reminder *data* on the device is a separate concern and not new to Tier 2: it is
backlog item 1 (manual backup/restore shipped 2026-08-10, Android Auto Backup
enabled but unverified). **D1 is now worth running** — it tests exactly this and
two features depend on the answer.


### Discoverability, mute, and account are three settings, not one

The first draft unified them into a single switch and called it elegant. It was
wrong in one specific way (see "Known defects" #7): switching it off
**deregistered**, so "mute everyone for a week" and "delete my account" were the
same button, and turning it off destroyed the block list.

- **Account exists** — created at first number binding. Deleting it is the Play
  Store deletion path, not a toggle.
- **Discoverable** — whether a lookup by phone hash resolves to this user.
- **Accepting reminders** — the global mute. **Keeps the row, the blocks and the
  links.** This is the "don't let anyone remind me" switch.

Per-person blocking is separate again and unchanged (see "Consent").

A user who has never bound a number has no row and makes no network calls, which
preserves the constraint that a solo user's install never phones home. Binding is
prompted **once during onboarding**, alongside the existing first-launch
permission and name prompts in `app/_layout.tsx`. A decline writes **nothing to
the server**; the decline is remembered locally in AsyncStorage so the app can
re-offer once, later, at a contextually obvious moment.

### You cannot tell "declined" from "never installed"

This is a platform fact, not a design choice: you cannot inspect another person's phone, and a user who declined leaves no server-side trace. The two states are indistinguishable.

**The design does not need to distinguish them.** The Tier 1 fallback message serves both cases in one sentence:

> Anand sent you a reminder. Get the app: [link] — already have it? Turn on "Let people remind you" in Settings.

### Lookup, and the enumeration problem

India's mobile number space is roughly 10^9 — small enough that a table of unsalted SHA-256 hashes is brute-forceable in hours. A leaked table of unsalted hashes is functionally a leaked contact list.

Therefore: **the server hashes, with a secret pepper** (HMAC). The client sends the E.164-normalized number over TLS; the server HMACs it and compares. Plaintext numbers transit the server and are **never stored**.

Two consequences that must not be dropped in implementation:

- **This must be disclosed in the privacy policy.** Numbers crossing the server in transit is exactly the kind of thing this app's positioning obliges it to state plainly rather than bury.
- **The lookup endpoint must be hard rate-limited — and not per account.** Accounts are cheap, so a per-account cap alone is bypassed by making more accounts (see "Known defects" #5). Cap per **account**, per **device**, per **IP**, and **globally**, with a daily contact-lookup ceiling and logging of high-volume callers. Note this weakens considerably once binding costs an OTP, since accounts stop being free to create. The contact picker makes bulk lookups tempting — resist checking the whole address book at once.
- **The claim query cannot be protected by ordinary RLS.** "Give me every invitation matching my phone hash" runs against rows that are not yet owned by anyone, so no row-ownership policy covers it. It needs a `SECURITY DEFINER` function with its own explicit checks — and it is the most attack-exposed endpoint in the design, because it is the one #1 abused. It deserves more scrutiny than anything else here.

### Normalization is load-bearing on both devices

A hash only matches if both devices normalize identically. `utils/phoneNumber.ts` is therefore on the critical path for a correctness property, not just a display one. Its region-derived country-code logic needs tests specifically for cross-device agreement.

### The dual-SIM gap, and the repair path

Anand picks Amma's Airtel number; she registered with her Jio one. The invitation is addressed to a hash nobody owns and silently expires.

**v1 accepts one number per account**, and adds an **opaque link code** as a repair mechanism: Amma shares a short code once, Anand pastes it, and from then on that pair is linked by internal user id — the phone number stops mattering for them.

The code is deliberately a *repair* tool and not the primary path. Phone-based discovery via the contact picker is what makes the feature usable for the motivating audience (a parent who needs medication reminders), and it is the only thing that makes M6 — resolving "my husband" from natural language — possible at all. An opaque ID can never be resolved from free text.

Useful second-order property: if phone-number lookup ever becomes a liability, the code path already exists and phone lookup can be demoted without a rewrite.

---

## Consent

### Accept-first

The first reminder from a new sender arrives as a **request**, not a scheduled reminder. Only after Amma accepts does anything get armed on her device.

An open push channel keyed on phone numbers, with no accept step, would be a spam and harassment channel with a 100% delivery rate. It is also increasingly unshippable through Play review.

### Blocking is honest, per-person, and reversible

When Amma blocks Anand, Anand is **told**: *"Amma isn't accepting reminders from you."*

Silent blocking is correct on a platform of strangers, where the blocker's safety depends on the blocker not knowing. This is a family app; the realistic block is a parent muting an over-eager child. Under silent blocking, Anand would keep sending reminders into a void believing they land — **and that is a broken reminder**, which is the one thing this app cannot be.

- Enforced **server-side**. Never trust the sending device to honour a block.
- The block list is itself sensitive (a list of hashed numbers someone doesn't want to hear from) and lives under an RLS policy.
- **Unblock deletes the row.** This is why blocks are rows and not flags.
- **Unblocking re-delivers nothing.** Anything sent during the block stays undelivered. A surprise volley of previously-rejected reminders is how you get re-blocked and uninstalled. There is also no "you have been unblocked" push — the sender simply finds their next send works.
- A **global** "don't let anyone remind me" exists alongside the per-person list. It is the *mute* switch (see "Discoverability, mute, and account"), and it keeps the account and the block list intact.
- **The block confirmation must not overclaim.** Blocking stops app delivery. It cannot stop the sender opening WhatsApp and messaging directly, because Tier 1 runs entirely on the sender's own phone and is outside this system's control (see "Known defects" #10). Say so in the copy — backlog item 20 is a whole item about a label that promised more than the system delivered.

---

## The lifecycle

### States

```
                    ┌──> accepted ──> rescheduled ──> done
invited ──┼──> declined
          ├──> blocked
          └──> expired

(cancelled — terminal, reachable from any pre-terminal state, sender-initiated)
```

- **`invited`** — delivered. No distinction is drawn between "queued on the server" and "delivered to the device". Expo push receipts can tell you a notification reached FCM but not that anyone saw it; the distinction is unactionable, unexplainable, and invites "Delivered ✓✓" misreading.
- **`declined`** — "not this one". Decline does **not** mean "never again"; that is what blocking is for. Do not overload it.
- **`expired`** — see below.
- **`cancelled`** — the sender's one-way kill switch.

**"Recipient has no app" is not a status.** It is a Tier 1 reminder, keyed off the existing `isSendReminder()` in `services/ReminderService.ts:115`. Giving it a `deliveryStatus` would force every consumer to special-case a status that never transitions.

### Expiry is tied to the reminder's own datetime

An unaccepted reminder for 08:00 is meaningless at 08:01, so that is when it dies. A fixed TTL would be wrong for both a reminder ten minutes out and one next month.

**The sender is told on expiry.** "I sent it and assumed it landed" is the failure mode this entire tier exists to eliminate.

This also makes the mailbox self-cleaning, which pairs with the retention policy below.

### Asymmetric editing rights

| | Sender | Recipient |
|---|---|---|
| Cancel | Yes — terminal, wins over everything | Yes (decline / delete her own) |
| Change time or text | **No** | Yes |
| Must inform the other party | n/a — cancel is visible | Yes |

The principle: **nobody can silently alter another person's device.** The sender may only cancel; the recipient may do anything but must inform.

### Concurrent edits

Anand cancels at 07:59; Amma reschedules to 09:00 in the same minute.

**Cancel wins whenever it reaches the device.** A cancelled appointment ringing anyway is the actively harmful outcome, and last-write-wins produces it. Amma is then told her edit was discarded because the sender cancelled.

**But cancel is not absolute, and the spec must not claim it is.** The reminder is armed locally — that is the whole point of the mailbox architecture — so a cancel needs a push to reach the device. An offline or dozing phone will not get it. D27 tests that an accepted reminder fires correctly *in aeroplane mode*, so the first draft of this spec shipped a device test verifying the exact condition under which its strongest promise fails (see "Known defects" #2).

**Mechanism.** The alarm **fires immediately and is never blocked on the
network.** In parallel the device checks the server; if the reminder was
cancelled, the notification is dismissed and the row marked. A briefly-appearing
notification is a far smaller harm than a late one — and putting a network
round-trip inside the `ALARM_EARLY_OFFSET_MS` window would trade away the exact
punctuality that backlog items 19-23 and five device tests were spent securing.
Cancels are also pushed best-effort at high priority, and reconciled on next
connectivity.

**Honest copy, stated once here and enforced in the UI:** *"Cancel wins whenever
it reaches the device. While the recipient is offline it is best-effort, and a
cancelled reminder may still fire."* The sender's cancel confirmation must say
so. This is the same class of problem as backlog item 20's alarm-toggle label —
a promise the copy made that the system could not keep.

**Order by server receive-time, never by device timestamp.** These are two phones; a skewed clock must not decide the outcome.

### What the sender sees when Amma reschedules

The sender's copy **moves to the new time**, with the original preserved for display — "9:00 (you sent 8:00)".

There is direct precedent in the codebase: `originalDatetime` exists on `Reminder` because *"`datetime` is overwritten by each snooze, so without this the distance a task has slid from its original intent is unrecoverable."* Same problem, same solution.

Freezing the sender's copy at the sent time was rejected: a reminder list showing a time that is now wrong is worse than useless.

### What the sender does NOT see

**Snoozes are private.** `Reminder.snoozeCount` is documented as *"Deliberate postponements. Never reset — this is the avoidance signal."* That data exists to help the person who owns the task, not to report them to a third party.

Reported: accepted, declined, rescheduled, expired, blocked, done.
Not reported: snoozes, dismissals, how long it sat unread.

A deliberate "moved to 9am" is a message Amma chooses to send. Four snoozes is not.

---

## Data model

### Postgres (`lib/db/src/schema/`)

Follows the existing convention: one file per table, each exporting a Drizzle table, an `insertXSchema` via `drizzle-zod`, and `InsertX`/`X` types. `drizzle-zod` is what satisfies `threat_model.md`'s requirement that write-capable routes validate with Zod, without maintaining two definitions that drift.

| Table | Purpose | Notes |
|---|---|---|
| `users` | id, `phone_hash` (unique), display name, `discoverable`, created_at | A row exists **only** for opted-in users |
| `devices` | user_id FK, `expo_push_token`, platform, last_seen_at | One user, many devices |
| `blocks` | (blocker_id, blocked_id) composite PK | Unblock is a `DELETE` |
| `link_codes` | the dual-SIM repair path | Short-lived, single-use |
| `invitations` | the mailbox | See below |

The load-bearing detail in `invitations`:

```
recipientPhoneHash  text     NOT NULL   -- NOT a foreign key
recipientId         uuid     NULL       -- filled in on claim
```

**`recipientPhoneHash` is deliberately not a foreign key.** That is what lets an invitation be addressed to someone who does not exist yet — and it is exactly the mechanism that makes registration self-claiming: on registering, a user asks "do any pending invitations match my hash?" and collects them.

This is why **no deferred deep linking is needed**. The invitation is addressed to a phone number, not a device or a session. The invitation finds her; she does not have to carry it through the install. No Branch SDK, no Install Referrer, no claim code for this purpose. The invite link is a plain Play Store link.

`invitations` also carries `datetime`, `originalDatetime`, `status`, `expiresAt` (== `datetime`), and **nullable** `title` / `description` — see retention.

Every table gets an RLS policy. RLS was a primary reason for choosing Supabase over Firebase: it is enforced by Postgres on every query path, where Firebase Security Rules are bypassed by the Admin SDK and can therefore be forgotten by a future route.

### Mobile (`services/ReminderService.ts`)

`ReminderRecipient` was deliberately left as an *object* by Tier 1 so this could be additive. It gains:

- `appUserId?: string` — the resolved remote user, when known
- `lookedUpAt?: string` — cache timestamp

**Reachability is derived, never stored as a durable fact.** "Amma has no app" is the result of a lookup with a short TTL, re-checked at send time. Persisting `hasApp: false` is the bug that would make the feature appear permanently broken the day Amma installs.

`Reminder` gains `deliveryStatus?`, `remoteInvitationId?`, and reuses the existing `originalDatetime`.

---

## Privacy and retention

### Reminder content

Reminder text is not neutral — *"Take your BP tablets"*, *"Call the oncologist"*, *"Court date"*. A Supabase table full of other people's health reminders is a materially different proposition from an on-device app, and would have to be declared as such in the Play Data Safety form.

**Policy: store plainly, delete on accept or expiry.** The server is a mailbox, not an archive.

**Plus an absolute maximum age of 30 days, independent of the reminder's datetime.** Expiry-at-reminder-time alone does not make the mailbox self-cleaning: "remind Amma about the anniversary next June" would hold content for nine months (see "Known defects" #6). The absolute cap is what makes the stated retention policy true.

The invitation **row** survives accept with its status and timestamps — only `title`/`description` are nulled — so "it never arrived" stays debuggable. Rows are purged 30 days after reaching a terminal state.

**E2E encryption is the honest ideal and is deferred, not dismissed.** The reason is concrete: key management is where E2E projects die, and *this app's users already lose device state* — the backup story in backlog item 1 is paste-a-JSON-blob, so reinstalls are common and lossy. A lost key would mean undecryptable reminders and no recovery path.

The schema must therefore be shaped so E2E is addable **without a migration**: content in discrete columns, and a `content_encryption` discriminator present from day one.

### Account deletion is a Play Store requirement

Adding accounts trips a policy the app is currently exempt from. Google Play's User Data policy requires any app allowing in-app account creation to provide **both** an in-app deletion path **and** a publicly accessible **web URL** for deletion requests — enforced since April 2024 and declared in the Data Safety form.

There is no website today. `artifacts/mobile/server/serve.js` serves a landing page but is not publicly deployed.

**Build a minimal static page posting to a Supabase Edge Function.** It is one page and one function, and Supabase can host it. Deferring it means discovering it during review, which is the most expensive possible moment.

**Deletion cascades, with one deliberate exception:** reminders already transferred and armed on other people's devices **survive**. They are the recipient's reminders now — that is what transfer means. The privacy policy must say so.

---

## What Tier 1 becomes

**Tier 1 is permanent infrastructure, not a stopgap.** This design leans on it in three independent places:

1. **Bootstrap** — the only way an unregistered person is first reached.
2. **Fallback** — the Q8 behaviour when the recipient has no app.
3. **Recovery** — the channel that tells a decliner, or someone who installed before this feature existed, how to turn discoverability on.

Recorded explicitly because the temptation later will be to delete it as superseded. It is not.

### The invite nudge cap must be split

`utils/inviteNudges.ts` caps invites at 3 per person (`MAX_NUDGE_SENDS`) and carries no URL, its comment noting *"with no backend there is no attribution to gain — revisit in Tier 2 with a real link."*

That revisit is now, and the cap is in conflict with itself: on the fourth send to someone who still hasn't installed, the message would go out with no way to onboard them.

**Split what is currently one concept:**

- **The witty nudge** — stays capped at 3. Its purpose is charm, and charm has a limit.
- **The functional invite link** — uncapped, present whenever the recipient has no app. It is not marketing, it is the envelope.

---

## UI

The Tier 1 "Sending" section is renamed **"Reminders for others"** — which is now *accurate*, since the recipient's phone genuinely rings. It holds both Tier 2 rows and Tier 1 fallback rows, and the heading is honest for both.

Within it, **status is position, not decoration**: split into **"Waiting"** (invited) and **"Scheduled with them"** (accepted). The sender's actual question is "has this landed or not?" — a binary that position answers at a glance and a per-row chip does not. It also gives expiry somewhere honest to live: an expired invitation visibly drops out of "Waiting" instead of sitting there looking fine.

`app/(tabs)/index.tsx` already has the section machinery from Tier 1.

### Copy and Malayalam

Per the `INVITE_NUDGES_ML` precedent, the split is by *idiom*, not by importance:

- **Functional strings translated now** — "Accept", "Decline", "Blocked", "Waiting", "Reminders for others", "Let people remind you". These are not witty and translating them is low-risk.
- **Personality strings wait for a native speaker** — invite nudges, delivery confirmations. Machine translation produces exactly the cringe the requirement exists to avoid.

The worst outcome to avoid: a user whose reason for choosing this app is Malayalam support hitting a wall of English at the exact moment they are trying to help a parent who may only read Malayalam. That user is arguably the core case.

---

## What M7 inherits

Everything here generalises mechanically to N recipients — users, devices, blocks, invitations, accept-first, transfer-and-fire-locally. `backlog.md` is right that acknowledgement **is** RSVP.

**Design the schema for N recipients now; ship the UI, copy and privacy defaults for one.**

`invitations` fans out from one reminder to many recipients from day one. Retrofitting that later means migrating live rows under the pressure of a half-built second feature.

But the *product* does not generalise, and this is the important part. This design deliberately keeps snoozes private because caregiving is not surveillance. Group RSVP wants the opposite — the entire point is everyone seeing who is in. **Same tables, opposite privacy defaults.** `backlog.md` already warns that M7 is arguably a different app and that two products in one binary usually means neither gets good. Building both at once is how that warning comes true.

---

## Build order

0. **Identity and authentication.** Device key generation and storage in
   `expo-secure-store`, session handling, the OTP provider account, and deciding
   what RLS policies are even keyed on. The first draft folded this into step 1
   and called it "schema", which understated a whole subsystem (see "Known
   defects" #9). The repo has zero tables and, per `threat_model.md`, no
   authentication boundary of any kind — this is built from nothing.
1. **Supabase project + schema + RLS.** New project in the existing org (`letsplan` is dropped). Region `ap-south-1`. Nothing else can be tested until tables exist. Includes the `SECURITY DEFINER` claim function, which is the highest-risk single piece of code in the build.
2. **Number binding and the verification ladder** — the onboarding prompt, invite-link token claim (rung 1), OTP (rung 2), the three separated settings, rebind semantics and the 45-day window.
3. **Lookup** — server-side HMAC, rate limiting, the contact-picker integration, the derived-not-stored reachability cache.
4. **Invitation send and claim** — including the self-claiming registration path.
5. **Accept → local schedule.** The point at which the feature does its actual job; everything before this is plumbing.
6. **Status flow back** — accepted / declined / expired / done, and the "Reminders for others" section split.
7. **Blocking and unblocking**, server-enforced.
8. **Reschedule and cancel**, including the concurrent-edit rule.
9. **Link codes** — the dual-SIM repair path.
10. **Account deletion page + Edge Function**, and the Data Safety declaration.

Steps 1–5 are the walking skeleton. Anything after step 6 could ship in a follow-up release without the feature being incoherent.

---

## Costs to accept up front

- **$25/month for Supabase Pro, from the first real user.** The free tier pauses after a week of inactivity, and a paused project means invitations silently fail to deliver — the exact failure class of backlog items 19, 21 and 23. Free tier is for development only.
- **A privacy policy and a Data Safety declaration**, covering phone numbers in transit, reminder content at rest, and the retention window.
- **A deployed web page** for account deletion.
- **An SMS provider account and ~₹0.15-0.20 per OTP**, once per number per lifetime, and only for users who bind without an invite link. Roughly ₹200 per thousand users — negligible beside the Supabase bill, and the reason the first draft rejected OTP was a miscalculation, not a trade-off. Check whether the chosen Indian provider is one Supabase Auth supports natively; if not, verification goes in a custom Edge Function.
- **An operational commitment**: uptime, FCM credential rotation, and backups, indefinitely, for a free app with no monetisation in the backlog. This is the item most likely to fail in year two; name a minimum service level rather than leaving it implicit.

---

## Deferred, with reasons

| Item | Why not now |
|---|---|
| E2E encryption | Key recovery unsolved while device state is routinely lost. Schema shaped for it. |
| ~~Phone verification (OTP)~~ | **No longer deferred** — see above. The original reasoning was a miscalculation: ~₹0.20 once per number, and OTP is DLT-exempt in India. |
| Truecaller one-tap verification | Free and covers most Indian users, but a native dependency and a third-party data recipient in the Data Safety form. Revisit only if OTP friction binds. |
| A recovery PIN | Would allow a longer rebind window than 45 days. Adds a secret to an app that has none, and a support burden. The escape hatch if 45 days proves too aggressive. |
| Multiple numbers per account | Unverified second numbers would let anyone claim someone else's number — the one real attack this design otherwise avoids. |
| Per-series "no app" notice | Blocked on M2 (recurring reminders). Per-contact memory ships now. |
| Recurring send-reminders | Blocked on M2. |
| Malayalam personality copy | Needs a native speaker, not a translator. |
| iOS | Android-first. Nothing here is Android-specific except Play compliance. |
| M7 group UI | Schema ready, product deliberately not. |

---

## Known defects and resolutions

An adversarial review of the first draft ([`docs/reviews/tier2-adversarial-review.md`](../../reviews/tier2-adversarial-review.md), 2026-08-30) raised fourteen findings. Three were P0. Two of those were design-breaking and forced a settled decision to be reopened. Every row is resolved or explicitly rejected below; a rejection with a stated reason is a resolution, and re-raising one should require new information rather than a fresh reading.

### P0 — broke the design

**#1 Number takeover.** *Valid, and worse than reported.* Unverified binding meant an attacker could claim any number, self-claim its pending invitations, receive **all future sends** to it, and — since `phone_hash` is `UNIQUE` — permanently lock the real owner out. Note the review's second proposed fix does **not** work: requiring a separate accept for claimed invitations just means the *attacker* taps accept. **Resolved** by reopening the identity decision and adding the verification ladder. See "Identity".

**#3 No identity recovery.** *Valid, and the same bug as #1.* Root cause in one sentence: **without number verification you cannot distinguish "Amma reinstalling" from "an attacker claiming Amma's number."** The review listed these separately; seeing them as one made both resolvable. Also a fair hit on inconsistent reasoning — the first draft rejected E2E *because* device state is routinely lost, then built identity on a device key anyway. **Resolved** by rebind-on-reverify, bounded at 45 days. See "Reinstall, migration, and recycled numbers".

**#2 Cancel unenforceable offline.** *Valid.* The review did not notice how explicit the contradiction already was: **D27 tests the exact failing condition.** **Resolved** by fire-first-check-in-parallel plus honest copy — but *not* by the review's proposed blocking server check, which would put a network round-trip inside the alarm window and trade away this app's hardest-won property. See "Concurrent edits".

### P1/P2 — accepted

| # | Resolution |
|---|---|
| **#4** Abusive content inside the invitation | **Accepted, re-prioritised to P2.** The proposed fix — hide the text until accept — means accepting blind, a real cost to the common case for a rare threat. Instead: **block is one tap from the invitation itself**, and first contacts are rate-limited. |
| **#5** Rate limit is per-account, accounts are free | **Accepted.** Now capped per account, device, IP and globally, with a daily ceiling and high-volume logging. Weakens once binding costs an OTP. |
| **#6** Far-future datetime defeats retention | **Accepted.** Absolute 30-day maximum age added, independent of datetime. |
| **#7** One switch, three jobs | **Accepted, for a different reason than given.** "Hide from one person" was already served by per-person blocking, so that part of the finding is wrong. The real defect: switching off **deregistered**, destroying the block list — so mute and account-deletion were the same button. Now three separate settings. |
| **#8** The core user must find a settings switch | **Accepted, and resolved without the proposed fix.** Defaulting discoverability on would undo the opt-in position. Instead, **rung 1 of the verification ladder removes the step entirely** for anyone arriving via an invite link — which is exactly the older-parent case. The review's cheapest suggestion stands and should be done: **test onboarding with a real target user before building.** |
| **#9** Step 1 hides a subsystem | **Accepted.** Step 0 added. |
| **#10** A block does not stop Tier 1 contact | **Accepted.** Copy must state the limit. |
| **#14** Operations has no named owner | **Partially accepted.** The owner of a solo project is its author; naming a minimum service level is worth doing, and is now in "Costs". Not a spec defect. |

### Rejected, with reasons

**#11 Content deletion leaves no debugging trail.** *Largely already the design.* The finding appears to read "delete content on accept" as deleting the row. It is not: `title`/`description` are **nullable**, and the invitation row survives with status, datetime and timestamps. Metadata retention was already specified. The one genuine gap — how long the row itself lives — is now fixed at 30 days post-terminal.

**#12 Tier 2 does not feed the adaptive-reminder differentiator.** *Premise is wrong.* Tier 2 withholds behaviour data **from the sender**, not from the adaptive engine. Amma's own app still sees her own snoozes and adapts normally; that is precisely the caregiving-not-surveillance line. The build-time competition point is fair and is a scheduling question, not a defect.

**#13 Tier 1 already solves this; validate demand first.** *A settled decision, re-raised by a reviewer without the design context.* The no-backend option was put explicitly during the design interview and rejected: this is Tier 2. The finding also understates the delta — Tier 1 does not merely cost a tap, it **requires the sender to be awake, free and holding their phone at the reminder time.** For the medication case that is most of the value. The reviewer's concrete suggestion — validate with ~10 target users before step 1 — is cheap, sensible, and should be done regardless; it is not a reason to redesign.

### Raised by neither the spec nor the review

**The claim query cannot be protected by ordinary RLS.** Matching invitations to a newly-registered phone hash reads rows nobody owns yet, so no row-ownership policy applies. It needs a `SECURITY DEFINER` function with explicit checks, and it is the endpoint #1 abused. Highest-scrutiny code in the build.

**The two-way sync was never attacked.** Recipient-edits-and-sender-is-notified is the largest complexity increase in the design and no finding touched it. Read the review's silence there as untested, not as a clean bill.

---

## Device verification

Green Jest proves nothing here — most of this feature's failure modes are "never arrived", "arrived at the wrong time", or "arrived after the app was killed", none of which jsdom can observe.

Device-test items land in `device-tests.md` in the same change as the feature, per that file's own maintenance rule. See **D25–D31**.
