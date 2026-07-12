# JSON Schema front-end support catalog

**Package:** `@jsonschema-form/input-jsonschema`  
**Entry point:** `jsonSchemaToTree(schema)`  
**Schema dialect:** [draft-07](https://json-schema.org/draft-07/json-schema-release-notes.html) types via `json-schema-typed`. The compiler reads only the keyword subset documented below; later-draft keys may appear in documents but are inert unless noted.
**Maintenance:** Update this catalog and the relevant capability tests in the same change as compiler behavior. Initial catalog work is tracked by bead `jsonschema-form-00s`.

This document records **what the compiler does today**, not what we intend. Every non-obvious claim should be backed by source and/or tests (see [Evidence](#evidence)).

---

## How compilation works

`jsonSchemaToTree` runs three stages:

1. **Reject** boolean root schemas (`true` / `false`).
2. **`resolveLocalRefs`** — inline same-document `#` / `#/…` `$ref`s (with sibling shallow-merge); recurse into `properties` and homogeneous `items`.
3. **`compileRoot` → `present(defaultPresentation)`** — structural transcription (`compile.ts`) then default widget assignment (`@jsonschema-form/core` `present/present.ts`).

The front-end is a **structural transcriber** (ADR 033): it reads keywords into neutral `facts` / `constraints`; it does **not** validate instance data. Validation is side-loaded (ADR 019).

---

## Status definitions

| Status | Meaning |
|--------|---------|
| **supported** | Keyword/shape is read and affects the compiled tree or default presentation predictably. |
| **supported (qualified)** | Works under documented constraints; edge cases may surprise users. |
| **degraded** | Source shape is **accepted** but represented by a less-specific fallback in the form tree (usually a plain string `input` leaf). |
| **ignored** | Source modifier has **no compilation effect** on an otherwise recognized shape. |
| **rejected** | Compile throws or the subschema is skipped. |

**Validation-only** is **orthogonal** — never a compilation status. It describes behavior enforced by a validator but not represented in the compiled tree (see [Validation-only semantics](#validation-only-semantics)).

**Degraded in this catalog:** No row below currently uses **degraded**. JSON Schema combinator keywords (`anyOf`, `allOf`, …) are **ignored** modifiers on an already-resolved subschema — the property's own keywords (e.g. missing `type`) determine the fallback leaf. **Degraded** is for when an entire source *shape* is accepted but mapped to a less-specific tree node (the Zod front-end uses this for non-literal unions). That distinction is intentional.

**Default behavior** — when a shape is supported, the table states the **shipped** widget/rule from `defaultPresentation` (overridable via `present(tree, layered(defaultPresentation, resolver))`).

---

## By schema shape (what consumers ask)

### Root document

| Shape | Status | Default form behavior | Notes |
|-------|--------|----------------------|-------|
| `{ type: 'object', properties: {…} }` | supported | `GroupNode` root; one child per property | Standard entry shape. |
| Boolean root (`true` / `false`) | rejected | — | Throws: `Boolean schemas are not yet supported`. |
| Root without `type: 'object'` | supported (qualified) | Still compiles if `properties` present on root | `compileRoot` → `compileGroup` (`compile.ts`) |

### Scalar leaf (`type` string / number / integer / boolean)

| Keyword / shape | Status | Default behavior | Evidence |
|-----------------|--------|------------------|----------|
| `type: 'string'` (no `enum` / choice `oneOf`) | supported | `input`, `attrs.type=text` | `parser.test.ts` |
| `type: 'number'` / `type: 'integer'` | supported | `input`, `attrs.type=number`; `facts.primitive` is `number` or `integer` respectively | `conformance.test.ts` (integer scenario); `parser.test.ts` (number) |
| `type: 'boolean'` | supported | `input`, `attrs.type=checkbox` | `parser.test.ts` |
| `enum: […]` (non-empty string/number options) | supported | `radio` if ≤5 options else `select`; labels = `String(value)` | `conformance.test.ts`, `present.test.ts` (bd cm7) |
| `enum: []` | supported (qualified) | Plain `input` (empty enum ignored) | `edgeSchemas.test.ts` |
| `oneOf: [{ const, title? }, …]` with string/number `const` values | supported | Same as `enum`; `title` → option label, else `String(const)` | `parser.test.ts`, `edgeSchemas.test.ts`, ADR 003 |
| `oneOf` without `const` on branches | supported (qualified) | `radio` with **zero options** (`choices: []`) | `edgeSchemas.test.ts` |
| `oneOf` + `type` omitted on property | supported | Choice field if `const` branches exist | `edgeSchemas.test.ts` (`plan` field) |
| `anyOf` | **ignored** | Modifier not read; compiles as untyped string `input` from resolved subschema | `edgeSchemas.test.ts` — **not** variant subforms |
| `allOf` | **ignored** | Modifier not read; branch constraints not merged; untyped string `input` if no `type` | `edgeSchemas.test.ts`; bead `jsonschema-form-0z9` |
| `const` | **ignored** | Untyped string `input` | `compile.ts` (absence) |
| `format` (known set) | supported | Maps to native `<input type>` (see [Formats](#formats)) | `present.test.ts` (bd 672) |
| `format` (unknown) | supported (qualified) | `input`, `type=text`; `facts.format` still set | `errorHandling.test.ts` |
| `minLength` / `maxLength` / `pattern` | supported | Copied to `facts.constraints` and HTML attrs | `parser.test.ts` |
| `minimum` / `maximum` | supported | Copied to `facts.constraints` and `min`/`max` attrs | `parser.test.ts` |
| `default` | ignored | Not read at compile; no prefill in tree or shipped native submit | `compile.ts` (absence); bead `jsonschema-form-2qx` |
| `readOnly` / `writeOnly` | ignored | Annotations not copied to tree; shipped stack has no read-only enforcement | `compile.ts` (absence) |
| Missing `type` with `enum` | supported | Choice field from `enum` | `compile.ts` `buildScalarChoices` |
| Missing `type` otherwise | supported (qualified) | `primitive: 'string'`, `input` | `compile.ts` `toPrimitive` default |
| Array-valued `type`, e.g. `['number', 'null']` | ignored | Union members are not interpreted; falls back to string `input` | `edgeSchemas.test.ts` |

### Choice presentation defaults (scalar)

| Option count | Single-value (`valueShape: 'scalar'`) | Multi-value (`valueShape: 'array'` + `choices`) |
|--------------|---------------------------------------|--------------------------------------------------|
| ≤ `OPTION_COUNT_THRESHOLD` (5) | `radio` | `checkboxes` |
| > 5 | `select` | `multiselect` |

Threshold: `OPTION_COUNT_THRESHOLD` in `packages/core/src/present/present.ts` (bd cm7).  
`textarea` is **not** a default — opt-in via custom `PresentationResolver` (`present.test.ts`).

### Object branch (`type: 'object'`)

| Keyword / shape | Status | Default behavior | Evidence |
|-----------------|--------|------------------|----------|
| `properties` + nested schemas | supported | `GroupNode`; children compiled recursively | `parser.test.ts` |
| `required: ['a', …]` on object | supported | Sets `facts.constraints.required` per child | `parser.test.ts` |
| `title` / `description` on object | supported | Group `parts.label` / `parts.description` when present | `parser.test.ts` |
| `type: 'object'` **without** `properties` | supported (qualified) | Compiles as **leaf** `FieldNode` (`input`), not an empty group | `edgeSchemas.test.ts` |
| `additionalProperties` | ignored | Only explicit `properties` become children | `edgeSchemas.test.ts` |
| `patternProperties` | ignored | Not read in `compileGroup` | `compile.ts` (absence) |
| `minProperties` / `maxProperties` | ignored | Not read | `compile.ts` (absence) |
| `dependencies` / `dependentRequired` / `dependentSchemas` | ignored | Not read | `compile.ts` (absence) |
| `if` / `then` / `else` | ignored | Not read | `compile.ts` (absence); bead `jsonschema-form-avw` |

### Array branch (`type: 'array'`)

| Keyword / shape | Status | Default behavior | Evidence |
|-----------------|--------|------------------|----------|
| Homogeneous `items: { … }` (single schema) | supported | See sub-rows below | `parser.test.ts`, `arraysRobustness.test.ts` |
| `items` omitted | rejected | Throws: must have `items` | `errorHandling.test.ts` |
| `items: [ … ]` (tuple / legacy tuple form) | rejected | Throws: tuple-style `items` not supported | `errorHandling.test.ts`; bead `jsonschema-form-a58` |
| `items: true` / `items: false` | rejected | Throws | `errorHandling.test.ts` |
| `items.enum` or `items.oneOf` with `const` | supported | Container collapses to one leaf: `checkboxes` or `multiselect` | `parser.test.ts`, `containerFacts.test.ts`, ADR 030 §3 |
| `items` primitive, no finite choices | supported | `ArrayNode` with add/remove; each item is scalar `input` | `deepNesting.test.ts`, `arraysRobustness.test.ts` |
| `items.type: 'object'` + `properties` | supported | `ArrayNode`; each item is nested `GroupNode` | `parser.test.ts` |
| `items` nested `array` | supported | Dynamic nested arrays | `arraysRobustness.test.ts` |
| `minItems` | supported | Seeds that many `ArrayItemNode` children; `constraints.minItems` | `arraysRobustness.test.ts` |
| `maxItems` | supported | `constraints.maxItems` on container / collapsed leaf | `parser.test.ts` |
| `uniqueItems` | ignored | Not copied to `facts.constraints` | `compile.ts` `buildValidation` |
| `contains` | ignored | Draft-07 array assertion; not read in `compileArray` | `compile.ts` (absence) |
| `additionalItems` | ignored | Tuple `items: [...]` rejected before this keyword applies | `errorHandling.test.ts` |
| `prefixItems` | ignored | JSON Schema 2020-12; not read (distinct from rejected tuple `items: [...]` above) | bead `jsonschema-form-a58` |

**Submit behavior (native `form.submit`)** — array-valued leaves always submit as JSON arrays; empty multiselect omitted from payload (`parser.test.ts`). Checkbox groups do not set HTML `required` for “at least one” (`present.test.ts`); use side-loaded validation.

### `$ref` and definitions

| Feature | Status | Behavior | Evidence |
|---------|--------|----------|----------|
| Local `#`, `#/…` | supported | Inlined before compile; siblings shallow-merge over target | `parser.test.ts` |
| `$defs`, `definitions` (keyword) | ignored | Keywords not read for field generation; subschemas inside are **not** auto-compiled as form fields | `resolveRefs.ts` |
| `$ref` into `$defs` / `definitions` | supported (qualified) | Both `#/$defs/…` and `#/definitions/…` resolve as local pointer targets; draft-07 idiom is `definitions`, later-draft documents may use `$defs` | `parser.test.ts` |
| `$ref` in `items` | supported | Resolved | `parser.test.ts` |
| External / URL `$ref` | rejected | Throws | `parser.test.ts` |
| Circular `$ref` | rejected | Throws | `parser.test.ts` |
| `$ref` sibling merge | supported (qualified) | **Non–draft-07:** siblings win over resolved target (documented in `resolveRefs.ts`) | `parser.test.ts` |

### Boolean subschemas

| Context | Status | Behavior |
|---------|--------|----------|
| Property value `true` / `false` | rejected | Subschema skipped; property omitted from tree (no throw) | `errorHandling.test.ts` |
| Root boolean | rejected | Throws |

---

## Formats

Known `format` → `<input type>` mapping (`present.ts` `inputAttrsFromFacts`):

| `format` | HTML `type` |
|----------|-------------|
| `email` | `email` |
| `date` | `date` |
| `date-time` | `datetime-local` |
| `time` | `time` |
| `uri`, `url` | `url` |
| `color` | `color` |
| `tel` | `tel` |
| *(anything else)* | `text` (fallback) |

No `datetime` alias; `month` / `week` not mapped. Broader format coverage: bead `jsonschema-form-ft3`.

---

## Validation-only semantics

These JSON Schema keywords affect runtime validation (e.g. `@jsonschema-form/validation-ajv`) but are **not** represented in the compiled tree beyond whatever inner facts survive compilation. **Prefill** (initial field values) is a separate axis — also not handled by compile or the shipped native submit path today (bead `jsonschema-form-2qx`).

| Feature | Compile / shipped stack | Validation behavior |
|---------|-------------------------|---------------------|
| `default` | Ignored — not read at compile; no prefill in tree or native submit | Applied on validated output **only** when caller opts in (`createAjvValidator(schema, { ajv: { useDefaults: true } })`); off by default in `@jsonschema-form/validation-ajv` |
| `const` | Ignored — plain string leaf | Fixed value enforced by validator |
| `multipleOf`, `exclusiveMinimum`, `exclusiveMaximum` | Ignored — not copied to `facts.constraints` | Numeric constraints enforced by validator |
| `uniqueItems` | Ignored | Array uniqueness enforced by validator |
| `allOf` / `anyOf` / structural `oneOf` | Ignored or partial (const branches only) | Branch selection / merge enforced by validator |
| `if` / `then` / `else` | Ignored | Conditional rules enforced by validator |
| `additionalProperties`, `patternProperties` | Ignored | Extra/matching keys enforced by validator |
| `readOnly` / `writeOnly` | Ignored — not copied; no shipped UI enforcement | May be enforced by a validator or custom presentation; not by default |

Constraints copied to `facts.constraints` (e.g. `minLength`, `minimum`) are **HTML hints** in the tree; full enforcement still depends on side-loaded validation.

---

## Keyword quick reference

| Keyword | Status | Summary |
|---------|--------|---------|
| `$id`, `$schema`, `$comment` | ignored | Metadata; not read | `compile.ts` (absence) |
| `title` | supported | Field/group label (`facts.label`, `parts.label`) |
| `description` | supported | `facts.description`, `parts.description` |
| `type` | supported (qualified) | Dispatches a single object / array / scalar type; array-valued unions fall back to string |
| `properties` | supported | Object children |
| `required` | supported | Per-property required flags |
| `enum` | supported | Scalar or `items` choices |
| `const` | ignored | Use `oneOf` + `const` for labeled options |
| `multipleOf`, `exclusiveMinimum`, `exclusiveMaximum` | ignored | Not copied to `ValidationRules` |
| `minLength`, `maxLength`, `pattern` | supported | String constraints → facts + attrs |
| `minimum`, `maximum` | supported | Number constraints → facts + attrs |
| `items` | supported (qualified) | Homogeneous object only; no tuple array |
| `additionalItems` | ignored | Tuple `items: [...]` rejected before this keyword applies |
| `minItems`, `maxItems` | supported | Array length constraints |
| `uniqueItems` | ignored | Not copied to `facts.constraints` |
| `allOf` | ignored | Modifier keyword; bead `jsonschema-form-0z9` |
| `anyOf` | ignored | Modifier keyword; bead `jsonschema-form-c5t` |
| `oneOf` | supported (qualified) | **Only** `const` branches → choices; structural `oneOf` → empty radio |
| `not` | ignored | Not read | `compile.ts` (absence) |
| `if`, `then`, `else` | ignored | bead `jsonschema-form-avw` |
| `$ref` | supported (qualified) | Local only; see above |
| `$defs`, `definitions` | ignored (keyword) | Keywords not read; containers not compiled as fields. Local `$ref` into `#/$defs/…` or `#/definitions/…` inlines target | `resolveRefs.ts`, `parser.test.ts` |
| `additionalProperties` | ignored | |
| `patternProperties` | ignored | Not read in `compileGroup` |
| `dependencies` | ignored | Not read |
| `default` | ignored | Not read at compile; no prefill; AJV `useDefaults` opt-in only | bead `jsonschema-form-2qx` |
| `examples`, `deprecated` | ignored | Not read | `compile.ts` (absence) |
| `readOnly`, `writeOnly` | ignored | Annotations not copied; no shipped enforcement |
| `contentMediaType`, `contentEncoding` | ignored | Not read | `compile.ts` (absence) |
| `propertyNames` | ignored | Not read | `compile.ts` (absence) |

---

## Public API surface

| Export | Status | Role |
|--------|--------|------|
| `jsonSchemaToTree(schema)` | supported | Compile + default present |
| `JSONSchema`, `JSONSchemaObject` | supported | Re-exported draft-07 types |
| `InferData<S>`, `FieldPath<S>` | supported | Type-level output shape and dot-path union from a schema literal |
| `VERSION` | supported | Package version string |

Internal modules (`compile.ts`, `resolveRefs.ts`) are not public API.

---

## Evidence

| Area | Primary source | Tests |
|------|----------------|-------|
| Structural compile | `src/compile.ts` | `parser.test.ts` |
| `$ref` | `src/resolveRefs.ts` | `parser.test.ts` (`$ref / $defs`) |
| Default widgets | `packages/core/src/present/present.ts` | `present.test.ts`, `containerFacts.test.ts` |
| Combinators / gaps | `compile.ts` (absence) | `edgeSchemas.test.ts`, `errorHandling.test.ts` |
| Edge cases | — | `edgeSchemas.test.ts`, `errorHandling.test.ts` |
| Arrays / submit | `packages/core` submit utils | `arraysRobustness.test.ts`, `parser.test.ts` (submit) |

When changing behavior, update **this file** and the relevant capability test in an existing suite (`edgeSchemas.test.ts`, `errorHandling.test.ts`, `parser.test.ts`, etc.).

---

## Known gaps (beads — not a second tracker)

Actionable unsupported areas are tracked in **bd**. This catalog links them for triage:

| Gap | Bead |
|-----|------|
| `anyOf` / structural `oneOf` variant subforms | `jsonschema-form-c5t` |
| `allOf` merge at compile time | `jsonschema-form-0z9` |
| `if` / `then` / `else` conditionals | `jsonschema-form-avw` |
| Tuple / `prefixItems` arrays | `jsonschema-form-a58` |
| `default` prefill | `jsonschema-form-2qx` |
| Broader `format` / `pattern` UX | `jsonschema-form-ft3` |
| Umbrella schema resolution epic | `jsonschema-form-z0t` |

---

## Corrections vs common assumptions

- **`anyOf` is not supported as a variant subform.** The combinator is an **ignored** modifier; the property compiles from its resolved subschema (plain string input when `type` is absent) (`edgeSchemas.test.ts`).
- **`oneOf` is not general union typing.** Only `{ const, title? }` branches become choices; `{ type: 'string' } | { type: 'number' }` yields an empty radio group.
- **`allOf` does not merge.** Constraint keywords on `allOf` branches are not applied.
- **`packages/core/README.md` schema-resolution list is stale.** Resolution lives in `@jsonschema-form/input-jsonschema` and is limited to local `$ref` (ADR 033).
- **Validation is never the front-end's job.** Constraints are surfaced for HTML hints and side-loaded validators only.
- **`default` is not prefill.** Compile ignores it; AJV applies defaults only when the caller enables `useDefaults`.
