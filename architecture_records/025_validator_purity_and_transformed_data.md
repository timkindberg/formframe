# ADR 025: The Validator is Pure and Returns Transformed Data

**Date:** 2026-06-29
**Status:** Accepted
**Deciders:** Tim Kindberg

## Context

ADR 019 carved the validation slot as a synchronous, side-loaded contract:

```ts
type Validator = (data: unknown) => ValidationResult
interface ValidationResult { valid: boolean; issues: ValidationIssue[] }
```

The RHF spike (PR #12, ADR 024) put that contract under a second, independent
consumer for the first time — not Core's submit path, but a foreign form library
holding its own live state. Two latent gaps fell out, and both are properties of
the **contract**, not of RHF. The spike papered over them in recipe code; that
glue is the smell that says the seam, not the recipe, is underspecified.

### Gap 1 — the contract is silent on mutation, and one adapter mutates

`createAjvValidator` runs AJV with `coerceTypes: true`, which **mutates the input
object in place** (string `"18"` becomes number `18` on the very object you
passed). The type `(data: unknown) => ValidationResult` neither promises nor
forbids this, so every consumer inherits an invisible footgun:

- Core's native submit path got away with it only by luck — it builds a fresh
  object from `FormData` each submit, so there is nothing live to corrupt.
- RHF does **not** get away with it. Handing AJV RHF's live values object
  corrupted RHF's change tracking: a field's error would not clear after the user
  fixed it. The spike had to defensively deep-clone
  (`JSON.parse(JSON.stringify(values))`) before every validate.

A footgun that forces every caller to clone "just in case" is a contract defect.
The caller cannot know *which* validators mutate (AJV does, Zod does not) without
reading each adapter's source — exactly the coupling the side-loaded seam exists
to prevent.

### Gap 2 — transformed data has nowhere to go

AJV's coercion produces genuinely useful values: the typed (`number`/`boolean`)
form of all-strings `FormData`. But `ValidationResult` carries only
`{ valid, issues }`. So the **only** channel through which a caller could ever
observe coercion was the in-place mutation of Gap 1. The bug and the (accidental)
feature were the same line of code — which means naively "fixing" Gap 1 by making
AJV stop mutating would silently delete coercion for everyone who unknowingly
relied on it.

### The second implementation already does the right thing

Per ADR 008, the seam's shape is judged against a *real* second implementation —
and we have one. Zod's `safeParse` is **already pure** (it never touches the
input) and **already returns a new, parsed/coerced value** as `result.data`. So
the correct contract is not an invention: it is *the behaviour Zod exhibits
today*. AJV is the outlier that mutates and then throws the coerced value away.
This ADR codifies what the pure adapter already does and brings the impure one
into line.

## Decision

Evolve the `Validator` contract along two axes. Both are the same underlying
move: **a validator produces a new value instead of mutating the caller's.**

### 1. A `Validator` MUST NOT mutate its input

The contract gains an explicit purity invariant: given `data`, a validator must
not modify `data` (or anything reachable from it). Adapters whose engine mutates
(AJV's `coerceTypes`) **clone internally** and validate the clone. Callers may
freely pass live state objects — their own form library's, a React ref's,
anything — without defensive copying. The clone moves from "every consumer, just
in case" to "the one adapter that actually needs it, once."

### 2. `ValidationResult` MAY carry the transformed data

```ts
interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
  /**
   * The validated value after any validator-applied coercion/normalization
   * (e.g. AJV `coerceTypes`, Zod `coerce`/transforms). Optional: a validator
   * that transforms nothing may omit it (callers fall back to their input).
   * Never a reference to the caller's input — always a fresh value (see the
   * purity invariant). Lets a consumer adopt typed values without ever
   * observing a mutation.
   */
  data?: unknown
}
```

Coercion becomes a **first-class, opt-in output** rather than a side effect.
A consumer that wants typed values reads `result.data`; one that does not ignores
it. AJV returns the coerced clone here; Zod returns `safeParse`'s `result.data`;
a validator that normalizes nothing omits the field.

### 3. Still synchronous; async stays a separate evolution

This ADR does not touch sync-vs-async. The async / Standard Schema question is
its own thread (`jsonschema-form-r1p`). Note the convergence, though: Standard
Schema's success result is `{ value }`, and adding `data` here is a deliberate
step toward that shape — a later async+Standard-Schema ADR maps our
`{ valid, issues, data }` onto `{ value, issues }` with no further contract churn.

### 4. The contract suite gains universal invariants; coercion is per-adapter

The validator-agnostic suite (ADR 020) — already run against AJV, Zod, and the
throwaway fake — grows the two cases that hold for **every** validator:

- **Purity:** snapshot the input (deep clone), validate, assert the input is
  deep-equal to its snapshot (unchanged).
- **No aliasing:** on a no-coercion-needed input, when `result.data` is present
  assert it is *not the same reference* as the input but *is* deep-equal to it —
  so a consumer can never mutate its own state through `result.data`.

Coercion *content* is deliberately **not** in the shared suite: AJV coerces by
default while plain Zod does not, so "string `"25"` becomes number `25`" is not a
cross-validator guarantee. Each adapter asserts its own coercion in its own
suite (AJV via `coerceTypes`; Zod via `z.coerce`), checking `result.data` carries
the coerced value *and* the input is untouched. Strengthening the gate is always
in scope; this makes "validators don't mutate" impossible to regress silently.

## Consequences

- **The mutation footgun dies at the source.** Every consumer — native submit,
  RHF, a future TanStack recipe, the reactive store — may pass live objects
  safely. The RHF recipe's defensive clone can be deleted; it was compensating
  for a contract gap, not doing real work.
- **Coercion is portable.** Typed values are available to any consumer via
  `result.data` without reaching into a specific validator's behaviour. The
  native submit path *may* later submit `result.data` to deliver typed values
  instead of raw `FormData` strings (follow-up, not required here).
- **AJV adapter:** clones input, runs coercion on the clone, returns it as
  `result.data`. One extra shallow structured-clone per validate. Validation is
  already the heavy operation and is moving to field-scoped frequency
  (`jsonschema-form-m3v`), so the cost is immaterial and bounded to the adapter
  that opted into coercion.
- **Zod adapter:** add `data: result.data` to the success branch. Otherwise
  unchanged — it already satisfies purity.
- **Core:** one optional field added to an existing interface; still pure types
  plus the one helper. Zero new dependencies; the stubborn boundary holds.
- **Backward compatible.** `data` is optional and `issues`/`valid` are unchanged,
  so existing consumers compile and behave identically until they opt in.

## Alternatives Considered

- **Document "validators may mutate; clone if you care"** — rejected. It pushes a
  validator-specific implementation detail into every consumer and leaves the
  footgun armed. The seam exists precisely so consumers need not know which
  validator they hold.
- **Make AJV stop coercing (`coerceTypes: false`)** — rejected. Native `FormData`
  is all strings; without coercion every `number`/`boolean`/`integer` field fails
  its type check spuriously (the original reason coercion was enabled, ADR 019).
- **Return transformed data by mutation only (status quo)** — rejected. Conflates
  the feature with the bug and is unobservable without aliasing the caller's
  state.
- **A separate `transform`/`coerce` method on the validator** — rejected as
  premature surface area. The validate call already has the value in hand;
  one optional output field is the smaller seam (ADR 008 — don't grow API beyond
  what the second implementation forces).
- **Name the field `value` to match Standard Schema now** — deferred to
  `jsonschema-form-r1p`. `data` matches this contract's existing input vocabulary
  ("the form's assembled data"); the `data`↔`value` rename is trivial and belongs
  with the Standard-Schema alignment that motivates it.

---

**Relates to:** ADR 019 (the contract this evolves), ADR 020 (the shared contract
suite that gates the two new invariants), ADR 008 (the second implementation —
Zod — already exhibits the target behaviour, so the seam is earned, not
speculated), ADR 024 (the RHF recipe whose defensive clone surfaced both gaps),
`jsonschema-form-r1p` (async / Standard Schema alignment — the next step, where
`data` converges on `{ value }`), `jsonschema-form-m3v` (field-scoped
revalidation — bounds the per-validate clone cost).
