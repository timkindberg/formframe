# jsonschema-form

A schema-driven form library, built as a better-architected alternative to [React JSON Schema Form (RJSF)](https://github.com/rjsf-team/react-jsonschema-form).

## The problem

RJSF sits at one extreme: schema drives *everything*, including customization. The easy 80% is fast, but every hard-20% need forces more `ui_schema`/`rule_schema` indirection — because RJSF's overrides are schema-keyed registries, not code. Plain form libraries (React Hook Form, TanStack Form) sit at the other extreme: code for everything, no auto-generation at all.

## The goal

**A schema generates the form automatically — that's the reason this library exists.** You customize in **JSX (code)**, not in more schema. Hand-authoring a whole form node-by-node is a non-goal — if that's what you want, use a form library directly.

This puts jsonschema-form in between RJSF and the plain form libraries: **serialize when you must, code when you can** — a principle that applies per form, even per node.

A serializable customization path also exists for genuinely DB-driven cases (Mode 1, see below), where the customization itself must be stored, not just the schema. That path is pushed into adapters, including ones you write yourself, and stays deliberately minimal — see [ADR 007](./architecture_records/007_schema_generates_jsx_customizes.md).

## The model

Earlier drafts of this library described "five decoupled layers" in a linear stack (Core → Validation → Framework → Form Library → UI). That framing has been superseded — see [ADR 006](./architecture_records/006_core_as_form_tree_ir_with_adapters.md).

**Core is the form tree** — an intermediate representation (IR) — plus the recursive fold over it. It is stateless, framework-agnostic, and imports nothing. JSON Schema parsing is just *one front-end* that compiles a schema into the tree (the entry point is `jsonSchemaToTree`); a Zod schema or TypeScript type would be equally valid front-ends.

Everything else hangs off Core as an **adapter**, filling one or more **capability slots**:

- **Front-end** — compiles a source schema into the tree (JSON Schema today; Zod/TS are plausible future front-ends).
- **Structure / framework-binding** — renders the tree (React today).
- **Validation** — side-loaded, framework-agnostic, rides directly on Core.
- **Form-state** — holds values + reactivity. The default is a *headless* adapter wrapping nothing: native `<form>` + FormData. RHF/TanStack Form are optional wrapped adapters for teams that need live reactivity or want to plug into existing form infrastructure.
- **Presentation (UI)** — the actual rendered components and styling.

Adapters are first-class and **user-writable** — the extension model is "write an adapter," never "fork Core." We deliberately don't draw a layered-stack diagram: the dependency shape is more hub-and-spoke than linear (e.g. validation doesn't sit "above" React; a UI kit may ship its own form-state). The one fixed invariant is the **stubborn Core boundary**: Core imports nothing, holds no state, and touches no DOM or framework.

See `CONTEXT.md` for the full glossary and `architecture_records/` for the decisions behind it.

## Customizing: the continuation model

Customization is one recursive primitive, available at any granularity, fractal from the whole form down to a single field part. The renderer walks the tree and calls `renderNode(node, { Default, Children })` per node; you re-enter the engine by mounting a handle — `<Default of={node} />`, `<Children of={node} />`, or a specific child `<Default of={node.children.x} />` — or override individual parts of a field with `<Default of={node} parts={{ partName: (part) => <JSX/> }} />`. At every node you have three moves: take the default whole, keep the default layout but swap a sub-piece, or place the sub-pieces yourself. You pay only for what you customize — the library renders the rest.

This is the RJSF-killer: the hard 20% is JSX, not schema sprawl. Full detail lives in [ADR 010](./architecture_records/010_recursive_continuation_rendering.md).

## Reference stack & swappability

Designing every swap seam up front tends to produce speculative, wrong abstractions. Instead, **swappability is earned by a second implementation** ([ADR 008](./architecture_records/008_swappability_earned_by_second_implementation.md)):

- **Phase A** — Core plus a **zero-dependency reference stack**: React + native `<form>`/FormData (uncontrolled) + no validation + bare default UI. The stubborn Core boundary is the only hard architectural gate at this stage.
- **Phase B** — slots fill in one at a time, each forced by its *first real adapter*. **Validation and UI swap in first** — they're visible to end users and where teams have the most existing investment. **Form-state is a shallow slot and swaps in last, and only when needed** ([ADR 011](./architecture_records/011_form_state_is_a_shallow_slot.md)): reach for RHF/TanStack only for live/reactive behavior or interop with existing form infrastructure, not for its own sake.

## Monorepo structure

- `packages/core` — headless foundation: the form-tree IR, the JSON Schema front-end, the recursive fold
- `packages/react` — React framework-binding adapter (hooks, default templates, the continuation renderer)
- `packages/validation-ajv` — AJV validation adapter
- `packages/react-hook-form` — React Hook Form form-state adapter
- `packages/ui-tailwind` — Tailwind presentation adapter
- `examples/basic-react` — example app exercising the library end to end

## Key decisions

- **Core is stateless and framework-agnostic** — form-state adapters own values; React owns rendering.
- **No "kitchen sink" component** — we provide building blocks, not `<JsonSchemaForm />`.
- **"label" not "title"** — field nodes use `label` for clarity despite JSON Schema's `title`.
- **Boolean schemas throw** — `true`/`false` as schema values are not supported.

See `architecture_records/` for the full rationale behind every decision above.
