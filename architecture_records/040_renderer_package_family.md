# ADR 040: Name Rendering Adapters `renderer-*`

**Date:** 2026-07-12
**Status:** Accepted (bd `jsonschema-form-byf`)
**Deciders:** Tim Kindberg
**Extends:** ADR 024 (presentation adapters are recipes), ADR 035 (React
binds form trees), ADR 038 (FormFrame package identity)

## Context

FormFrame's input and validation package families expose their capability first
and implementation second: `input-jsonschema`, `input-zod`, `validation-ajv`,
and `validation-zod`. The rendering packages instead used bare implementation
names, `react` and `vanilla`, which hid their relationship in package listings
and import suggestions.

The candidate `ui-react` / `ui-vanilla` family would make that relationship
visible, but `ui` means presentation in FormFrame's architecture. These
packages bind and render the neutral tree with unstyled defaults; they are not
design systems or styled UI kits. Using `ui-*` would blur the intentionally
separate rendering and presentation capability slots.

## Decision

Rename the public packages:

- `@formframe/react` → `@formframe/renderer-react`
- `@formframe/vanilla` → `@formframe/renderer-vanilla`

`renderer-*` is the package family. The suffix identifies the rendering
environment. `renderer-react` also owns React-specific binding behavior such as
hooks, validation display state, and continuation components; the package name
identifies its primary capability rather than claiming rendering is its only
responsibility.

Reserve `ui-*` for actual presentation packages if FormFrame ever ships them.
ADR 024 currently keeps UI integrations as recipes, but the vocabulary remains
useful even without maintained UI packages.

Only public package identities change. Source directories, TypeScript project
references, and internal filenames remain `packages/react` and
`packages/vanilla`.

No compatibility packages are published because neither old package name has
been released.

## Consequences

- npm listings and autocomplete group both rendering implementations together.
- Package families consistently read capability-first, implementation-second.
- `ui` retains its precise meaning as presentation rather than framework
  binding.
- Consumers must use the longer imports, for example
  `@formframe/renderer-react`.
- Adding another renderer has an obvious name such as `renderer-vue` or
  `renderer-svelte`.

## Alternatives Considered

- **`ui-react` / `ui-vanilla`.** Rejected because these packages are not UI
  kits, and presentation is a separate capability.
- **Keep `react` / `vanilla`.** Concise, but does not expose the shared package
  family.
- **`render-react` / `render-vanilla`.** Clear, but the noun `renderer` names
  the adapter family more naturally.
- **`framework-react` / `framework-vanilla`.** Rejected because vanilla is not
  a framework and rendering is the shared capability.

---

**Relates to:** ADR 014 (continuation engine), ADR 024 (adapter packaging), ADR
035 (source-agnostic React binding), ADR 038 (FormFrame identity).
