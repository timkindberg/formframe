# ADR 055: `layout` `root.children` Is FormShape-Keyed

**Date:** 2026-08-20
**Status:** Accepted
**Deciders:** Tim Kindberg
**Annotates:** [ADR 048](./048_typed_tree_form_shape_binding.md), [ADR 053](./053_schemafields_layout_prop.md)

## Context

ADR 053 named the place-yourself prop `layout` so the callback would infer. That inference stopped at `root: EGroup`. `EGroup.children` is `Record<string, ENode>` — no autocomplete of `from`, no “this is a field vs a group”, no nested `address.street` without an `isGroup` guard.

ADR 053 deferred that to the typed-factory skin (ADR 010 Mode 2: `<fields.address.street/>` as a JSX tag). That skin is a different product. Keyed `root.children.x` is the **primitive** (`node.children.street`), indexed by the `FormShape` brand `useFormTree` already closes over (ADR 048). Throwing the brand away on `BoundSchemaFieldsProps` was a hole, not a missing epic.

## Decision

**`SchemaFields` types `layout` off `TreeShapeOf<form>` — bound or unbound — and a kind-unknown handle needs no guard.**

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

`<Default of={group} layout={…} />` keeps the same overlay: `of` is a `LayoutGroup` at that path prefix, so nested `layout` callbacks stay keyed. The unbound `<SchemaFields form={…} layout={…} />` reads the brand straight off the `form` prop, so both doors behave the same (the hook is partial application, not the only place typing happens).

### Kind-unknown handles carry every kind's surface

Two places genuinely cannot know a node's kind: an unbranded tree (`jsonSchemaToRuntimeTree`, plain `GroupNode`) and a dynamic `child(path)` lookup. Typing those as Core's `ENode` union made the guard mandatory before you could touch anything kind-specific:

```tsx
// before — a ternary the consumer cannot act on differently anyway
const address = root.children.address
return address.isGroup ? <Default of={address} … /> : null
```

So the fallback is not Core's disjoint union but a union of the same four handles **each carrying the other kinds' keys typed `undefined`** (`AnyKindNode` / `AnyKindGroup`, internal to `layoutShape.ts`). Unnarrowed access compiles and yields `T | undefined` — `node.parts.addButton`, `node.children?.street`, `node.Children?.()` — while `if (node.isArray)` still narrows, because the discriminants are untouched. It composes with the re-entry layer, which is already null-safe: `<Default of={undefined} />` renders nothing, and `<Children of={field} />` renders nothing.

Keys are derived from the union itself (`KeysOfUnion`), so a new kind-only member on a Core handle is covered without editing a list. This is a React-layer overlay — Core's `ENode` stays a plain discriminated union for `walk`/`intercept`.

The typed-factory skin (`<fields.x/>` without `.Default`) is still not this ADR.

## Consequences

- `useFormTree`’s branded overload already had `TS`; `BoundSchemaFieldsProps<TS>` uses it. `SchemaFieldsProps<F>` derives the same `TS` from the `form` prop, and `useFormTree` now passes `layout` straight through (no cast).
- **`parts` callbacks on a kind-unknown handle don't infer their parameter.** `DefaultOptsOf<H>` over a union yields a *union* of override maps, and TS won't contextually type a callback against a union. Excess-property checking still rejects a bogus key. This predates the overlay (it was already true of the `ENode` union) and is the reason to reach for a keyed child or an `isField` narrowing when you want typed part callbacks.
- Widget-narrowed `EField` parts (control archetype) stay the intercept-rules job (`FieldProps<Shape, P>`). Layout keys answer *which child* and *field vs group vs array*. Origin `S` (`EField<JSONSchemaObject>` / `EField<ZodType>`) is the tree-wide `facts.origin.schema` type (ADR 033), not a per-path subschema.
- Array item children stay `EArray`’s `Record<string, ENode>` for now (`${number}` paths — [#171](https://github.com/timkindberg/formframe/issues/171)). Array *layouts* work regardless (ADR 054); only the keyed typing of item children is deferred.
- The brand is only as exact as the front-end's inference. `$ref`, tuple `items`, and the combiners resolve to `unknown` in `InferData`, and a boolean property schema is typed but skipped at runtime — so a keyed child can claim `EField` where the runtime node is a group, or name a child that does not exist. This is inherited from ADR 048 (`useInterceptRules` already keys off the same brand), not introduced here — tracked separately.

## Alternatives considered

- **Wait for Mode 2 factory tags.** Rejected — this is the primitive, already in user code, already branded on `form`.
- **Keep the unbound `SchemaFields` unbranded.** Rejected on a second look. The first pass here assumed inference off `form: AnyGroupNode` would be unreliable and left the generic to the hook. It isn't: `SchemaFieldsProps<F extends AnyGroupNode>` infers `F` from the prop and `TreeShapeOf<F>` reads the brand, which typechecks across every existing call site. Leaving it out meant the batteries-included component silently lost typing the hook had — and that asymmetry is what pushed the tests onto guards.
- **Leave kind-unknown handles as Core's `ENode` union.** Rejected — it makes a guard mandatory for information the consumer has no way to supply, in a layer whose whole re-entry surface is already null-safe.
- **Loosen Core's `ENode` itself (or the `intercept` node).** Deferred. Same absent-key trick would work, but it widens a Core public type (and every `walk` handler) to fix a React-layer ergonomics problem. Revisit if `intercept` guards prove as annoying as layout guards were — that's a second implementation forcing the seam (ADR 008), not a guess.
- **Give field handles real empty `children` / `Children()` at runtime** so no `?.` is needed at all. Rejected for now: it buys one character per call site by making Core's field handle answer container questions, and blurs the field/container split for the vanilla renderer and the conformance oracle too.
