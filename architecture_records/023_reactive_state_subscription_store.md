# ADR 023: Reactive State as a Fine-Grained Subscription Store

**Date:** 2026-06-29
**Status:** Superseded by [ADR 050](./050_validation_is_a_non_goal.md)
**Deciders:** Tim Kindberg

> **Superseded (2026-07-17).** The fine-grained first-party error/status
> subscription store is demoted with library-owned validation.
> [ADR 011](./011_form_state_is_a_shallow_slot.md)'s YAGNI on a first-party store
> is reaffirmed; fan-out-free error updates are the form framework's (or recipe's)
> job. See [ADR 050](./050_validation_is_a_non_goal.md).

## Context

Reactive validation (ADR 021) pushes validation issues into the rendered form on
every change. The first cut held issues in a single React **Context**
(`ValidationProvider` → `useFieldIssues`). Context has a fatal property for this:
**every consumer re-renders when the context value changes, regardless of which
slice it read.** So one keystroke re-rendered *every* field's root and error slot
— O(fields) React work per event — even though only one field's issues changed.
Uncontrolled inputs didn't remount (the `NodeRenderer` memo and called-not-mounted
handles still held their DOM/values), but the wasted reconciliation is exactly the
RJSF performance trap.

The maintainer's constraint is explicit and non-negotiable: **never re-render a
node when it was preventable; performance is paramount.** The rest of the codebase
already honours this (the `NodeRenderer` memo, `ArrayRoot`'s dense re-mint, the
`render-counts` contract). The validation Context was the one place that broke it.

## Decision

**Hold validation issues in a tiny external store read through
`useSyncExternalStore` with a per-path snapshot** (`packages/react/src/issueStore.ts`),
instead of a single Context value.

The store's one job is **reference stability**: `getIssues(path)` returns the
**same array reference** across `setResult` calls that don't change that path
(and a single shared, frozen `EMPTY_ISSUES` when a path has none). A field
subscribes to *its own* path's snapshot, so React's `Object.is` bail skips the
re-render for every field whose issues didn't change. A validation pass therefore
re-renders **only the fields whose issues actually changed**.

`ValidationProvider` keeps its public `issues` prop (no consumer churn) but is
store-backed internally: it owns one store per instance and feeds it the latest
issues in a layout effect (after commit, never during render). With **no**
provider the store is `null`, every field reads `EMPTY_ISSUES`, and no error
markup is emitted — so the conformance oracle still matches the vanilla renderer.

### Roll our own — do not depend on Zustand

The store is **~50 lines we own**, on top of React's official
`useSyncExternalStore`. Reasoning:

- **This store is a seam we are defining** (see "the reactive-state slot" below
  and ADR 024). Depending on Zustand would either leak its API into our public
  contract or force us to wrap it anyway; owning a minimal interface is cleaner
  and matches the project ethos (Core imports nothing; minimal deps).
- **The genuinely hard part is delegated to React.** Tearing / concurrent-render
  correctness is precisely what `useSyncExternalStore` exists to solve.
- **The part that bites hand-rolled stores is sidestepped.** Selector + custom
  equality (`useSyncExternalStoreWithSelector`) is where such stores get subtle
  bugs; we avoid it entirely by enforcing per-path reference stability and using
  bare `useSyncExternalStore` (no selector, no equality fn).
- **Safety net:** if a general-purpose store is ever needed, we *vendor* (copy)
  Zustand's `vanilla` `createStore` into the repo rather than depend on it — the
  same own-your-code spirit as ADR 024's recipe model.

### This is the reactive-state slot, with teeth

ADR 011 left form-state a "shallow slot" and asked when a reactive adapter is
warranted. This store is the concrete shape of that slot: it backs validation
issues **today**, and the same per-path subscription mechanism is what field
values, touched/dirty state, and cross-field reactivity would ride **later**.
Per ADR 024 it is also the seam a form-library adapter (React Hook Form /
TanStack Form) would implement. Following ADR 008, the store's **public,
adapter-facing** interface stays internal until a second consumer earns its
shape — this ADR commits only to the internal store that kills the fan-out.

## Consequences

- **Verified, not hoped.** A render-count test ("a field gaining an issue
  re-renders only that field, not its siblings") makes the perf claim a gated
  invariant (ADR 009); `issueStore` unit tests pin the reference-stability
  invariant directly.
- **No public API change.** `ValidationProvider issues={…}`, `useFieldIssues`,
  and `useValidationIssues` keep their signatures; the win is internal. Submit-time
  validation also benefits (a failed submit no longer re-renders every field root).
- **Validator runtime is a separate cost.** This ADR removes the React fan-out;
  it does **not** change that `revalidate` still runs a full-form validator pass
  per event. Debounce and field/group-scoped validation remain the deferred
  mitigations (ADR 021).
- **`useSyncExternalStore` discipline.** `getSnapshot` must return a referentially
  stable value for unchanged slices (we do) or it loops; the shared frozen
  `EMPTY_ISSUES` covers the no-issues case.

## Alternatives Considered

- **Keep the single Context** — rejected: this is the fan-out being fixed.
- **`useSyncExternalStoreWithSelector` / a Zustand dependency** — rejected: the
  selector-equality layer is unnecessary given per-path reference stability, and a
  dependency would leak into or duplicate the seam we are defining.
- **Harder memoization of field components** — rejected: Context propagation
  bypasses `React.memo`, so it cannot fix the fan-out; the store does.

---

**Relates to:** ADR 011 (form-state shallow slot — now given a concrete shape),
ADR 019 (Validator seam), ADR 021 (reactive validation — the producer of these
updates), ADR 024 (adapters are patterns; this store is a seam an adapter
implements), ADR 008 (earn the public seam shape from a second implementation).
