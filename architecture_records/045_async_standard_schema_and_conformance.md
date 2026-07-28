# ADR 045: Async Standard-Schema Interop and Conformance Evolution

**Date:** 2026-07-14
**Status:** Superseded by [ADR 050](./050_validation_is_a_non_goal.md)
**Deciders:** Tim Kindberg
**Extends:** ADR 019 (side-loaded validation), ADR 020 (shared validator-agnostic
contract suite), ADR 025 (validator purity and transformed data), ADR 026 (speak
Standard Schema at the boundary), ADR 041 (async validator is a sibling seam),
ADR 042 (validation-run authority, staleness, and failure)

> **Superseded (2026-07-17).** Async Standard-Schema interop on the library
> `Validator` boundary is demoted. See [ADR 050](./050_validation_is_a_non_goal.md).

## Context

ADR 041 added `AsyncValidator` as a Promise-returning **sibling** of the
synchronous `Validator`, accepted through the single `useFormTree({ validator })`
slot. ADR 026 established that we *speak* Standard Schema at the boundary via two
pure adapters (`toStandardSchema` / `fromStandardSchema`) rather than adopting it
as the internal contract, and that `fromStandardSchema` **throws** on a
Promise-returning (async) Standard Schema because the sync seam cannot represent
it. ADR 020 defined a validator-agnostic contract suite run against AJV, Zod, and
a fake.

Async now needs first-class interop: a consumer must be able to *consume* an
async Standard-Schema library (Zod/Valibot/ArkType with async refinements) as an
`AsyncValidator`, and to *emit* our `AsyncValidator` to an async-aware consumer.
The specific hazard is Zod: its synchronous `safeParse` **throws** when the schema
contains async refinements/transforms, so the existing `createZodValidator` can
never validate an async schema, and any "try sync, fall back to async" bridge
would execute the schema twice. This ADR decides how the adapters, the maintained
Zod adapter, and the contract suite evolve — without source-origin sniffing and
while preserving synchronous compatibility.

## Decision

### 1. A direct async Zod factory: `createZodAsyncValidator`

The maintained Zod adapter gains `createZodAsyncValidator(schema)` over
`schema.safeParseAsync`, returning an `AsyncValidator` (ADR 041). It is the
higher-fidelity async path, mirroring the sync `createZodValidator`:

- **It is essentially forced.** Zod's sync `safeParse` throws on async schemas, so
  the sync factory cannot handle them; `safeParseAsync` is the only single-pass
  way to validate them.
- **It preserves `keyword`** (Zod's `issue.code`), which the generic Standard hop
  drops (ADR 026). This is the same rich-vs-generic tradeoff ADR 026 drew for the
  sync path, now extended to async.
- **It runs the schema exactly once.** Because async Zod uses this dedicated
  factory (not a sync bridge that throws and is retried async), the
  "sync-then-async duplicate execution" hazard cannot arise — that double-run only
  exists for a bridge that tries sync first and falls back. Explicit sibling
  factories mean no such fallback is ever written.

### 2. Async sibling bridges mirror the ADR 041 seam split

The Standard Schema boundary gains async siblings, mirroring the sync/async
`Validator`/`AsyncValidator` split:

- **`fromStandardSchemaAsync(schema): AsyncValidator`** — consume *any* async
  Standard-Schema library as an `AsyncValidator`. It awaits `~standard.validate`
  (which may return a value or a Promise), so it handles sync and async schemas
  uniformly in a single execution. It is the zero-wrapper generic path; it is
  keyword-less (Standard has no keyword slot), so `createZodAsyncValidator` remains
  the higher-fidelity option for Zod specifically.
- **`toStandardSchemaAsync(asyncValidator): StandardSchemaV1`** — emit our
  `AsyncValidator` as a Standard Schema whose `~standard.validate` returns a
  Promise, so an async-aware consumer (RHF, TanStack Form) can drive it.

The synchronous `fromStandardSchema` / `toStandardSchema` are **unchanged**:
`fromStandardSchema` still throws on a returned Promise (ADR 026). The mappings
(`data` ⇄ `value`, dot-path ⇄ segment array, `keyword` dropped) are identical;
only the timing differs.

### 3. No source-origin sniffing; branch on result shape

Nothing inspects where a validator or schema came from. The consumer **explicitly
chooses** the sync or async factory (`createZodValidator` vs
`createZodAsyncValidator`; `fromStandardSchema` vs `fromStandardSchemaAsync`). The
single `useFormTree({ validator })` slot accepts `Validator | AsyncValidator` and
distinguishes them by the **shape of the returned result** — is it a Promise? — a
universal runtime check applied to the *output*, never a probe of the validator's
identity or origin. A sync validator publishes immediately (ADR 041); an async one
is awaited under the ADR 042 generation gate.

### 4. Contract suite gains an async execution mode

The validator-agnostic suite (ADR 020) gains an async mode that runs the **same
per-call invariants** against an `AsyncValidator` by awaiting the result:

- purity (input deep-equal before/after),
- no-aliasing (`data`/`value` never the caller's input reference),
- verdict correctness,
- transformed-value presence.

These are properties of a single validate *call* and hold identically for sync and
async adapters. The **ordering, staleness, and failure invariants (ADR 042)** are
properties of *orchestration across runs*, not of one call, so they stay in
`useFormTree` tests and are deliberately **not** added to the per-call suite. Async
Standard-Schema conformance is covered by running the async suite over both
`fromStandardSchemaAsync` and `createZodAsyncValidator`.

### 5. No `data`→`value` rename

ADR 026's resolution stands for the async bridges too: keep `data` internally,
project it onto Standard's required success `value` at the boundary. Async changes
timing, not vocabulary.

## Consequences

- `@formframe/core` gains `fromStandardSchemaAsync` and `toStandardSchemaAsync`
  (two more pure adapters over inlined types; still zero-dependency).
- `@formframe/validation-zod` gains `createZodAsyncValidator` over
  `safeParseAsync`; the sync `createZodValidator` is unchanged.
- The contract suite is parameterized over a sync/async execution mode; existing
  sync adapters run unchanged, async adapters run the same invariants awaited.
- `useFormTree`'s validator slot is typed `Validator | AsyncValidator` and
  branches on Promise-ness of the result (feeds the ADR 042 generation gate).
- Purely additive: no existing sync export, adapter, or `ValidationResult` shape
  changes; sync callers are untouched.

## Alternatives Considered

- **Route async Zod through the generic `fromStandardSchemaAsync` only** (no direct
  factory). Rejected: silently drops Zod's `keyword` (ADR 026), and leaves the
  maintained adapter unable to express its highest-fidelity async form — an
  asymmetry with the sync path that offers `createZodValidator`.
- **A universal bridge that tries sync then falls back to async.** Rejected: this
  is precisely the sync-then-async double-execution hazard; it also forces
  result-shape guessing before the call. Explicit sibling factories avoid it.
- **A single `fromStandardSchema` returning `Validator | AsyncValidator`
  automatically.** Rejected: collapses the ADR 041 sibling-seam distinction the
  consumer should make explicitly, and reintroduces origin/shape sniffing at the
  boundary.
- **Add ADR 042 ordering/staleness assertions to the per-call contract suite.**
  Rejected: those are orchestration properties across multiple runs, not
  properties of one validate call; they belong in `useFormTree` tests. Mixing them
  would make the validator-agnostic suite depend on a run scheduler.
- **Adopt Standard Schema as the internal contract now that async lands.**
  Rejected again on ADR 026's addressing-model argument (dot-string `node.path`
  powers the typed `FieldPath`); async does not change it. The async bridges make a
  future migration incremental if the typed-path story is ever reworked.
- **Rename `data`→`value`.** Unnecessary (ADR 026); the boundary adapter already
  carries the spec's name.

---

**Relates to:** ADR 019 (the seam), ADR 020 (the contract suite this extends),
ADR 025 (transformed data → Standard `value`), ADR 026 (the sync boundary this
mirrors for async), ADR 041 (the sync/async sibling seam this interop tracks),
ADR 042 (the orchestration invariants kept out of the per-call suite),
`jsonschema-form-9jk.1` (async validation semantics map),
`jsonschema-form-9jk.1.8` (final ratification — consolidates seam, ordering,
pending, submit, failure, interop, and conformance),
`jsonschema-form-1oz` (keyword vocabulary — what the generic Standard hop loses).
