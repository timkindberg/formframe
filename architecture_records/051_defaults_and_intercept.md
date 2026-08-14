# ADR 051: Defaults vs Intercept — Two Jobs, Two Names

**Date:** 2026-08-14
**Status:** Accepted (GitHub epic [#141](https://github.com/timkindberg/formframe/issues/141))
**Deciders:** Tim Kindberg
**Annotates:** ADR 013 (renderer set is **defaults**; React adoption is not `createRenderer` + a second selector language), ADR 047 §3 and §6 (kind blankets / `control` on the registrar are not a stylesheet; adapter and customize are not one registrar at two scopes)
**Builds on:** ADR 010 / 017 (continuation floor), ADR 013 (renderer set), ADR 047 §1–§2 and §4 (mounted handlers, arrangeable parts, path-narrowed types), ADR 048 (`FormShape` binding), ADR 031 (`present()` is a different axis)

The customize layer grew two composition rules that both looked like “change how it renders”: a by-reference renderer set (`createRenderer` / `defaultAdapter`) and a specificity registrar (`useRenderNodeRules`) whose `<Default />` skipped the registrar and hit the engine. Kind-wide `allFields` / `r.control` occupied the intercept list, so a path Extra dropped team look and form-lib wiring. We keep the continuation floor and split the jobs by name.

## Decision

**Defaults** are the table of templates + parts that `<Default />` draws. **Intercept** is drawing this node; unmatched nodes keep those defaults.

### 1. Defaults

The renderer set (ADR 013) is the defaults object: per kind, a **template** (`root`) plus parts (`label`, `control`, `addButton`, `removeButton`, …). `useFormTree(tree, { defaults })` binds it. Batteries native HTML is `nativeDefaults`; diagnostics are `diagnosticDefaults`; `mergeDefaults` last-wins per key. Vanilla uses the same words. Core may keep `RendererAdapter` / `mergeAdapter` as the engine contract.

A **template** is only that kind `root` — RJSF’s good part (Field / Object / Array templates), not a parallel `allFields` intercept. `<Default />` means the **current merged defaults**, not the previous layer’s template. Wrapping a previous root is calling it in userland (`(p) => <Card>{org.field.root(p)}</Card>`).

Recipes (Chakra × RHF, native error inject, …) are defaults objects, not winning `r.control` intercepts. Form-lib wiring lives on `defaults.field.control` (or a kind switch inside it).

Org → team → feature composition is **userland**, not a library builder: `mergeDefaults`, wrap roots, unmatched intercepts call the previous `intercept`, close over team defaults with `useTeamFormTree`. Untouched slots flow down; a lower layer that touches a slot replaces it.

### 2. Intercept

The public name of `renderNode` is **`intercept`**. The value is still the continuation callback `(node, { Default, Children }) => jsx`. It stays the type on `SchemaFields`, on `<Default of={node} intercept={…} />`, and in vanilla — one intercept API at every depth.

React sugar on the same prop (not a second table):

- Shorthand path map: `{ email: EmailHint, 'address.street': StreetHint }` (`FieldPath` is dotted; no nested-object maps).
- Bag: `{ paths, where: [[pred, Handler], …] }`. Exact path beats `where`. Unmatched → defaults.
- Function floor, for what is not “this handler on these nodes.”

Handlers stay mounted components with arrangeable parts (ADR 047 §1–§2). Docs teach the map/bag; App_08 is what the sugar lowers to. No registrar methods (`allFields`, `control`, catch-all `default`) as stylesheets.

A defaults-side fluent (`defaultField` / `defaultControl`) is deferred. If it returns, it is a **different** helper that produces a defaults object, never methods on the intercept bag.

### 3. Arrays

`defaults.array` / `defaults.arrayItem` templates must arrange like groups (`Label` + `{children}` + `AddButton` / `RemoveButton`). Add/remove state must not live only inside a replaceable root (lift to a provider the template composes). Item chrome is `defaults.arrayItem`, not `contacts.*` path intercepts.

## Considered options

- **Onion `<Default />` = next matching rule.** Rejected: two meanings of Default (table vs previous handler) breaks fractal intercept; Extra that places parts still drops the onion.
- **One builder writing defaults and intercepts.** Rejected for now: hides which knob is which. Intercept sugar lives on the `intercept` prop so the word stays visible.
- **Map XOR function overload.** Rejected: `where` and exact paths could not coexist. The bag keeps `where` as data.
- **Nested-object path maps.** Rejected: `address` as group handler vs child bag is ambiguous. Dotted `FieldPath` is the IR’s path language.
- **`useFormTree(fn)` as the customizer.** Rejected: the hook already takes `resolvePresentation` (widget axis, ADR 031) and intercept belongs on `SchemaFields`.
- **Library N-layer provider.** Rejected until a second consumer forces it; `useTeamFormTree` is the documented close-over.

## Consequences

- ADR 047 §1–§2 (handlers, parts) and §4 (path types) stand. §3 kind blankets and `r.control` as intercepts, and §6 “one registrar at two scopes,” do not.
- README / gallery teach `useFormTree({ defaults })` then `<SchemaFields intercept={…} />`. Numbered apps 01–15 stay; App_08 remains the intercept floor.
- `useRenderNodeRules` is the previous sugar; replace it with the intercept bag and stop teaching `allFields` / `control` as stylesheets.
