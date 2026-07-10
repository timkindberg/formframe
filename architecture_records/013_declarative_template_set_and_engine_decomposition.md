# ADR 013: The Renderer Adapter as the Customization Seam — and Decomposing FormRenderer

**Date:** 2026-06-21 (revised 2026-06-22)
**Status:** Accepted
**Deciders:** Tim Kindberg

## Context

With `useFormTree` established as pure sugar over the React renderer (ADR 010/035) and the continuation engine extracted to Core (ADR 014), the renderer's responsibilities became visible in one place — and the old `FormRenderer` bundled **three** distinct jobs:

1. **The engine** — recursion over the IR, `renderNode` dispatch, scoping, and the re-entry handles (`node.Default`/`Children`/`child`/`parts.X.Default`). *This already moved to Core (ADR 014).*
2. **A default template-set** — the hardcoded JSX for each node *kind* and *part* (`DefaultField`/`DefaultGroup`/`DefaultPart`).
3. **Form chrome** — the `<form>` element and the submit button.

Two observations forced this ADR. First, the override ergonomics: customizing one node means a `renderNode` arrow with a path check; customizing all nodes of a kind means a `renderNode` switch — a *function* where a structured **renderer set** reads better, and exactly what the old `Default*Template` overrides *felt* like, minus their dead-end (they couldn't hand control back to the engine). Second, Tim's framing: "FormRenderer maybe did too much all at once" — is the default rendering a *separable, injectable* concern, with a meaningful **lower rung** where the defaults are not assembled for you?

The original draft (Proposed) sketched a separate declarative `templates={…}` map desugaring to a kind-switching `renderNode`. A design grilling rejected that in favor of making **the renderer adapter itself** the override unit. This revision records what we built.

## Decision

### 1. The override unit is the renderer adapter — a *compound per node kind*

There is no separate `templates` map. The adapter the renderer hands to Core's `createContinuation` *is* the customization seam, organized by node kind, each kind a `root` (composition renderer) plus its parts:

```ts
interface RendererAdapter<R> {
  field: { root, label, description, input, select }
  group: { root, label, description }
  combine // plumbing: join sibling results
}
```

You customize by overriding entries **by reference**:

```tsx
const adapter = { ...defaultAdapter, field: { ...defaultAdapter.field, label: MyLabel } }
```

`root` follows the compound-component convention (Chakra/Radix/Ark — the root of *that* component); it's namespaced under the kind, so it does **not** collide with the form-tree root (`node.isRoot`). Parts are **per-node-context**: a field's `label` renders a `<label>`, a group's `label` renders a `<legend>` — genuinely different renderers, co-located where they belong. Each part's `Default` dispatches to `adapter[kind][partName]`, so the built-in defaults are *just the default renderer set*, not privileged engine code. Arrays/arrayItems are structural pass-through for now (interactivity deferred — bead `bi4`); they have no adapter entry and fold through `combine`.

### 2. A public floor with a diagnostic fallback

The lowest public rung, `createRenderer(partialAdapter)`, binds a renderer set and returns a `SchemaFields`-style component (React) / `renderToString`-style function (vanilla). The adapter is **partial**: any missing **content** renderer falls back to a visible `[… not implemented: {json}]` **diagnostic** marker, so an incomplete adapter still runs and tells you what's missing. `combine` is plumbing (no meaningful "[combine not implemented]"), so it always carries the framework's real default and sits outside the diagnostic floor.

Each renderer ships two built-in sets: the real **`defaultAdapter`** and the **`diagnosticAdapter`**. `createRenderer` is `createContinuation(mergeAdapter(diagnosticAdapter, partial))`; the batteries-included renderer is simply `createRenderer(defaultAdapter)`.

### 3. Chrome is the consumer's

The `<form>` element and submit button are **not** rendered by the library. The top-level component renders the form's *content only* and is renamed **`SchemaFields`** (it renders fields, not a `<form>`). Consumers wrap it:

```tsx
<form onSubmit={form.submit(onSubmit)}>
  <SchemaFields />
  <button type="submit">Submit</button>
</form>
```

This keeps renderers nesting cleanly (a `SchemaFields` inside another consumer's `SchemaFields` — the VNDLY nested-form pain — needs no chrome-stripping workaround) and resolves the App_08 spike's "submit is not a part" gap: submit was never a part; it's chrome, and chrome is the consumer's. `useFormTree` returns `{ form, SchemaFields }`.

### 4. The rungs, top to bottom

- `useFormTree(tree) → { form, SchemaFields }` — holds the compiled tree; sugar.
- `SchemaFields` — batteries-included; `createRenderer(defaultAdapter)`.
- `createRenderer(partialAdapter)` — the public floor; gaps → diagnostic markers.
- `createContinuation(adapter)` (Core) — the mechanism; takes a complete adapter.

## Resolved open questions (from the Proposed draft)

1. **Is a "no-defaults" rung worth exposing?** Yes — `createRenderer` with a partial set is exactly that altitude, made safe (not crash-y) by the diagnostic floor. New **App_05** demonstrates it coming alive.
2. **Where does form chrome live?** The consumer's (§3). Not engine, not a root-node part.
3. **What's the new example's altitude?** `App_05` ("React + Renderer Adapter — the floor"), just below the hook; the 01→08 discovery arc stays intact.
4. **Relationship to styling (ADR 012 §4) and the UI-kit swap.** Unchanged: the renderer set, styling-hooks axis, and a full UI-kit are points on one spectrum; this ADR doesn't pre-empt the UI-kit boundary.

## Consequences

- The presentation seam is now one well-typed contract (`RendererAdapter<R>`) that every renderer and future UI kit conforms to — the genuine hard-to-reverse commitment here (the rest — the `SchemaFields` rename, chrome-out, diagnostic base — is reversible/additive). Pre-1.0 with zero external adapters, even the contract is cheap to reshape today.
- Recovers the ADR-004 template *feel* (declarative, by-reference overrides) without the dead-end: every entry re-enters the engine.
- `Default*Template` and the `templates`-map sketch are both superseded.

## Alternatives Considered

- **A separate declarative `templates={…}` map** (the original Proposed draft) — rejected: a second namespace over the same mechanism; making the adapter itself the override unit is one concept, not two.
- **Flat renderer record** (`{ field, group, label, input, …, combine }`) — rejected in the grill: it blurs node- and part-altitude into one namespace and can't express per-node-context parts (`field.label` ≠ `group.label`).
- **Keep chrome in the component** — rejected: nesting renderers then requires stripping a nested `<form>`; additive to re-add later as an optional wrapper if wanted.
- **Resurrect `Default*Template`** — rejected: they dead-end (no re-entry), the very flaw the continuation model (ADR 010) fixed.

---

**Relates to:** ADR 004 (the original React default templates — superseded mechanism), ADR 010 (continuation rendering; the named-but-deferred registration skin), ADR 008 (swappability earned by a second implementation), ADR 012 §4–§5 (styling axis; kind-level overrides), ADR 014 (the continuation engine in Core).
