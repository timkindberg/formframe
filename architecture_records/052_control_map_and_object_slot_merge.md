# ADR 052: `field.control` Is a Kind Map; Object Part-Slots Merge One Level

**Date:** 2026-08-16
**Status:** Accepted (GitHub [#155](https://github.com/timkindberg/formframe/issues/155); sibling [#154](https://github.com/timkindberg/formframe/issues/154) is the React defaults-piece extraction)
**Deciders:** Tim Kindberg
**Annotates:** ADR 029 §5 (the IR facet stays one `parts.control`; the *defaults table* is now a map of arms, not one function that switches on `kind`), ADR 051 §1 (form-lib wiring is per **control arm**, not a kind switch inside one `field.control` function)
**Builds on:** ADR 013 (renderer set / `mergeAdapter`), ADR 014 (continuation engine), ADR 029 (unified control facet + closed `kind` union), ADR 051 (defaults vs intercept)

`defaults.field.control` was one function that `switch`ed on `control.kind`. Overriding `input` (RHF `register`, a Chakra Input, …) meant replacing the whole slot and re-copying select / textarea / choicegroup. `mergeAdapter` is a per-kind shallow merge, so `{ field: { control: { input } } }` would also wipe the other arms once control became an object. Intercept `parts.control` was already the per-node function and is the wrong knob for kind-wide wiring (ADR 051).

## Decision

**`field.control` is a control map.** Common field chrome stays on `field.root`. The engine does not special-case the name `"control"`: a part entry that is a function is called; a part entry that is a record is indexed by `data.kind`. `mergeAdapter` last-wins functions and one-level-merges any part slot that is a plain object.

### 1. Control map

```ts
type FieldControlRenderers<R> = {
  [K in ControlKind]: (data: Extract<FieldControl, { kind: K }>) => R
}

// field.control is this map, not (data: FieldControl) => R
```

Arms today: `input`, `select`, `textarea`, `choicegroup` — the closed Core `ControlKind` union (ADR 029 §6). A recipe overrides one arm:

```ts
mergeDefaults(nativeDefaults, {
  field: { control: { input: RhfInput } },
})
```

select / textarea / choicegroup stay native. There is no `control.root` and no leftover wrapper function on the slot — wrapping every widget is `field.root`'s job.

`PartialAdapter` / `ReactPartialDefaults` must type `control` as `Partial<FieldControlRenderers<R>>`, not “the whole map or nothing.” `diagnosticDefaults` ships every arm as a `[… not implemented]` marker so an incomplete `createRenderer({ field: { control: { input } } })` still lights up the rest.

### 2. Coerce at lookup, not a named special case

`node.parts.control.Default()` stays the fractal call (ADR 010). Dispatch lives where `Default` is bound — engine `enrichParts` / `partRenderer`:

- function → call it with `data`
- plain object → call `entry[data.kind](data)`
- missing entry / missing arm → same as today (`combine({ children: [] })`)

The fold algorithm does not change. Adding a kind is a new `FieldControl` arm + a new map key in every complete renderer set, not a new `if (name === 'control')`. Vanilla string + DOM get the same coerce; they do not reimplement a switch in `field.root`.

### 3. One-level object-slot merge

`mergeAdapter` (and each renderer's `mergeDefaults`) for each kind key:

- both values are plain objects (not functions, not arrays) → `{ ...base, ...over }`
- otherwise last-wins, including `combine` taken whole

Do not recurse further. Do not special-case the string `"control"`. Functions are not objects for this test (`typeof === 'function'`).

`useFormTree({ defaults: { field: { control: { input } } } })` therefore keeps native select / textarea / choicegroup.

### 4. Intercept is unchanged

Per-node `parts={{ control: (c) => … }}` / `<Default of={node} parts={{ control }}>` stays **one function** for that node. The map is the defaults table only. Do not re-type `SchemaFields` off the defaults object ([#87](https://github.com/timkindberg/formframe/issues/87) is the path-map type axis).

### 5. Break the function slot

Pre-1.0. No dual period (function-or-map). First-party recipes that today pass a `switch` as `defaults.field.control` migrate onto arms in the same change. Native recipe does not override control (it wraps `field.root` via `InjectFieldErrors`) and stays as it is.

## Considered options

- **`control.root` plus arms (nested compound).** Rejected: a third composition axis. Wrapping every widget is `field.root`.
- **Wrapper function + nested map.** Rejected: two knobs for one job; the review’s “container” instinct is #154’s field a11y wiring, not a second control template.
- **Engine special-cases the name `"control"`.** Rejected: the next mapped part invents a second special case. Coerce-at-lookup is generic.
- **Adapter-side dispatch** (`DefaultFieldRoot` / vanilla root reads the map). Rejected: `part.Default()` becomes a lie; every adapter reimplements dispatch.
- **Recursive deep merge of the whole defaults object.** Rejected: overkill, and would try to merge values that should last-win.
- **Special-case only `field.control` in `mergeAdapter`.** Rejected: same surprise as a named engine case. Object-slot merge matches coerce-at-lookup.
- **Dual period (function or map).** Rejected: ceremony for one slot; recipes are first-party and move in the same PR.

## Consequences

- Core `FieldPartRenderers.control`, `PartialAdapter`, `mergeAdapter`, and engine lookup change together. React `nativeDefaults` / `diagnosticDefaults` and vanilla string + DOM follow. `DefaultFieldRoot` still calls `controlPart.Default()` — it does not grow a kind switch.
- ADR 029’s invariant holds in spirit: a new widget is a new `kind` arm + map key, not a fold change. The IR facet is still one `parts.control`.
- ADR 051’s “form-lib wiring lives on `defaults.field.control`” now means on an **arm**.
- React defaults-piece extraction (`useFieldA11y`, `FieldControlSlot`, `ArrayHost`) is [#154](https://github.com/timkindberg/formframe/issues/154), not this change. Do not export a unified `DefaultControl` — that function is what this ADR deletes.
- Glossary: **control map**, **control arm** (`CONTEXT.md`).
