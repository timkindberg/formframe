# ADR 028: Whole-Document Validation Stays; Field-Scoping Deferred (Measured)

**Date:** 2026-07-01
**Status:** Superseded by [ADR 050](./050_validation_is_a_non_goal.md)
**Deciders:** Tim Kindberg

> **Superseded (2026-08-12).** This ADR measured the cost of a library-owned
> reactive validation runtime re-running the whole document per keystroke.
> ADR 050 makes that runtime a non-goal — recipes (RHF, TanStack, or a
> hand-rolled native hook) own when and how often a validator runs, so the
> whole-document-vs-field-scoped cost tradeoff is no longer the library's to
> make. The benchmark and its finding (whole-document validation is cheap;
> the purity clone dominates cost) remain valid evidence for any recipe or
> adapter that wants it, just not as a library-level decision.

## Context

Reactive validation (ADR 021) re-runs the side-loaded `Validator` over the
**entire** assembled form on every change event. React JSON Schema Form's
reputation for poor performance on large forms made this look like an obvious
next target: validate only the changed field/subtree so per-keystroke cost stops
scaling with form size (issue `h05`).

A future reader will reasonably ask: *"Why didn't they field-scope validation
like the fast form libraries?"* This ADR records why we deliberately did **not**,
and what would change our mind.

Two costs were being conflated:

- **Re-render cost** — already solved. ADR 023's per-path issue store means a
  keystroke re-renders only the field(s) whose issues actually changed, no matter
  how large the form is. This was RJSF's real pain, and it is gone.
- **Validator cost** — the whole-document AJV run per event. This ADR measures
  it before building anything, per the project's "evidence, not assertion" bar.

## Decision

**Keep whole-document validation. Do not field-scope. Defer `h05` until evidence
demands otherwise.**

We wrote a benchmark of the real adapter hot path (cheap JSON clone + coercion +
`ajv` validate — the mutating default of ADR 025) at increasing form sizes:
`packages/validation-ajv/bench/reactiveValidateCost.mjs`. Measured cost of one
per-event validation, against a 16.7 ms frame budget (60 fps):

| form size            | clone + validate | % of one frame |
| -------------------- | ---------------- | -------------- |
| 100 fields           | ~9 µs            | 0.05%          |
| 300 fields           | ~27 µs           | 0.16%          |
| 1000 fields          | ~115 µs          | 0.69%          |
| grid 100×8 (800 leaf)| ~29 µs           | 0.17%          |

Even at **1000 fields the whole-document validator costs ~0.11 ms — under 1% of a
single frame.** It is not the bottleneck at any realistic size. Field-scoped
validation would be a large change that **breaks or complicates cross-field
rules** (`required`/`dependencies`/`dependentRequired`, `if`/`then`/`else`,
`oneOf`, custom keywords that read siblings) — all of which need the whole object
— to buy back a cost that does not exist.

Secondary finding: the ADR-025 purity **clone** is roughly two-thirds of that
per-event cost at large N (~73 µs of the 115 µs at 1000 fields); validation
itself is the cheap part. So if this hot path is ever worth touching, the lever
is the clone, not the validator — and it is still sub-millisecond, so no action
is taken now.

## Consequences

- **`h05` is deferred**, not abandoned, with the benchmark as the standing
  artifact. Re-run it if the picture is ever in doubt.
- **Cross-field validation stays trivially correct** — the validator always sees
  the entire object, so no rule needs a "the rest of the form is stale" caveat.
- **The seam is unchanged.** `Validator` remains `(data) => ValidationResult`
  over the whole document (ADR 019). We avoided inventing a `validateAt(path)` /
  sub-validator abstraction that ADR 008 (swappability earned by a second
  implementation) says we should not add speculatively.
- **The benchmark is a gate, not decoration.** It lives with the AJV adapter and
  can be extended (async validators, other engines) when a real case arrives.

## Escape hatch — what would reopen this

- **Async / network-backed validators.** If a validator does I/O (remote
  uniqueness check, server-side rules), per-keystroke whole-document runs become
  expensive in *latency*, not CPU. The right answer there is a **debounce knob**
  on `revalidate` plus async `Validator` support (a separate future seam) — still
  **not** field-scoping. Field-scoping would only follow if profiling of a real
  async case showed the request payload/scope itself was the problem.
- **A pathologically expensive synchronous validator** (huge custom keywords). Same
  first move: debounce. Measure before scoping.

## Alternatives Considered

- **Field/subtree-scoped validation now** — rejected: large blast radius,
  breaks cross-field rules, and the benchmark shows no cost to justify it.
- **Whole-document validate but commit only the changed field's issues to the
  store** — unnecessary: ADR 023 already diffs per path and re-renders only
  changed fields, so replacing the full issue list is already cheap.
- **Debounce `revalidate` by default** — deferred: adds latency to feedback for
  no measured CPU benefit on synchronous validators. Kept as the first tool for
  the async escape hatch above, filed separately if/when needed.

---

**Relates to:** ADR 019 (the whole-document `Validator` slot this preserves),
ADR 021 (reactive validation, which runs it per event), ADR 023 (the per-path
store that already made re-renders O(changed)), ADR 025 (the purity clone that
dominates the measured cost), ADR 008 (don't add the sub-validator abstraction
speculatively).
