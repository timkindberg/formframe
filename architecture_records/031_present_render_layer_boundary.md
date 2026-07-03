# ADR 031: The `present()` / `renderNode` Boundary — A Widget Is a (Visual Form + Value Contract) Pair

**Date:** 2026-07-03
**Status:** Proposed (bd `6it`)
**Deciders:** Tim Kindberg
**Relates to:** ADR 006 (neutral IR waist), ADR 010 (the `renderNode` continuation /
imperative hijack), ADR 011 (form-state is a shallow slot; submit assembles from the
tree + native `FormData`), ADR 013 (render dispatch / `SchemaFields`), ADR 029
(presentation stage over neutral facts), ADR 030 (container facts + subtree collapse)

## Context

ADR 030's review surfaced a naming smell worth resolving before we build on it.

Both of our stage words — **`present()`** and **`renderNode`** — connote *visual output*.
Yet the responsibilities are the reverse of that intuition:

- **`present()`** has authority over the **submitted value**. Choosing `multiselect` for
  an enum-array makes it submit an array; ADR 030's *collapse* prunes a subtree and
  re-homes the whole `{ … }`/`[ … ]` value on one control (`valueShape`). `present()`
  decides what a node contributes to the submitted document.
- **`renderNode`** (ADR 010), despite "render" sounding like the thing that draws pixels,
  is the one that **cannot** change the submitted value — it only replaces a node's
  markup (ADR 030 Consequences: "submit walks the tree, not the rendered DOM").

So the layer that *sounds* visual owns the data, and the layer that *sounds* like it owns
rendering is visual-only. The review asked the right two questions: **is `present()` still
the right word**, and **should `renderNode` instead gain the missing data capability** so
the boundary isn't lopsided? This ADR answers both.

## Decision

### 1. A widget is a **(visual form + value contract)** pair, not a visual-only artifact

This is the load-bearing reframe. Picking a widget is *simultaneously* a display decision
and a data decision, and the two are inseparable:

- `<select multiple>` **renders** as a listbox **and submits** an array.
- `<input type="checkbox">` **renders** as a box **and submits** a boolean.
- ADR 030's collapsed object-array **renders** as one control **and submits** `Array<…>`.

HTML itself already fuses them: `type` on an `<input>` is a *presentational* attribute
that also determines the *value* the element contributes. There is no "visual-only widget
choice" — the value contract rides along with every widget.

### 2. `present()` legitimately owns the value contract; it is the semantic resolution stage

Because a widget is that pair, the stage that **assigns widgets** (`present()`, ADR 029)
necessarily has authority over the value contract too. That is not `present()`
overreaching into data — it is the direct consequence of §1. `present()` is best
understood as the **resolution / lowering** stage: it lowers the abstract neutral tree
(`NodeFacts`, ADR 006/029/030) into a concrete widget tree, fixing for each node its
`(widget, control parts, value contribution)`. It runs at the **tree level**, before any
framework, and its output is what the rest of the pipeline — crucially **submit** —
inherits.

### 3. `renderNode` is a render-time **visual** override and *cannot* own the value contract

`renderNode` (ADR 010) hijacks the *drawing* of an already-resolved node. It does not
re-run widget resolution, so it never touches the value contract. This is not an accident
we should fix — it is **forced by the architecture**:

- **Submit is tree-driven and framework-agnostic** (ADR 011). The submitted document is
  assembled from the resolved tree + native `FormData`, and must work on the vanilla,
  zero-React stack. Submit never observes React render output.
- **`renderNode` runs at React render time**, after the tree is finalized. For it to
  change the submitted value it would have to either (a) feed back and mutate the tree
  (breaks Core statelessness, ADR 006), or (b) make submit read the rendered DOM (breaks
  the framework-agnostic, native-`FormData` submit path, ADR 011). Both are rejected.

So the asymmetry is **desirable and fundamental**: keeping value-shape authority in the
tree-level stage is exactly what lets the submitted document stay derivable from the tree
alone, in any framework, with no renderer at all.

### 4. Keep the name `present()`; do not rename

Given §1, "presentation" *properly includes* the value contract (as it does in HTML), so
`present()` is defensible: it decides how each node presents **both to the user and to the
submit pipeline**. We considered renaming it to a compiler-lowering word (`resolve()` /
`realize()` / `lower()`) to make the semantic authority obvious, but rejected it: it is a
public-API churn (ADR 029's `present`/`PresentationResolver`/`SchemaFields` surface) for a
connotation nuance, and "present" is not wrong once §1 is understood. The fix is a crisp
**glossary**, not a rename.

### 5. The consumer-facing mental model is two axes, not one ladder

| I want to change… | Use | Nature | Scope |
|---|---|---|---|
| **what a node submits** (widget / value shape / collapse) | the `PresentationResolver` fed to `present()` | declarative, tree-level, framework-agnostic | whole pipeline incl. submit |
| **how a node looks** (markup, layout, wrapping) | `renderNode` (ADR 010) | imperative, render-time, React-only | DOM only |

"Present decides the widget (and therefore the value); render draws it (and may be
hijacked for looks)."

## Consequences

- **The boundary is ratified, not patched.** `present()` = semantic/structural resolution
  (widget + value contract + collapse); `renderNode` = visual override. Neither grows
  into the other.
- **Submit stays tree-pure.** The submitted document remains a function of the resolved
  tree alone — no DOM scraping, works on the vanilla stack (ADR 011). This is the property
  we are protecting by *not* giving `renderNode` data powers.
- **`present()` keeps its name and public surface** (ADR 029). This ADR adds vocabulary,
  not API.
- **Guidance for future widgets:** any new control that changes the submitted value shape
  (radio groups keep scalar; checkbox groups/`multiselect` are arrays; a collapsed group
  is `valueShape:'object'`) is a `present()`/catalog concern (ADR 029 §5–§6, ADR 030), not
  a `renderNode` concern.

## Alternatives considered

- **Rename `present()` → `resolve()` / `realize()` / `lower()`.** Clearer as a
  compiler-lowering term, but rejected: public-API churn against ADR 029 with no
  functional gain; §1 makes "present" accurate.
- **Give `renderNode` the ability to change the submitted value.** Rejected per §3: it
  would require mutating the tree from render (breaks Core statelessness) or reading the
  DOM at submit (breaks the framework-agnostic native-`FormData` path). The one-axis
  "renderNode can do everything" model is incompatible with a tree-derived submit.
- **Introduce a third, submit-only override seam.** Rejected as premature (ADR 008): value
  shape is already fully expressible through `present()`; no second consumer forces a
  separate submit-transform seam yet. (ADR 030 §6 notes the resolver-declared submit
  transform that *does* ride with `present()` when async object-identity lands.)

## Explicit rejections

- **"`present` means visual, so it shouldn't touch data."** Rejected — in this library
  (and in HTML), presentation *is* the widget, and the widget carries the value contract.
- **Treating the `present`/`render` asymmetry as a limitation to remove.** Rejected — it
  is the mechanism that keeps submit tree-pure and framework-agnostic.
