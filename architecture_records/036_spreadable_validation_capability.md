# ADR 036: `useFormTree` Returns a Spreadable Validation Capability

**Date:** 2026-07-10
**Status:** Accepted (bd `jsonschema-form-5ss.1`)
**Deciders:** Tim Kindberg
**Extends:** ADR 023 (fine-grained validation stores), ADR 027 (touched/error
display policy), ADR 035 (source-agnostic React binding)

## Context

`useFormTree` owns validation issues, touched paths, and the submitted flag.
`ValidationProvider` turns that state into the fine-grained stores consumed by
fields, summaries, and custom error UI. Consumers currently have to translate
between those two modules in the same package:

```tsx
<ValidationProvider
  issues={errors}
  touched={touched}
  submitted={submitted}
>
```

This loopback is accidental plumbing. It is also easy to omit `touched` or
`submitted`, which silently breaks the provider's default touched-gated display
policy.

Automatically wrapping `SchemaFields` would hide the loopback but put the
provider too low: `ValidationSummary` and custom validation UI often need the
same scope. A library-owned `<Form>` would additionally take ownership of form
chrome and event timing that deliberately belong to the consumer.

## Decision

`useFormTree` returns a coherent `validation` capability:

```ts
validation = {
  issues: errors,
  touched,
  submitted,
}
```

The intended composition is:

```tsx
<ValidationProvider {...validation}>
  <ValidationSummary />
  <SchemaFields />
</ValidationProvider>
```

All three properties are required on the returned object, so the common spread
path cannot omit touched or submitted state. The object is memoized and changes
identity only when one of its members changes.

The existing top-level `errors`, `touched`, and `submitted` values remain
available for consumers that inspect individual state directly. The lower-level
`ValidationProvider` interface also remains public and unchanged, including
`showErrorsWhen`, so custom state owners can keep using it without
`useFormTree`.

`SchemaFields` remains a stable component type bound only to the presented form
tree. Validation capability updates therefore re-render the owning consumer and
provider without remounting uncontrolled controls.

## Consequences

- Correct provider wiring becomes one operation instead of three remapped
  props.
- Summaries, fields, and custom error UI can share one explicit provider scope.
- Consumers still own the `<form>`, submit controls, validation event timing,
  and error-display policy.
- Validators remain side-loaded and source-agnostic; the hook does not select
  one from tree origin.
- Existing lower-level renderer and provider compositions remain valid.
- Tests pin both the complete spread path and uncontrolled DOM identity across a
  validation update.

## Alternatives Considered

- **Wrap the bound `SchemaFields` automatically** — rejected because summaries
  and custom validation UI may need to sit beside the fields under the same
  provider.
- **Return a bound validation provider component** — rejected because it adds a
  second component identity to stabilize without reducing the explicit
  composition beyond the spreadable object.
- **Ship a library `<Form>`** — rejected because it would own or parameterize
  form chrome, event timing, and application controls.
- **Auto-select a validator from tree origin** — rejected because provenance
  does not determine validation authority, configuration, or timing.

