#!/bin/sh
# Stop hook: if new commits landed this session and system_learnings.md wasn't
# touched in them, block stop and remind Claude to log a learnings entry.
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

MARKER=".claude/.last-learnings-commit"
CURRENT_HEAD=$(git rev-parse HEAD 2>/dev/null) || exit 0
LAST_CHECKED=$(cat "$MARKER" 2>/dev/null || echo "$CURRENT_HEAD")

if [ "$CURRENT_HEAD" = "$LAST_CHECKED" ]; then
  exit 0
fi

CHANGED=$(git diff --name-only "$LAST_CHECKED" "$CURRENT_HEAD" 2>/dev/null)

if echo "$CHANGED" | grep -q "^system_learnings.md$"; then
  echo "$CURRENT_HEAD" > "$MARKER"
  exit 0
fi

COMMIT_LOG=$(git log --oneline "$LAST_CHECKED..$CURRENT_HEAD" 2>/dev/null)
echo "$CURRENT_HEAD" > "$MARKER"

REASON="New commit(s) landed this session without a system_learnings.md entry:
${COMMIT_LOG}
Append a short entry (WHAT/WHY/WHERE, imperative, newest-first) to system_learnings.md for any non-obvious fix/decision in these commits, then stop again. If nothing non-obvious happened (pure formatting, trivial rename, etc.), it's fine to skip -- just say so and finish."

# Escape for JSON: backslash, double-quote, then real newlines -> \n
ESCAPED=$(printf '%s' "$REASON" | sed 's/\\/\\\\/g; s/"/\\"/g' | awk '{printf "%s\\n", $0}')
# strip trailing \n added by the last awk line
ESCAPED=${ESCAPED%\\n}

printf '{"decision": "block", "reason": "%s"}\n' "$ESCAPED"
