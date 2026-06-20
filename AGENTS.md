# AI Agent Guide

This document provides guidance for AI assistants working on this project.

## Development philosophy: a verification-gated autonomous loop

Earlier guidance here said "you are pairing with the developer, not driving" and asked agents to check in before architectural decisions. **That's inverted on this branch** ([ADR 009](./architecture_records/009_verification_gated_autonomous_loop.md)): development runs as a loop that iterates against a **deterministic gate suite** until the golden scenarios are green, and the agent works largely unsupervised within that gate.

**Autonomy is bounded by verifiability** — you decide alone exactly to the degree the gate suite can catch you being wrong. Three tiers:

1. **Decide & proceed** — anything fully covered by green gates: make a red test green, implement within an existing pattern, fix types/lint, refactor and stay green, pick widget defaults, organize files.
2. **Propose-an-ADR, then proceed** — introducing a new abstraction or seam (only once a second implementation forces it — [ADR 008](./architecture_records/008_swappability_earned_by_second_implementation.md)), a new capability slot, a new front-end, or a public-API shape change. Write the ADR, then continue — don't wait for a round-trip.
3. **Stop & escalate** — crossing the stubborn Core boundary, changing the golden-scenario set, adding a heavy dependency, hitting something that can't be made green, deleting existing work, or being stuck with no green progress after several iterations.

The gate suite is `npm run gate` (typecheck + lint + test). It must stay deterministic and run every iteration — a Stop hook is the natural enforcement (`scripts/gate-stop-hook.sh`, opt-in via `JSF_GATE_ENFORCE=1`). Weak gates mean unsafe autonomy, so strengthening the gate is always in scope. You do not grade your own work — a separate checker/evaluator decides "done" and audits placement/taste; verification is objective output (test/type/lint results, render counts), shown as evidence, not asserted.

### Budget posture

This is built on a **$20/mo Claude Pro plan** — budget is a first-class constraint, not an afterthought. The gate is free (`npm run gate` is a shell command); agent reasoning and especially subagents cost usage. Default to:

- **A single agent, interactive**, working one issue at a time (`bd ready`) against the gate. The 3-tier autonomy above keeps permission round-trips low, which saves tokens versus strict pairing. Use a cheaper model for implementation grind; reserve a stronger model for design/placement calls.
- **tech-lead orchestration** (Opus orchestrator + Sonnet subagents) only for large, well-specified chunks (e.g. a whole Phase-B adapter) — not for small interactive iterations, where spawn/parse overhead dominates. Net savings are unproven; measure before relying on it.
- **Avoid token-multiplying orchestration** (Dynamic Workflows / Sandcastle-style parallel multi-agent runs) — parked until budget allows.

The runner (single agent vs. tech-lead vs. something else) is a swappable implementation detail. What's non-negotiable is the gate suite and an independent evaluator, not any particular orchestration tool.

## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**
```bash
bd ready --json
```

**Create new issues:**
```bash
bd create "Issue title" -t bug|feature|task -p 0-4 --json
bd create "Issue title" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**
```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**
```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`
6. **Commit together**: Always commit the `.beads/issues.jsonl` file together with the code changes so issue state stays in sync with code state

### Auto-Sync

bd automatically syncs with git:
- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### MCP Server (Recommended)

If using Claude or MCP-compatible clients, install the beads MCP server:

```bash
pip install beads-mcp
```

Add to MCP config (e.g., `~/.config/claude/config.json`):
```json
{
  "beads": {
    "command": "beads-mcp",
    "args": []
  }
}
```

Then use `mcp__beads__*` functions instead of CLI commands.

### Managing AI-Generated Planning Documents

AI assistants often create planning and design documents during development:
- PLAN.md, IMPLEMENTATION.md, ARCHITECTURE.md
- DESIGN.md, CODEBASE_SUMMARY.md, INTEGRATION_PLAN.md
- TESTING_GUIDE.md, TECHNICAL_DESIGN.md, and similar files

**Best Practice: Use a dedicated directory for these ephemeral files**

**Recommended approach:**
- Create a `history/` directory in the project root
- Store ALL AI-generated planning/design docs in `history/`
- Keep the repository root clean and focused on permanent project files
- Only access `history/` when explicitly asked to review past planning

**Example .gitignore entry (optional):**
```
# AI planning documents (ephemeral)
history/
```

**Benefits:**
- ✅ Clean repository root
- ✅ Clear separation between ephemeral and permanent documentation
- ✅ Easy to exclude from version control if desired
- ✅ Preserves planning history for archeological research
- ✅ Reduces noise when browsing the project

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ✅ Store AI planning docs in `history/` directory
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems
- ❌ Do NOT clutter repo root with planning documents

For more details about the project architecture, see `architecture_records/` and `ARCHITECTURE.md`.
For more details about the project and the product vision, see `README.md`.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
