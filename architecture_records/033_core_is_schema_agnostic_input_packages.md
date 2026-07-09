# ADR 033: Core Is Schema-Agnostic — a Neutral Compile-In Seam and Per-Schema Input Packages

**Date:** 2026-07-07
**Status:** Accepted (bd `8o0`) — staged implementation (B1 ✅ → B2 ✅ → B3 ✅ → B4 ✅)
**Deciders:** Tim Kindberg
**Extends:** ADR 006 (Core as the form-tree IR with adapters), ADR 029 (neutral
`FieldFacts` + `present()`), ADR 030 (container facts + subtree collapse)
**Enables:** bd `4qe` (Zod front-end, PR C)

## Context

CLAUDE.md already states the intended shape: *"Core is the form-tree IR plus the
recursive fold over it — stateless, framework-agnostic, **imports nothing**. Front-ends
(JSON Schema today) compile *into* the tree."* The code does not yet match that claim.
Core is still welded to JSON Schema in four places:

1. **`NodeBase.schema: JSONSchemaObject`** — every node carries its originating JSON
   Schema subschema.
2. **`FieldFacts.origin.schema: JSONSchemaObject`** — the neutral waist names a concrete
   JSON Schema type.
3. **`ArrayNode.itemSchema: JSONSchemaObject`** + `getItem(i)` builds items by re-reading
   that schema — Core knows how to *parse a JSON Schema item*.
4. The builders (`createFieldNode`/`createGroupNode`/`createArrayNode`) **take a
   `JSONSchemaObject` and read its keywords** (`enum`, `oneOf`, `minItems`, `title`, …).
   `jsonSchemaToTree` + `resolveRefs` live inside Core.

So a second front-end (Zod, bd `4qe`) cannot compile *into* the tree without either
(a) lowering Zod to JSON Schema first (lossy, and it would re-prove the coupling) or
(b) duplicating the whole builder/collapse logic. Neither is acceptable. We want Core to be
the neutral IR + `present()` + submit, and **each schema language its own input package**
that compiles into Core's builders. (This is also why the library will eventually be renamed
`schemaform` — it is not JSON-Schema-specific.)

Two redundancies compound the coupling and must be cleared first:

- **`node.validation` duplicates `facts.constraints`.** Every node carries a legacy
  `validation: ValidationRules` that is a copy of the neutral `facts.constraints` ADR 029
  introduced — plus a wart: a multiselect leaf stores `minItems`/`maxItems` in
  `validation.minLength`/`maxLength` (there are `minItems`/`maxItems` slots on
  `ValidationRules`, unused). Two homes for one fact.
- **The scalar-choice-array collapse lives in the front-end** (`arrayNode.ts`
  `createMultiselectFieldNode`): the parser decides `{type:array, items:{enum}}` becomes one
  multiselect leaf. That is a *lowering* decision; per ADR 030 it belongs in `present()`, and
  leaving it in the parser forces every future front-end to re-implement it.

## Decision

**Core imports nothing schema-specific. Each schema language is an input package that
compiles into Core's neutral builders.** Concretely:

### 1. `facts.constraints` is the single validation home; `node.validation` is removed

`ValidationRules` lives only on `NodeFacts.constraints` (ADR 029/030). Array-length
constraints are `constraints.minItems`/`maxItems` (not smuggled into `minLength`), so the
`minItems→minLength` wart dies. Every consumer (validation adapters, examples, `present()`,
submit) reads `node.facts.constraints`. `serializeNode`/`toJSON` emits `constraints` from
facts. (Array *items* — `ArrayItemNode` — are structural wrappers with no facts and no
constraints of their own; item requiredness rides on the array.)

### 2. The array→widget collapse is `present()`'s job, not the front-end's (ADR 030 §3)

A front-end emits an **`ArrayNode`** for an array schema and populates `ContainerFacts`
(`valueShape:'array'` + `choices` for a finite scalar-choice set, or an `item` descriptor
otherwise — choices XOR item). `defaultPresentation` **collapses a `valueShape:'array' &&
choices` container to one multiselect/checkboxes leaf by default**, while an object array /
object subtree stays decomposed unless a resolver opts in (ADR 030 §5). `jsonSchemaToTree`
runs `present(defaultPresentation)` so its returned tree is fully lowered. Front-ends become
pure **structural transcribers** — they extract facts, they never pick widgets or collapse.

Lazily-created runtime items (`ArrayNode.getItem(i)`, which the renderer uses for *every*
rendered item and the submit walk uses to find nested array leaves) are produced by the
front-end factory as raw structure, so they run through `presentDefaultItem` — the same
default fold, scoped to one item subtree — to collapse their nested scalar-choice arrays
consistently with the static tree. (Consumer resolvers still don't reach runtime items; that
pre-existing asymmetry is unchanged and tracked separately in bd `jzi`, not introduced here —
its fix likely rides on B3's `itemFactory` closure carrying the layered resolver.)

### 3. Core exposes neutral builders; front-ends call them with already-neutral input

Core's public compile-in seam is four builders that take **neutral** input (facts,
children, parts descriptors) — never a schema:

```ts
createFieldNode(input: { facts: LeafFacts<S>; … }): FieldNode<S>
createGroupNode(input: { facts: ContainerFacts<S>; children: AnyNode<S>[]; … }): GroupNode<S>
createArrayNode(input: {
  facts: ContainerFacts<S>
  seed: AnyNode<S>[]                    // instantiated items (minItems)
  itemFactory: (index: number) => AnyNode<S>  // build one item on demand
}): ArrayNode<S>
createArrayItemNode(input: { child: AnyNode<S>; … }): ArrayItemNode<S>
```

`createArrayNode` takes an **`itemFactory` closure** so Core can materialize a runtime item
(`getItem(i)`) without knowing the source schema — the front-end closes over its own item
compiler. This replaces `ArrayNode.itemSchema` + Core's schema-reading `getItem`.

### 4. `origin` is generic; Core treats the originating schema as opaque

Facts are generic in the originating-schema type: `NodeFacts<S = unknown>`,
`origin: { source: string; schema: S }`. **Core never reads `origin.schema`** — it passes it
through. A front-end specializes `S` (JSON Schema → `JSONSchemaObject`; Zod → `ZodType`) so a
consumer's resolver gets a **properly typed** `facts.origin.schema` for the schemas it owns.
The whole-node **`NodeBase.schema` is removed** — the only schema reference is the generic,
front-end-owned `origin.schema` on facts.

### 5. `@jsonschema-form/input-jsonschema` owns all JSON Schema knowledge

`jsonSchemaToTree`, `resolveRefs`, and the keyword→facts mapping move to a new
`@jsonschema-form/input-jsonschema` package that depends on `@jsonschema-form/core` and calls
its builders. Core keeps zero dependencies and no JSON Schema import. Core does **not**
re-export `jsonSchemaToTree` (that would make the dependency point back Core→front-end); every
consumer imports it directly from `@jsonschema-form/input-jsonschema`, and the `JSONSchema` type
now lives there too.

## Migration (staged; gate-green per PR)

- **PR B1 ✅** — §1: remove `node.validation`, consolidate to `facts.constraints` (kills the
  `minItems→minLength` wart). Core-internal, mechanical.
- **PR B2 ✅** — §2: relocate the scalar-choice-array collapse parser→`present()` default (the
  ADR 030 §3 amendment). `createArrayNode` always emits an `ArrayNode` (choices XOR item),
  `jsonSchemaToTree` runs `present(default)`, and `getItem` runs `presentDefaultItem`;
  `createMultiselectFieldNode`/`isPrimitiveArraySchema` are gone. Output is byte-identical
  (the collapsed leaf's facts match the old multiselect leaf). Nested primitive arrays now
  work as a side effect (relates to bd `ci4`).
- **PR B3 ✅** — §3/§4: neutral builders (`createFieldNode`/`createGroupNode`/`createArrayNode`/
  `createArrayItemNode`) + `itemFactory` closure; generic `origin<S>` (Core defaults `S=unknown`,
  reads it as opaque); drop `NodeBase.schema` / `ArrayNode.itemSchema`. Core-internal — the JSON
  Schema front-end (`compile.ts`) still lived in Core, now pinned to `S=JSONSchemaObject`.
- **PR B4 ✅** — §5: extract `@jsonschema-form/input-jsonschema` (`compile`, `resolveRefs`,
  `jsonSchemaToTree`, and the `JSONSchema`/`JSONSchemaObject` types). Core exports the neutral
  builders + `ValidationRules` + `decodeJsonPointerSegment`, drops the `json-schema-typed`
  dependency, and no longer imports or re-exports any JSON Schema. All consumers (react, vanilla,
  validation-*, examples) and the schema-driven tests moved to the new package.

## Consequences

- **A second front-end (Zod) is now a thin package**, not a fork of Core — it fills facts and
  calls builders, inheriting `present()`, collapse, and submit for free (bd `4qe`, PR C).
- **Core is finally schema-agnostic**, matching the stated architecture, and can be renamed
  `schemaform` without a lie in the name.
- **Typed origin for consumers** — a resolver reading `facts.origin.schema` gets the
  front-end's real type, not `JSONSchemaObject` baked into Core.
- **One validation home** removes a whole class of "which copy is right?" bugs.
- **Public-API breakage**: nodes lose `.schema` and `.validation`; `ArrayNode` loses
  `.itemSchema`. Pre-1.0, taken deliberately; call sites migrate to `facts`.

## Explicit rejections

- **Zod → JSON Schema → tree** — rejected (the decider's call): lossy, and it would *re-prove*
  the coupling instead of removing it. Zod compiles directly into Core's builders.
- **Keep `node.validation` as a convenience mirror of `facts.constraints`** — rejected: two
  homes for one fact is exactly the redundancy this ADR clears, and it is what forces the
  `minItems→minLength` wart into `present()` on collapse.
- **Keep `ArrayNode.itemSchema` and a Core `getItem` that parses it** — rejected: that is Core
  reading a schema. The `itemFactory` closure moves the schema knowledge to the front-end.
- **Leave the array→multiselect collapse in the front-end** — rejected: it is lowering
  (ADR 030); duplicating it per front-end is the coupling we are removing.
