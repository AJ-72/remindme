# `catchup` — project state briefing after time away

**Date:** 2026-08-14
**Status:** design approved, ready for implementation plan

## Problem

Returning to this repo after days or weeks means re-deriving the same context by
hand every time: reading `git status`, guessing whether three old stashes still
matter, opening `backlog.md` to remember what the project is even for, and
trying to recall what the last session was mid-way through. The information
exists but is scattered across git, four different doc files, and Claude Code's
own session transcripts. Nothing joins them up.

## Solution

A project skill, `/catchup`, that reads those sources, prints a six-section
briefing, and ends with one concrete proposed next step for approval.

It is **read-only over the repo**: it never commits, stashes, deletes, or runs
build tooling. It writes exactly two files, both gitignored.

## Invocation

```
/catchup                    # window = since last checkpoint
/catchup 3 weeks            # explicit duration override
/catchup since f8e146d      # explicit commit override
```

Skill lives at `.claude/skills/catchup/SKILL.md`.

## Window derivation

The gap duration is computed **first**, because the gap *is* the window — it
determines how far back everything else is pulled, and it is stated up front so
the reader knows how much to trust their own memory.

Resolution order:

1. An explicit argument, if given, wins outright.
2. Otherwise `last_run` from `.claude/catchup-state.md`.
3. First run (no state file): fall back to the wider of *(a)* the date of the
   most recent commit, or *(b)* 2 weeks. Say explicitly that this is a first
   run and the window was inferred.

## Sources

| Source | Answers | Read mode |
|---|---|---|
| `.claude/catchup-state.md` | When was I last here, at what HEAD | Full |
| git — `log`, `status`, `stash list`, `diff --stat` | What changed; health signal | Scoped to window |
| `backlog.md` | What the project is for; what's next | **Full** |
| Newest `*.jsonl` in `C:\Users\anand\.claude\projects\c--workspace-remindme\` | What I was mid-thought about | **Extractive only — never read directly** |
| `system_learnings.md` | Prior root causes; ledger-gap detection | Referenced, not quoted wholesale |
| `docs/superpowers/plans/`, `docs/superpowers/specs/`, `handoffs/` | Untracked or unfinished work | Listing + targeted read |

### Transcript handling — the load-bearing constraint

Transcript files in this project reach **14 MB** (largest observed:
`4dace283-….jsonl`, 14,445,710 bytes; second 9.7 MB). Reading one directly
would exhaust the context window and is categorically forbidden by this design.

The skill instead shells out to filter the **single newest** `*.jsonl` by mtime,
**excluding the current session's own transcript**, and extracts only three
things:

1. **User message text** — the human turns, which carry intent.
2. **The final ~10 exchanges** — to judge whether the session ended cleanly or
   was cut off mid-task.
3. **File paths from `Edit`/`Write` tool calls** — the "where", obtained without
   reading any tool body.

Assistant prose and all tool results are discarded: verbose, and re-derivable
from the commits. Only the filtered output is read into context.

Scope is deliberately **last session only**, not a multi-session sweep — the
most recent session is where "where was I" actually lives, and the cost of
being wrong is one extra question to the user.

## Output — six sections

**1. Gap.** `"Away 4 days. Last commit Aug 10, last catchup Aug 6. Pulling
everything since Aug 6."` Two lines. States the derived window and why.

**2. What this project is.** 3–5 lines synthesised from `CLAUDE.md` and
`backlog.md`. Near-stable across runs. Present so that a long absence does not
require re-reading `CLAUDE.md` by hand before the rest of the briefing makes
sense.

**3. Where you left off.** The weighted-first section:
- Uncommitted and untracked files, grouped by area.
- Each stash, **with a judgment** on whether commits landing since appear to
  supersede it — not a bare `git stash list`.
- Last session's intent, the files it touched, and whether it ended clean or
  mid-task.

**4. What landed.** Commits in the window, grouped by theme. Not a raw
`git log` dump.

**5. Open threads.**
- Plans/specs written but never committed (e.g. an untracked file under
  `docs/superpowers/plans/`). Note the precedent recorded in
  `system_learnings.md` 2026-08-09: *an uncommitted plan may still be
  implemented, and a committed screen may not match its plan* — so report the
  discrepancy, never infer implementation status from tracked-ness.
- **Ledger gap:** commits in the window that did not touch
  `system_learnings.md`. This mirrors the existing `Stop` hook
  (`.claude/check-learnings-updated.sh`) but reports rather than blocks.
- Anything the last session raised and left unresolved.

**6. Proposed next step.** One concrete action, justified against **both** the
backlog's stated priorities and the in-flight state. Backlog structure the
proposal must respect: `P1` is an explicit priority item; numbered items carry
inline `[FIXED <date>]` / `[IN PROGRESS]` markers; the `D1–D7` device-verification
section gates several others (notably D1 gates the real scope of item 1).
Presented for approval — **never executed** as part of the catchup run.

## Writes

Both gitignored, following the precedent of `.claude/.last-learnings-commit`
("local session state, not committed"). These files describe *this user's*
absence; in a shared checkout the gap calculation would be meaningless.

- **`.claude/catchup-state.md`** — timestamp of run, HEAD sha at run, and a
  one-line summary of what was in flight. This is the baseline for the next
  run's window.
- **`.claude/last-catchup.md`** — the briefing verbatim, so it can be reopened
  without re-running.

`system_learnings.md` is a **read source only**. It is never written by this
skill: its documented purpose is a ledger of non-obvious fixes and root causes,
kept short and scannable for a weaker model, and status-checkpoint content would
dilute it.

Both new filenames must be added to `.gitignore`.

## Explicitly out of scope

- **No live health checks.** No `pnpm typecheck`, no `jest`. Health is reported
  from git alone. This keeps the run fast and invokes no build tooling. (It also
  sidesteps the known-broken `artifacts/mockup-sandbox` `@types/react`
  typecheck failure documented in `system_learnings.md` 2026-08-07, which would
  otherwise be pure noise in every briefing.)
- **No interactive triage.** The skill does not walk item-by-item asking
  keep/drop. It reports, proposes once, and stops.
- **No repo mutation.** No commits, no stash drops, no file deletion, no
  branch operations.

## Failure modes

| Condition | Behaviour |
|---|---|
| No state file (first run) | Say so; use the inferred fallback window; do not error. |
| No transcript, or only the current session's | Say "no prior session found"; continue with git + docs. |
| Transcript filter yields nothing usable | Report the transcript as unreadable; continue. |
| Nothing changed in the window | Say so in two lines. Do not pad six sections. |
| Explicit argument names an unknown commit | Report it and fall back to the checkpoint window. |

## Success criteria

1. Running `/catchup` after a gap produces a briefing that makes re-reading
   `git status`, `backlog.md`, and `CLAUDE.md` by hand unnecessary.
2. No transcript file is ever read directly into context.
3. The repo is byte-identical after a run except for the two gitignored files.
4. The proposed next step cites a specific backlog item or a specific piece of
   in-flight work — never a generic suggestion.
