# ADR 038: FormFrame Product and Package Identity

**Date:** 2026-07-12
**Status:** Accepted (bd `jsonschema-form-5ss.7`)
**Deciders:** Tim Kindberg
**Extends:** ADR 033 (schema-agnostic Core and input packages), ADR 036
(name-agnostic package build)

## Context

The library began as a JSON Schema form generator, and its original
`@jsonschema-form/*` npm scope reflected that origin. The architecture no longer
privileges one source language: JSON Schema and Zod compile through separate
front-ends into the same neutral form tree, and every renderer, validator, and
form-state adapter consumes that tree.

Keeping JSON Schema in the umbrella identity would understate the product and
discourage users of Zod or future schema front-ends. The generic
`@schemaform/*` name was considered, but an unrelated package family already
uses that namespace and product identity.

The name should remain clear about the product category without sounding like a
form-builder service, validation library, or source-specific RJSF clone. It
should also describe the architectural role of the form-tree IR: the stable
frame that source schemas compile into and consumer adapters build upon.

## Decision

The human-facing product name is **FormFrame**. The exact capitalization is part
of the brand.

The npm package family uses the **`@formframe/*`** scope:

- `@formframe/core`
- `@formframe/renderer-react`
- `@formframe/renderer-vanilla`
- `@formframe/input-jsonschema`
- `@formframe/input-zod`
- `@formframe/input-conformance`
- `@formframe/validation-contract`
- `@formframe/validation-ajv`
- `@formframe/validation-zod`

ADR 040 later grouped the two rendering adapters under the `renderer-*`
package family.

Source-specific suffixes remain explicit. FormFrame is schema-agnostic; each
input package still tells consumers exactly which source language it compiles.

The default Standard Schema vendor identifier becomes `formframe`.

### Discovery and migration

Package keywords and documentation retain terms such as JSON Schema, Zod,
React, and forms so the new umbrella name does not sacrifice source-specific
discovery.

No compatibility packages or aliases are published. The packages are still
pre-1.0 and have not been released under the old scope, so aliases would create
permanent maintenance without helping an existing consumer.

### Explicitly out of scope

- Package directory names and path-based TypeScript project references remain
  unchanged.
- Beads issue ids keep their existing `jsonschema-form-*` prefix.
- The GitHub repository was subsequently renamed to `timkindberg/formframe`;
  GitHub redirects its previous URL. Renaming local checkout directories remains
  an optional operational follow-up.
- Historical planning notes in `history/` remain point-in-time artifacts.

## Consequences

- The public identity now matches the source-neutral architecture while still
  clearly describing a form library.
- `@formframe/core` reads as the stable form frame; input and consumer package
  names explain how data enters and leaves it.
- Every package import and cross-workspace dependency changes before v1.
- The build architecture stays unchanged because ADR 036 made it
  scope-agnostic.
- Repository search remains effective through package suffixes, metadata
  keywords, and explicit JSON Schema/Zod documentation.

## Alternatives Considered

- **Keep `@jsonschema-form/*`.** Rejected because it permanently privileges one
  input language in a schema-agnostic architecture.
- **Use `@schemaform/*` / SchemaForm.** Rejected because an unrelated package
  family already occupies the identity and would create avoidable confusion.
- **Use FormTree.** Rejected because an existing forms product already uses the
  name.
- **Use FormWork.** Rejected because several existing form platforms and
  libraries use close or identical names.
- **Publish aliases under both scopes.** Rejected because there are no published
  consumers to migrate.

---

**Relates to:** ADR 033 (input packages), ADR 035 (React binds trees), ADR 036
(package build), PR #56.
