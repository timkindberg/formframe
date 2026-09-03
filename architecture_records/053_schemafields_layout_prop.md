# ADR 053: Root Place-Yourself Is `layout`, Not JSX `children`

**Date:** 2026-08-19
**Status:** Accepted. **Annotated by [ADR 054](./054_layout_placements_resolve.md)** — layout placements resolve through intercept; `Default` accepts `layout` + `intercept`. **Annotated by [ADR 055](./055_layout_children_formshape.md)** — bound `layout` `root.children` is FormShape-keyed.
**Deciders:** Tim Kindberg
**Annotates:** [ADR 010](./010_recursive_continuation_rendering.md) (root place-yourself sugar), [ADR 017](./017_component_re_entry_layer.md) §4 (the two IOC seams)

## Context

ADR 010/017 made root place-yourself a **function-as-JSX-children** render prop: `<SchemaFields>{(root, helpers) => …}</SchemaFields>`, sugar for intercept firing on the root. That collides with three things product code actually needs:

1. **Inference.** JSX `children` is typed as `ReactNode` in too many paths (`React.FC`, array children, the implicit children slot). The callback’s `root` / `{ Default, Children }` do not infer. A named prop does.
2. **The word.** `children` is already React’s slot, already `{children}` on group/array handlers (ADR 047), and already `node.Children()`. The render-prop is none of those — it is **root layout**.
3. **Not intercept.** A function intercept is per-node and must pass unmatched nodes through. Root place-yourself is root-only. Overloading `intercept` would force the pass-through and the unstable-function remount footgun. The jobs stay two props.

## Decision

**Root place-yourself is the `layout` prop** on `SchemaFields` (and the bound `SchemaFields` from `useFormTree`):

```tsx
<SchemaFields
  layout={(root, { Default }) => (
    <>
      <Default of={root.children.email} />
      <Default of={root.children.name} />
    </>
  )}
/>
```

Same continuation as before: `layout` receives the enriched root plus `{ Default, Children }` and **replaces** the root template (group `root` does not run). Omit `layout` and the engine walks the tree through defaults / `intercept`. Nested `<Default of={node} />` in a layout is **placement** — intercept then template ([ADR 054](./054_layout_placements_resolve.md)).

`intercept` stays the per-node continuation (function / path map / bag). `layout` is not an alias for it.

The bound component is a function `(props) => ReactNode`, not `React.FC` — `FC` is how the old children callback lost its type.

FormShape-keyed `root.children.x` is [ADR 055](./055_layout_children_formshape.md) (bound `SchemaFields` from `useFormTree`). The typed-factory skin (ADR 010 Mode 2 JSX tags) is still separate. `layout` on an unbranded tree stays `EGroup`.

## Consequences

- Gallery App_08, handle tests, and inject tests use `layout={…}` instead of function children.
- ADR 010’s `<Form>{(root) => …}</Form>` spelling and ADR 017’s children-render-prop example are historical; the live surface is `layout`.
- Pre-1.0: no `children` alias.

## Alternatives considered

- **Keep children, drop `FC`.** Helps some inference; still fights JSX children typing and the overloaded word.
- **Call it `intercept`.** Rejected — different arity and job (see conversation on hide/show vs rearrange).
- **Call it `place` / `compose`.** Accurate to ADR 010 “place-yourself”; `layout` is the product-facing job (reorder, wrap, grids).
