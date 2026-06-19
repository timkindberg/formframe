# ADR 006: Core Is the Form-Tree IR; Front-ends and Consumers Are Adapters

**Date:** 2026-06-18
**Status:** Accepted
**Deciders:** Tim Kindberg

## Context

`README.md` / `ARCHITECTURE.md` describe "five layers" with Core as a JSON Schema parser. Grilling the vision exposed two problems with that framing: (1) JSON Schema is only *one* possible source — a Zod schema or a TypeScript type carry the same shape information and are equally valid sources; (2) the dependency reality is more hub-and-spoke than a linear stack (validation is framework-agnostic and rides directly on Core, not above React; a UI kit may ship its own form-state). We need Core's identity pinned without prematurely drawing the spoke diagram.

## Decision

**Core *is* the form tree** — an intermediate representation (IR) — **plus the recursive fold over it.** It is stateless, framework-agnostic, and imports nothing.

JSON Schema parsing is demoted to *one front-end*, not Core's identity. Rename `parseSchema` → `jsonSchemaToTree` so the seam stays honest.

Two adapter roles, both first-class and **user-writable** (the extension model is "write an adapter," never "fork the core"):

- **Front-end** — compiles a source schema *into* the tree (JSON Schema, Zod, TS type).
- **Consumer** — folds *over* the tree to produce something (framework binding, validation, form-state, UI).

We deliberately **do not** commit to a layered-stack vs. hub-and-spoke diagram yet (see ADR 008). The only firm architectural invariant is the **stubborn Core boundary**: Core imports nothing, holds no state, touches no DOM/framework.

## Consequences

- **Pros:** no single source format can pollute Core; multiple authoring surfaces become possible; third parties extend by writing adapters.
- **Cons:** more indirection than a direct parser; "what belongs in Core?" stays a live judgement — mitigated by treating the Core boundary as a hard gate and by stubborn spikes.

## Alternatives Considered

- **Core = JSON Schema interpreter** — rejected: welds JSON Schema into Core's identity and blocks Zod/TS as sources.
- **Strict five-layer linear stack** — rejected: validation is framework-agnostic (rides on Core directly), and form/UI responsibilities can collide in a single package, so a clean linear order doesn't exist.

---

**Amends:** the "five layers" framing in `ARCHITECTURE.md` and `README.md`.
