# ADR 055: Bound `layout` `root.children` Is FormShape-Keyed

**Date:** 2026-08-20
**Status:** Accepted
**Deciders:** Tim Kindberg
**Annotates:** [ADR 048](./048_typed_tree_form_shape_binding.md), [ADR 053](./053_schemafields_layout_prop.md)

## Context

ADR 053 named the place-yourself prop `layout` so the callback would infer. That inference stopped at `root: EGroup`. `EGroup.children` is `Record<string, ENode>` — no autocomplete of `from`, no “this is a field vs a group”, no nested `address.street` without an `isGroup` guard.

ADR 053 deferred that to the typed-factory skin (ADR 010 Mode 2: `<fields.address.street/>` as a JSX tag). That skin is a different product. Keyed `root.children.x` is the **primitive** (`node.children.street`), indexed by the `FormShape` brand `useFormTree` already closes over (ADR 048). Throwing the brand away on `BoundSchemaFieldsProps` was a hole, not a missing epic.

## Decision

**Bound `SchemaFields` (from `useFormTree`) types `layout` off `TreeShapeOf<form>`.**

```tsx
const { SchemaFields } = useFormTree(jsonSchemaToTree(schema))
;<SchemaFields
  layout={(root, { Default }) => (
    // root.children.from is an EField; root.children.address is a group
    // whose .children.street is an EField. `root.children.nope` is an error.
    <Default of={root.children.from} />
  )}
/>
```

`<Default of={group} layout={…} />` keeps the same overlay: `of` is a `LayoutGroup` at that path prefix, so nested `layout` callbacks stay keyed.

Unbranded trees (`jsonSchemaToRuntimeTree`, plain `GroupNode`) and unbound `<SchemaFields form={…} />` stay `EGroup` — there is no concrete brand to index. The typed-factory skin (`<fields.x/>` without `.Default`) is still not this ADR.

## Consequences

- `useFormTree`’s branded overload already had `TS`; `BoundSchemaFieldsProps<TS>` uses it.
- Widget-narrowed `EField` parts (control archetype) stay the intercept-rules job (`FieldProps<Shape, P>`). Layout keys answer *which child* and *field vs group vs array*. Origin `S` (`EField<JSONSchemaObject>` / `EField<ZodType>`) is the tree-wide `facts.origin.schema` type (ADR 033), not a per-path subschema.
- Array item children stay `EArray`’s `Record<string, ENode>` for now (`${number}` paths — [#171](https://github.com/timkindberg/formframe/issues/171)). Array *layouts* work regardless (ADR 054); only the keyed typing of item children is deferred.
- The brand is only as exact as the front-end's inference. `$ref`, tuple `items`, and the combiners resolve to `unknown` in `InferData`, and a boolean property schema is typed but skipped at runtime — so a keyed child can claim `EField` where the runtime node is a group, or name a child that does not exist. This is inherited from ADR 048 (`useInterceptRules` already keys off the same brand), not introduced here — tracked separately.

## Alternatives considered

- **Wait for Mode 2 factory tags.** Rejected — this is the primitive, already in user code, already branded on `form`.
- **Generic unbound `SchemaFields<TS>` inferred from `form`.** `form` is `AnyGroupNode` at that seam; inference is unreliable. The hook is the place the generic is already closed over. Callers can still annotate `SchemaFieldsLayout<Shape>` if they hoist a layout off an unbound renderer.
