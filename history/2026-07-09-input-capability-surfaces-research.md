---
date: 2026-07-09T16:07:02-0400
researcher: Tim Kindberg
git_commit: d48aa1537ef904218fd760d10abaaaa115b2d286
branch: feat/input-zod
repository: jsonschema-form
topic: "How Core IR, JSON Schema draft-07, and Zod v4 capability surfaces map today"
tags: [research, core-ir, input-jsonschema, input-zod, capability-surfaces, ADR-029, ADR-030, ADR-033, ADR-034, PR-51]
status: complete
last_updated: 2026-07-10
last_updated_by: Tim Kindberg
last_updated_note: "Updated installed Zod version after useFormTree integration"
---

# Research: Input Capability Surfaces — Core IR, JSON Schema draft-07, and Zod v4

**Date:** 2026-07-09T16:07:02-0400 (America/New_York)  
**Researcher:** Tim Kindberg  
**Git commit:** `d48aa1537ef904218fd760d10abaaaa115b2d286`  
**Branch:** `feat/input-zod` ([PR #51](https://github.com/timkindberg/jsonschema-form/pull/51))  
**Repository:** jsonschema-form  
**Bead:** `jsonschema-form-bt6`

## Research question

How do the current Core IR capability surface, JSON Schema draft-07 source surface, and Zod v4 source surface map to one another today — specifically for deciding whether a future maintained support view should be Core-IR-first, source-spec-first, or expose both projections?

This document records **what exists today** and the **factual consequences** of each projection. It is not an implementation plan.

---

## Summary

The repo today implements a **three-stage pipeline** shared by both front-ends:

1. **Source recognition** — `@jsonschema-form/input-jsonschema` reads draft-07 keywords; `@jsonschema-form/input-zod` reads Zod v4 `schema._zod.def` via `zodInternals.ts`.
2. **Neutral compilation** — both call Core builders (`createFieldNode` / `createGroupNode` / `createArrayNode`) producing `NodeFacts` / `LeafFacts` / `ContainerFacts` with `origin: { source, schema }`.
3. **Presentation lowering** — `present(defaultPresentation)` in Core assigns widgets, derives `parts.control`, and collapses scalar-choice arrays (ADR 029/030).

**Core vocabulary is finite and form-oriented** (scalar primitives, three `valueShape` values, a small `ValidationRules` bag, optional `choices` or `item`, six built-in field-widget names plus fixed container widget labels). **Source vocabularies are open and much larger** (full draft-07 keyword set; Zod’s `def.type` graph including transforms, refinements, brands, records, etc.).

The two source adapters **converge on the same Core waist** where their shapes align (objects, homogeneous arrays, scalar leaves, finite choice sets, basic constraints, metadata). They **diverge in recognition breadth and degradation posture**: JSON Schema mostly **ignores** unsupported keywords silently; Zod **degrades non-structural constructs to a plain string `input` leaf** without throwing (ADR 034), while preserving the real `ZodType` on `origin.schema`.

**Validation is deliberately outside compilation** (ADR 019): front-ends surface constraints for HTML hints; `validation-ajv` and `validation-zod` validate instance data against the full source schema, including semantics the tree does not represent (refinements, combinators, etc.).

**Conclusion (evidence-backed, not prescriptive):** Core-first and per-source projections are **complementary**, not interchangeable. A Core-first view answers “what form structure and default presentation does the library produce?” Per-source views answer “what did the author write that the compiler did not lift?” Neither alone is sufficient for a complete support matrix; together they explain both **compiled behavior** and **source-level gaps**.

---

## What “surface” means at each level

Four distinct surfaces exist in the current architecture. A future support catalog must be explicit about which surface a row describes.

### 1. Source construct recognition

What the front-end **reads** from the author's schema before calling Core builders.

| Layer | Recognition mechanism | Primary files |
|-------|----------------------|---------------|
| JSON Schema draft-07 | Keyword/shape dispatch on resolved `JSONSchemaObject` | `packages/input-jsonschema/src/compile.ts`, `resolveRefs.ts` |
| Zod v4 | `def.type` discriminant + `checks` on `schema._zod.def` | `packages/input-zod/src/zodInternals.ts`, `compile.ts` |

### 2. Semantic expressibility in Core facts/nodes/constraints/structure/origin

What the **neutral IR** can carry after compilation (before or after `present()`).

Defined in `packages/core/src/parser/nodeTypes.ts`:

- **`NodeFacts`** (all nodes): `path`, `label`, `description?`, `required`, `valueShape`, `constraints`, `attrs`, `origin`
- **`LeafFacts`**: adds `primitive`, `format?`, `choices?`
- **`ContainerFacts`**: adds `choices?` XOR `item?` (`ItemDescriptor`)
- **`ValidationRules`** (`packages/core/src/parser/utils.ts`): `required`, `minLength`, `maxLength`, `minimum`, `maximum`, `pattern`, `minItems`, `maxItems` only
- **Tree structure**: `field` | `group` | `array` | `arrayItem` nodes; no separate node kinds for unions, records, tuples, etc.
- **`origin`**: `{ source: string; schema: S }` — Core treats `origin.schema` as **opaque**; only front-ends and consumer resolvers may read it (ADR 029 §2, ADR 033 §4)

### 3. Default presentation behavior (`present(defaultPresentation)`)

Assigned **after** compilation in `packages/core/src/present/present.ts`:

- Field-widget names: `input`, `select`, `multiselect`, `radio`, `checkboxes`, `textarea` (built-in catalog only); group, array, and array-item nodes use fixed `fieldset`, `array`, and `arrayItem` labels
- Control archetypes (`FieldControl.kind`): `input`, `select`, `textarea`, `choicegroup`
- Default rules: `choices` + `valueShape` drive widget; `OPTION_COUNT_THRESHOLD = 5` splits inline group vs dropdown (ADR 029, bd cm7)
- Container collapse: `valueShape === 'array' && choices` → one multiselect/checkboxes leaf; object arrays and object groups stay decomposed unless a consumer resolver opts in (ADR 030 §3/§5)
- `present()` **never reads `origin.schema`** to derive parts (ADR 029 §3)

### 4. Validation-only semantics (outside compilation)

Full source semantics enforced at submit/validation time, not in the tree:

- **JSON Schema:** `packages/validation-ajv` compiles the full schema with AJV (`ajvValidator.ts`)
- **Zod:** `packages/validation-zod` runs `schema.safeParse(data)` (`zodValidator.ts`)
- Front-ends explicitly do **not** validate instances (ADR 019; stated in `SUPPORT_CATALOG.md` and ADR 034)

---

## Pipeline (shared by both front-ends)

```
Source schema
    → front-end compile (structural transcriber only)
    → Core builders → raw tree (facts + structure, no widgets on leaves from compile)
    → present(defaultPresentation)
    → fully-formed tree (widgets, parts.control, collapsed scalar-choice arrays)
```

Entry points:

- `jsonSchemaToTree(schema)` — `packages/input-jsonschema/src/jsonSchemaToTree.ts`
- `zodToTree(schema)` — `packages/input-zod/src/zodToTree.ts`

Both end with `present<SourceType>(compileRoot(...), defaultPresentation)`.

**Invariant (ADR 033/034):** front-ends decide **no widgets** and collapse **no subtrees**; all lowering is in `present()`.

---

## Open-world issue: finite Core vocabulary vs unbounded source + form needs

### Core is not a universal form ontology

The Core waist encodes a **deliberately small** set of form-relevant concepts:

- Four primitives: `string | number | integer | boolean`
- Three submitted-value shapes: `scalar | array | object`
- Finite choice sets as `SelectOption[]` (`value: string | number`, `label: string`)
- Thin `ItemDescriptor` for open-ended array elements
- Eight validation rule slots (see `ValidationRules`)
- Six built-in field-widget names, three fixed container widget labels, and four field-control archetypes

This set is **closed by design** (ADR 008: second implementation earns new seams). It does **not** enumerate “all shapes that will ever be needed in a form.”

Examples of real-world form needs **not** in Core vocabulary today:

- Variant/subform switching (`oneOf` structural branches, Zod discriminated unions)
- Open maps/records with dynamic keys
- Fixed-position tuples
- Async option sources (`optionsSource` — lives in resolver `args`, ADR 030 §4, not facts)
- Custom widgets (`widget: string & Brand` — deferred, ADR 029 §6)
- Coercion, transforms, branded types, cross-field refinements

### “All shapes needed in a form” is not a finite knowable list

Form requirements are **open-world**: product-specific widgets, DB-loaded schemas, remote option lists, and domain-specific constraints continually introduce new constructs. The library’s architecture responds by:

1. Compiling a **best-effort structural approximation** into Core
2. Preserving the **full source** on `origin.schema` for consumer resolvers
3. Side-loading **full validation** against the source schema
4. Allowing **presentation override** via `PresentationResolver` without recompilation

A support view that claims to be “complete” against all possible form shapes would be **false** regardless of projection choice. Catalogs can only be **evidence-backed inventories of current compiler behavior** plus explicit open-world caveats.

---

## Core IR capability surface (current)

### Node kinds and facts

| Concept | Core representation | Default presentation |
|---------|---------------------|----------------------|
| Scalar leaf | `FieldNode`, `LeafFacts`, `valueShape: 'scalar'` | `input` (or choice widgets if `choices`) |
| Object branch | `GroupNode`, `ContainerFacts`, `valueShape: 'object'` | `widget: 'fieldset'`; children rendered |
| Repeatable array (open-ended) | `ArrayNode`, `ContainerFacts`, `valueShape: 'array'`, `item` descriptor | `widget: 'array'`; add/remove items |
| Scalar-choice array | Collapsed to `FieldNode`, `valueShape: 'array'`, `choices` | `checkboxes` (≤5 options) or `multiselect` |
| Array item wrapper | `ArrayItemNode` (no facts) | Structural chrome only |

### Constraints → HTML attrs (via `deriveControl`)

Mapped in `present.ts` `inputAttrsFromFacts` / `selectAttrsFromFacts`:

| `ValidationRules` field | HTML attr |
|-------------------------|-----------|
| `required` | `required` |
| `minLength` / `maxLength` | `minLength` / `maxLength` |
| `minimum` / `maximum` | `min` / `max` |
| `pattern` | `pattern` |
| `minItems` / `maxItems` | (constraints on container; multiselect length not remapped to `minLength` after ADR 033) |

**Not in `ValidationRules`:** `multipleOf`, `exclusiveMinimum`, `exclusiveMaximum`, `uniqueItems`, `minProperties`, `maxProperties`, content encoding, etc.

### Formats → input types

`present.ts` maps `facts.format` to `HtmlInputType` for: `email`, `date`, `date-time`, `time`, `uri`/`url`, `color`, `tel`. Unknown formats → `type: 'text'` but `facts.format` preserved.

### What Core cannot represent (semantic gaps)

| Source concept | Core gap |
|----------------|----------|
| Structural unions / variant switching | No union node; no conditional children |
| `default` / prefill values | No fact slot for default value |
| Open maps (`additionalProperties`, `z.record`) | No map node; no dynamic key children |
| Tuples | No tuple node; no positional item schemas |
| Transforms / refinements / brands | No effect/refinement facts |
| Recursive schemas | No graph/recursion in tree (compile must be finite) |
| `readOnly` / `writeOnly` | No read-only fact |
| Cross-field validation | No dependency/conditional facts |

---

## JSON Schema draft-07 source surface (current)

**Package:** `@jsonschema-form/input-jsonschema`  
**Dialect:** draft-07 via `json-schema-typed`  
**Catalog:** `packages/input-jsonschema/SUPPORT_CATALOG.md` (uncommitted working copy; behavior described here matches that file and tests)

### Recognition stages

1. Reject boolean root schemas
2. `resolveLocalRefs` — inline `#` / `#/…` refs (sibling shallow-merge; non–draft-07 behavior documented in `resolveRefs.ts`)
3. `compileRoot` → `present(defaultPresentation)`

### Status vocabulary (from catalog)

| Status | Meaning |
|--------|---------|
| **supported** | Keyword affects compiled tree or default presentation predictably |
| **supported (qualified)** | Works under documented constraints |
| **annotation-only** | In `origin` / facts metadata; no structural effect alone |
| **ignored** | Present in schema; compiler does not read |
| **rejected** | Throws or subschema skipped |

### Evidence-backed crosswalk (JSON Schema → Core)

| Concept | JSON Schema recognition | Core mapping | Default presentation | Gap class |
|---------|------------------------|--------------|---------------------|-----------|
| **Scalar primitives** | `type: string/number/integer/boolean` | `LeafFacts.primitive` | `input` (+ format mapping) | — |
| **Object** | `type: object` + `properties` | `GroupNode` + children | `fieldset` | `additionalProperties` **ignored** — only explicit `properties` compiled (`supportCatalog.test.ts`) |
| **Object without `properties`** | `type: object` alone | **Leaf** `FieldNode`, `valueShape: scalar` | `input` | Core can represent object shape but adapter compiles as leaf (`supportCatalog.test.ts`) |
| **Repeatable array** | `type: array`, homogeneous `items: {...}` | `ArrayNode` + `item` descriptor | `array` widget | Tuple `items: [...]` **rejected** (throws) |
| **Scalar choices** | `enum` or `oneOf` with `const` (+ optional `title`) | `LeafFacts.choices` | `radio`/`select` by count | Structural `oneOf` → `choices: []`, `radio` with zero options (`supportCatalog.test.ts`) |
| **Scalar-choice array** | `items.enum` / `items.oneOf` const branches | `ContainerFacts.choices` | Collapsed `checkboxes`/`multiselect` | — |
| **Nullable / optional** | `required` array on parent only | `constraints.required` per child | `required` attr | No `type: ['x','null']` union handling — **ignored**, falls back to string (`supportCatalog.test.ts`) |
| **Default values** | `default` keyword | **Not mapped** | No prefill | Source expressible, compiler **ignores** (bead `jsonschema-form-2qx`) |
| **Constraints** | `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `minItems`, `maxItems` | `facts.constraints` + HTML attrs | Via `deriveControl` | `multipleOf`, `exclusiveMin/Max` **ignored** |
| **Metadata** | `title`, `description` | `facts.label`, `facts.description`, `parts` | Label/description parts | `$id`, `$schema`, `$comment` **ignored** |
| **Unions / variants** | `anyOf` | **Ignored** — no `type` → string leaf | `input` text | Source expressible, compiler **ignores** (`supportCatalog.test.ts`) |
| **Composition** | `allOf` | **Ignored** — constraints not merged | Untyped string `input` if no `type` | Source expressible, compiler **ignores** (`supportCatalog.test.ts`) |
| **Intersections** | (no native keyword; `allOf` used) | Same as `allOf` | — | — |
| **Records / maps** | `additionalProperties`, `patternProperties` | **Ignored** | — | Core has no map node; adapter **does not map** |
| **Tuples** | `items: [schema, ...]` | **Rejected** (throws) | — | Compiler rejects |
| **Transforms / effects** | (not in JSON Schema) | N/A | N/A | Validation-only in other stacks |
| **Discriminated unions** | `oneOf` + `const` discriminator pattern | Only if all branches are `const` scalars | Choice widgets | Structural discrimination **not mapped** |
| **Recursive / lazy** | Circular `$ref` | **Rejected** (throws in `resolveRefs.ts`) | — | Finite tree requirement |
| **Refs** | Local `#` refs | Inlined before compile; `origin.schema` is resolved subschema | — | External URL refs **rejected** |
| **Validation-only** | `not`, `if/then/else`, `contains`, `uniqueItems`, `dependencies`, `contentMediaType`, `readOnly`, `writeOnly`, etc. | **Ignored** at compile | — | Enforced only if AJV validator used on full schema |

### JSON Schema formats

Known mappings documented in `SUPPORT_CATALOG.md` and `present.ts`. Unknown `format` → `facts.format` set, `type: text`.

---

## Zod v4 source surface (current — PR #51)

**Package:** `@jsonschema-form/input-zod`  
**Entry:** `zodToTree(schema)`  
**Introspection:** `schema._zod.def` via `zodInternals.ts` (ADR 034)  
**Version:** Zod v4 only; the lockfile currently resolves 4.4.3. Zod v3 internals differ (deferred per ADR 008)

### Recognition model

| Helper | Reads |
|--------|-------|
| `defOf` / `typeOf` | `def.type` discriminant |
| `unwrap` | Wrapper chain: `optional`, `default`, `prefault`, `nullable`, `readonly`, `catch`, `nonoptional`, … via `innerType` |
| `readScalar` | Primitives, `date`, checks (`min_length`, `max_length`, `greater_than`, `less_than`, `string_format`, `number_format`) |
| `readChoices` | `enum` entries; `union` of `literal` only (string/number values) |
| `readArrayLength` | `min_length`/`max_length` checks on array |
| `readMeta` | `.meta({ title, description })`, `.describe()` |

### Requiredness (wrapper chain)

From `compile.ts` + tests (`zodToTree.test.ts`):

- Required unless `unwrap` finds `optional`, `default`, or `prefault` in chain
- `.nullable()` alone → **still required** (key must be present; value may be null)
- `.nullish()` → optional (optional wrapper of nullable)

### Evidence-backed crosswalk (Zod → Core)

Verified by `packages/input-zod/src/zodToTree.test.ts` (32 tests) and **runtime probes** on branch `feat/input-zod` (2026-07-09) for constructs not covered by tests.

| Concept | Zod recognition | Core mapping | Default presentation | Gap class |
|---------|----------------|--------------|---------------------|-----------|
| **Scalar primitives** | `z.string()`, `z.number()`, `z.int()`, `z.boolean()` | `LeafFacts.primitive` | `input` / `checkbox` / `number` | — |
| **`z.date()`** | `def.type === 'date'` | `primitive: string`, `format: 'date'` | `input type=date` | — |
| **Object** | `z.object({ shape })` | `GroupNode`, child per `shape` entry | `fieldset` | — |
| **Repeatable array** | `z.array(element)` | `ArrayNode` + `item` descriptor | `array` | Throws if no `element` |
| **Scalar choices** | `z.enum([...])`, `z.union([z.literal(...)])` | `LeafFacts.choices` | `radio`/`select` | Union with boolean/null literals → **not a choice set** (`readChoices` returns `undefined`) — verified |
| **Scalar-choice array** | `z.array(z.enum(...))` | `ContainerFacts.choices` | Collapsed `checkboxes`/`multiselect` | — |
| **Nullable / optional / default** | Wrapper chain | `constraints.required` | `required` attr | `prefault` → optional (verified); `default` → optional |
| **Constraints** | `.min()`, `.max()`, `.regex()` | `facts.constraints` | HTML attrs | `.refine()` on number: inner min preserved through unwrap (verified) |
| **Metadata** | `.meta()`, `.describe()` | `facts.label`, `facts.description` | Label/description | — |
| **Unions / variants** | `z.union([z.string(), z.number()])` | Degrades: `compileField` on non-array/object → string leaf | `input` text | Source expressible; adapter **does not map** union semantics |
| **Discriminated unions** | `z.discriminatedUnion(...)` | Degrades to string `input` leaf | `input` | Source expressible; adapter **does not map** |
| **Composition / intersection** | `z.intersection()` / `.and()` | Degrades to string `input` leaf | `input` | Source expressible; adapter **does not map** |
| **Records / maps** | `z.record(...)` | Degrades to string `input` leaf; **`origin.schema` is real `ZodRecord`** | `input` | Core cannot represent maps; **preserved in origin only** |
| **Tuples** | `z.tuple([...])` | Degrades to string `input` leaf | `input` | Core cannot represent tuples; adapter **does not map** |
| **Transforms / pipe** | `.transform()`, `z.pipe()` | Degrades to the default string leaf | `input` | Semantics validation-only via `validation-zod`; tree ignores transform |
| **Refinements** | `.refine()`, `.superRefine()` | Wrapper peeled; inner scalar facts kept | `input` | Refinement logic **validation-only** |
| **Brands** | `.brand()` | Degrades to string leaf (unwrap to inner) | `input` | Brand **preserved in origin only** |
| **Coerce** | `z.coerce.number()` | `primitive: 'number'` | `number` input | Coercion behavior validation-only |
| **Lazy / recursive** | `z.lazy(() => ...)` | Degrades to string `input` leaf when used as property | `input` | **Does not expand** lazy graph into tree (verified) |
| **Refs** | (no ref mechanism in Zod) | N/A | N/A | — |
| **Non-structural types** | `z.any()`, `z.unknown()`, `z.never()`, `z.null()`, `z.undefined()`, `z.void()`, `z.nan()`, `z.bigint()` | Degrade to string `input` leaf (except `z.literal(true)` → boolean) | `input` text | Core cannot represent; adapter **does not map** |
| **Readonly / catch** | `.readonly()`, `.catch()` | Unwrapped; inner facts | Per inner type | Wrapper semantics **preserved in origin only** |
| **Root constraint** | Non-object root | **Throws** | — | `compileRoot` requires object |

### PR #51 posture: “degrade, don’t crash”

ADR 034 §Consequences and sourceBehavior verified 2026-07-09:

> Unsupported constructs degrade to best neutral approximation (plain field) rather than throwing.

**Exceptions that throw:**

- Root schema not `z.object(...)` — `'zodToTree expects a Zod object schema at the root'`
- `z.array` without element — `'Zod array at {path} has no element schema'`

**No dedicated tests** for unsupported constructs in `zodToTree.test.ts`; behavior verified via runtime probes on this branch.

### PR #51 scope (from `gh pr view 51`)

- Adds `@jsonschema-form/input-zod` with `zodInternals.ts`, `compile.ts`, `zodToTree.ts`
- 32 tests mirroring `input-jsonschema` feature coverage
- ADR 034 documents mapping table and rejected `z.toJSONSchema()` path
- Pins `origin.source = 'zod'`, `S = ZodType`

---

## Representative crosswalk — stable concepts at a glance

| Stable concept | Core IR | JSON Schema draft-07 | Zod v4 |
|----------------|---------|---------------------|--------|
| Scalar primitives | `LeafFacts.primitive` + `format?` | `type` keyword | `def.type` + checks |
| Object | `GroupNode`, `valueShape: object` | `type:object` + `properties` | `z.object` shape |
| Repeatable array | `ArrayNode`, `item` descriptor | `type:array` + `items` object | `z.array(el)` |
| Scalar choices | `choices[]` on leaf or container | `enum`, `oneOf`+`const` | `z.enum`, literal `union` |
| Nullable/optional/default | `constraints.required` only | `required[]`; `default` ignored | Wrapper chain |
| Constraints | 8-slot `ValidationRules` | subset of keywords | `.min/.max/.regex` checks |
| Metadata | `label`, `description` | `title`, `description` | `.meta()`, `.describe()` |
| Unions/variants | *Not represented* | `anyOf` ignored; `oneOf` partial | Degrades to plain leaf |
| Intersections/composition | *Not represented* | `allOf` ignored | `intersection` degrades |
| Records/maps | *Not represented* | `additionalProperties` ignored | `z.record` degrades; origin preserved |
| Tuples | *Not represented* | `items:[...]` throws | `z.tuple` degrades |
| Transforms/effects | *Not represented* | N/A | Degrades; validation-only |
| Discriminated unions | *Not represented* | structural `oneOf` not mapped | degrades |
| Recursive/lazy | Finite tree only | circular `$ref` throws | `z.lazy` degrades |
| Refs | `origin.schema` (resolved) | local `$ref` inline | N/A |
| Validation-only | Side-loaded validators | AJV full schema | `safeParse` full schema |

### Gap taxonomy (used in tables)

| Label | Meaning |
|-------|---------|
| **Source expressible, compiler ignores** | Keyword/construct exists in source language; front-end does not read it (no error) |
| **Compiler preserves only in origin** | Tree gets best-effort leaf/container; full semantics remain on `facts.origin.schema` |
| **Core cannot represent semantics** | No fact/node slot exists in Core IR for this concept |
| **Core can represent, adapter does not map** | Core has relevant slots but this front-end does not populate them for this construct |

---

## Projection analysis: what each view reveals and what is lost

### Core-first projection

**Reveals:**

- Actual **tree shape** after `present(default)` (including collapsed arrays)
- **Default widgets** and `parts.control` (HTML attrs, choice options)
- **Submit-relevant** `valueShape` and array signatures
- **Neutral constraints** surfaced to the UI
- **`origin.source`** tag (`'jsonschema'` | `'zod'`) but not source details unless resolver reads `origin.schema`

**Hides / loses:**

- Which source keywords/constructs were **ignored vs mapped**
- **Validation-only** rules (refinements, combinators, transforms)
- Source-specific wrapper semantics (nullable vs optional distinction in Zod is only partially lifted to `required`)
- **Degradation** — a plain `input` leaf looks the same whether the source was `z.record`, `anyOf`, or `z.string()`
- Full **draft-07** or **Zod def.type** vocabulary

**Best answers:** “What widget/structure does the library produce by default?” and “What can `PresentationResolver` match on without reading `origin.schema`?”

### JSON Schema-first projection

**Reveals:**

- Full **draft-07 keyword** inventory and document structure
- **`$ref`** graph and resolution behavior
- Explicit **ignored/rejected** keyword set (per `SUPPORT_CATALOG.md` + `supportCatalog.test.ts`)
- Gap between **schema validation** (AJV) and **form compilation**

**Hides / loses:**

- Post-`present()` **collapsed** tree (enum array → multiselect leaf)
- **Widget** assignment and option-count heuristic
- Zod-specific concepts (no Zod in this projection)

**Best answers:** “What JSON Schema shapes does `input-jsonschema` read or skip?” and “What validates but does not compile?”

### Zod-first projection

**Reveals:**

- **`def.type`** coverage in `zodInternals.ts`
- **Wrapper-chain** requiredness rules
- **Degradation** behavior for unsupported types (plain leaf, no throw)
- **`origin.schema`** as real `ZodType` for consumer resolvers
- Difference from **hypothetical** `z.toJSONSchema()` path (rejected in ADR 034)

**Hides / loses:**

- Default **presentation** outcome unless tests/`present()` consulted
- JSON Schema-only keywords (`$ref`, `allOf`, etc.)
- Constructs never attempted in `zodInternals` (no explicit registry — absence means degrade)

**Best answers:** “What Zod constructs compile structurally vs degrade?” and “What remains validation-only?”

### Complementarity conclusion

| Question | Core-first | Source-first |
|----------|------------|--------------|
| Default widget for a field? | ✅ | ❌ (must derive or run `present()`) |
| Was `anyOf` in the schema ignored? | ❌ | ✅ |
| Does `z.record` produce a map UI? | ❌ (looks like text `input`) | ✅ (explicit degrade) |
| What does submit assemble? | ✅ (`valueShape`) | ❌ |
| What does Zod `safeParse` enforce? | ❌ | ✅ (Zod projection) |
| Typed `origin.schema` for resolver? | Partial (opaque type) | ✅ |

The views are **complementary**: Core-first is authoritative for **compiled form behavior**; per-source views are authoritative for **author intent and unmigrated semantics**. A single projection cannot answer both “what renders?” and “what did we drop?” without the other.

---

## Validation-only semantics (shared pattern)

| Mechanism | JSON Schema | Zod |
|-----------|-------------|-----|
| Validator entry | `createAjvValidator(schema)` | `createZodValidator(schema)` |
| Input to validator | Full JSON Schema document | Full `ZodType` |
| Issue paths | AJV instance paths → dot paths | `ZodIssue.path` → dot paths |
| Semantics beyond tree | `allOf`, `anyOf`, `not`, `if/then/else`, `uniqueItems`, formats AJV enforces, etc. | `.refine()`, `.transform()`, `.superRefine()`, coercion, brands, etc. |
| Coercion | AJV `coerceTypes` option | Zod input parsing |

Front-ends copy a **subset** of constraints into `facts.constraints` for HTML hints. Validators enforce the **full source**.

---

## Architecture records (decision context)

| ADR | Relevance |
|-----|-----------|
| [029](../architecture_records/029_presentation_stage_over_neutral_facts.md) | Neutral facts; `present()` stage; widget catalog; `origin` generic |
| [030](../architecture_records/030_container_facts_and_subtree_collapse.md) | `NodeFacts` waist; `choices` XOR `item`; collapse in `present()` |
| [033](../architecture_records/033_core_is_schema_agnostic_input_packages.md) | Core schema-agnostic; input packages; builders; `origin<S>` |
| [034](../architecture_records/034_zod_front_end_direct_introspection.md) | Zod direct introspection; mapping table; degrade posture |

---

## Primary sources

### In-repo (first-party)

| Source | Role |
|--------|------|
| `packages/core/src/parser/nodeTypes.ts` | Core facts/node interfaces |
| `packages/core/src/parser/utils.ts` | `ValidationRules` |
| `packages/core/src/present/present.ts` | Default presentation + widget catalog |
| `packages/input-jsonschema/src/compile.ts` | JSON Schema compiler |
| `packages/input-jsonschema/src/jsonSchemaToTree.ts` | JSON Schema entry |
| `packages/input-jsonschema/SUPPORT_CATALOG.md` | JSON Schema support inventory (uncommitted) |
| `packages/input-jsonschema/src/supportCatalog.test.ts` | JSON Schema gap evidence |
| `packages/input-zod/src/zodInternals.ts` | Zod v4 introspection surface |
| `packages/input-zod/src/compile.ts` | Zod compiler |
| `packages/input-zod/src/zodToTree.test.ts` | Zod supported-feature evidence |
| [PR #51](https://github.com/timkindberg/jsonschema-form/pull/51) | Zod front-end landing context |
| ADR 029, 030, 033, 034 | Architectural decisions |

### External (specification / official docs)

| Source | URL |
|--------|-----|
| JSON Schema draft-07 release notes | https://json-schema.org/draft-07/json-schema-release-notes.html |
| JSON Schema draft-07 validation spec | https://json-schema.org/draft-07/json-schema-validation.html |
| Zod 4 documentation (Colin Hacks / installed v4.4.3) | https://github.com/colinhacks/zod/blob/v4.4.3/packages/docs/content/api.mdx |
| Zod 4 discriminated union (v4 changelog, installed v4.4.3) | https://github.com/colinhacks/zod/blob/v4.4.3/packages/docs/content/v4/index.mdx |

---

## Limits and open questions

1. **`SUPPORT_CATALOG.md` is uncommitted** — JSON Schema inventory may drift until landed (bead `jsonschema-form-00s`).
2. **No Zod support catalog or degradation tests** — unsupported behavior verified by runtime probes only; not gated in CI.
3. **`zodInternals.ts` has no explicit unsupported registry** — unknown `def.type` values fall through `compileNode` → `compileField` → `readScalar` default string primitive.
4. **Consumer resolver threading to runtime array items** — pre-existing asymmetry (bead `jsonschema-form-jzi`); not introduced by PR 51.
5. **Whether `origin.schema` should appear in a user-facing support matrix** — today it is the escape hatch for unmigrated semantics but requires TypeScript/source-specific resolver code.
6. **Exhaustiveness** — crosswalk tables are representative, not a machine-generated full keyword × adapter matrix.

---

## Code references

- `packages/core/src/parser/nodeTypes.ts:42-94` — `NodeFacts`, `LeafFacts`, `ContainerFacts`, `AnyFacts`
- `packages/core/src/parser/utils.ts:5-14` — `ValidationRules`
- `packages/core/src/present/present.ts:89-108` — `defaultPresentation` rules
- `packages/input-jsonschema/src/compile.ts:128-137` — `compileNode` dispatch
- `packages/input-zod/src/compile.ts:46-56` — `compileNode` dispatch
- `packages/input-zod/src/zodInternals.ts:231-252` — `readChoices` (finite choice detection)
- `packages/input-zod/src/zodToTree.ts:19-21` — compile + `present(default)`
