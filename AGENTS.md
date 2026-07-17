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

- **A single agent, interactive**, working one issue at a time (`gh issue list`) against the gate. The 3-tier autonomy above keeps permission round-trips low, which saves tokens versus strict pairing. Use a cheaper model for implementation grind; reserve a stronger model for design/placement calls.
- **tech-lead orchestration** (Opus orchestrator + Sonnet subagents) only for large, well-specified chunks (e.g. a whole Phase-B adapter) — not for small interactive iterations, where spawn/parse overhead dominates. Net savings are unproven; measure before relying on it.
- **Avoid token-multiplying orchestration** (Dynamic Workflows / Sandcastle-style parallel multi-agent runs) — parked until budget allows.

The runner (single agent vs. tech-lead vs. something else) is a swappable implementation detail. What's non-negotiable is the gate suite and an independent evaluator, not any particular orchestration tool.

## Issue Tracking with GitHub Issues

**IMPORTANT**: This project uses **GitHub Issues** on `timkindberg/formframe` for ALL issue tracking. Do NOT use markdown TODOs, task lists, or parallel trackers.

### Quick Start

**Check for ready work:**
```bash
gh issue list --state open --label 'p1'
gh issue list --state open --search 'no:assignee'
```

**Create new issues:**
```bash
gh issue create --title "Issue title" --label "type:feature,p2" --body "…"
```

**Claim and update:**
```bash
gh issue edit <n> --add-label "in-progress"
gh issue edit <n> --add-assignee "@me"
```

**Complete work:**
```bash
gh issue close <n> --reason completed --comment "Done"
```

### Labels

- **Type:** `type:bug` | `type:feature` | `type:task` | `type:epic` | `type:decision` | `type:chore`
- **Priority:** `p0` … `p4`
- **Status-ish:** `in-progress` | `deferred`
- Plus topic labels (`v1`, `dx`, `validation`, …)

### Workflow for AI Agents

1. **Check ready work**: `gh issue list --state open`
2. **Claim your task**: add `in-progress` (and assignee if useful)
3. **Work on it**: implement, test, document
4. **Discover new work?** `gh issue create` and link with `Related to #N` / `Blocked by #N` in the body
5. **Complete**: `gh issue close <n>`
6. Historical `jsonschema-form-*` / `bd …` citations in ADRs resolve via [`scripts/bd-to-github-migration-map.json`](scripts/bd-to-github-migration-map.json) — that file is a lookup table only, **not** an active tracker

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

### Important Rules

- Use GitHub Issues for ALL task tracking
- Prefer `gh` CLI (`--json` when scripting)
- Store AI planning docs in `history/` directory
- Do NOT create markdown TODO lists
- Do NOT reintroduce bd/beads as a parallel tracker
- Do NOT clutter repo root with planning documents

For more details about the project architecture, see `architecture_records/` and `ARCHITECTURE.md`.
For more details about the project and the product vision, see `README.md`.

## Session Completion

**When ending a work session:**

1. **File issues for remaining work** — `gh issue create` for follow-ups
2. **Run quality gates** (if code changed) — `npm run gate`
3. **Update issue status** — close finished work, label in-progress items
4. **Push** when the user asks (or when session protocol requires it):
   ```bash
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** — provide context for the next session
