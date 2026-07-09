# Architecture & Design Decisions

This document captures the architecture of the JSON Schema Form library: what Core is, how adapters hang off it, and how rendering/customization works. For the decision history behind each section, see `architecture_records/`. For vocabulary, see `CONTEXT.md`.

## Core: the form-tree IR

**Core is the form tree** — an intermediate representation (IR) — plus the recursive fold over it. It is stateless, framework-agnostic, and imports nothing ([ADR 006](./architecture_records/006_core_as_form_tree_ir_with_adapters.md)).

Earlier drafts described Core as a JSON Schema *parser* inside a five-layer linear stack. That framing is superseded: JSON Schema is only one possible **front-end** — a Zod schema or a TypeScript type carries the same shape information and is an equally valid source. The entry point is named `jsonSchemaToTree`, not `parseSchema`, so the seam stays honest about what Core's identity actually is.

We deliberately do not commit to a layered-stack vs. hub-and-spoke diagram. The dependency reality is more hub-and-spoke than linear — validation is framework-agnostic and rides directly on Core, not "above" React; a UI kit may ship its own form-state. The one firm invariant is the **stubborn Core boundary**: Core imports nothing, holds no state, touches no DOM or framework.

### Adapters: front-ends and consumers

Everything outside Core is an adapter, and adapters are first-class and **user-writable** — the extension model is "write an adapter," never "fork Core."

- **Front-end** — compiles a source schema *into* the tree (the JSON Schema front-end today).
- **Consumer** — folds *over* the tree to produce something: a framework binding, validation, form-state, rendered UI.

### Capability slots

A **capability slot** is a swappable responsibility: structure, validation, framework-binding, form-state, presentation. Swappability is per-slot — one package may fill several slots at once (e.g. a UI kit that ships its own form-state). Slots are filled by adapters; which slots exist and how they're divided is allowed to evolve as real second implementations force the seams (see "Swappability," below).

## The Tree Structure

Core's primary job is to compile a schema into a **navigable tree structure** representing the shape of the form.

### Node Types

```typescript
type NodeType = 'root' | 'group' | 'field'
```

**Field Node** (leaf): a single form input — path, widget type, required flag, HTML attrs, schema reference, and `parts` (the framework-agnostic render structure for that field).

**Group Node** (branch): a nested object — path, title, description, required flag, children. Can contain Fields or other Groups. Objects in JSON Schema carry their own metadata (title, description, required status), so they deserve their own node type.

**Root Node**: the top-level container — children, plus query methods for both tree traversal and flat access.

### Tree Traversal Patterns

```typescript
// Pattern 1: Tree walking (preserves hierarchy)
form.root.children.forEach(node => {
  if (node.nodeType === 'group') {
    node.children.forEach(field => {
      // render inputs
    })
  }
})

// Pattern 2: Flat access (convenience)
form.getAllFields()           // => Array of all leaf fields
form.getField('address.street') // => Direct path access, relative to the calling group
```

### Widget Determination

Core keeps widget types **minimal and unopinionated**: the default widget is `'input'`, with a computed `attrs` object carrying HTML attributes (type, min, max, etc.). Framework and presentation adapters can override or extend this — Core doesn't know what UI components consumers want, so it stays flexible.

## Product model: schema generates, JSX customizes

**A schema generates the form automatically** — that's the reason the library exists. Hand-authoring a whole form node-by-node is a non-goal ([ADR 007](./architecture_records/007_schema_generates_jsx_customizes.md)).

Customization has two surfaces:

- **JSX (code)** — the first-class, default surface. Override any node with your own JSX and re-enter the default renderer for that node's subtree. This is the differentiator vs. RJSF.
- **Serializable schema (data)** — for DB-driven cases where the customization itself must be stored, not just the schema. This heavier path is pushed into adapters (including user-written ones), and its precise shape is deliberately deferred.

**Guardrail:** never grow the *core* schema vocabulary to solve a customization problem. A new core `ui_schema` keyword is a smell that the form is actually static and should use JSX instead.

## Rendering & customization: the continuation model

The React renderer is built on **one recursive primitive: the continuation** ([ADR 010](./architecture_records/010_recursive_continuation_rendering.md)), re-entered through two stable JSX components ([ADR 017](./architecture_records/017_component_re_entry_layer.md)). Recursion lives in the engine; the user re-enters it by mounting a handle:

- `renderNode(node, { Default, Children })` — the per-node hook the renderer calls while walking the tree. Return custom JSX to hijack a node, or `<Default of={node} />` to keep the default. The helpers are injected (also importable).
- `<Default of={node} />` — render this node's default composition; descendants still pass through `renderNode`.
- `<Children of={node} />` — render this node's child nodes through the resolver.
- `<Default of={node.children.x} />` — render one specific child node (any handle on `of`; `of={null/undefined}` renders nothing).
- `<Default of={node} parts={{ partName: (part) => <JSX/> }} />` — override individual parts of a field; each part is itself a handle (`<Default of={part} />`), so "augment" and "replace" are the same signature.

**Three moves at every node:** take the default whole; keep the default layout and swap sub-pieces; or place the sub-pieces yourself with custom JSX. This is progressive disclosure — work at the highest level (`<SchemaFields/>`, all defaults) and drop down precisely where you need control: swap a part, place the sub-pieces, or fall all the way to the raw `walk`.

**Fully fractal** — `<SchemaFields/>` resolves the form tree to its defaults. `<SchemaFields>{(root, { Default }) => …}</SchemaFields>` places yourself at the root, which is sugar for `renderNode` firing on the root. `SchemaFields` renders the form's *content only* — the chrome (the `<form>` element, submit, reset/cancel) is the consumer's, not a root part (ADR 013); the root's *children* are the top-level fields/groups. `renderNode` reappears, scoped, via `<Default of={container} renderNode={…} />` — nearest scope wins. A field bottoms node-recursion (it has parts, no child nodes); an atomic part bottoms part-recursion.

`Default`/`Children` are stable, module-level components that delegate to the node's own callable re-entry points — the callables are generic over the result type `R` and owned by Core's `createContinuation` (ADR 014), so the JSX layer (ADR 017) is React-only sugar with no remount (ADR 016). Core's node stays headless data; enrichment wraps it with these handles at fold time.

A typed-factory skin (`<fields.address.street/>`, `.Default`-free, keyed and renderable) is planned on top of the same engine once shape inference lands — see ADR 010 for status.

## Swappability: earned, not designed

Designing every swap seam up front requires taste and tends to produce speculative, wrong abstractions from a single example. Instead, **swappability is earned by a second implementation** ([ADR 008](./architecture_records/008_swappability_earned_by_second_implementation.md)):

- **Phase A** — Core plus the **zero-dependency reference stack**: React, native `<form>` + FormData (uncontrolled, submit-time, zero value-driven re-renders) for form-state, no validation, bare default UI templates. The stubborn Core boundary is the only hard architectural gate.
- **Phase B** — fill/swap one slot at a time, letting each *first real adapter* carve its seam (contract tests + a throwaway fake adapter written at that moment). Priority: **validation and UI first** (visible, high-investment swaps), **form-state last and optional** ([ADR 011](./architecture_records/011_form_state_is_a_shallow_slot.md)):
  - Validation → AJV, then Zod (via Standard Schema)
  - Presentation → Chakra, then raw React + Tailwind
  - Form-state → RHF / TanStack Form, justified only by reactivity needs or interop with existing infrastructure — never swapped for its own sake
  - Framework stays React for now (no second framework yet — YAGNI)

**Rule-of-three:** an abstraction is not extracted until a second real adapter demands it. Phase-A "everything else" stays honestly decomposed into well-named files/folders even while cross-importing freely, so a later seam extraction is "promote a folder to a package," not "untangle a hairball."

**Performance is per-adapter, not a universal guarantee.** Some form libraries are inherently slower than others; we gate only our own non-degradation — the library must add no re-renders on top of whatever reactivity the host form-state adapter provides.

## Form-state is a shallow slot

In a schema-driven form, the end user never sees the form-state library — it's plumbing slotted into an adapter, unlike validation and UI, which are visible and where teams have real existing investment ([ADR 011](./architecture_records/011_form_state_is_a_shallow_slot.md)).

- The default form-state adapter is **headless**: it wraps no external library. The minimal headless adapter is native `<form>` + FormData — uncontrolled, submit-time, zero dependencies, covering the static majority of forms.
- External form-lib adapters (RHF, TanStack Form) are **optional**, justified only by:
  1. **Reactivity** — live/conditional behavior (show B when A==X, live validation errors, dirty/touched, reactive arrays) that submit-time FormData can't do.
  2. **Interop** — backing forms with a team's existing form infrastructure (shared resolver, submit pipeline, devtools).
- We do not chase every form library — native plus at most RHF/TanStack.
- *Live* validation display requires a reactive form-state adapter; submit-time validation works fine on the native adapter.

A first-party reactive store (dependency-free live behavior without reaching for RHF/TanStack) is a deferred idea — YAGNI until a concrete need (e.g. live tenant rules) forces it.

## Type System Decisions

We use **`json-schema-typed`** (draft-07) for the JSON Schema front-end's types: battle-tested (120M+ downloads), supports modern drafts, no known vulnerabilities, and stable enough that its type definitions don't need constant updates. Since Core is schema-agnostic (ADR 033), this dependency and the `JSONSchema` type live in **`@jsonschema-form/input-jsonschema`**, which re-exports it:

```typescript
export type { JSONSchema } from 'json-schema-typed/draft-07'
```

This lets consumers import the schema type from the JSON Schema front-end without knowing its internal dependencies; Core itself imports no schema language.

## What We Decided Against

### ❌ High-Level "Kitchen Sink" Components
```typescript
// We DON'T provide this
<JsonSchemaForm schema={schema} onSubmit={handleSubmit} />
```
Too opinionated — teams might build this themselves, but it's not this library's job. We provide building blocks.

### ❌ Vanilla/HTML String Layer
We explored a pure HTML string renderer (`renderToHTML(form, values) // => '<form>...'`) as a first rendering surface. Nobody would actually use it in practice; it was unnecessary indirection. We go straight to framework adapters (React first).

### ❌ Stateful Core
We considered having Core manage form values directly (`core.setValue(...)`, `core.getValue(...)`). Different form-state adapters want to manage state differently; keeping Core stateless gives maximum flexibility and avoids competing with form libraries on their own turf.

### ❌ Baked-in Validation
Validation libraries are framework-agnostic and should be side-loaded, not forced into Core or any single layer's architecture.

### ❌ Designing all swap seams up front
Speculative, taste-heavy, premature abstraction — and not verifiable by the gate suite. See "Swappability," above.

---

**Last Updated:** 2026-06-19
**Contributors:** Tim Kindberg
