# ADR 035: React Binds Form Trees, Not Schemas

**Date:** 2026-07-10
**Status:** Accepted (bd `jsonschema-form-glf`)
**Deciders:** Tim Kindberg
**Extends:** ADR 013 (React convenience rung), ADR 033 (schema-agnostic Core +
front-end packages), ADR 034 (Zod front-end)

## Context

The React convenience hook was introduced while JSON Schema was the only
front-end. It therefore accepted a JSON Schema, compiled it internally, then
owned the behavior that is actually common to every form tree: presentation,
bound rendering, native submission, validation issue state, live revalidation,
and touched/submit state.

ADR 033 moved JSON Schema compilation out of Core, and ADR 034 added a
structurally different Zod front-end. Keeping schema compilation inside the React
hook would make JSON Schema privileged and force Zod users to drop to a lower
rendering rung despite both inputs producing the same `GroupNode<S>`.

The real React seam is the form tree, not any source schema.

## Decision

**`@jsonschema-form/react` exposes `useFormTree(tree, options)` as its sole
convenience hook.** Callers compile with an input package first:

```tsx
const tree = jsonSchemaToTree(jsonSchema)
const form = useFormTree(tree, {
  validator: createAjvValidator(jsonSchema),
})
```

```tsx
const tree = zodToTree(zodSchema)
const form = useFormTree(tree, {
  validator: createZodValidator(zodSchema),
})
```

`useFormTree<S>` accepts `GroupNode<S>` and preserves `S` for the returned tree
and `PresentationResolver<S>`. It owns:

- layered default + consumer presentation;
- a stable `SchemaFields` component bound to the presented tree;
- native `FormData` submission;
- optional validator execution and issue state;
- live `revalidate`;
- touched and submitted state.

Schema recognition and compilation remain entirely in input packages.

### No source-specific compatibility hook

The previous JSON-Schema-specific hook is removed rather than retained as
another public rung. A wrapper would preserve the exact coupling this decision
removes, keep `@jsonschema-form/input-jsonschema` as a React peer dependency, and
leave two ways to teach the same behavior.

JSON Schema now takes the same explicit compile-then-bind path as Zod. The extra
line makes the architecture visible and keeps every future front-end equal.

### Tree identity

The input tree should have a stable reference. Module-scope schemas can compile
at module scope; schemas received as props should compile under `useMemo`.
Changing the tree reference intentionally rebinds and re-presents the form.

## Consequences

- React no longer has a peer dependency on the JSON Schema input package.
- JSON Schema and Zod get identical rendering, submission, validation, touched,
  and presentation behavior.
- A new front-end needs only to produce a Core tree; React requires no change.
- The hook's interface names its true dependency and is independently testable
  with any tree origin.
- JSON Schema quick starts gain one explicit compilation line.
- This is a breaking pre-1.0 public-interface change; there is deliberately no
  deprecated alias.

## Relationship to earlier ADRs

The earlier decisions about content-only rendering, side-loaded validation, live
validation, touched state, presentation, and continuation rendering remain in
force. This ADR changes only the hook interface and moves compilation fully to
the input-package side of the React seam.
