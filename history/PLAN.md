# jsonschema-form — Looping-Workflow Experiment Plan

This is the working plan for the experiment branch `worktree-agentic-loop-experiment`: shift from strict `/pair` mode to a faster, verification-gated autonomous loop. Vocabulary lives in [`CONTEXT.md`](../CONTEXT.md); decisions in `architecture_records/006`–`009`.

## North star (definition of done)

**Golden scenarios** — a small set of representative, sanitized VNDLY-style forms — green at **three test altitudes** (unit · component-integration · end-to-end in the example app), on the **reference stack: React + React Hook Form + JSON-Schema/AJV + Chakra UI**.

## Principles (the constraints the loop obeys)

- **Core is the form-tree IR**; front-ends compile in, consumers fold over; adapters are first-class and user-writable (ADR 006).
- **Schema generates; JSX (default) or serializable schema customizes.** Serialize when you must, code when you can. Never bloat the *core* schema vocabulary to customize (ADR 007).
- **Swappability is earned by a second implementation, not designed.** Keep Phase-A "everything-else" honestly decomposed so seam extraction is "promote a folder," not "untangle a hairball" (ADR 008).
- **Autonomy is bounded by verifiability**; the 3 tiers; worker never grades itself (ADR 009).
- **The stubborn Core boundary** (imports nothing, no state, no DOM/framework) is the one hard architectural invariant.

## The gate suite (the deterministic net — autonomy == what these cover)

1. **Tests green at 3 altitudes** — Vitest (core, node) + Vitest browser mode/Playwright (react), plus e2e golden scenarios in the example app.
2. **Types clean** — `tsc`; stricter flags over time (bd `i6p`).
3. **Lint clean** — ESLint.
4. **Dependency-direction fitness function** — Core imports nothing; validation imports no framework; no spoke imports a sibling spoke. (dependency-cruiser.) *Added once >1 spoke exists.*
5. **Non-degradation / render-count** — on the reference stack, typing in field A does not re-render field B.
6. **Swappability contract tests** + a fake adapter per slot. *Added in Phase B when a 2nd impl appears.*

Enforcement: a **Stop hook** runs the deterministic subset every iteration; the **checker subagent** owns placement/taste judgement.

## Sequence

### Iteration 0 — green + gates (prerequisite; before any loop)
- ✅ **Core tests green** — converted stale `node.isX()` method-calls to boolean-property reads; fixed a broken multiselect-submit test mock (a JS `Map` collapses duplicate keys, so it could never represent a multiselect; production `submit()` was correct).
- ✅ **Finished the abandoned type-inference refactor** — explicit interface-based node union (`AnyNode`) in `parser/nodeTypes.ts` with recursive `children` and uniform `FieldParts`; restores consumer-facing narrowing (`if (node.isArray) node.getItem(0)`). Multiselect is a widget-discriminated `FieldNode`. Removed the unused `BaseNode` alias.
- ✅ **Gate suite as one command** — `npm run gate` = typecheck + lint + test (core node + react browser). Full board green: 86 core + 31 react, 0 type errors, lint/prettier clean.
- ✅ **Renamed `parseSchema` → `jsonSchemaToTree`** (ADR 006) — 106 sites across core/react/examples.
- ⚠️ **Worktree must symlink its own `@jsonschema-form/*`** into `node_modules`, or the gate validates against the MAIN checkout's core (see memory `worktree-workspace-resolution`). Done for this worktree; not committed (node_modules is gitignored).
- ⏳ **beads CLI** — issue data is in `.beads/beads.left.jsonl` (25 KB) but `issues.jsonl` is empty and there's no `beads.db`; needs a careful `bd import` (deferred — don't risk the issue-tracker data without confirmation).
- ⏳ **Stop hook** — wire `npm run gate` as a Stop hook so a loop can't end red (opt-in; changes session behavior).
- ⏳ **deps-cruiser** dependency-direction fitness function — add when there is >1 spoke.

### Spike — the recursive continuation renderer (PAIRED) — DESIGN LOCKED in ADR 010
- Prove the one primitive end-to-end against a nested schema (loose types): `renderNode` (node hijack, top-level + scoped) + `node.Default` / `node.Children` / `node.child(p).Default` (tree re-entry) + `parts={{…}}` and `part.Default` (part scope) + `<Form>{(root) => …}</Form>` (root place-yourself). Confirm the *feel*; gates can't judge ergonomics.
- Deferred skins (ADR 010): overrides-map, compound slots, component registry, typed module factory + the `.Default`-free `<fields.x/>` form (needs `6nb`).

### Phase A — Core + reference stack to golden-green
- Curate the golden scenarios (e.g. signup, nested address, array-of-objects, enum/select, value-dependent conditional, one nasty VNDLY-shaped form).
- Get them green at all 3 altitudes on React + RHF + AJV + Chakra.
- Keep "everything-else" honestly decomposed in files.

### Phase B — earn the seams
- Introduce a second implementation one slot at a time: **TanStack Form**, **Zod**, **raw React + Tailwind** (framework stays React — YAGNI).
- Each 2nd impl forces a seam → write contract tests + fake adapter *at that moment*. Validation interop via **Standard Schema** (validation emits a schema the form lib runs; it does not push results upward).
- Re-run all golden scenarios across the swapped stacks.
- Good fit to trial **Dynamic Workflows** (independent, parallel slots).

### Ongoing ritual — stubborn spikes
- Periodically pick a piece of logic and try to push it closer to Core; document the floor as an ADR/issue. Parallel + adversarial → another good Dynamic Workflows trial target.

## Runner

Swappable (ADR 009) and **budget-constrained** ($20/mo Claude Pro). `npm run gate` is free; agent reasoning + subagents cost usage.

- **Default: single agent, interactive** — one issue at a time via `bd ready`, gated. Cheapest; 3-tier autonomy minimizes round-trips. Use a cheaper model (Sonnet) for implementation grind, Opus for design/placement calls.
- **tech-lead (Opus orchestrator + Sonnet subagents):** only for large, well-specified chunks (Phase-B adapters). Savings unproven → measure on the first big chunk before relying on it.
- **Dynamic Workflows / Sandcastle:** parked — token-prohibitive on Pro.

Enforcement: `scripts/gate-stop-hook.sh` is a `Stop` hook — off unless `JSF_GATE_ENFORCE=1`, skips when no source changed since the last run, and gives up after 3 red runs (Tier-3 escalation) so a stuck loop can't burn tokens.

## Doc rewrite (this branch, discrete step)
Rewrite `README.md` / `AGENTS.md` / `CLAUDE.md` / `ARCHITECTURE.md` to reflect the loop philosophy and the IR/adapter framing (currently they mandate strict pairing and describe "five layers").

## Open / deferred
- **Serializable schema-customization shape** (ADR 007 deferred) — likely a VNDLY-specific adapter.
- **TS type-inference cluster** (bd epic `6nb` + `33g`, `2uw`, `fiz`, `gjq`, `nsg`, prototypes) — revisit after Phase A.
- **`form.submit()` normalization placement** — Core (bd `uk8`) vs React adapter (bd `hj7`): the first concrete placement call for the loop + checker to resolve.
