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

**A scoped layout is a whole scope, not one call.** `Resolve({ renderNode })` scopes a *single* call, so `<Default of={x} intercept={…} layout={…} />` originally left every other handle on the callback's node bound to the **outer** resolver: `<Children of={node} />` rendered its children through the outer intercept, silently contradicting "nearest scope wins". Core enriched nodes therefore also gain **`rebind(renderNode)`** — re-enrich this node against another resolver, so `Children`, `child`, `children.x`, `Resolve`, and an array's `renderItem` all agree, and navigation *from* the rebound handle stays scoped. The adapter hands the layout callback the rebound handle. `enrich` was already the primitive; `rebind` just makes it reachable from a handle.

**`parts` at a placement beats an ambient intercept.** They cannot compose: an intercept that replaces a node outright has nowhere to apply part overrides. The inline overlay at the placement site is the more specific instruction, so `<Default of={x} parts={…} />` inside a layout renders the **template with overrides** and does not run the ambient intercept for `x`. Same nearest-scope rule, applied to the template axis.

**A custom array `layout` re-installs array state.** Add/remove state lives above the replaceable `array.root` (ADR 051 §3), which is exactly the template a `layout` skips — so `layout` on an array node installs it itself. Inside that callback `<Children of={array} />` yields the provider's **live slots**, not Core's static seed children, and `<Default of={array.parts.addButton} />` is wired.

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
- Core `Resolve` is the adapter-agnostic name for “run the resolver on this node”; vanilla still uses `Default` / `Children` for the string fold. `rebind` is navigation, not rendering, so it is lowercase.
- **A layout that reorders nodes must key its placements.** Placements bypass the engine's `combine`, which is what supplies child keys in the normal walk, so React reconciles a reordered placement by position and an uncontrolled input keeps the previous field's value under the new field's name. Write `<Default key={node.path} of={node} />` when the order is dynamic. The engine cannot key this for you: a child's reconciliation key must be its *relative* identity, because a re-pathed array item (`contacts.1` → `contacts.0`) changes the absolute path of every descendant and an absolute-path key would remount surviving subtrees and discard their values.
- `Default` now carries four axes (`parts`, `intercept`, `layout`, `errors`) with a defined precedence: `layout` first, then `parts`/`intercept` as a template call, then a bare placement `Resolve`. That is the ceiling — a fifth axis should be a different component, not another prop.

## Alternatives considered

- **Two public components (`Place` vs `Default`).** Same runtime split. The identity objection (`layout`'s `Default` would not be `typeof Default`) is weak on its own — helpers could inject `Place` and satisfy the same test. The real reason to keep one component is that placement-vs-re-entry is the *same intent* ("render this node here") differing only in whether an interceptor has already had its turn. **Revisit if the ambient place-mode context keeps producing bugs**: the known cost is that a `<Default of={node} />` extracted into a shared helper component behaves differently depending on where it is mounted, and its props do not disclose that.
- **Make intercept’s `Default` also `Resolve`.** Infinite loop on unmatched pass-through.
- **Leave nested `layout` off `Default`.** Rejects the fractal claim of ADR 010; deep groups in a root layout would need a second API.
- **Thread placement `parts` through the resolver hop** (so `parts` and intercept compose) via a context, the way injected `errors` already travels. Rejected: it makes the precedence invisible rather than defined, and stacks a third ambient context on the two this ADR already introduces.
