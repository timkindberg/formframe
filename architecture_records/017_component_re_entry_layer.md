# ADR 017: Component Re-entry Layer — JSX Handles over the Callable Engine

**Date:** 2026-06-24
**Status:** Accepted
**Deciders:** Tim Kindberg

## Context

ADR 016 removed a real remount footgun: the React fold had been **mounting** a
per-render handle closure as JSX (`<node.Default/>`), which made the component
*type* new on every render, so any genuine re-render unmounted the subtree and
discarded uncontrolled input values. 016's fix was to render by **calling** the
handle — `{node.Default()}` — exactly as the vanilla string fold is forced to.
That made re-renders safe and unified the two adapters.

But 016 §4 also promoted *calling* to the **public** customization ergonomic, and
that overcorrected. The defect was never "JSX is bad" — it was "a fresh closure
mounted as a fresh *type*." JSX over a **stable** type reconciles in place just
fine. Rendering by calling functions (`{node.Default()}`, `{node.Children()}`,
`{node.children.longitude.Default()}`) reads as imperative and abandons the
declarative tree ADR 010 set out to give consumers. The objection was explicit:
keep `<node.Default/>` ergonomics, but solve the *closure churn*, not by trading
JSX for function calls.

The resolution is to separate the two things 016 had conflated: the **component
type** (must be stable to reconcile) and the **per-render work** (the handle,
which legitimately changes). If the type is a single module-level component and
the handle rides in as a *prop*, React diffs the prop and reconciles — no
remount, no impurity, and the JSX tree is back.

## Decision

**Add a thin, React-only component re-entry layer over 016's callable handles.**
Two module-level components — `Default` and `Children` — take the handle as an
`of` prop and delegate to its bound callable. The component *type* is constant
across renders; the changing part is data on `of`. This restores JSX re-entry
(`<Default of={node} />`) with 016's stable-type guarantee intact. **The engine
is unchanged** — the callables remain the primitive (vanilla still calls them;
React internals still call them through 016's `renderPart`/`PartHost`); this
layer is pure by-reference delegation that rides entirely on that substrate.

### 1. `Default` / `Children` — one stable component each

```tsx
<Default of={handle} />     // ≡ handle.Default()
<Children of={container} /> // ≡ container.Children()
```

Each is a module-level function component. `<Default of={x} />` is literally
`x.Default()` wrapped in a constant type, so it reconciles in place where the old
`<x.Default/>` (the closure *as* the type) remounted. The per-render handle is
demoted from "the component" to "a prop."

### 2. Uniform over node, child, and part — and null-safe

`of` accepts **anything with a `.Default()`**: a node, an out-of-position child
(`of={node.children.longitude}`), or a **part** (`of={node.parts.label}`). One
component subsumes what ADR 010 split across `node.Default`, `child().Default`,
and `parts.X.Default`. `of={null | undefined}` renders nothing, so optional parts
and absent children need no guard: `<Default of={field.parts.description} />`
just disappears when there is no description. `Children` is likewise kind-safe (a
non-container renders nothing).

### 3. Overrides are typed props

The node-only options become props: `<Default of={node} parts={{…}}
renderNode={…} />`. `parts` keeps its **precise per-node** override typing
(ADR 012) — derived from the actual handle via `DefaultOptsOf<H>`, so a part
(which has no options) offers neither prop by type. A scoped `renderNode` prop is
itself a `RenderNode` and is adapted to Core's 1-arg resolver internally.

### 4. The two IOC seams inject `{ Default, Children }`

`RenderNode` becomes `(node, helpers) => R` and the root render-prop becomes
`(root, helpers) => R`, where `helpers = { Default, Children }`:

```tsx
<SchemaFields renderNode={(node, { Default }) => <Default of={node} />} />
<SchemaFields>{(root, { Default }) => <Default of={root.children.name} />}</SchemaFields>
```

Both components are **also exported** for `import`. Part-override callbacks
(`parts={{ label: (label) => … }}`) are not handed helpers explicitly — the
injected `Default`/`Children` are already in lexical scope (or importable). This
keeps the IOC entry points self-contained without forcing an import, while not
over-threading helpers through every nested callback.

### 5. Engine and navigation API unchanged

Core's `enrich`, the callables, `renderChild`/`renderPart`, and `PartHost` are
untouched. So is the **navigation/data** API: `node.children`, `node.child()`,
`node.parts` (as data), and the core field/query members. Only the *render
handles* gain a component spelling; everything you traverse stays the same.

## Consequences

- **JSX re-entry is back, without the remount.** `render-stability.test.tsx`'s
  sharp case — an inlined `renderNode` that forces every `NodeRenderer` to
  re-render — now re-enters via `<Default of={node} />` and still keeps the
  input's value *and* its exact DOM node. A new `handles.test.tsx` pins the whole
  surface (injection, parts, `<Children of/>`, null-safety, re-render stability).
- **Pure.** The components read `of` and call it; nothing mutates during render,
  so the layer is safe under concurrent React — the explicit reason a
  "mutable current resolver on the node" alternative was rejected.
- **Conformance proves the delegation is faithful.** The React override cases in
  `conformance.test.tsx` now use `<Default of={node} />` / `<Default
  of={node.parts.label} />` and still match the vanilla **call-form** oracle
  byte-for-byte — i.e. the component layer is exactly `x.Default()`.
- **Smaller surface, one concept.** Node, child, and part re-entry collapse to a
  single `<Default of={…} />` (plus `<Children of={…} />`), replacing three
  differently-spelled handles. The callables remain public and low-level; the
  components are the blessed ergonomic.
- **No new fibers of consequence.** `Default`/`Children` are transparent
  (they return their delegate's markup); the mounted component types are still
  just `NodeRenderer`, `ArrayRoot`, and `PartHost`. The perf contract
  (`render-counts.test.tsx`) is unchanged and green.

## Alternatives Considered

- **`node.default` (lowercase) pre-bound to a `<Default of={node} />` element.**
  Rejected: a per-node bound *element* would be re-created each `enrich` (its own
  identity churn / impurity), and storing JSX on the node couples Core to React.
  A prop-driven component keeps Core framework-free and the type stable. (This
  was the user's first instinct; we landed on the uniform component instead.)
- **Context-supplied resolver so `<node.Default/>` can stay zero-prop.** Rejected:
  it breaks for out-of-position children — `<Default of={node.children.longitude}
  />` rendered from a *parent's* `renderNode` would read the parent's scope, not
  longitude's. The `of` prop carries the correctly-bound handle explicitly.
- **A mutable "current resolver" on the node.** Rejected: mutation during render
  is impure and unsafe under concurrent React.
- **Keep 016's `{node.Default()}` as the only API.** Rejected on the ergonomic
  objection above — but it remains the *underlying primitive* the components
  delegate to, and the contract vanilla is held to.
- **Thread helpers into every nested override callback.** Deferred: only the two
  top-level IOC entry points inject `{ Default, Children }`; nested part callbacks
  use lexical scope or import. Expandable later if a real case forces it (ADR 008).

---

**Relates to:** ADR 010 (restores its JSX re-entry ergonomic, now spelled
`<Default of={node} />` over a stable type), ADR 016 (**partially supersedes its
§4** public-API decision — re-enter by *mounting* the stable `<Default of/>`
component, while keeping 016's call-based *internals* and the `renderPart` /
`PartHost` substrate that makes it safe), ADR 013 (`RenderNode` and the root
render-prop grow the injected `helpers` argument; the components are exported from
the renderer set), ADR 012 (the `parts` prop preserves precise per-node override
typing).
