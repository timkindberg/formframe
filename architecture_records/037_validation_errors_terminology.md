# ADR 037: Validation Failures Are Errors in Owned Interfaces

**Date:** 2026-07-10
**Status:** Accepted (bd `jsonschema-form-68g`)
**Deciders:** Tim Kindberg
**Supersedes:** The `issue`/`issues` terminology in ADRs 019, 020, 023, 026,
027, and 036; their architectural decisions otherwise remain in force.

## Context

The validation capability models only blocking failures, but its owned
interfaces mix the conventional form term `errors` with Standard Schema and
Zod's upstream term `issues`. Core exposes `ValidationIssue` and
`ValidationResult.issues`; React consequently exposes issue-named provider
props, hooks, and a store even though its visible markup, display policy, and
accessibility interfaces already speak about errors.

The project is still version `0.0.0` with no external consumers, so preserving
both vocabularies would make every future caller learn an accidental distinction
without providing compatibility value.

## Decision

**Use `error`/`errors` throughout every interface and implementation the project
owns.** The Core contract is:

```ts
interface ValidationError { path: string; message: string; keyword?: string }
interface ValidationResult<T> {
  valid: boolean
  errors: ValidationError[]
  data?: T
}
type Validator<T> = (data: unknown) => ValidationResult<T>
function groupErrorsByPath(
  errors: ValidationError[]
): Map<string, ValidationError[]>
```

React follows the same vocabulary end to end:

- `useFormTree` and its spreadable `validation` capability expose `errors`;
- `ValidationProvider` accepts `errors`;
- custom UI reads `useFieldErrors` and `useValidationErrors`;
- the fine-grained implementation is an `ErrorStore` in `errorStore.ts`.

Maintained validation adapters return the owned `errors` result. Foreign
interfaces keep their specified names only at the adapter seam:

- Standard Schema's emitted and consumed result field remains `issues`;
- Zod's `ZodError.issues` is read and translated to `ValidationError`;
- AJV's `validate.errors` is read and translated to `ValidationError`.

No deprecated aliases or dual result fields are added.

## Consequences

- Core, maintained adapters, React, examples, tests, and current documentation
  use one conventional form vocabulary.
- This is a deliberate breaking public-interface change before v1.
- Standard Schema, Zod, and AJV remain structurally compatible because their
  property names change nowhere; translation is localized at adapter seams.
- Core still owns only pure validation types and the pure grouping helper, so
  the stubborn Core boundary remains intact.
- Historical ADR text retains its original terminology; this record supersedes
  those names without rewriting the decisions that introduced the capability.

## Alternatives Considered

- **Keep `issue` everywhere.** Rejected because the owned protocol represents
  only blocking form errors, and the surrounding UI already uses that term.
- **Expose both names through aliases.** Rejected because there are no external
  consumers to migrate and parallel vocabulary would permanently widen the
  interface.
- **Rename upstream `issues` fields too.** Rejected because those fields belong
  to Standard Schema and Zod. Adapters translate foreign interfaces rather than
  pretending their contracts changed.

---

**Relates to:** ADR 019 (validator seam), ADR 020 (shared contract tests), ADR
023 (fine-grained React store), ADR 026 (Standard Schema boundary), ADR 027
(error display policy), ADR 036 (spreadable validation capability).
