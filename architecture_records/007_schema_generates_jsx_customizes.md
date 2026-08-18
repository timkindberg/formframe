# ADR 007: Schema Generates; JSX (or Serializable Schema) Customizes

**Date:** 2026-06-18
**Status:** Accepted
**Deciders:** Tim Kindberg

## Context

Two failure modes bracket this library:

- **RJSF** — schema drives *everything*, including customization. The easy 80% is fast, but every hard-20% need forces more `ui_schema`/`rule_schema` indirection, because RJSF's overrides are schema-keyed registries, not code.
- **Plain form libs (RHF/TanStack)** — code for everything, no auto-generation.

We want the in-between. We must also fully serve VNDLY: unknown-shape tenant forms (schema / ui_schema / rule_schema, genuinely DB-driven) **and** known-shape product forms still authored with those artifacts — **without** re-growing RJSF's indirection for everyone else.

## Decision

**A schema generates the form automatically** — that is the reason to exist. Hand-authoring a whole form node-by-node is a **non-goal** (use a form lib).

**Customization is available via both JSX and serializable schema:**

- **JSX (code)** is the first-class, default surface. Override any node in the tree with your own JSX, and call `renderChildren()` to hand control back to the default renderer for that node's subtree (re-entrancy). This is the RJSF-killer.
- **Serializable schema (data)** supports DB-driven cases where customization itself must be stored. This heavier path is pushed into **adapters — including user-written ones** (e.g. a VNDLY adapter for tenant-specific behavior). Its precise shape is **deferred**.

**Authoring modes:** **Unknown-shape** (Mode 1, Dynamic) vs **known-shape** (Mode 2, Static). Unknown-shape is DB-driven / tenant-configured and must be serializable; JSON Schema is the usual source. Known-shape is known at build time, so customize is JSX. Known-shape source may be JSON Schema, Zod, or a TypeScript type — a greenfield app may prefer Zod for types, but JSON Schema known-shape still gets a typed `FormShape` binding (ADR 048). Principle: **serialize when you must, code when you can** — per form, even per node.

**Guardrail:** never bloat the *core* schema vocabulary to solve a customization. A new core `ui_schema` keyword is a smell that the form is actually known-shape and should use JSX.

## Consequences

- **Pros:** one engine serves both VNDLY (full schema/ui_schema/rule_schema) and the community (JSX-first); the hard 20% is JSX, not schema sprawl; third parties own custom adapters.
- **Cons:** two customization surfaces must stay coherent; deferring the serializable-customization shape leaves a known, intentional gap.

## Alternatives Considered

- **Pure "better RJSF" (schema for everything)** — rejected: re-grows the indirection we're escaping.
- **Pure JSX-first (no schema generation)** — rejected: can't serve DB-driven forms, and abandons auto-generation, which *is* the product.

---

**Amends:** the pairing/customization framing in `README.md`. **Relates to:** ADR 006 (adapters), ADR 008 (swappability), ADR 048 (`FormShape` types).

**Amended 2026-08-16:** Known-shape (Mode 2) is not Zod-or-TS-only. JSON Schema is a valid known-shape source; customize is still JSX. Greenfield apps may still choose Zod. See `CONTEXT.md` (unknown-shape / known-shape).
