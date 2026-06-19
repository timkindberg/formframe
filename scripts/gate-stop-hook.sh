#!/usr/bin/env bash
# Stop hook: in loop-enforcement mode, keep the agent from ENDING its turn while
# `npm run gate` is red — but
#   (a) only run the gate when source actually changed since the last run (no
#       point re-verifying a turn where the agent only thought/replied), and
#   (b) give up after a few consecutive red runs so a stuck loop can't burn tokens.
#
# OFF BY DEFAULT: only enforces when JSF_GATE_ENFORCE=1 (set by the loop runner).
# In normal interactive sessions this exits 0 immediately and never blocks you.
#
# Exit codes (Claude Code Stop hook): 0 = allow the turn to end; 2 = block it
# (stderr is fed back to the agent so it keeps working).
#
# Tunables (env):
#   JSF_GATE_ENFORCE      "1" to enforce (default off)
#   JSF_GATE_MAX_ATTEMPTS consecutive red runs before giving up (default 3)

set -u

# Not enforcing → never block.
[ "${JSF_GATE_ENFORCE:-0}" = "1" ] || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
MAX_ATTEMPTS="${JSF_GATE_MAX_ATTEMPTS:-3}"
STATE_DIR="${TMPDIR:-/tmp}"
MARKER="$STATE_DIR/jsf-gate-marker" # mtime marks the last gate run
COUNT_FILE="$STATE_DIR/jsf-gate-fail-count"
LOG_FILE="$STATE_DIR/jsf-gate.log"

cd "$PROJECT_DIR" || exit 0

# Skip when no source changed since the last gate run.
if [ -f "$MARKER" ]; then
  changed=$(find packages -type f \( -name '*.ts' -o -name '*.tsx' \) \
    -not -path '*/node_modules/*' -not -path '*/dist/*' -newer "$MARKER" \
    2>/dev/null | head -1)
  if [ -z "$changed" ]; then
    exit 0
  fi
fi

if npm run gate >"$LOG_FILE" 2>&1; then
  rm -f "$COUNT_FILE"
  touch "$MARKER"
  exit 0 # green → allow stop
fi

# Gate is red — track consecutive failures.
count=0
[ -f "$COUNT_FILE" ] && count=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" >"$COUNT_FILE"
touch "$MARKER"

if [ "$count" -ge "$MAX_ATTEMPTS" ]; then
  rm -f "$COUNT_FILE"
  echo "npm run gate still RED after $count attempts — allowing stop to avoid wasting tokens. Fix the gate, then resume." >&2
  exit 0 # give up → allow stop
fi

echo "npm run gate is RED (attempt $count/$MAX_ATTEMPTS). Fix the failing typecheck/lint/tests before ending; see $LOG_FILE." >&2
exit 2 # block → keep the agent working
