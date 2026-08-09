# Reminders

A React Native / Expo reminder app with first-class **Malayalam** support — voice
dictation and typed input, parsed on-device with no account and no network call.

Built by [CuriousMind Labs](#). Android; iOS not yet built.

> **What this repo is really about**
>
> The app is a reminder app. The interesting part is *how it was built* — with an
> AI coding assistant, over two months and 176 commits, using a deliberate
> spec → plan → TDD → root-cause-ledger loop. If you're here to evaluate that
> process rather than the product, start with
> **[`system_learnings.md`](system_learnings.md)** and the
> [Working with AI](#working-with-ai) section below.

---

## What it does

- **Malayalam and English input**, typed or dictated. Type
  `അഞ്ചരയ്ക്ക് ഡോക്ടറെ വിളിക്കാൻ` and it schedules for 5:30.
- **Voice dictation** in either language, selectable in Settings — not tied to
  the phone's system locale.
- **Share-to-remind** — forward a WhatsApp text or voice note; audio is
  transcribed to a reminder.
- **Notification actions** — Mark Done and Snooze work with the app fully
  closed, via a TaskManager task rather than a React listener.
- **Local-first.** Everything lives in AsyncStorage. No account, no server, no
  data leaves the device.

## Stack

TypeScript · React Native / Expo SDK 54 · Expo Router · AsyncStorage ·
expo-notifications · expo-speech-recognition · Jest + Testing Library ·
pnpm workspaces

---

## Working with AI

This repo was built with Claude Code as the primary implementer. Three things
make it a more honest sample than a one-shot generated codebase.

### 1. Every feature has a paper trail

Each non-trivial feature went through the same loop, and the artifacts are
committed:

| Stage | Where |
|---|---|
| Design spec, written before any code | [`docs/superpowers/specs/`](docs/superpowers/specs/) |
| Implementation plan, broken into TDD tasks | [`docs/superpowers/plans/`](docs/superpowers/plans/) |
| Session handoffs | [`handoffs/`](handoffs/) |
| Open work and known bugs, unedited | [`backlog.md`](backlog.md) |

The plans are task-by-task with failing-test-first steps. See
[the remind-someone-else plan](docs/superpowers/plans/2026-08-09-remind-someone-else-tier1.md)
for a representative one — including the parts where the design was argued down
to something smaller.

### 2. Tests are close to 1:1 with source

~4,200 lines of test against ~5,900 lines of source, across 21 test files.
Two standing rules held throughout: **never ignore a failing test**, and
**never leave unused code or tests**.

The convention was: write the failing test, *verify it fails for the right
reason*, then implement. Several bugs in the ledger were caught because a test
was confirmed to fail before the fix — and at least one was caught because it
*didn't*.

### 3. The ledger records where the AI was wrong

[`system_learnings.md`](system_learnings.md) is a running log of non-obvious
fixes with root causes, newest first. It is the most useful file in the repo,
and deliberately includes the misses:

- **A regex that made a character optional and silently corrupted output.**
  `മണിക്കൂറ?` matched the Malayalam hour word with its final consonant optional,
  stranding a bare `ർ` in the reminder title. Two tests caught it.
- **Green tests hiding a real defect.** A parser branch resolved the *time*
  correctly while leaving the matched phrase in the title. Every test passed.
  Found by probing the parser beyond what the tests asserted.
- **A test named for a behavior it never asserted.** The home-screen header date
  shipped missing for weeks because the test was called *"shows a 'Today' header
  with a date and upcoming-count subtitle"* and only ever asserted the count.
  The gap was in the *plan*, not the implementation.

### A worked example: duplicate notifications

The kind of bug that doesn't yield to pattern-matching.

**Symptom:** two identical notifications for one reminder, both reading "Now".

**Root cause:** notifications are scheduled to fire 60s *early* to counter
Android Doze delivery lag. For that final minute the notification has already
been delivered while `datetime > now` is still true — so the 15-minute
background reschedule saw it as pending, "cancelled" it (a no-op, since you
cannot un-deliver a notification already in the tray), and scheduled a second
copy that fired immediately. Worse, the new ID overwrote the stored one, leaving
the first notification an orphan nothing could ever cancel.

**Fix, two parts:** the guard subtracts the same offset; and cancellation sweeps
all scheduled notifications by payload `reminderId` rather than trusting a single
stored ID — which makes orphans already on users' devices self-healing.

**The generalizable rule**, now in the ledger: *when a scheduled time is
deliberately offset from a logical time, every guard asking "has this happened
yet" must use the same offset.*

### Where the AI could not help

The Malayalam date parser ([`utils/malayalamDateParser.ts`](artifacts/mobile/utils/malayalamDateParser.ts))
is hand-built, because the failures were linguistic rather than technical:

- Malayalam **fuses** the hour and fraction into one token — `അഞ്ച്` (five) +
  `അര` (half) becomes `അഞ്ചര`, so two-token patterns never see it.
- The hour word `മണി` is **agglutinative**, taking case suffixes that speech
  recognizers spell inconsistently (`മണിക്ക്` / `മണിയ്ക്ക്` / `മണിക്ക`).
- The chillu `ർ` is its own character, not `റ` plus a sign.
- A lookahead guard has to sit *immediately* after `മണി` and **before** the
  optional groups, because `മണിക്ക` is a strict prefix of the duration word
  `മണിക്കൂർ` — a trailing guard backtracks into a bare match and lets the wrong
  word through.

Each of those was found by testing against real dictated input, not by
specification. The comments in that file record why, so the next person doesn't
re-derive them.

---

## Running it

```bash
pnpm install
pnpm run typecheck                       # full typecheck
cd artifacts/mobile && npx jest          # tests
```

Mobile dev: `npx expo start` against an installed dev client, or
`npx expo run:android` for a full local native build.

Local Android builds on Windows need three specific fixes (JDK version, CMake
version, and a Ninja long-path bug that Windows' own long-path setting does
*not* fix). All three are documented with root causes in
[`CLAUDE.md`](CLAUDE.md#local-android-builds-on-windows).

`CLAUDE.md` is the canonical run/operate reference and doubles as the assistant's
context file.

---

## Status

Pre-release. Not yet listed on the Play Store.

Known gaps, tracked in [`backlog.md`](backlog.md): no dark mode, no recurring
reminders, no cloud backup, Android only. These are open by choice — the backlog
and the ledger are kept honest rather than curated, since a tidy backlog would
defeat the point of publishing them.

## A note on commit history

Early commits show three author identities — two of mine plus `Replit Agent`,
from the period when the project was scaffolded on Replit. Authorship is
unified going forward. The design specs, plans, and ledger in this repo record
the decisions behind the code regardless of which identity committed it.
