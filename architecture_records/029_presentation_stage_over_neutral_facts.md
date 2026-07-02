# ADR 029: Presentation as a Dedicated Stage over Neutral Facts

**Date:** 2026-07-01
**Status:** Accepted (tracer bd `wsr` landed; dual period closed by bd `9pb`)
**Deciders:** Tim Kindberg
**Supersedes:** ADR 022 (Widget Selection as a Layered IR Slot)
**Amends:** ADR 012 §3 (ownership of schema-derived HTML attributes)

## Context

Consumers must be able to customize **which widget renders a node** — including for
schemas they do not control (loaded from a database at runtime) — **declaratively,
type-safely, and without the library mandating a source format**. The canonical case:
a field the schema gives no UI hint for (e.g. a plain `type: array`, or a scalar
`enum` the consumer wants as a `multiselect` instead of a `select`) must be
renderable as any widget via a consumer-supplied rule — no schema edit, no
library-blessed keyword.

Two facts about the code today make the current shape unsustainable for this:

1. **Widget choice is welded to parsing.** `createFieldNode` decides `input` vs
   `select` (from `enum`/`oneOf`) and *builds the widget-specific parts* at parse
   time (`packages/core/src/parser/fieldNode.ts`); `arrayNode.ts` emits
   `multiselect` for primitive-array-of-enum. So "how a field presents" is a
   decision the **front-end** makes, which means every future front-end
   (`input-zod` is imminent) would re-implement it, and consumers cannot override
   it without editing the schema or hijacking render imperatively.

2. **The control set is closed in two places.** `FieldNode = InputFieldNode |
   SelectFieldNode` (`nodeTypes.ts`) and `FieldPartRenderers<R>` hard-codes
   `input()` + `select()` (`continuation/engine.ts`), with `DefaultFieldRoot`
   dispatching `node.widget === 'input' ? parts.input : parts.select`
   (`renderer.tsx`). There is no seam to add or hijack a control.

**ADR 022 is superseded.** It kept widget assignment in the parser (layers 1–3) and
made in-schema annotation (`x-widget`) a *library-recognized keyword*. That both
welds presentation to the front-end and forces one concrete source format on
consumers. The product direction is the opposite: the library owns a **normalized
presentation API + a resolver seam + a widget catalog**, and consumers transform
*their* source (inline `x-*`, a sidecar uiSchema, a DB blob) into it. Where the
hint comes from is not the library's business.

This ADR was chosen over three narrower options after an unbiased architecture
review (see *Alternatives Considered*). The review's amendments — a Core-owned
widget catalog, a single unified control facet, and a closed Core archetype union
for typing — are folded into the Decision below.

## Decision

**Presentation is its own stage.** The pipeline becomes:

```
front-end (parse)        →  neutral facts + origin, NO widget, NO control parts
present() (Core, pure)   →  assign widget + derive control parts, via a layered resolver
adapter (fold)           →  render, dispatching one `control` slot by resolved widget
```

### 1. The parser produces neutral facts, not widgets

A leaf node carries the raw material any widget needs, and no widget decision:

```ts
interface FieldFacts<TOrigin = unknown> {
  path: string
  label: string
  description?: string
  required: boolean
  primitive: 'string' | 'number' | 'integer' | 'boolean'
  valueShape: 'scalar' | 'array'        // scalar vs array-valued — defaults depend on it
  format?: string
  choices?: SelectOption[]              // present when the schema constrains to a set
  constraints: ValidationRules          // min/max/pattern/…
  attrs: { id: string; name: string }
  origin: { source: string; schema: TOrigin }
}
```

`valueShape` is mandatory because the multiselect story hinges on array-vs-scalar:
`choices` alone cannot distinguish a scalar `enum` (→ `select`) from a primitive
array-of-enum (→ `multiselect`), and `groupNode` submit-wrapping keys off
`widget === 'multiselect'`. Facts must carry enough structure for defaults
**without** reading `origin.schema`.

`valueShape` is `'scalar' | 'array'` for now. `'object'` is **anticipated but
deferred**: it applies only to *object-collapsing widgets* — a single leaf widget
that owns an object value (e.g. an address or date-range control producing
`{ … }`), which requires `present()` to collapse a `GroupNode` subtree into one
widget node — a separate, undesigned capability. Adding the member now would be a
producer-less/consumer-less enum (ADR 008); adding it later is a safe additive
change whose exhaustiveness errors will pinpoint every site object-collapse must
handle. It is extended when such a widget earns it.

### 2. `origin` is generic and front-end-owned

`node.schema: JSONSchemaObject` becomes `node.origin: { source: string; schema:
TOrigin }`, where `TOrigin` defaults to `unknown` and is **inferred from the
front-end's return type** (`jsonSchemaToTree(schema): GroupNode<JSONSchemaObject>`;
future `zodToTree(schema): GroupNode<ZodType>`). Core, traversal, the continuation
engine, the renderer, and validation may read only `origin.source`; `origin.schema`
is opaque to them. **Invariant:** only front-ends and consumer resolvers read
`origin.schema`. The full "neutral facet layer" is deliberately *not* built now —
the imminent Zod front-end is the second implementation that will earn which facets
are worth normalizing (ADR 008).

### 3. `present()` is a pure Core stage driven by a layered resolver

```ts
type Presentation = { widget: string; args?: Record<string, unknown> }
type PresentationResolver = (node: FieldFacts) => Presentation | undefined

function present(
  root: GroupNode,
  resolve: PresentationResolver,
  catalog: WidgetCatalog,          // Core-owned derivers; see §4
): GroupNode
```

- It is **source-agnostic**: a resolver may match on neutral facts *or* reach into
  `origin.schema` (accepting front-end coupling for that resolver, which the
  consumer owns). The library recognizes **no** source keyword.
- Resolvers **layer**, lowest→highest, consumer wins:
  `layered(defaultPresentation, consumerResolver)`. The shipped default replaces the
  parser's old hard-coding:
  ```ts
  const defaultPresentation: PresentationResolver = (f) =>
    f.valueShape === 'array' && f.choices ? { widget: 'multiselect' }
    : f.choices                          ? { widget: 'select' }
    :                                      { widget: 'input' }
  ```
- It runs **once per schema/resolver change**, memoized alongside parse, and **must
  preserve node identity for unchanged subtrees** (structural sharing) so the
  React `NodeRenderer` memo-bail keeps holding.

`present` lives in `@jsonschema-form/core` — the same "fold over the tree" family as
the continuation engine; splitting it into a package is deferred until a second
consumer forces it (ADR 008).

### 4. Core owns the widget catalog; adapters bind renders

A **widget kind** has two halves that live in two layers:

- **neutral `deriveParts`** — pure, framework-free, produces the control facet from
  facts. **Built-ins live in Core** (`@jsonschema-form/core` widget catalog), so the
  string-oracle and vanilla adapters get the *same* derivers and conformance
  (React ≡ vanilla markup, ADR 013/008) still holds. Co-locating derivers in the
  React package would be a conformance trap.
- **adapter `render`** — framework-specific. The React side **binds renders to
  catalog names** and may extend with new kinds:

```ts
// react — binds renders to the Core catalog; adds typed custom widgets
const widgets = bindRenders(coreCatalog, {
  input:  ({ control }) => <input {...control.attrs} />,
  select: ({ control }) => <select {...control.attrs}>{/* options */}</select>,
  multiselect: ({ control }) => <select multiple {...control.attrs}>{/* options */}</select>,
})
  .extend({
    rating: widget<{ max: number }>({
      control: rawControl,                                  // generic control facet
      render: ({ field, args }) => <StarRating name={field.attrs.name} max={args.max} />,
    }),
  })
```

Consumers **hijack** a built-in by rebinding its `render` (keep its Core deriver);
they **add** a custom widget by supplying a control facet + render. There is **no
runtime registration** — the catalog is a compile-time `const`.

### 5. One unified `control` facet — no raw-vs-archetype tiers

The continuation engine replaces the hard-coded `field.input` / `field.select`
part renderers with a **single `field.control` slot**. *Every* widget has a control
facet (typed per widget; exotic widgets use a generic/`raw` facet). This keeps ADR
010 continuation uniform: `parts.control.Default`, `renderNode` hijacks, and part
overrides all target `control` regardless of widget. A custom widget is **not** a
second-class "raw" node with a different shape.

### 6. Typing: closed Core archetype union, branded custom widgets

- Core keeps a **closed, fully-discriminated archetype union** for its built-ins
  (`input | select | multiselect`) so ADR 012 narrowing survives internally.
- Custom widgets are `widget: string & Brand` + the generic control facet + a typed
  `args` bag. `args` is type-safe **only** for widgets present in the consumer's
  `const` catalog; runtime/DB resolvers correctly collapse to a loose
  `{ widget: string; args?: Record<string, unknown> }` (the product owner accepts
  that Mode-1/runtime typing is loose).
- The typed `{ widget, args }` pairing is threaded as a **generic on the hook**
  (`useSchemaForm<S, const W>(schema, { widgets, resolvePresentation })` →
  `PresentationResolver<W>`), **not** through Core's heterogeneous tree.
  `present(root, resolve, catalog)` narrows on `widget` at runtime and does not try
  to keep per-widget part types across the tree.

`args` (generic per-widget config) is named to avoid collision with a select's
`options` (its choices).

## Migration (two PRs, dual-period, commit-sequenced)

The dual period ran across **two** PRs rather than one (a deliberate re-scope: the
`present()` seam was battle-tested on `main` before the parser's fallback was
removed — the blast radius of touching every `jsonSchemaToTree → render` path was
too large to bundle with the seam's introduction).

**PR 1 — bd `wsr` (additive seam):** the parser emits *both* today's widget/parts
*and* the new facts, so the gate stays green at every commit:

1. Add `FieldFacts` (incl. `valueShape`) to field nodes **without** removing existing
   widget/parts.
2. Add Core `present()` + `defaultPresentation` + Core derivers for `input`,
   `select`, `multiselect` (extracted from `buildInputAttrs`/select attrs in
   `fieldNode.ts` and `createMultiselectFieldNode` in `arrayNode.ts`).
3. Wire `useSchemaForm` → `present()`.
4. Flip conformance to compare the **post-`present`** tree.

**PR 2 — bd `9pb` (dual period closed):** delete the parser's widget/parts
derivation. `createFieldNode`/`createMultiselectFieldNode` now build **only neutral
facts** and delegate widget selection + parts to the Core catalog via
`presentDefaultLeaf(facts)` (the shipped default rule + `deriveInputParts`/
`deriveSelectParts`). `buildInputAttrs` and the parser's part-builders are gone, so
the facts→parts logic lives in exactly one place (`present.ts`). `jsonSchemaToTree`'s
return stays **fully-formed** (default-presented) — every direct consumer (the
`@jsonschema-form/vanilla` package, conformance, arrays/render-stability tests) is
unchanged, and `useSchemaForm` still layers a consumer resolver on top identity-
preservingly. The array→`multiselect` *collapse* remains a structural (facts)
decision the parser owns; only the leaf's widget/parts derivation moved.

Parser unit tests that assert widget/parts were **kept, not migrated**: they now
exercise the parse → facts → default-present path end-to-end through the public
`jsonSchemaToTree` entry point (a legitimate integration contract), so they stay
green and meaningful without duplicating `present()`'s own unit tests.

**Deferred to later tracers** (do not bundle): `bindRenders`/`extend` custom-widget
DX, the unified `field.control` engine/adapter rewrite (§5 — the larger, riskier
half; the first tracer reuses the existing `select` dispatch since `multiselect`
already renders via `<select multiple>`), and the `origin` rename (§2).

**Tests are integration-style** (product-owner preference): assert
`schema + resolver + widgets → rendered DOM / submitted data`, not parser internals.
The golden case for the first tracer: a schema with no multiselect hint +
`resolvePresentation` forcing `multiselect` → assert `<select multiple>` in the DOM
and that submit yields a `string[]`.

## Consequences

- **Front-end-agnostic presentation.** `present()` never reads `origin.schema` to
  build parts (the parser already turned `enum` into neutral `choices`), so
  `input-zod` inherits the entire widget system for free by filling `FieldFacts`.
- **`enum → select` is an overridable rule, not parser code** — directly enabling
  the DB-schema/no-hint customization story.
- **ADR 012 §3 amended.** Schema-derived HTML attributes are assembled by **Core
  widget derivers in the present stage**, not by the JSON Schema parser. Core still
  owns the neutral attribute contract; only *where* it is assembled moves.
- **ADR 013 renderer contract changes** (later tracer): field control dispatch moves
  from fixed `input`/`select` part renderers to a single `control` slot keyed by
  resolved widget. Non-control parts (label/description/chrome) are unchanged.
- **Conformance cost is explicit.** Built-in derivers become a maintained Core module
  so both React and the string oracle share them; this is a real artifact, not a
  React convenience helper.
- **Perf:** one extra memoized O(n) walk per schema/resolver change — same order as
  parse; zero per-keystroke cost provided `present` preserves node identity and
  `widgets`/`resolvePresentation` are stable references.
- **Typed DX for const schemas, loose for runtime** — as intended.

## Explicit rejections

- **Library-recognized source keyword** (`x-widget`, ADR 022 layer 2) — rejected as a
  library concern. Consumers may adopt such a keyword *in their own resolver*; the
  library defines no source format.
- **Parser deciding widgets/parts** — rejected; it welds presentation to each
  front-end and blocks override.
- **Raw-vs-archetype two-tier widgets** — rejected; breaks ADR 010 continuation
  uniformity. One `control` facet instead.
- **Deriver co-location in the React adapter** — rejected; conformance trap. Built-in
  derivers live in Core.
- **Runtime widget registration** — rejected; compile-time `const` catalog only.

## Alternatives Considered

- **Option 1 — resolve at parse time** (`jsonSchemaToTree(schema, { resolve })`):
  welds resolution to parsing; every front-end re-plumbs it; re-resolving means
  re-parsing. Rejected.
- **Option 2 — bolt-on override pass that reuses the parser's part builders**:
  rebuilding archetype parts requires reading `origin.schema`, re-coupling the pass
  to JSON Schema; converges on this ADR's facts/parts split anyway, but warty.
  Rejected.
- **Option 3 — resolve inside the React renderer**: resolution logic entangled with
  rendering and duplicated per adapter (vanilla would re-implement); harder to
  unit-test. Rejected.
- **`NodeBase<TOrigin = JSONSchemaObject>`** (defaulting to JSON Schema): bakes the
  front-end assumption into Core. Rejected in favor of `= unknown` inferred from the
  front-end (§2).

---

**Relates to:** ADR 006 (IR waist), ADR 008 (second implementation earns the seam —
Zod front-end, deferred neutral-facet layer), ADR 010 (continuation; `control` facet
uniformity), ADR 012 (typed IR; §3 amended), ADR 013 (renderer adapter; control
dispatch), ADR 014 (continuation engine), ADR 019 (validation side-loaded; orthogonal
to presentation), ADR 022 (superseded).
