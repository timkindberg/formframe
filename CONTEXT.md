# FormFrame

FormFrame is a schema-driven form library. A schema automatically generates a form; you customize any part of it — in code (JSX, the default surface) or in serializable schema (for DB-driven cases, via adapters). It sits between RJSF (schema for everything, including the painful customization) and form libraries like React Hook Form / TanStack Form (code for everything, no auto-generation).

This file is a glossary, not a spec. It defines the project's shared vocabulary so we speak precisely. Strategy, principles, and decisions live in `history/` and `docs/adr/`.

## The model

**Core**:
The hub. Owns the form tree and the recursive fold over it. Stateless, framework-agnostic, imports nothing.
_Avoid_: kernel, parser (parsing is one front-end, not Core's identity). "Engine" is fine for the continuation mechanism *within* Core (see **Continuation** — "the continuation engine"), just not as a bare synonym for Core-the-hub.

**Form tree** (the IR):
Core's internal representation of a form — the intermediate representation that every front-end compiles *into* and every consumer folds *over*.
_Avoid_: AST, model, schema (the schema is a source, not the tree).

**Continuation** (the fold):
Core's generic recursive fold over the form tree — `createContinuation<R>`, parameterized by the renderer's result type `R`. It enriches each node with its re-entry points (`Default`/`Children`) and threads the active `renderNode`; every renderer adapter plugs into it. ADR 014 also calls this **the continuation engine**.

**Front-end**:
An adapter that compiles a schema *into* the form tree (e.g. the JSON Schema front-end, the Zod front-end).
_Avoid_: parser, loader.

**Consumer**:
An adapter that folds *over* the form tree to produce something (a framework binding, validation, form state, rendered UI).

**Spoke** / **Adapter**:
Any pluggable package that hangs off Core. Used interchangeably. First-class and user-writable — the extension model is to write an adapter, not fork Core.
_Avoid_: layer (implies a strict linear stack; the shape is deliberately undrawn — see ADRs).

**Capability slot**:
A swappable responsibility: structure, validation, framework-binding, form-state, presentation. Swappability is per-slot — one package may fill several slots (e.g. a UI kit that ships its own form-state).

## Input support

**Compilation status**:
The support catalog's outcome for translating a source construct into the form tree: supported, qualified, degraded, ignored, or rejected. This axis says nothing about full-source validation.
_Avoid_: validation support, catch-all support status

**Validation-only semantics**:
Source behavior enforced or produced by a validator but not represented in the compiled form tree. This is orthogonal to compilation status.
_Avoid_: unsupported

**Degraded compilation**:
A source shape is accepted but represented by a less-specific fallback shape in the form tree.
_Avoid_: ignored

**Ignored construct**:
A source modifier has no compilation effect on an otherwise recognized shape.
_Avoid_: degraded

**Form-state adapter**:
The slot that holds values + reactivity. *Headless* (wraps no external lib — native `<form>` + FormData is the minimal one; a first-party reactive store would be a richer one, deferred) or *wrapped* (React Hook Form / TanStack Form — optional, for reactivity + interop). A shallow slot; validation and UI are the primary swaps (ADR 011).

## Validation

**Validation run**:
One validator invocation over a point-in-time, whole-document input snapshot. Its result and transformed output remain tied to that snapshot.

**Validation result**:
The verdict produced by a completed validation run: valid or invalid, with validation errors and optional transformed data.
_Avoid_: outcome, response

**Invalid result**:
A validation result that says the input violates validation rules. A verdict exists, unlike a validation run failure.
_Avoid_: validation failure

**Validation run failure**:
A validation run that ends without a result because the validator throws or rejects. This is an operational problem, not an invalid result.
_Avoid_: validation error, invalid result

**Authoritative run**:
The validation run whose completion may publish shared validation state.
_Avoid_: latest result (completion order does not grant authority)

**Stale run**:
A validation run superseded by a newer authoritative run; its completion cannot change shared validation state.
_Avoid_: cancelled run (staleness does not imply cancellation)

## Authoring

**Schema** (the source):
The pluggable artifact that drives automatic form generation. May be JSON Schema, a Zod schema, or a TypeScript type. The developer authors *one* source; everything else is derived.

**Mode 1** (Dynamic):
The form's shape is unknown at build time and must be serializable (DB-driven). JSON Schema is the source.
_Avoid_: runtime mode.

**Mode 2** (Static):
The form's shape is known at build time. A Zod schema or TS type is the source, and customization is done in JSX.
_Avoid_: known-shape mode, compile-time mode (pick "Static").

**ui_schema**:
Serializable customization hints, used only in Mode 1 where customization must also be stored. Kept deliberately minimal — reaching for a new ui_schema keyword is a smell that the form is actually Static and should use JSX.

**rule_schema**:
Serializable conditional logic (e.g. conditionally required/hidden fields), used only in Mode 1 for genuinely DB-driven, tenant-configured rules. Thin by design.

## Rendering & customization

See ADR 010 for the full model. One recursive primitive, two granularities (node, part), three moves (take default / swap sub-pieces / place yourself), fractal from `<SchemaFields>` to `part.Default`.

**`useFormTree`** (the React behavior binding):
The source-agnostic hook that binds a compiled form tree to presentation, a stable `SchemaFields`, native submission, validation errors, revalidation, and touched/submitted state. Input packages compile first (`jsonSchemaToTree` / `zodToTree`); React never accepts or recognizes a source schema (ADR 035).
_Avoid_: source-specific React hooks that hide compilation and privilege one front-end.

**`SchemaFields`** (the rendering entry point):
The component that folds the form tree into UI — the fractal root from which `intercept` / `Default` / `Children` descend. It renders the form's *content only*; the `<form>` element + submit button are the consumer's (chrome is deliberately not the library's, so renderers nest cleanly).
_Avoid_: Form, FormRenderer (it renders fields, not a `<form>`); bare `Fields` (ambiguous with a form's fields — the `Schema` prefix marks it as the schema-driven renderer).

**Renderer adapter** (a presentation consumer):
A consumer that folds the form tree into UI for one target (React, vanilla DOM, …). It supplies the **default renderer set**, organized as a *compound per node kind*: each kind has a **template** (`root` — its composition renderer) plus its **parts** — `field: { root, label, description, control }`, `group: { root, label, description }`, `array: { root, label, description, addButton }`, `arrayItem: { root, removeButton }` — plus the `combine` plumbing. (`root` follows the compound-component convention — Chakra/Radix/Ark — the root of *that* thing; namespaced under the kind, so distinct from the form-tree root.) You customize by overriding entries *by reference*: `{ ...nativeDefaults, field: { ...nativeDefaults.field, label: MyLabel } }`; the same set, partially overridden, is the lower rung beneath the batteries-included renderer. Parts are **per-node-context** — a field's `label` is a `<label>`, a group's `label` is a `<legend>`; an array's `addButton` and an arrayItem's `removeButton` are the add/remove controls. **Interactive behavior is per-adapter, not part of the contract** — the engine and the renderer set produce *markup*; a stateful adapter (React; a future vanilla-DOM adapter) wires add/remove, while the string oracle (`renderToString`) renders the same controls inert. Cross-adapter conformance is therefore a *markup* contract. A renderer ships two built-in sets: the real **defaults**, and a **diagnostic** set whose every content entry renders a visible `[… not implemented]` marker echoing the node's data — the floor's fallback, so an incomplete adapter still runs and tells you what's missing.
_Avoid_: template-set, calling the whole adapter a template (that's RJSF's schema-keyed registry). The kind `root` *is* a template.

**Defaults** (the renderer set):
The table of templates + parts that `<Default />` draws — one entry per kind (`field` / `group` / `array` / `arrayItem`), each a template (`root`) plus parts. You pass `defaults` into `useFormTree` / `createRenderer`. Batteries native HTML is `nativeDefaults`; diagnostics are `diagnosticDefaults`; `mergeDefaults` last-wins per key. Close over team defaults with a userland `useTeamFormTree` wrapper — not a library context.
_Avoid_: adapter (as the React adoption name — internally it is still a renderer adapter); template-set for the whole table; a library N-layer provider.

**Template**:
The kind-wide composition renderer for a field, group, array, or arrayItem — `defaults[kind].root`. It arranges that kind's parts (and `{children}` for containers). Path-specific customization is an intercept, not a template.
_Avoid_: FieldTemplate as a second API beside the kind root; using template for an intercept or RJSF's widget/uiSchema registry.

**Hijack** / **Intercept**:
Supplying your own JSX for a node or part instead of the current defaults — at any level, paying only for what you change. Same move at form (`intercept`), node (`<Default of={node} />`), and part (`parts={{…}}` / `<Default of={part} />`). The public name of the per-node callback is **intercept** (historically `renderNode`).
_Avoid_: widget override; using template for an intercept; `renderNode` in new public API.

**`intercept`**:
The per-node function the renderer calls while walking the tree — the floor. Return custom JSX to intercept a node, or `<Default of={node} />` to keep the current defaults. React sugar on the same prop: a dotted-path map (`{ email, 'address.street' }`), or a bag `{ paths, where }` (`where` is predicate + handler pairs, not the function floor). A map value is a handler, or a **parts object** (`{ email: { control, label, … } }`) — the same `parts={{…}}` map `<Default>` already takes, keyed by path. `{ root: Handler }` is the long form of passing a node handler (Default *is* root, so `root` is not a Default `parts` key). Exact path beats `where`. Unmatched nodes keep defaults. Nested-object maps are not the path language (`FieldPath` is dotted).
_Avoid_: `renderNode` as the adoption name; a registrar `allFields` / `control` as a second defaults table; treating a parts object as a path-scoped defaults patch.

**`interceptRules` / `useInterceptRules`**:
The previous intercept sugar (ADR 047/048 registrar; historically `renderNodeRules` / `useRenderNodeRules`). Replaced as the adoption path by the `intercept` prop’s path map / `{ paths, where }` bag. Do not use `allFields` / `allGroups` / `allArrays` / `control` as stylesheets — those jobs are **defaults**.
_Avoid_: `renderNodeRules`, `useRenderNodeRules` in new public API.

**`Default`**:
The component that renders the **current merged renderer set** for the thing it hangs off — `node.Default` (that kind's template + parts) or `part.Default` (one part). It does not mean the previous layer's template; wrapping a previous template is calling that root in userland. Re-enters the engine, so descendants still pass through intercepts.

**`Children`**:
`node.Children` renders a node's child *nodes* through the resolver — the inter-node continuation that lets you take the reins on a node's layout while the library renders below.

**`parts={{…}}`**:
The part-scope intercept on `node.Default`: override individual parts (each override receives the part object, which carries both its data and its own `.Default`) while the rest render default. The intercept path-map parts object is this same map (`{ email: { control: X } }` is literally `<Default of={email} parts={{ control: X }} />`). `{ root: Handler }` is the long form of a node handler — `root` is not a Default `parts` key.

## Working method

**Golden scenario**:
A representative real-world form (sanitized, VNDLY-style) that must pass at all three test altitudes — unit, component-integration, and end-to-end in the example app. The collected golden scenarios are the project's definition of done.

**Stubborn spike**:
A deliberate experiment that tries to push a piece of logic (or a sub-piece) as close to Core as it can go, to discover its true floor. Produces an ADR/issue documenting where it stopped and why — not a pass/fail gate.

**Swappability contract test**:
A shared test suite that every adapter filling a given capability slot must pass, plus a throwaway "fake" adapter, proving the seam is real rather than claimed.
