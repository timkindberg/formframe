# ADR 030: Container Facts — Generalizing the Neutral Waist so `present()` Can Collapse a Subtree into One Widget

**Date:** 2026-07-02
**Status:** Accepted (bd `fcj`) — approved 2026-07-03 after review (PR #28); **tree-level
contract implemented 2026-07-07** (see Amendment below)
**Deciders:** Tim Kindberg
**Extends:** ADR 029 (§1 `FieldFacts` → a node-level `NodeFacts` waist; resolves the
deferred `valueShape: 'object'` member of §1)
**Relates to:** ADR 006 (IR waist), ADR 008 (a second implementation earns the seam),
ADR 010/013 (the continuation `control` facet / render dispatch), ADR 011 (form-state
shallow slot; submit assembly), ADR 018 (sparse array paths / submit)

## Context

ADR 029 made presentation its own stage: the parser emits neutral **`FieldFacts`** on
each leaf, and a pure `present()` stage assigns a widget + derives control parts via a
layered `PresentationResolver`. That resolver is the seam a consumer uses to say "render
*this* node as *that* widget" for schemas it does not control — the whole point of the
ADR.

But the seam only reaches **leaves**. Two facts about the code today:

1. **`FieldFacts` is leaf-only.** It lives on `FieldNode` (`nodeTypes.ts`); `present()`
   calls `presentField` only when `node.isField` and otherwise just recurses into
   `children` (`present.ts`). `ArrayNode` and `GroupNode` carry **no facts**.
2. **A resolver therefore cannot opt a *container subtree* into a single widget.** A
   `PresentationResolver` is `(facts: FieldFacts) => Presentation | undefined` — it is
   never handed a container, so there is nothing to match on and no node to rewrite.

What this blocks — the canonical case (the VNDLY primary-multiselect pattern):

```jsonc
// allowed_criteria: choose N criteria objects from a remote list
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": { "name": { "type": "string" }, "type": { "type": "string" } }
  }
}
```

Today this parses to an **`ArrayNode`** (an add/remove list of object sub-forms). The
product wants a consumer to be able to present it as **one multiselect** producing
`Array<{ name, type }>` — no schema edit, no add/remove UI. There is no seam for that,
because the `ArrayNode` has no facts to resolve over.

The mirror gap is object subtrees: a `GroupNode` (e.g. an address, a date-range) that a
consumer wants to collapse into **one** control that owns the whole `{ … }` value. ADR
029 §1 anticipated exactly this and **deferred `valueShape: 'object'`** until "such a
widget earns it," noting it "requires `present()` to collapse a `GroupNode` subtree into
one widget node — a separate, undesigned capability." **This ADR designs that
capability** and, with it, earns `valueShape: 'object'`.

## Decision

### 1. `FieldFacts` generalizes to a node-level `NodeFacts` waist

Facts become a property of **every** node — leaves *and* containers — not just leaves.
Leaves keep exactly today's facts; containers gain facts that describe the value the
subtree submits. The neutral waist (ADR 006) now spans the whole tree, so the resolver
can match a container the same way it matches a leaf.

```ts
type ValueShape = 'scalar' | 'array' | 'object'

interface NodeFacts {
  path: string
  label: string
  description?: string
  required: boolean
  valueShape: ValueShape
  constraints: ValidationRules
  attrs: { id: string; name: string }
  origin: { source: string; schema: unknown } // front-end-owned (ADR 029 §2)
}

// today's FieldFacts, unchanged in meaning
interface LeafFacts extends NodeFacts {
  primitive: 'string' | 'number' | 'integer' | 'boolean'
  format?: string
  choices?: SelectOption[]
}

// projected onto ArrayNode / GroupNode
interface ContainerFacts extends NodeFacts {
  choices?: SelectOption[]        // present only when the schema constrains a finite set
  item?: ItemDescriptor           // the neutral shape of one element (open-ended sources)
}
```

`ItemDescriptor` is the minimum neutral description of a single element (e.g. its member
keys + primitives) — enough for a resolver to name a value/label identity **without**
reading `origin.schema`. Its precise shape is settled by the first two consumers (ADR
008); it is deliberately thin here.

### 2. `valueShape` is the shape of the *submitted value*, independent of decomposition

This is the load-bearing invariant. `valueShape` describes what the node contributes to
the submitted document, **whether or not it is currently decomposed into children**:

| node today | `valueShape` | decomposed now? |
|---|---|---|
| scalar leaf | `scalar` | — |
| leaf enum-array (`multiselect`) | `array` | no (already one control) |
| **subtree array** (`items:object`) | `array` | yes (add/remove) — *collapsible* |
| **object subtree** (`GroupNode`) | `object` | yes (nested fields) — *collapsible* |

A leaf enum-array and a *collapsed* object-array **both** report `valueShape: 'array'`
and stay consistent. This resolves ADR 029's deferred member: `'object'` is the
submitted shape of an object-collapsing widget.

### 3. Generalizing facts to containers is a safe no-op by default

The shipped `defaultPresentation` keys multiselect off **`valueShape === 'array' &&
choices`** (ADR 029). A subtree array has `valueShape: 'array'` but **no `choices`** (it
has an `item` descriptor instead), so the default rule yields nothing for it and it
**stays an add/remove `ArrayNode`**. An object subtree (`valueShape: 'object'`, no
`choices`) likewise stays decomposed. So projecting facts onto containers changes no
default output — `present(tree, defaultPresentation)` remains identity-preserving across
the whole container matrix, exactly as ADR 029's default is for leaves. Conformance
proves it by folding the default over the existing container schemas.

Collapse happens **only** when a consumer resolver explicitly returns a widget for a
container node.

### 4. Two kinds of option supply: finite `choices` (facts) vs an open-ended **source** (`args`)

First, separate the easy case. A **finite** option set — whether it comes from `enum`
*or* `oneOf` — is already carried by neutral `choices`, and `oneOf` already supplies
**both halves of the identity**: `const` is the submitted value and `title` is the
display label (this is App_01's pattern, and the parser already lowers it — see
`arrayNode.ts` / `fieldNode.ts`). So a finite object/enum multiselect needs *nothing*
extra: `choices: [{ value, label }, …]` is complete, and neither `valueKey` nor
`labelKey` is involved. This is the common case and it is fully covered by facts today.

The hard case is **open-ended** options — the VNDLY `allowed_criteria` pattern — which is
richer than a finite set in two ways facts alone cannot carry:

- **option source** — the options are remote/async (`allowed_criteria` is *fetched*), so
  there is no static `choices` array to bake into the tree; and
- **value identity** — each fetched option is an **arbitrary object** (`{ name, type }`
  is merely VNDLY's shape — it could be any object with any keys), so the widget needs to
  be told *which* member is the submitted value and *which* is the display label. A
  finite `oneOf` never has this problem because `const`/`title` are fixed by convention;
  an arbitrary fetched object has no such convention.

Neither belongs in neutral facts. They are supplied by the resolver as **`args`** (the
generic per-widget config bag from ADR 029 §6, named to avoid colliding with a select's
`options`). This is not a new pattern invented here — it is exactly what the VNDLY
`JSFSelect` already does with its `optionsFromApi` hook, generalized into the resolver:

```ts
resolvePresentation: (facts) =>
  facts.path === 'allowed_criteria'
    ? {
        widget: 'multiselect',
        // optionsSource: () => Promise<Array<Record<string, unknown>>>  (cf. JSFSelect optionsFromApi)
        // valueKey/labelKey: which member of each fetched object is value vs label
        args: { optionsSource: fetchCriteria, valueKey: 'name', labelKey: 'type' },
      }
    : undefined
```

Same widget **name** (`multiselect`), divergent **facts/args** — the exact case `args`
exists for. Container **facts** carry `valueShape` + *either* `choices` (finite,
in-schema, self-identifying) *or* an `item` descriptor (open-ended); the resolver
supplies the runtime source via `args`.

**Are `valueKey`/`labelKey` canonical or just an example?** — Proposed as *canonical
typed args for the built-in `multiselect` widget*, not an ad-hoc convention: Core owns
that widget in the catalog (ADR 029 §6), so it can own the small typed shape
`{ optionsSource?, valueKey?, labelKey? }` its renderer reads. But they are **not frozen
by this ADR** — the concrete typing lands with the §5 `control` slot and the async-options
capability that actually consumes them, and only after a second real consumer confirms the
shape (ADR 008). Until then they are the *proposed* arg names, exercised by the
characterization spec, not a shipped public type.

### 5. `present()` gains **collapse**

`present()` today offers only leaves to the resolver. It is generalized to offer
**container** nodes too, and to *collapse* one when the resolver returns a widget for it:

- prune the subtree's `children`, and
- emit a single **leaf-like control node** at the container's `path` carrying the
  container's facts (so `valueShape` is preserved), the resolved `widget`, and `args`.

Uncollapsed containers recurse exactly as today. **Collapse is memoized the same way the
rest of `present()` is** — this is not new machinery, it inherits ADR 029 §3:

- `present()` is a pure fold keyed on `(tree, resolver)`, run **once** and cached upstream
  (`useFormTree`'s `useMemo`), so collapse does **not** re-run on value changes /
  keystrokes — only if the schema or resolver identity changes.
- collapse is **identity-preserving**: a container whose facts and resolver decision are
  unchanged returns the *same* collapsed node reference (structural sharing), so even when
  `present()` is re-invoked, the collapse body's work is not re-materialized downstream and
  the React `NodeRenderer` memo-bail keeps holding.

So the collapse code "doesn't run over and over if things aren't different" — same input
tree + same resolver ⇒ referentially-equal collapsed node, no recompute.

### 6. Submit assembly stays consistent for free (leaves the array hook where it is)

Submit today collects **`arrayFieldSignatures`** by walking for
`fieldNode.widget === 'multiselect'`, then `forceArrayFields` wraps a single value into a
1-element array and `unflatten` nests it (`groupNode.ts` / `groupNode.submitUtils.ts`).
Because a collapsed object-array is emitted as a **leaf-like node with `valueShape:
'array'`**, the signature walk keys on **`facts.valueShape === 'array'`** (a trivial
generalization of the `widget === 'multiselect'` check) and the *array* value assembles
with no further work — a single selection still submits as `['x']`.

The **object identity** step (mapping the submitted option values back into
`{ name, type }` objects via `valueKey`/`labelKey`) is an *additional*, resolver-declared
submit transform. It ships with the async-options capability (§7), not in the first
slice — the array-shape assembly is correct without it.

### 7. Rendering a collapsed container is gated on ADR 029 §5 (+ async options)

Drawing the collapsed control as DOM needs two things this repo has deliberately not
built yet:

- the **unified `field.control` slot** (ADR 029 §5) — today React dispatches only
  `input` vs `select` (`DefaultFieldRoot`), and the engine's `FieldPartRenderers` +
  Core's `FieldNode` union are closed to `input | select | multiselect`; and
- an **async/remote options** capability — the current `SelectFieldParts.options` is a
  static array, which cannot express `optionsSource`.

So **this ADR's scope is the tree-level contract**: the `NodeFacts` waist, container
facts, `present()` collapse, and submit array-assembly consistency — all fully testable
without a renderer (assert that `present()` collapses the subtree to one node, prunes its
children, preserves `valueShape`, and that submit yields the array). The DOM rendering of
the async object-array multiselect lands with the §5 `control` rewrite (tracked by
`jsonschema-form-cm7`) and the async-options slot.

## Migration (additive, gate-green per commit)

1. Introduce `NodeFacts` / `LeafFacts` / `ContainerFacts` (`FieldFacts` becomes
   `LeafFacts`, re-exported under the old name for one release). Project facts onto
   `ArrayNode` / `GroupNode` in the parser. **No behavior change** — the default rule
   ignores container facts that lack `choices`.
2. Generalize `present()` to offer container nodes to the resolver and to collapse when
   it returns a widget; identity-preserving; default remains a no-op. Fold `present(default)`
   over the container matrix in conformance to prove the no-op.
3. Generalize submit's array-signature collection from `widget === 'multiselect'` to
   `facts.valueShape === 'array'`.
4. **(Later, with ADR 029 §5 / `cm7`)** render the collapsed control; add the
   `optionsSource` async slot and the `valueKey`/`labelKey` submit transform.

## Consequences

- **The resolver seam becomes whole-tree.** A consumer can present *any* node — leaf or
  subtree — as any widget, directly enabling the DB-schema/no-hint story for containers,
  not just scalars.
- **`valueShape: 'object'` is earned, not speculative** (ADR 008): it arrives with the
  object-collapsing widget that needs it, and its exhaustiveness errors will pinpoint
  every site object-collapse must handle.
- **Default output is unchanged** — a pure superset; existing trees, conformance, and
  submit are untouched until a resolver opts in.
- **`args` carries source + identity, facts stay neutral** — remote/async option sources
  never pollute the front-end-agnostic waist.
- **Rendering is explicitly deferred** to the §5 control slot; the facts/collapse/submit
  contract stands alone and is independently verifiable.
- **This sharpens a layer boundary we had left implicit** (surfaced by review): `present()`
  is the **semantic/structural** stage — it decides the widget, the `valueShape`, and
  whether a subtree collapses, and *the whole pipeline (crucially submit, which walks the
  tree) inherits those decisions*. The imperative `renderNode` hijack (ADR 010) is a
  **presentational** override — it can change how a node *looks* (markup, layout, wrapping
  DOM) but **cannot** change what the node *submits*, because submit reads the tree, not
  the rendered output. So the imperative layer is not "less powerful than `present()` by
  accident" — it is deliberately **visual-only**, and value-shape/structure changes must
  go through `present()`. This division (declarative semantics vs. imperative visuals) is
  worth stating as its own principle; if it proves load-bearing beyond this ADR it should
  graduate to a dedicated ADR amending ADR 010/029.

## Explicit rejections

- **Put `optionsSource` / `valueKey` in facts** — rejected; the option source is
  runtime/remote and consumer-owned, not a neutral, front-end-derivable fact. It is
  `args` (ADR 029 §6).
- **A distinct `collapse: true` flag on the resolver return** — rejected; returning a
  widget for a container *is* the collapse instruction. A container that keeps its widget
  (`fieldset`/`array`) is simply not collapsed.
- **Model the collapsed array as a brand-new node kind** — rejected; it is a leaf-like
  control with `valueShape: 'array'`, so it reuses the existing submit hook and (later)
  the `multiselect` control. No new kind, no new submit path.
- **Collapse at parse time** — rejected for the same reason ADR 029 rejected resolving at
  parse time: it welds the decision to the front-end and blocks override.

## Alternatives considered

- **Leave containers factless; let consumers hijack the render imperatively** (ADR 010
  `renderNode`) — a consumer *can* already replace an `ArrayNode`'s rendered output, but
  (a) it must re-implement the widget + its options + submit wiring by hand per app, and
  (b) the submitted value would **still** be assembled as an add/remove array, because
  submit walks the **tree**, not the rendered DOM — imperative hijack cannot change what a
  node submits. This is not a wart to route around; it surfaces a real layer boundary
  (see the new consequence below). Collapse in `present()` makes the value shape and the
  widget a single declarative decision the rest of the pipeline inherits. Rejected as the
  primary path (imperative hijack remains available for one-off *visual* overrides).
- **A separate `presentContainer()` resolver distinct from the leaf resolver** —
  rejected; two resolver seams double the consumer's surface for one concept ("present
  this node as that widget"). One `NodeFacts`-typed resolver covers both.

## Amendment (2026-07-07) — implementation split; the scalar-choice §3 rule deferred to the front-end extraction

Implementing this ADR surfaced two refinements, agreed with the decider:

1. **The default-collapse rule is *widened* to scalar-choice arrays — but that half is
   deferred to PR B, not landed here.** As written, §3 makes the default a pure no-op for
   *every* container. The agreed end state additionally makes the default **collapse a
   *scalar-choice* array** (items are a finite `enum`/`oneOf` set → one
   multiselect/checkboxes leaf), while an **object array** and an **object subtree** still
   stay decomposed unless a resolver opts in. This relocates the array→multiselect collapse
   that the JSON Schema front-end does **today** (`arrayNode.ts`
   `createMultiselectFieldNode`) out of the parser and into `present()`, so front-ends
   become pure structural transcribers and a second front-end (Zod) inherits the collapse
   for free.

   It is **deferred to PR B** (the `input-jsonschema` extraction) because a byte-identical
   relocation collides with a legacy wart: the multiselect leaf currently stores
   `minItems`/`maxItems` in `validation.minLength`/`maxLength` (pinned by
   `parser.test.ts` "respects minItems and maxItems for multiselect"). Porting that remap
   into `present()` would drag a wart into the clean stage; instead PR B removes the
   redundant `node.validation` field (moving array-length constraints into
   `facts.constraints`, which already has `minItems`/`maxItems` slots) so the wart **dies**
   as the collapse relocates.

   **Landed (PR B2, ADR 033 §2):** `createArrayNode` now always emits an `ArrayNode`
   carrying `choices` (finite scalar-choice set) *or* an `item` descriptor (open-ended),
   `defaultPresentation` collapses the `valueShape:'array' && choices` container to one
   multiselect/checkboxes leaf, and `jsonSchemaToTree` runs `present(default)` so its
   returned tree is fully lowered. `createMultiselectFieldNode`/`isPrimitiveArraySchema` are
   deleted; the front-end is a pure structural transcriber. Runtime items (`getItem`) run the
   same default fold via `presentDefaultItem`, so nested scalar-choice arrays collapse there
   too — which incidentally makes nested primitive arrays work (relates to bd `ci4`).

2. **Naming: the resolver receives `AnyFacts` (the `LeafFacts | ContainerFacts` union),
   with `NodeFacts` as the shared base interface.** §1 sketched a single `NodeFacts`; in
   code the union is what a resolver / the default rule needs so it can read `choices` on
   either arm while `primitive` (leaf) and `item` (container) narrow by discriminant. A
   collapse synthesizes a `LeafFacts` from the container's `ContainerFacts`, preserving
   `valueShape` (load-bearing for submit) and using a placeholder `primitive: 'string'`
   (collapsed controls are select/multiselect/choicegroup, whose derivers ignore
   `primitive`).

**What PR A landed (the tree-level contract, fully verified without a renderer):**
`NodeFacts`/`LeafFacts`/`ContainerFacts`/`ItemDescriptor` (+ `FieldFacts` back-compat
alias); container facts projected onto `ArrayNode` (`valueShape:'array'` + `item`) and
`GroupNode` (`valueShape:'object'`); `present()` offers non-root containers to the resolver
and **collapses** a container into one leaf-like `FieldNode` (pruning the subtree,
preserving `valueShape`, carrying resolver `args`); submit assembly already keys on
`facts.valueShape === 'array'`, so a collapsed object-array submits `Array<…>` with no
further change. **Not** in PR A: rendering the collapsed control (§7, needs the
async-options slot) and the §3 scalar-choice relocation (landed later in PR B2, above).

---

*This ADR crosses the stubborn Core facts boundary (`FieldFacts` → `NodeFacts`) and adds
a capability (`valueShape: 'object'`, subtree collapse), so it was escalated for a
decision before implementation (AGENTS.md tier 3) and **accepted after review** (PR #28).
The accompanying `containerFacts.test.ts` pins today's behavior and records the target
contract as `it.todo` executable-spec entries so the gate stays green until each slice is
implemented. Implementation follows the migration steps above; rendering of collapsed
controls is gated on the ADR 029 §5 `field.control` slot. The present/render layer
boundary this ADR surfaced (Consequences) is ratified separately in ADR 031.*
