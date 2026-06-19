# ADR 009: Development Runs as a Verification-Gated Autonomous Loop

**Date:** 2026-06-18
**Status:** Accepted (experiment branch only)
**Deciders:** Tim Kindberg

## Context

This project is also an experiment in looping agentic workflows. The existing docs (`README.md`, `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`) mandate strict pairing — "you are pairing, not driving," "ask before architectural decisions." To move faster we invert that, but autonomy is only safe with crisp goals, constraints, and verification. People fixate on the *runner* (tech-lead orchestration vs. Claude Code Dynamic Workflows vs. Sandcastle); the substance is the gates and an independent evaluator.

## Decision

Development proceeds as a loop that iterates against a **deterministic gate suite** until the **golden scenarios** are green.

**Autonomy is bounded by verifiability** — the agent decides alone exactly to the degree the gates can catch it being wrong. Three tiers:

- **Decide & proceed** — anything fully covered by green gates (make a red test green, implement within an existing pattern, type/lint fixes, refactors that stay green, widget defaults, file organization).
- **Propose-ADR, then proceed** — introduce a new abstraction/seam (*only* when a 2nd implementation forces it — ADR 008), a new capability slot, a new front-end, or a public-API shape change.
- **Stop & escalate** — cross the stubborn Core boundary, change the golden-scenario set, add a heavy dependency, hit something that can't be made green, delete existing work, or get stuck (no green progress after N iterations).

**Non-negotiables, independent of the runner:**

1. The gate suite is **deterministic** and runs **every iteration** (a Stop hook is the natural enforcement). Weak gates = unsafe autonomy, so gate-strengthening is always in scope.
2. The worker **does not grade itself.** A separate checker/evaluator decides "done" and audits layer placement (maker/checker). Verification is grounded in objective output (test/type/lint/deps results, render counts) and shown as evidence, not asserted.

**The runner is a swappable implementation detail, matched to task shape AND budget, changeable as we go.** Hard constraint: this is built on a $20/mo Claude Pro plan, so token-multiplying orchestration is avoided. Verification is *free* (`npm run gate` is a shell command); agent reasoning — and especially subagents — cost usage.

- **Default — single agent, interactive.** One main agent works one issue at a time (`bd ready`) against the gate. Cheapest mode; the 3-tier autonomy keeps permission round-trips low, which *saves* tokens vs. strict pairing.
- **tech-lead orchestration (Opus orchestrator + Sonnet subagents):** reserved for *large, well-specified* chunks (e.g., a whole Phase-B adapter) where delegating bulk churn to Sonnet outweighs subagent cold-start + spec/parse overhead. Net savings are **unproven** — measure on the first big chunk before relying on it. Not for small interactive iterations (overhead dominates).
- **Dynamic Workflows / Sandcastle:** parallel multi-agent orchestration — **token-prohibitive on the Pro plan. Parked** until budget allows.

## Consequences

- **Pros:** fast; safe to exactly the degree the gates cover; no runner lock-in.
- **Cons:** the gate suite becomes critical path; requires the discipline of letting abstractions wait for the second implementation.
- **Budget ($20 Pro) is a first-class constraint.** The gate is free; usage is spent on agent reasoning and subagents. So we favor a single agent + autonomy (few round-trips), use cheaper models for grind, reserve tech-lead for big well-specified chunks, and park DW/Sandcastle. The reviewer/second-opinion agent runs at milestones, not every iteration.
- **Scope:** this inverts the pairing philosophy **only on the experiment branch**, and triggers a rewrite of `README.md` / `AGENTS.md` / `CLAUDE.md` / `ARCHITECTURE.md` on that branch.

## Alternatives Considered

- **Pure manual pairing** — rejected for this experiment; testing the loop *is* the point.
- **Commit to one heavyweight runner up front** — rejected; the runner is swappable, so an early lock-in is premature.

---

**Relates to:** ADR 008 (gates enforce "earn the seam"). **Inverts (on branch):** pairing philosophy in `README.md` / `AGENTS.md` / `CLAUDE.md`.
