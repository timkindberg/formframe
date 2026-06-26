# ADR 022: Widget Selection as a Layered IR Slot

**Date:** 2026-06-25
**Status:** Proposed
**Deciders:** Tim Kindberg

## Context

Widget choice determines which `FieldNode` discriminant the parser emits (ADR 012), which parts the renderer adapter dispatches to (ADR 013), and whether a `renderNode` hijack sees an `input` or `select` node (ADR 010). Today the parser applies **schema-derived defaults** only — `type` / `format` / `enum` map to a widget (boolean → checkbox, enum → select, `string` + `format: date` → date input, and so on).

That default layer is necessary but insufficient for two product pressures:

1. **Runtime/DB-unknown schemas.** Forms sourced from a database at runtime have no accompanying JSX and no compile-time schema. Customization must travel **with the field** in the one schema document, or be expressible as a **data-driven resolver** over the parsed node — not as a parallel, path-keyed uiSchema document divorced from the field (the maintainer's standing objection to RJSF's second source of truth).
2. **Known-schema DX.** For `as const` schemas, consumers want typed, high-precedence overrides — `renderNode` hijacks and, eventually, override maps keyed by `FieldPath<S>` from the recently merged `InferData` / `FieldPath` inference work — without giving up the runtime paths above.

ADR 010 already rejected an RJSF-style widget registry as the *primary* customization mechanism; ADR 012 made `widget` the compile-time discriminant on `FieldNode`. This ADR records **how the single IR `widget` slot is populated** — one field, one resolved value, four layered sources in precedence order.

## Decision

**Widget selection is a single IR `widget` slot on each field node, populated by layered sources.** Lower layers apply first; higher layers override. The parser (JSON Schema front-end) owns layers 1–3; the React adapter may apply layer 4 before render.

### Precedence (lowest → highest)

1. **Schema-derived default** — from `type`, `format`, and `enum` (e.g. boolean → checkbox, enum → select, `string` + `format: date` → date input). This is what the parser does today; it remains the floor when nothing else applies.

2. **In-schema annotation** — a recognized keyword living **next to the field inside the one schema** (e.g. `x-widget: "radio"`). Validators ignore unknown keywords. This is the data-driven path for purely unknown schemas loaded at runtime: the widget hint travels with the field, not in a separate document keyed by JSON Pointer paths.

3. **Runtime resolver** — an optional `resolveWidget(node)` strategy function for cross-cutting rules expressed in code (e.g. "all enums become radios"). Still data-driven over the parsed node; still no parallel uiSchema.

4. **JSX / typed override** — `renderNode` hijack or a typed override map keyed by `FieldPath<S>` (from `InferData` / `FieldPath` on compile-time schemas). Highest precedence; best DX for known schemas where the consumer owns the shape at compile time.

The **output** of this stack is one resolved `widget` string (and thus one discriminated `FieldNode` variant) per field. The renderer adapter (ADR 013) continues to dispatch on that single discriminant; it does not consult uiSchema or a parallel widget map.

### Explicit rejections

- **Parallel uiSchema documents** (RJSF-style path-keyed widget/template maps) — rejected. A second source of truth divorced from the field duplicates schema structure, drifts from validation paths, and fails the runtime/DB schema story. In-schema annotation (layer 2) is the data-driven alternative that stays on the field.
- **JSX-only customization** — rejected as the sole mechanism. `renderNode` and typed overrides (layer 4) are essential for known schemas but useless when the schema arrives from a DB with no compile-time surface.
- **Schema-default-only** — rejected as sufficient. Defaults cover the common case but cannot express per-field runtime intent (layer 2), global resolver policies (layer 3), or app-specific typed overrides (layer 4).

## Consequences

- **One slot, one truth per field.** `FieldNode.widget` remains the discriminant (ADR 012); population is layered, not forked into parallel configuration systems.
- **Runtime schemas stay first-class.** Layers 2–3 require no JSX, no `FieldPath` inference, and no uiSchema sidecar — only the schema blob (plus an optional resolver hook at form construction).
- **Typed DX is preserved for const schemas.** Layer 4 composes with ADR 010 continuation hijacks and with `FieldPath<S>`-keyed override maps as that surface matures; it does not replace lower layers for dynamic forms.
- **Parser/front-end work.** Layers 2–3 belong in the JSON Schema compile step (`jsonSchemaToTree` / parser); layer 4 belongs in the React adapter's `renderNode` / override resolution — clear seam, no Core boundary crossing beyond reading annotation keywords during compile.
- **Validator seam unchanged.** Unknown `x-*` keywords remain validator-transparent; widget choice is compile-time IR, not validation logic (ADR 019).
- **Renderer adapter unchanged in shape.** `RendererAdapter` still keys field parts by resolved widget kind; swapping widgets changes which part slot is populated, not the adapter contract (ADR 013).

## Alternatives Considered

- **Parallel uiSchema document (RJSF-style)** — rejected: second source of truth, path-keyed indirection, poor fit for DB-sourced schemas; superseded by in-schema annotation + resolver + typed override on one IR slot.
- **JSX-only (`renderNode` / typed map, no schema annotation or resolver)** — rejected: fails runtime/unknown schemas; layers 2–3 are mandatory for parity with data-driven forms.
- **Schema-default-only (no annotation, resolver, or typed override)** — rejected: insufficient for radio-vs-select policies, runtime widget hints, and known-schema override ergonomics.
- **Separate parallel `widget` paths in the IR** (e.g. `defaultWidget` vs `overrideWidget`) — rejected: one resolved `widget` keeps ADR 012's discriminated union simple; layering is a compile-time/population concern, not multiple IR fields.

---

**Relates to:** ADR 010 (continuation customization — layer 4 `renderNode` hijack), ADR 012 (widget-discriminated `FieldNode`), ADR 013 (renderer adapter dispatches on resolved `widget`), ADR 019 (validation side-loaded — orthogonal to widget selection), `InferData` / `FieldPath` type inference (layer 4 typed override keys).
