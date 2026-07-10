# ADR 019: Validation as a Side-Loaded Capability Slot — Submit-Time, AJV-First

**Date:** 2026-06-25
**Status:** Accepted
**Deciders:** Tim Kindberg

## Context

Phase A is done — the zero-dependency native stack renders and submits. Phase B
begins, and the roadmap (`ARCHITECTURE.md`) is explicit about the order: **fill
the validation and UI slots first** (visible, high-investment swaps), form-state
last and optional. Validation is **framework-agnostic, rides directly on Core**
(not "above" React), and must be **side-loaded** — never baked into Core or any
single layer (the standing "❌ Baked-in Validation" anti-goal).

Two constraints shape the first cut:

- **Submit-time, not live.** Live error display (errors that update as you type)
  needs a *reactive* form-state adapter; **submit-time validation works fine on
  the native `<form>`+FormData adapter** (ADR 011). The native stack is what we
  have, so submit-time is the honest first target.
- **The seam is carved by the first real adapter, not invented up front** (ADR
  008 / Phase B): write the contract *plus contract tests plus a throwaway fake
  adapter* at the moment the first real adapter (AJV) lands, so the seam is proven
  validator-shaped rather than AJV-shaped.

## Decision

**Validation is a capability slot: Core defines a neutral contract; an adapter
package supplies the implementation; consumers run it.** This slice carves the
contract and ships the first adapter (AJV). It does **not** render errors yet —
that is the React slice that follows.

### 1. The neutral contract lives in Core (pure types + one pure helper)

```ts
interface ValidationIssue { path: string; message: string; keyword?: string }
interface ValidationResult { valid: boolean; issues: ValidationIssue[] }
type Validator = (data: unknown) => ValidationResult
function groupIssuesByPath(issues: ValidationIssue[]): Map<string, ValidationIssue[]>
```

Core is the hub validation "rides on," and these are **pure types plus one pure
function** — no imports, no state, no DOM — so the stubborn Core boundary holds.
Crucially, **issues are keyed by the same dot-path as `node.path`** (`name`,
`contacts.0.email`; `""` = the root value), so the React slice can map an issue to
the field that owns it with no translation layer. The contract belongs on Core,
not in the adapter package, because React and future validators (Zod, Valibot)
must depend on the *vocabulary* without coupling to any one *validator*.

### 2. Synchronous, submit-time

`Validator` is synchronous: run it against the assembled form data at submit. That
covers the native-adapter path the architecture calls out. Async validators
(Standard Schema, Zod's async refinements) are a **future seam evolution**,
deferred until a second adapter actually forces an async shape (ADR 008).

### 3. AJV is the first adapter (`@jsonschema-form/validation-ajv`)

`createAjvValidator(schema) → Validator` compiles the schema once (`allErrors`,
`strict:false`) and maps each AJV `ErrorObject` to a `ValidationIssue`:

- `instancePath` (RFC 6901 JSON Pointer, `/contacts/0/email`) → dot-path
  (`contacts.0.email`), un-escaping `~1`/`~0`;
- `required` reports the *parent* path with the offender in
  `params.missingProperty`, so we append it — the issue lands on the missing field
  itself, not its parent.

AJV is the package's declared peer dependency; it does not touch Core or React.

### 4. The seam is proven validator-shaped by contract tests + a fake

A single **contract-test suite** runs against two factories: the real AJV adapter
*and* a hand-written ~30-line **fake validator** (a schema-walking checker for
`required`/`minLength`). It asserts `valid` + each issue's `path` + `keyword`
(validator-agnostic) — never the human message (which legitimately differs). If
both pass the same suite, the contract is not secretly AJV-shaped. The fake is a
throwaway test fixture, exactly as Phase B prescribes.

## Consequences

- **Validation is opt-in and fully decoupled.** Core states the shape; the adapter
  computes; the consumer decides when to run it. Nothing about validation is
  required by, or baked into, Core or the render path.
- **One path convention end to end.** Structure (`node.path`), submission
  (`name` attrs), and now validation (`issue.path`) all key on the same dot-path —
  the React slice maps issues to fields for free.
- **Conformance untouched.** This slice adds no IR field and no markup; the vanilla
  oracle is unaffected.
- **Stubborn boundary intact.** Core gained pure types and one pure helper, zero
  dependencies.
- **Explicitly out of scope (next slices):** rendering errors in React, running the
  validator from `useFormTree`/`form.submit`, live/reactive validation, async
  validators, and per-keyword message customization.

## Alternatives Considered

- **Bake validation into Core/the parser** — rejected: the standing anti-goal;
  validators are framework-agnostic and belong side-loaded.
- **Put the contract in `validation-ajv`** — rejected: React and any second
  validator would then import a specific validator package for the *type*. The
  neutral vocabulary belongs on the hub (Core).
- **Validate by folding over the tree** — rejected for AJV, which validates against
  the *schema*. The slot only promises "data → issues"; how a validator computes is
  its own business.
- **Async-first `Validator`** — deferred: sync covers submit-time on the native
  adapter; an async shape is a seam evolution to earn when a second adapter needs
  it, not to speculate on now.
- **Promote the contract suite to a shared test package now** — deferred: it lives
  in `validation-ajv/test` until a second adapter (Zod) gives it a second consumer.

---

**Relates to:** ADR 008 (seam carved by the first real adapter + contract tests +
a throwaway fake), ADR 011 (form-state is a shallow slot — submit-time validation
needs no reactive state; live validation does, hence deferred), ADR 013 (rendering
issues will be a renderer-set concern in the React slice), `ARCHITECTURE.md`
Phase B ("validation first → AJV, then Zod").
