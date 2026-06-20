# ADR 012: A Richer, Typed Core IR — Compile-time Inference, Widget-Discriminated Fields, Core-Owned HTML Attributes

**Date:** 2026-06-20
**Status:** Accepted
**Deciders:** Tim Kindberg

## Context

Three threads converged while promoting the spike into the real renderer (ADR 010, bead `dyt`):

1. **How good can our types be?** A JSON Schema declared `as const` carries its full shape at compile time, so we *can* infer real types from it (the `FromSchema<typeof schema>` technique). We want this to be a **point of pride**: hand us a compile-time schema and you get awesome types; only a *runtime-loaded* schema falls back to the loose/dynamic API.
2. **`FieldParts` is loosely modeled.** `input?` and `select?` are *both optional* on one shape, discriminated only by a `widget` string at runtime — forcing `parts.select ? … : parts.input` checks everywhere. If we know the widget, the type should too.
3. **Who owns HTML attributes?** `input.attrs`/`select.attrs` were typed as `Record<string, string | number | boolean>` and earlier mis-filed under "the UI axis." But native HTML attributes are schema-derived and platform-universal — every renderer and UI kit needs the *same* ones. Re-deriving them per adapter is duplication and drift.

These are all the same underlying move: **make the Core IR richer and more precisely typed**, without crossing the stubborn Core boundary (imports nothing, no DOM/framework).

## Decision

### 1. Compile-time schema ⟹ full type inference; runtime schema ⟹ loose API

A JSON Schema `as const` is a **typed source**. The library commits to two type-level entry points over the **same engine**:

- **Typed entry (Mode 2):** a compile-time/`as const` schema infers value types (and, later, accessor/path types). This is the "awesome types" promise.
- **Loose entry (Mode 1):** a runtime-loaded schema (DB-driven, dynamic) gets the loose/dynamic API — there is nothing to infer, so loose is *correct* there, not a fallback-of-shame.

**Sequencing (so we don't churn two layers at once):**
- **Now:** lock this as a goal and *reserve* the seam. Do **not** thread do-nothing generics through the API yet — reserving the slot is enough; the generic arrives with the inference that uses it.
- **After the loose `dyt` engine is green:** build **value-type inference** first (`onSubmit`/`form.submit()` receive `{ name: string; theme: 'light'|'dark'|'auto'; age?: number; … }`), `FromSchema`-shaped — cheap, high value.
- **The deeper push (epic `6nb`):** **accessor/path-type inference** — the typed factory skin (`fields.address.street` with autocomplete, `renderNode` narrowing per node). This is the recursive mapped-type work over the tree.

**Boundary constraint:** the inference must be **Core's own type-level code (or a vendored types-only definition)**, never a runtime dependency — `FromSchema`-style types are erasable, so this is viable while keeping "Core imports nothing" intact.

### 2. The field IR is widget-discriminated

`FieldNode` becomes a discriminated union on `widget`:

- `InputFieldNode` — `widget: 'input'`, `parts: InputFieldParts` (has `input`, no `select`).
- `SelectFieldNode` — `widget: 'select' | 'multiselect'`, `parts: SelectFieldParts` (has `select` + `options`, no `input`).
- `FieldParts = InputFieldParts | SelectFieldParts` (shared base for `container`/`label`/`description`).

**Behavior with runtime/unknown schemas (important):** the union is *compile-time only* — the runtime object the parser builds is byte-for-byte unchanged. For a runtime schema the consumer doesn't know `widget` statically, so the node types as the full union and **neither `parts.input` nor `parts.select` is directly accessible until you narrow on `widget`**; after `if (node.widget === 'select')`, the matching part is present and **non-optional**. This is *stricter and better* than the old both-optional model: it turns the widget check you already do at runtime into a compile-time requirement you can't forget. The discriminant is `widget` (the source of truth), not part-truthiness.

### 3. Core owns the native HTML attribute contract

`input.attrs`/`select.attrs` are typed as **framework-neutral interfaces in Core** (`HtmlInputAttrs`, `HtmlSelectAttrs`), not `Record<string, …>`, and not `React.InputHTMLAttributes`/DOM-lib types (that would import framework/DOM and break the boundary). Core already emits HTML attrs today (`label.attrs.for`, `select.attrs.{ id, name, multiple, required }`), so this is *consistent*, not a new responsibility.

The line:
- **Core (the IR) owns:** schema-derived, platform-universal HTML attributes — `type`, `name`, `id`, `required`, `min`/`max`/`step`, `minLength`/`maxLength`, `pattern`, `placeholder`, `readonly`, `multiple`, `for`. Every renderer/UI-kit consumes the same ones; an adapter spreads `{...attrs}` and never re-declares them.
- **UI adapter owns:** presentation — className, component identity, styling, layout, framework-specific props.

### 4. Styling is its own (future) axis, orthogonal to component swap

Defaults stay **near-styleless** (structure + semantics, minimal CSS). To make raw output stylable without forcing a component swap, Core/engine emit **stable hooks** — good `className`s / `data-*` attributes (alongside the existing `container.key`) for CSS-selector targeting — and we *may* ship a **minimal layout CSS file**, reusable across UI frameworks. This is a distinct customization axis from per-node `renderNode`, part overrides, and component-registry/UI-kit swap. **Deferred**; tracked as a bead.

### 5. Kind-level overrides need no new engine capability

"Render *all* groups (or all fields) with X instead of the default" is already expressible on the continuation engine via `renderNode` + the node discriminant:

```tsx
renderNode={(node) =>
  node.isGroup ? <MyGroup node={node} /> : <node.Default />
}
```

…recursing into children via `<node.Children/>`. The *ergonomic* form — an overrides-map / component registry (`templates={{ group, field }}`), which is also the UI-kit/theming swap — is the **deferred registration skin already named in ADR 010**, to be built when the UI second-implementation forces it (ADR 008). No new primitive; it desugars to a kind-switching `renderNode`.

## Consequences

- The "awesome types from a const schema" promise is now an explicit, recorded goal, with a concrete two-tier build order (value-types, then accessor-types) gated behind a green loose engine.
- `FieldParts`/`FieldNode` become discriminated unions — a Core public-API shape change that ripples into typed consumers (the `parser.test.ts` suite, `DefaultFieldTemplate`, examples `App_01`–`04`). The loose `any`-typed renderer/spike are unaffected. All gate-catchable.
- Core gains small framework-neutral HTML-attr interfaces; adapters stop re-declaring native attributes.
- A new (deferred) styling axis is acknowledged so we don't accidentally over-style the defaults.
- We explicitly do *not* add inference machinery or generics yet (YAGNI until the loose engine is green), avoiding premature, churn-inducing type-level abstraction.

## Alternatives Considered

- **Defer all typing to a future Zod/TS front-end** — rejected: the `as const` JSON Schema *is* the typed source, so a separate typed front-end isn't required to start; deferring the *goal* undersold the product.
- **Keep `FieldParts` both-optional** — rejected: forces runtime checks the type could guarantee, and is no simpler for dynamic schemas (you narrow on `widget` either way).
- **Put HTML attrs in the UI adapter** — rejected: they're schema-derived and universal; per-adapter re-declaration is duplication and drift.
- **Build the typed factory skin now** — deferred to `6nb`: it's the deep recursive-mapped-type work and the rule-of-three hasn't fired; do value-types first.

---

**Relates to:** ADR 006 (headless Core / stubborn boundary), ADR 007 (Mode 1 vs Mode 2 authoring), ADR 008 (swappability earned by a second impl; styling/registry skins), ADR 010 (continuation rendering; the deferred registration skins), epic `6nb` (typed factory skin).
