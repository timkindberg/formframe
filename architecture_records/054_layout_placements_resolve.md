# ADR 054: Layout Placements Resolve; `Default` Is Fractal

**Date:** 2026-08-20
**Status:** Accepted
**Deciders:** Tim Kindberg
**Annotates:** [ADR 010](./010_recursive_continuation_rendering.md), [ADR 017](./017_component_re_entry_layer.md), [ADR 053](./053_schemafields_layout_prop.md)

## Context

ADR 053 added `SchemaFields layout` as root place-yourself. That callback’s `<Default of={node} />` called `node.Default()` — the **template**, skipping intercept. Deep object/array nodes placed in a layout could not be intercepted, and could not themselves take `layout`. `<Default>` already accepted `intercept` (scoped template) but not `layout`. Product code (grids of nested groups) needs the two props to compose the same way `SchemaFields` does: **layout first, then intercept every placed node**.

Two `Default` meanings must stay distinct or intercept loops:

1. **Placement** (inside `layout`) — this node should go through intercept, then template.
2. **Re-entry** (inside intercept) — this node is already being intercepted; `<Default of={node} />` is the template (ADR 051: Default = defaults table, not the next intercept rule).

## Decision

**Layout placements `Resolve`.** Core enriched nodes gain `Resolve()` — `renderChild` / the active resolver (intercept, then template). `Default()` stays template-only.

React `<Default of={node} />` is still one module-level component (ADR 017). A place-mode context distinguishes the two jobs:

- `SchemaFields layout` (and `<Default layout>`) render their callback in place-mode. A bare `<Default of={node} />` there calls `node.Resolve()`.
- Intercept helpers still inject the same `Default`. Entering intercept forces place-mode off, so unmatched `<Default of={node} />` is the template and does not loop.

**`<Default>` accepts `layout` and `intercept`, like `SchemaFields`.** Fractal:

```tsx
<SchemaFields
  intercept={{ 'address.street': StreetHint }}
  layout={(root, { Default }) => (
    <Default
      of={root.children.address}
      layout={(addr, { Default: D }) => (
        <Grid>
          <D of={addr.children.street} />
        </Grid>
      )}
    />
  )}
/>
```

- `layout` on a node skips **that** node’s template (same as root) and runs the callback. Nested placements `Resolve`.
- `intercept` without `layout` stays today’s scoped `renderNode` on `Default()` (template this node; descendants use the scoped resolver).
- `layout` + `intercept` together: layout first; the intercept is the nearest resolver for nested placements (same nearest-scope rule as `<Default intercept>` without layout).

Parts still have only `Default()`; place-mode falls back to the template. Intercept helper identity is unchanged (`helpers.Default === Default`).

## Consequences

- Root `layout` + `intercept` compose without wrapping every placed field in a path intercept.
- Nested groups/arrays in a layout are themselves layout-able and intercept-able.
- Placing `<Default of={group} />` (no `layout`) now intercepts **that group**, not only its descendants via the template walk.
- Core `Resolve` is the adapter-agnostic name for “run the resolver on this node”; vanilla still uses `Default` / `Children` for the string fold.

## Alternatives considered

- **Two public components (`Place` vs `Default`).** Same runtime split, worse identity (`layout`’s `Default` would not be `typeof Default`). Context keeps one component.
- **Make intercept’s `Default` also `Resolve`.** Infinite loop on unmatched pass-through.
- **Leave nested `layout` off `Default`.** Rejects the fractal claim of ADR 010; deep groups in a root layout would need a second API.
