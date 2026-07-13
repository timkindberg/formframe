# ADR 024: Adapters Are Patterns, Not Packages

**Date:** 2026-06-29
**Status:** Accepted
**Deciders:** Tim Kindberg

## Context

The monorepo originally listed `@formframe/renderer-react-hook-form` and
`@formframe/ui-tailwind` alongside Core, React, and the validation
adapters. Both were empty placeholders — a `package.json` and an eight-line
`src/index.ts` exporting `VERSION = '0.0.0'`. No real adapter code existed.

Meanwhile the product model has clarified around **IOC seams** — stable
contracts consumers implement against — not a matrix of pre-built integrations.
Three seams matter:

1. **Renderer** — the presentation/customization seam ([ADR 013](./013_declarative_template_set_and_engine_decomposition.md))
2. **Validator** — side-loaded validation on Core ([ADR 019](./019_validation_as_a_side_loaded_slot.md))
3. **Reactive state store** — form-value reactivity (ADR 023, in progress)

The question is which of these deserve maintained packages versus reference
material in `examples/`.

## Decision

**The product is the seams, not a catalog of pre-built adapters.** UI-framework
adapters (Chakra, Tailwind, shadcn, etc.) and form-library adapters (React Hook
Form, TanStack Form) are **not** shipped as maintained monorepo packages.

What we *do* build for those axes is a **reference recipe** — copy/paste code
with instructions, living under `examples/` — whose job is to prove the seam is
sufficient ([ADR 008](./008_swappability_earned_by_second_implementation.md)),
not to be a product consumers install.

**Validation adapters remain packages.** `@formframe/validation-ajv` and
`@formframe/validation-zod` stay maintained workspace packages: they are
thin, Standard-Schema-shaped, and reusable without per-consumer customization.
The customization-heavy axes (UI presentation, form-library state) are recipes.

**Immediate action:** delete the empty `packages/react-hook-form` and
`packages/ui-tailwind` placeholder packages.

## Why

Real-world consumers customize a UI or form theme so heavily that a pre-built
adapter is near-useless. The maintainer's lived experience with RJSF's Chakra
"theme" — a package that looked like a product but required forking or
re-implementing for any non-trivial app — is the cautionary tale.

What is valuable is the **ability to build your own** against a stable seam.
This is ADR 008 applied to *distribution*: a second adapter exists to prove the
seam, not to become an unbounded maintenance surface.

## What an adapter we build is for

1. **Prove the primitives are sufficient** — a forcing function for the seam
   (ADR 008).
2. **Be a copy/paste reference recipe** in `examples/` with instructions — not a
   published package.

## Consequences

- Removed `packages/react-hook-form` and `packages/ui-tailwind`.
- Future UI/form-lib integrations land as `examples/` recipes, not workspace
  packages.
- Validation adapters (`validation-ajv`, `validation-zod`, and
  `validation-contract`) remain the maintained adapter packages.
- Docs (`README.md`, `CLAUDE.md`, `examples/README.md`) describe UI/form-lib
  work as recipes to copy, not packages to install.

## Alternatives Considered

- **A package per UI/form library** — rejected. Unbounded maintenance; low value
  because every consumer customizes the theme anyway. Placeholders gave the
  illusion of a product without delivering one.
- **A shadcn-style CLI that vendors adapter code into the user's repo** —
  explicitly deferred / out of scope for now. Copy/paste recipes with
  instructions are sufficient today. A CLI may be a future north star; it is
  **not** a commitment.

---

**Relates to:** ADR 008 (swappability earned by second implementation), ADR 013
(renderer seam), ADR 019 (validator seam), ADR 023 (reactive state store seam),
ADR 020 (validation packages remain maintained).
