# ADR 020: Shared Validation-Contract Package

**Date:** 2026-06-25
**Status:** Accepted
**Deciders:** Tim Kindberg

## Context

ADR 019 carved the validator seam in Core and placed the **contract-test suite**
in `@formframe/validation-ajv/test`, deferring a shared package until a
second adapter existed. That second adapter — `@formframe/validation-zod`
— now consumes the suite via an awkward `./test/contract` export on the AJV
package. Zod importing AJV for a test helper inverts the dependency direction
and leaks test infrastructure through a production package's public exports.

ADR 008's rule-of-three has fired: two real validators (AJV + Zod) plus the
throwaway fake all run the same suite. The seam is proven; promoting the suite
to its own package is the honest extraction.

## Decision

**Extract the validator-agnostic contract suite into
`@formframe/validation-contract`.**

The package is test infrastructure, not a runtime validator. Its public API:

- `runValidatorContract(target)` — Vitest suite asserting the Core `Validator`
  shape (`valid`, issue `path`, non-empty `message`, truthy `keyword`)
- `contractSchema` — JSON Schema exercising required, minLength, and nested
  array-item paths (`contacts.0.email`)
- `ValidatorContractTarget` — `{ name, validate }` passed into the suite

Dependencies: `@formframe/core` (types only) and `vitest`. Each validator
adapter adds `@formframe/validation-contract` as a **devDependency** and
calls `runValidatorContract` from its adapter-specific test file. Adapter-only
tests (AJV pattern/allErrors/coercion; Zod keyword mapping) stay in their
respective packages.

Remove the `./test/contract` export from `@formframe/validation-ajv`.

## Consequences

- **Clean dependency graph.** Zod no longer depends on AJV for conformance
  testing; both depend on a neutral test package.
- **Conformance is explicit.** New validators (Valibot, etc.) add one
  devDependency and one `runValidatorContract` call — the Phase B pattern from
  ADR 008, without export hacks.
- **Core boundary unchanged.** The runtime contract (`Validator`,
  `ValidationIssue`, `ValidationResult`) remains in Core; this package only
  tests it.
- **Cons:** one more workspace package; acceptable for a seam with two real
  consumers.

## Alternatives Considered

- **Keep the suite in `validation-ajv` with a `./test/contract` export** —
  rejected: wrong dependency direction once Zod exists; test code should not
  ship as a sibling export on a runtime adapter.
- **Move the suite into Core** — rejected: Core must stay dependency-free and
  must not import Vitest; the suite is test infrastructure, not IR vocabulary.
- **Inline duplicate suites per adapter** — rejected: defeats the single
  conformance oracle ADR 019 established.

---

**Relates to:** ADR 008 (second implementation earns the seam), ADR 019
(validator contract + contract tests), `@formframe/validation-ajv`,
`@formframe/validation-zod`.
