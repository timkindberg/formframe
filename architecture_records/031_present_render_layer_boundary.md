# ADR 031: The Three-Way Boundary — the **Schema** Owns Value Shape, `present()` Owns the Widget, `renderNode` Owns Pixels

**Date:** 2026-07-03
**Status:** Proposed (bd `6it`)
**Deciders:** Tim Kindberg
**Relates to:** ADR 006 (neutral IR waist), ADR 010 (the `renderNode` continuation /
imperative hijack), ADR 011 (form-state is a shallow slot; submit assembles from the
tree + native `FormData`), ADR 013 (render dispatch / `SchemaFields`), ADR 029
(presentation stage over neutral facts), ADR 030 (container facts + subtree collapse)

## Context

ADR 030's review surfaced a naming smell, and following it to the bottom corrected a
framing error worth pinning down before we build on it.

Both of our stage words — **`present()`** and **`renderNode`** — connote *visual output*.
Yet `present()` clearly *influences the submitted value* (choosing `multiselect` makes a
field submit an array; ADR 030 collapse re-homes a whole subtree's value on one control),
while `renderNode` (ADR 010) — despite "render" — **cannot** change the submitted value at
all. The first draft of this ADR concluded "**`present()` owns the value contract**." A
second review question exposed that as too strong:

> *The schema is the validator. If `present()` could submit a shape that differs from the
> schema, wouldn't that value just fail validation — i.e. isn't that a bug?*

Yes. That question is the key. It means the value contract is **not** `present()`'s to
own — it belongs to the **schema**, because the schema is what the document is validated
against, and any submit that diverges from it is by definition a bug. This ADR fixes the
model accordingly.

### The motivating concrete case (why "value shape" exists at all)

A `multiselect` (schema `type: array`) with a **single** option selected. `new
FormData(form)` yields one entry `tags=a` — and **`FormData` is lossy: a 1-element array
and a scalar are indistinguishable on the wire** (one `name=value` pair). So the raw
submit is `{ tags: 'a' }`, which fails `type: array`. Submit therefore repairs it to
`{ tags: ['a'] }` via `forceArrayFields` (`groupNode.ts` / `groupNode.submitUtils.ts`).

The lesson is not "`present()` decides the shape." It is:

- **Validation can only *detect*, not *repair*.** It can say `'a'` violates `type:array`;
  it cannot know the fix is `['a']` (vs. the value being genuinely wrong).
- **Repair happens at *assembly* time and needs the schema's shape there.** That shape,
  projected into the neutral tree as `valueShape`, is what tells the assembler "this path
  is an array, wrap a lone value." It is a **schema fact**, not a widget decision. (Today
  the walk keys on `widget === 'multiselect'` as a proxy; ADR 030 re-keys it on
  `facts.valueShape === 'array'` — i.e. directly on the schema fact.)

## Decision

### 1. The **schema** is sovereign over the submitted value shape

The schema is the validator, so it defines the shape the submitted document must have.
`valueShape` (`'scalar' | 'array' | 'object'`, ADR 029/030) is the **neutral projection of
the schema's shape** into the tree — front-end-owned (ADR 029 §2 `origin`), consumed by
submit assembly. No later stage may submit a value that diverges from it; if one did, that
is a validation-failing bug, not a feature.

### 2. Transport repairs are **schema-keyed**, and only *repair* lossiness — they never *invent* shape

Native `FormData` is flat and lossy, so submit runs shape-restoring transforms
(`forceArrayFields`, `transformCheckboxes`, `omitEmptyFormValues`, `unflatten`). Every one
is keyed on the **schema fact**, not on presentation, and each only reconstructs the shape
the schema already declared — it closes the gap between lossy transport and the schema, and
does nothing else. This is the legitimate, and *only*, sense in which the submitted value
is "shaped" downstream of the schema.

### 3. A widget is a **(visual form + value *production*)** pair — but its value is *bounded by the schema*

Picking a widget is simultaneously a display and a data decision, and the two are
inseparable — `<select multiple>` draws a listbox *and* produces an array; `<input
type=checkbox>` draws a box *and* produces a boolean. This is why `present()` (which
assigns widgets) is entangled with the value at all. **But that entanglement is
constrained, not sovereign:** `present()` must pick a widget whose produced value
*conforms* to the schema (or pair it with a §2 transform that bridges it back). It chooses
*among schema-conforming widgets*; it does not get to redefine the contract.

### 4. `present()` owns the **widget** and **tree structure** — constrained to conform

`present()` (ADR 029) is the tree-level resolution/lowering stage: for each node it fixes
the `(widget, control parts)` and — via ADR 030 collapse — may restructure the tree
(prune a subtree, re-home its value on one control). Both powers are **bounded by §1**: a
collapsed object-array must still submit `Array<{…}>` to validate, which is exactly why
ADR 030's `valueKey`/`labelKey` object-identity transform is *mandatory* (a first slice
that submitted scalar `['x']` against an object-array schema would fail validation — the
schema bounds what collapse may emit).

### 5. `renderNode` owns **pixels only** — and *cannot* touch the value, by construction

`renderNode` (ADR 010) hijacks the *drawing* of an already-resolved node. It does not
re-run widget resolution or restructure the tree, so it never affects the submitted value
— and it *couldn't* without breaking the architecture:

- **Submit is tree-driven and framework-agnostic** (ADR 011): the document is assembled
  from the resolved tree + native `FormData`, on the vanilla zero-React stack. Submit never
  observes React render output.
- **`renderNode` runs at React render time**, after the tree is finalized. For it to
  change the value it would have to mutate the tree (breaks Core statelessness, ADR 006) or
  make submit read the DOM (breaks the framework-agnostic native-`FormData` path, ADR 011).

So the asymmetry is **desirable and fundamental**: keeping value shape schema-owned and
tree-assembled is what lets the submitted document stay derivable from the tree alone, in
any framework, with no renderer.

### 6. Keep the name `present()`; do not rename

Given §3–§4, "presentation" properly spans the widget's visual form *and* its
(schema-conforming) value production, so `present()` is accurate: it decides how each node
presents to the user *and* to the submit pipeline. We considered renaming it to a
compiler-lowering word (`resolve()` / `realize()` / `lower()`) to foreground the semantic
role, but rejected it as public-API churn (ADR 029's `present`/`PresentationResolver`/
`SchemaFields` surface) for a connotation nuance. The fix is a crisp glossary, not a
rename.

### 7. Consumer mental model: three axes

| I want to change… | Where it lives | Nature | Constrained by |
|---|---|---|---|
| **the value shape a node submits** | the **schema** (front-end) + its §2 transforms | declarative, front-end | it *is* the contract (validator) |
| **the widget / decomposition** (incl. collapse) | the `PresentationResolver` fed to `present()` | declarative, tree-level, framework-agnostic | must conform to the schema (§1) |
| **how a node looks** (markup, layout) | `renderNode` (ADR 010) | imperative, render-time, React-only | cannot touch the value at all |

"The schema fixes the shape; `present()` picks a conforming widget (and may collapse);
`renderNode` just draws it."

## Consequences

- **Value shape is schema-owned, tree-assembled.** The submitted document stays a function
  of the schema-projected tree + native `FormData` — no DOM scraping, works on the vanilla
  stack (ADR 011). This is the property we protect by *not* letting `present()` or
  `renderNode` redefine the contract.
- **`present()`'s authority is scoped to widget + structure, both conform-bounded.** This
  corrects the first draft's over-broad "owns the value contract" claim.
- **ADR 030 collapse is bounded by validation.** The `valueKey`/`labelKey` transform is
  reclassified as *required for correctness* (schema conformance), not an optional
  polish step.
- **`present()` keeps its name and public surface** (ADR 029). This ADR adds vocabulary,
  not API.

## Alternatives considered

- **"`present()` owns the value contract" (this ADR's own first draft).** Rejected on
  review: the schema is the validator and therefore the sole authority on shape; a
  `present()` that diverged would produce validation-failing output.
- **Rename `present()` → `resolve()` / `realize()` / `lower()`.** Clearer as a lowering
  term, but rejected: public-API churn against ADR 029 with no functional gain; §3–§4 make
  "present" accurate.
- **Give `renderNode` the ability to change the submitted value.** Rejected per §5: it
  would require mutating the tree from render or reading the DOM at submit, both breaking
  Core statelessness / the framework-agnostic native-`FormData` path.

## Explicit rejections

- **Treat `forceArrayFields` (and friends) as a bug to delete.** Rejected — their *absence*
  is the bug (validation-failing output); they are the schema-keyed repair of lossy
  transport, and validation can only detect the loss, not repair it.
- **Treat the `present`/`render` asymmetry as a limitation to remove.** Rejected — it is
  the mechanism that keeps the submitted value schema-owned and framework-agnostic.
