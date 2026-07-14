# ADR 041: Async Validator Is a Sibling Seam

**Date:** 2026-07-13
**Status:** Accepted (bd `jsonschema-form-9jk.1.3`)
**Deciders:** Tim Kindberg
**Extends:** ADR 019 (side-loaded validation), ADR 025 (purity and transformed
data), ADR 026 (Standard Schema at the boundary), ADR 028 (whole-document
validation)

## Context

ADR 019 deliberately carved `Validator` as a synchronous, whole-document
function and deferred async validation until a real implementation forced its
shape. Standard Schema's `Result | Promise<Result>` contract, Zod async
refinements and transforms, and network-backed validation now provide that
pressure.

The async shape must preserve several properties already earned by synchronous
validation:

- direct synchronous callers can obtain a result without `await`;
- `ValidationResult.data` carries transformed output without aliasing the input;
- errors use FormFrame's dot paths and validation remains whole-document;
- the validator describes one call, while `useFormTree` coordinates relationships
  among live and submit calls.

The last distinction matters. Promise timing creates pending, stale-result, and
failure-publication questions, but putting run identity or authority into the
validator would move React orchestration into Core's stateless capability slot.

## Decision

Keep the existing `Validator` synchronous and add `AsyncValidator` as its
Promise-returning sibling:

```ts
type Validator<T = unknown> = (
  data: unknown
) => ValidationResult<T>

type AsyncValidator<T = unknown> = (
  data: unknown
) => Promise<ValidationResult<T>>
```

The two interfaces differ only in timing. Both validate one whole-document input
and obey the existing purity, transformed-data, non-aliasing, and dot-path-error
invariants. `AsyncValidator` receives no run identifier, trigger, cancellation
signal, or other orchestration context.

`useFormTree` continues to expose one `validator` option and accepts either
sibling:

```ts
validator?: Validator<Output> | AsyncValidator<Output>
```

This is one validation capability slot, not separate sync and async features.
Callers simply pass a validator. The React consumer preserves the synchronous
fast path: an immediate result is published immediately and does not create a
pending transition. A returned Promise enters async orchestration.

`ValidationResult` does not grow an operational-failure variant. A resolved
result is always a validation verdict: invalid data resolves with
`valid: false` and validation errors. If a validator cannot produce a verdict
because of a network failure, thrown bug, or equivalent operational problem, it
throws or rejects. The orchestrating consumer owns how that run failure is
published.

### Canonical validation-run vocabulary

- A **validation run** is one validator invocation over a point-in-time input
  snapshot.
- A **validation result** is the verdict produced by a completed run.
- An **invalid result** is a result with `valid: false`; a verdict still exists.
- A **validation run failure** is a throw or rejection before a result exists.
- **Authoritative** and **stale** describe whether an orchestrator may publish a
  run's completion. They are not properties interpreted by a validator.

## Consequences

- Existing `Validator` implementations, annotations, direct calls, and
  synchronous contract tests keep their type and timing.
- `AsyncValidator` reuses `ValidationResult`; adapters do not duplicate result
  mapping or catch operational failures into a second result union.
- `useFormTree` is the only native consumer that must branch between immediate
  and promised results. Pending state, generation checks, stale suppression,
  submit-intent completion, and operational-failure publication stay local to
  that module.
- A later cooperative-cancellation decision may add optional context without
  making run identity or authority part of this seam. Cancellation is not
  required for stale-result correctness.
- Standard Schema remains boundary interop. Exact sync and async factories,
  Zod's direct async path, and conformance-suite evolution are decided
  separately; this ADR requires only that the existing synchronous path remain
  available.

## Alternatives Considered

- **Widen `Validator` to return `ValidationResult | Promise<ValidationResult>`.**
  Rejected because every caller typed as `Validator` would lose direct access to
  a synchronous result. The smallest declaration would spread timing checks
  across existing sync consumers.
- **Make all validators asynchronous.** Rejected because an async wrapper is not
  truly synchronous: it always requires `await`, moves completion to a later
  microtask, and prevents use by Standard Schema consumers that require an
  immediate result. AJV and synchronous Zod already provide useful synchronous
  behavior at effectively no maintenance cost.
- **Rename the existing type to `SyncValidator` and make `Validator` an
  umbrella.** Rejected because it breaks current imports and annotations solely
  for a more symmetric taxonomy. Lowercase “validator” may refer to either
  sibling; the existing exported name retains its compatibility meaning.
- **Introduce a tagged validation-source object.** Rejected as a second protocol
  beside the callable validator and Standard Schema. Normalization belongs in
  the consumer and boundary adapters.
- **Pass a validation-run object or `AbortSignal` to `AsyncValidator`.** Deferred.
  Run authority belongs to orchestration, and the upstream schema interfaces do
  not establish a cancellation channel. The minimal one-argument seam does not
  prevent a later optional cancellation extension.

---

**Relates to:** ADR 008 (a second implementation earns a seam), ADR 020 (shared
validation contract), ADR 021 (live validation orchestration), ADR 023
(per-path publication stability), `jsonschema-form-9jk.1` (async validation
semantics map).
