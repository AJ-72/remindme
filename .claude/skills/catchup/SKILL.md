---
name: catchup
description: Use when returning to this project after time away, or when asked "where was I", "what's the state of the project", or "catch me up" - reconstructs in-flight work, what landed, and open threads from git, backlog.md and the last session transcript, ending with one proposed next step.
---

# Catchup — project state after time away

Produce a briefing that makes re-reading `git status`, `backlog.md` and
`CLAUDE.md` by hand unnecessary, ending with **one** concrete proposed next step.

**Announce:** "Using catchup to reconstruct project state."

## Hard rules

- **Read-only over the repo.** Never commit, stash, drop a stash, delete, or
  switch branches. You write exactly two files, both gitignored.
- **Never read a `.jsonl` transcript directly.** They reach 14 MB. Transcript
  access goes only through `transcript.js`.
- **Never run build tooling.** No `pnpm typecheck`, no `jest`. Health comes
  from git alone. (The root typecheck has a known-broken `mockup-sandbox`
  failure that would be noise in every briefing — see `system_learnings.md`
  2026-08-07.)
- **Propose, do not execute.** Section 6 ends the run. Wait for approval.
- Do not write `system_learnings.md`. It is a read source here.

## Arguments

| Form | Window |
|---|---|
| *(none)* | Since `last_run` in `.claude/catchup-state.md` |
| `3 weeks`, `5 days` | That duration back from now |
| `since <sha>` | That commit forward |

## Step 1 — Derive the window first

The gap *is* the window: it decides how far back everything else is pulled.

1. An explicit argument wins outright.
2. Else read `.claude/catchup-state.md` for `last_run`.
3. Else (first run): window start = the **earlier** of the most recent commit's
   date minus 3 days, or 2 weeks ago. Say the window was inferred. A window
   starting *at* the last commit would be empty exactly when the absence was
   longest.

If an explicit sha is unknown to git, say so and fall back to rule 2 or 3.

## Step 2 — Gather

Run these. Do not skip any; each feeds a specific section.

```bash
git log --since="<WINDOW_START>" --format='%h %ad %s' --date=short
git status --porcelain
git stash list
git diff --stat
git log -1 --format='%h %ad %s' --date=short
```

Read `backlog.md` **in full** — it feeds both section 2 and section 6.

List `docs/superpowers/plans/`, `docs/superpowers/specs/`, `handoffs/` and
cross-check against `git status --porcelain` for untracked entries.

Extract the last session (the exclude argument is this session's own id, so it
is never selected):

```bash
node .claude/skills/catchup/transcript.js \
  "C:/Users/anand/.claude/projects/c--workspace-remindme" "<CURRENT_SESSION_ID_PREFIX>"
```

If it prints `NO_PRIOR_SESSION`, say "no prior session found" and continue with
git + docs. If the current session id is unknown, pass no exclude argument and
instead discard any returned session whose `LAST_ACTIVITY` is within the last
few minutes — that is this session.

For the ledger gap, check which windowed commits touched `system_learnings.md`:

```bash
git log --since="<WINDOW_START>" --format='%h %s' --name-only -- system_learnings.md
```

## Step 3 — Write the briefing

Six sections, in this order. Weight section 3 most heavily.

**1. Gap.** Two lines. `"Away 4 days. Last commit Aug 10, last catchup Aug 6.
Pulling everything since Aug 6."` State the window and how it was derived.

**2. What this project is.** 3–5 lines from `CLAUDE.md` + `backlog.md`. Nearly
stable across runs. It exists so a long absence does not require re-reading
`CLAUDE.md` before the rest makes sense.

**3. Where you left off.**
- Uncommitted and untracked files, grouped by area.
- **All stashes, always — never window-filtered.** Stashes are standing state,
  not events. Give each a **judgment** on whether later commits appear to
  supersede it (compare the stash subject and date against what landed). Say
  "looks superseded by `<sha>`" or "still unique", never a bare list. You are
  not certain — phrase it as a read, not a verdict, and never propose dropping
  one without the user asking.
- Last session: its intent (from the human turns), the files it edited, and
  whether it ended clean or mid-task. The `FINAL ASSISTANT MESSAGE` block is
  the best signal — it often states "Next: …" explicitly.

**4. What landed.** Commits in the window grouped by theme, not a raw log.

**5. Open threads.**
- Plans/specs written but never committed. **Report the discrepancy; never
  infer implementation status from tracked-ness.** Precedent
  (`system_learnings.md` 2026-08-09): an uncommitted plan was partly
  implemented, and a committed screen did not match its plan.
- **Ledger gap:** windowed commits that did not touch `system_learnings.md`.
  Note that docs-only and trivial commits are legitimately exempt (the `Stop`
  hook's own escape clause), so this reads as "worth checking", not a nag.
- Anything the last session raised and left unresolved.

**6. Proposed next step.** Exactly one action, justified against **both** the
backlog and the in-flight state. It must cite a specific backlog item or a
specific piece of in-flight work — never a generic suggestion. Respect the
backlog's structure: `P1` is an explicit priority item; numbered items carry
inline `[FIXED <date>]` / `[IN PROGRESS]` markers; the `D1`–`D7`
device-verification section gates several others (notably `D1` gates the real
scope of item 1). Present it and stop.

If nothing changed in the window, say so in two lines. Do not pad six sections.

## Step 4 — Write state

Write `.claude/catchup-state.md`:

```markdown
last_run: <ISO timestamp>
head: <sha from git rev-parse HEAD>
in_flight: <one line on what was in flight at this run>
```

Write the full briefing verbatim to `.claude/last-catchup.md`.

Both are gitignored. Do not `git add` either.
