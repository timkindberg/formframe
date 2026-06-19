# jsonschema-form

A schema-driven form library. A schema automatically generates a form; you customize any part of it — in code (JSX, the default surface) or in serializable schema (for DB-driven cases, via adapters). It sits between RJSF (schema for everything, including the painful customization) and form libraries like React Hook Form / TanStack Form (code for everything, no auto-generation).

This file is a glossary, not a spec. It defines the project's shared vocabulary so we speak precisely. Strategy, principles, and decisions live in `history/` and `docs/adr/`.

## The model

**Core**:
The hub. Owns the form tree and the recursive fold over it. Stateless, framework-agnostic, imports nothing.
_Avoid_: engine, kernel, parser (parsing is one front-end, not Core's identity).

**Form tree** (the IR):
Core's internal representation of a form — the intermediate representation that every front-end compiles *into* and every consumer folds *over*.
_Avoid_: AST, model, schema (the schema is a source, not the tree).

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

**Override** / **Hijack**:
Supplying your own JSX for a node in the form tree instead of the default renderer. Available at any node — root, subtree, or a single leaf.
_Avoid_: widget override, template (those are RJSF's schema-keyed registries; ours is JSX).

**renderChildren** (continuation):
The handle a hijack receives to hand control *back* to the default renderer for that node's subtree. The re-entrancy that lets you customize precisely one node and let the library render the rest.

## Working method

**Golden scenario**:
A representative real-world form (sanitized, VNDLY-style) that must pass at all three test altitudes — unit, component-integration, and end-to-end in the example app. The collected golden scenarios are the project's definition of done.

**Stubborn spike**:
A deliberate experiment that tries to push a piece of logic (or a sub-piece) as close to Core as it can go, to discover its true floor. Produces an ADR/issue documenting where it stopped and why — not a pass/fail gate.

**Swappability contract test**:
A shared test suite that every adapter filling a given capability slot must pass, plus a throwaway "fake" adapter, proving the seam is real rather than claimed.
