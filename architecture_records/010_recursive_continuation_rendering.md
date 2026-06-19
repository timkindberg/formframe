# ADR 010: Recursive Continuation Rendering & Customization

**Date:** 2026-06-19
**Status:** Accepted
**Deciders:** Tim Kindberg

## Context

The differentiator vs. RJSF is *how you customize*: RJSF turns the hard 20% into ever-more `ui_schema`/rule-schema indirection because its overrides are schema-keyed registries. We want customization in **code (JSX)**, available at **any granularity**, where you only pay for what you change and the library renders the rest (ADR 007). This ADR locks the React rendering/customization model.

## Decision

**One recursive primitive — the continuation.** The renderer walks the form tree and calls a per-node hook `renderNode(node)`. The user re-enters the engine through components:

- `node.Default` — render this node's default composition (descendants still pass through `renderNode`).
- `node.Children` — render this node's child *nodes* through the resolver.
- `node.child(path).Default` — render one specific child (e.g. custom order).
- `part.Default` — render one part of a field.

Recursion lives in the **engine**; `renderNode` is the hook it calls per node; `Default`/`Children` are the re-entry points.

**Two granularities, same shape:**
- **Node scope** — sub-pieces are child nodes; intercept with `renderNode` (function) [or an overrides map — deferred].
- **Part scope** — sub-pieces are a field's parts; intercept with `parts={{ partName: (part) => JSX }}` on `node.Default`.

**Three moves at every node:** (1) take the default whole — `<node.Default/>`; (2) keep the default layout, swap sub-pieces — `parts={{…}}` / `renderNode`; (3) place the sub-pieces yourself — custom JSX using `node.child(p).Default`, `node.Children`, `node.parts.X.Default`.

**`Default` lives on the thing it renders** (`node.Default`, `part.Default`), and an override function always receives the whole sub-piece object (its data **and** its `.Default`), so "augment" and "replace" are one signature:

```tsx
label: (label) => <span><label.Default /><Info /></span>   // augment
input: (input) => <FancyInput {...input.attrs} />          // replace from data
```

**Fully fractal.** `Form` is the root node's `Default`: `<Form/>` = default; `<Form>{(root) => …}</Form>` = place-yourself at the root (sugar for `renderNode` firing on the root). The root's **parts** are the chrome (the `<form>` element, `submit`, `reset`/`cancel`, optional form-level title/description/error summary); the root's **children** are the top-level fields/groups. `renderNode` reappears, *scoped*, on any container `node.Default` (nearest scope wins). **Floors:** a field bottoms node-recursion (it has `parts`, no child nodes); an atomic part bottoms part-recursion.

**`Default`/`Children` are React-layer.** Core's node stays headless (ADR 006); the `node` passed to `renderNode` is the adapter's *enriched* wrapper. The same data is navigable on the Core node; render helpers are added by the adapter.

**Primitive vs. typed-factory skin.** The primitive uses explicit `.Default` plus keyed child access `node.children.street.Default` — works dynamically with loose types (Mode 1). *(Spike finding: a specific child must be reached as a JSX tag via keyed member access `node.children.x`, because a JSX tag name can't contain a function call; a `node.child('path')` method still exists for dynamic/relative lookup, but its result must be assigned to a capitalized variable to render.)* The `.Default`-free, keyed, *renderable* form (`<fields.address.street/>` with autocomplete, TanStack-Form-style) is the **typed factory skin** (Mode 2), earned by inferring the shape from the schema (epic `6nb`). Same engine underneath.

**Surfaces are registration skins on the one engine** (deferred): overrides-map (keyed dual of `renderNode`), compound slots, component registry (theme / UI-kit swap — an orthogonal axis), module factory (typed + reusable).

## Consequences

- You pay only for what you customize; the library renders the rest at every level — the anti-RJSF property.
- One engine to implement and teach; every surface and granularity is the same continuation.
- Core stays headless; render helpers are an adapter concern.
- The pretty typed `<fields.x/>` form is gated on `6nb`; until then, explicit `.Default` + method access.

## Alternatives Considered

- **RJSF-style type/widget template registry as the primary mechanism** — rejected as the base (that's the orthogonal *theming* axis, not per-node hijack); kept as the optional component-registry surface.
- **Node-is-a-component fused into the primitive** (no `.Default`) — rejected for the base (fuses Core identity with React rendering; "too clever"); adopted as the typed-factory skin, where types make it safe rather than clever.
- **Separate APIs per granularity** — rejected; node and part are the same primitive at two depths.

---

**Relates to:** ADR 006 (headless Core / adapters), ADR 007 (schema generates, JSX customizes), epic `6nb` (typing for the factory skin).
