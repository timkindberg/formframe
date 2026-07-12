# Zod front-end support catalog

**Package:** `@jsonschema-form/input-zod`  
**Entry point:** `zodToTree(schema)`  
**Schema dialect:** [Zod v4](https://zod.dev) — introspection via `schema._zod.def` (ADR 034). Evidence in this catalog uses **Zod 4.4.3** (current lockfile resolution). Zod v3 internals differ and are out of scope.  
**Maintenance:** Update this catalog and its evidence tests in the same change as compiler behavior. Initial catalog work is tracked by bead `jsonschema-form-5ss.6`.

This document records **what the compiler does today**, not what we intend. Every non-obvious claim should be backed by source and/or tests (see [Evidence](#evidence)).

---

## How compilation works

`zodToTree` runs two stages:

1. **`compileRoot` → `compile.ts`** — direct introspection (`zodInternals.ts`) produces neutral `facts` / `parts` / `children` and calls Core's neutral builders.
2. **`present(defaultPresentation)`** — default widget assignment (`@jsonschema-form/core` `present/present.ts`).

The front-end is a **structural transcriber** (ADR 033/034): it reads Zod definitions into neutral facts; it does **not** validate instance data. Validation is side-loaded (ADR 019) — typically `@jsonschema-form/validation-zod` against the same Zod schema. **Standard Schema does not compile forms.**

---

## Status definitions

| Status | Meaning |
|--------|---------|
| **supported** | Shape/wrapper is read and affects the compiled tree or default presentation predictably. |
| **qualified** | Works under documented constraints; edge cases may surprise users. |
| **degraded** | Source shape is **accepted** but represented by a less-specific fallback in the form tree (usually a plain string `input` leaf). |
| **ignored** | Source modifier has **no compilation effect** on an otherwise recognized shape. |
| **rejected** | Compile throws. |

**Validation-only** is **orthogonal** — never a compilation status. It describes behavior enforced by a validator but not represented in the compiled tree (see [Validation-only semantics](#validation-only-semantics)).

**Default behavior** — when a shape is supported, the table states the **shipped** widget/rule from `defaultPresentation` (overridable via `present(tree, layered(defaultPresentation, resolver))`).

---

## Direct introspection assumptions

All compiler reads go through `packages/input-zod/src/zodInternals.ts`:

| Helper | Reads |
|--------|-------|
| `defOf` / `typeOf` | `schema._zod.def`, discriminated on `def.type` |
| `unwrap` | Wrapper chain via `def.innerType` (`optional`, `default`, `prefault`, `nullable`, `readonly`, `catch`, `nonoptional`, …) |
| `readScalar` | Primitives, `date`, and checks (`min_length`, `max_length`, `greater_than`, `less_than`, `string_format`, `number_format`) |
| `readChoices` | `enum` entries; `union` of `literal` only (string/number values) |
| `readArrayLength` | Array `min_length` / `max_length` checks |
| `readMeta` | `.meta({ title, description })`, `.describe()` |

If Zod restructures `_zod.def`, **`zodInternals.ts` is the only file to touch.**

**Origin preservation:** `facts.origin.source` is always `'zod'`. `facts.origin.schema` is the **declared (still-wrapped)** property schema the author passed — not an unwrapped inner, not synthesized JSON Schema (ADR 033 §4 / ADR 034 §2).

---

## By schema shape (what consumers ask)

### Root schema

| Shape | Status | Default form behavior | Notes |
|-------|--------|----------------------|-------|
| `z.object({ … })` | supported | `GroupNode` root; one child per `shape` entry | Standard entry shape. |
| Non-object root (`z.string()`, `z.array(...)`, …) | rejected | — | Throws: `zodToTree expects a Zod object schema at the root`. |
| Wrapped root object (`.describe()`, `.meta()`, …) | supported | Same as plain object | Metadata on outer schema read via `readMeta`. |

### Scalar leaf

| Zod shape / modifier | Status | Default behavior | Evidence |
|---------------------|--------|------------------|----------|
| `z.string()` | supported | `input`, `attrs.type=text` | `zodToTree.test.ts` |
| `z.number()` | supported | `input`, `attrs.type=number` | `zodToTree.test.ts` |
| `z.int()` / `z.number().int()` | supported | `primitive: integer`, `attrs.type=number` | `zodToTree.test.ts` |
| `z.coerce.number()` | supported | Same compile as `z.number()` | `readScalar` in `zodInternals.ts`; coercion is validation-only |
| `z.boolean()` | supported | `input`, `attrs.type=checkbox` | `zodToTree.test.ts` |
| `z.date()` | supported | `primitive: string`, `format: date` → `input type=date` | `readScalar` in `zodInternals.ts` |
| `.min()` / `.max()` (string) | supported | `constraints.minLength/maxLength` + HTML attrs | `zodToTree.test.ts` |
| `.min()` / `.max()` (number) | supported | `constraints.minimum/maximum` + `min`/`max` attrs | `zodToTree.test.ts` |
| `.regex(re)` | supported | `constraints.pattern` + `pattern` attr | `zodToTree.test.ts` |
| `.email()` / `.url()` / `.datetime()` | supported | `facts.format` → native input type (`datetime` → `date-time` → `datetime-local`) | `zodToTree.test.ts` |
| Other `string_format` checks (`uuid`, `ip`, …) | qualified | `facts.format` set; unknown formats → `input type=text` | `mapStringFormat` / `readScalar` in `zodInternals.ts` |
| `z.enum([…])` (non-empty) | supported | `radio` if ≤5 options else `select` | `zodToTree.test.ts` |
| `z.union([z.literal(…), …])` (all string/number literals) | supported | Same as enum | `zodToTree.test.ts` |
| Numeric `z.literal(…)` union | supported | Numeric primitive + choice widgets | `conformance.test.ts` (`small-numeric-choice-radio`) |
| `z.literal('x')` alone | degraded | Plain string `input`; **no** `choices` | `zodToTree.test.ts` — use `enum` or literal union for choices |
| `z.literal(42)` alone | degraded | Plain number `input`; **no** `choices` | `zodToTree.test.ts` |
| `z.literal(true)` / `z.literal(false)` alone | degraded | `primitive: boolean`, checkbox input; **no** `choices` | `zodToTree.test.ts` |
| `z.union([z.string(), z.number()])` | degraded | Plain string `input`; union not represented | `zodToTree.test.ts`; bead `jsonschema-form-miu` |
| `z.discriminatedUnion(…)` | degraded | Same as non-literal union — string `input` | `zodToTree.test.ts`; bead `jsonschema-form-miu` |
| `z.union` with boolean/null literal members | degraded | Not a choice set (`readChoices` → `undefined`); string `input` | `readChoices` in `zodInternals.ts`, `zodToTree.test.ts` |
| `z.intersection()` / `.and()` | degraded | Plain string `input`; shapes not merged | `zodToTree.test.ts` |
| `z.record(…)` | degraded | Plain string `input`; map not decomposed | `zodToTree.test.ts`; bead `jsonschema-form-33i` |
| `z.tuple([…])` | degraded | Plain string `input`; tuple not decomposed | `zodToTree.test.ts`; bead `jsonschema-form-6xz` |
| `z.lazy(() => …)` | degraded | Plain string `input`; lazy graph not expanded | `zodToTree.test.ts`; bead `jsonschema-form-fng` |
| `.transform()` / `z.pipe()` | degraded | Plain string `input` (unwrap stops at pipe/transform wrapper) | `zodToTree.test.ts` |
| `.brand()` | qualified | Inner scalar facts; brand invisible to tree | `unwrap` in `zodInternals.ts` — brand in `origin.schema` only |
| `z.any()`, `z.unknown()`, `z.never()` | degraded | Plain string `input` | `readScalar` default in `zodInternals.ts` |
| `z.null()`, `z.undefined()`, `z.void()` | degraded | Plain string `input` | `readScalar` default in `zodInternals.ts` |
| `z.nan()`, `z.bigint()` | degraded | Plain string `input` | `readScalar` default in `zodInternals.ts` |
| `.refine()` / `.superRefine()` | qualified | Inner scalar facts preserved through unwrap | `zodToTree.test.ts` — predicate is validation-only |
| `.default()` / `.prefault()` requiredness | supported | `unwrap` marks owning key optional (`constraints.required: false`) | `zodToTree.test.ts` |
| `.default()` / `.prefault()` value | ignored (prefill) | No initial value in tree or HTML attrs | `zodToTree.test.ts`; parse-time default is validation-only; prefill bead `jsonschema-form-2qx` |
| `.readonly()` | supported (pass-through) | Unwrapped; inner facts compiled; no effect on requiredness | `unwrap` in `zodInternals.ts` |
| `.catch()` | supported (pass-through) | Unwrapped; inner facts compiled; key stays **required** | `zodToTree.test.ts` — catch fallback is validation-only |

### Choice presentation defaults (scalar)

| Option count | Single-value (`valueShape: 'scalar'`) | Multi-value (`valueShape: 'array'` + `choices`) |
|--------------|---------------------------------------|--------------------------------------------------|
| ≤ `OPTION_COUNT_THRESHOLD` (5) | `radio` | `checkboxes` |
| > 5 | `select` | `multiselect` |

Threshold: `OPTION_COUNT_THRESHOLD` in `packages/core/src/present/present.ts`.  
`textarea` is **not** a default — opt-in via custom `PresentationResolver`.

### Object branch (`z.object`)

| Shape / modifier | Status | Default behavior | Evidence |
|------------------|--------|------------------|----------|
| `z.object({ key: schema, … })` | supported | `GroupNode`; one child per shape entry | `zodToTree.test.ts` |
| Nested `z.object` property | supported | Nested `GroupNode`; dotted paths | `zodToTree.test.ts` |
| `z.object({})` (empty) | qualified | `GroupNode` with zero children | `compileGroup` in `compile.ts` |
| `.strict()` / `.passthrough()` / `.strip()` | ignored | Only explicit `shape` keys become children; catchall mode not read | `compileGroup` in `compile.ts` |
| Requiredness from wrapper chain | supported | `constraints.required` per child | `zodToTree.test.ts` |

### Array branch (`z.array`)

| Shape / modifier | Status | Default behavior | Evidence |
|------------------|--------|------------------|----------|
| `z.array(element)` homogeneous | supported | See sub-rows | `zodToTree.test.ts` |
| Missing / empty element | rejected | Throws: `Zod array at {path} has no element schema` | `compile.ts` |
| `z.array(z.string())` (open scalar) | supported | `ArrayNode` + `item: { valueShape: 'scalar' }` | `zodToTree.test.ts` |
| `z.array(z.enum(…))` / literal union element | supported | Container `choices`; collapses to `checkboxes`/`multiselect` | `zodToTree.test.ts` |
| `z.array(z.object({…}))` | supported | `item: { valueShape: 'object', keys: [...] }` | `zodToTree.test.ts` |
| Nested `z.array(z.array(…))` | supported | `item: { valueShape: 'array' }` | `buildItemDescriptor` in `compile.ts` |
| `.min(n)` / `.max(n)` on array | supported | `minItems`/`maxItems` + seed items | `zodToTree.test.ts` |
| `z.tuple([…])` as **element** | degraded | If tuple ever nested under array dispatch, same as tuple row | N/A today — tuple never reaches array compile |

### Wrapper chain (requiredness)

| Wrapper | Affects `constraints.required`? | Notes |
|---------|--------------------------------|-------|
| (none) | required | Default for object properties |
| `.optional()` | optional | |
| `.default()` | optional | Requiredness via `unwrap` (**supported**); default **value** not prefilled (ignored / validation-only) |
| `.prefault()` | optional | Same requiredness as `.default()`; prefault value not prefilled |
| `.nullable()` alone | **required** | Key must be present; value may be null |
| `.nullish()` | optional | `optional` wrapper of `nullable` |
| `.readonly()` | no effect on requiredness | Inner type compiled (**supported** pass-through) |
| `.catch()` | no effect on requiredness | Inner type compiled; catch fallback validation-only |

Peeling is structural: any wrapper with `def.innerType` is unwrapped (`unwrap()` in `zodInternals.ts`).

### Metadata

| Source | Status | Maps to | Evidence |
|--------|--------|---------|----------|
| `.meta({ title })` | supported | `facts.label`, `parts.label` | `zodToTree.test.ts` |
| `.meta({ description })` / `.describe()` | supported | `facts.description`, `parts.description` | `zodToTree.test.ts` |
| No title | supported | Label falls back to property path | `zodToTree.test.ts` |
| Meta on wrapper vs inner | supported | Outer checked first, then inner | `readMeta` in `zodInternals.ts` |

---

## Validation-only semantics

These Zod features affect runtime validation (and `@jsonschema-form/validation-zod`) but are **not** represented in the compiled tree beyond whatever inner scalar facts survive unwrapping:

| Feature | Compile behavior | Validation behavior |
|---------|------------------|---------------------|
| `.refine()` / `.superRefine()` / `.check()` | Inner base facts only | Predicate enforced by validator |
| `.transform()` / output type of `z.pipe()` | Degraded string leaf | Output type/coercion enforced by validator |
| `.brand()` | Inner scalar leaf | Brand preserved on `origin.schema` |
| `z.coerce.*` | Coerced-to primitive in tree | Coercion at parse time |
| `.default()` / `.prefault()` | Optional key (`unwrap`, **supported**); no initial value in tree | Default / prefault applied on parse (**validation-only**) |
| `.catch()` | Inner leaf; key stays required | Catch fallback on parse failure |
| Union / discriminated-union / intersection semantics | Degraded leaf | Branch selection enforced by validator |
| `z.record` / `z.tuple` / `z.lazy` structure | Degraded leaf | Full shape enforced by validator |

---

## String formats (`string_format` checks)

Known mappings via `readScalar` → `present()` (`inputAttrsFromFacts`):

| Zod check / format | `facts.format` | HTML `type` |
|--------------------|----------------|-------------|
| `.email()` | `email` | `email` |
| `.url()` | `url` | `url` |
| `.datetime()` | `date-time` | `datetime-local` |
| `z.date()` | `date` | `date` |
| *(unmapped, e.g. `uuid`, `ip`)* | passthrough | `text` |

---

## `def.type` quick reference

| `def.type` | Compilation status | Summary |
|------------|---------------------|---------|
| `string`, `number`, `boolean` | supported | Scalar leaf |
| `date` | supported | String primitive + `format: date` |
| `enum` | supported | Scalar choices |
| `literal` | degraded | Standalone literal → scalar leaf by value type; **no** `choices` (use enum or literal union) |
| `union` | qualified / degraded | Literal union → choices; else degraded string leaf |
| `object` | supported | Group (or root) |
| `array` | supported | Array container or collapsed choices |
| `optional` | supported (requiredness) | Marks owning key optional via `unwrap` |
| `nullable`, `nonoptional` | supported (pass-through) | Inner type compiled; `nullable` alone does not make key optional |
| `default`, `prefault` | supported (requiredness) + ignored (prefill) | Marks key optional; default value not copied to tree |
| `readonly`, `catch` | supported (pass-through) | Inner type compiled; semantics otherwise validation-only |
| `pipe` (transform / pipe) | degraded | String leaf |
| `record` | degraded | String leaf — bead `jsonschema-form-33i` |
| `tuple` | degraded | String leaf — bead `jsonschema-form-6xz` |
| `lazy` | degraded | String leaf — bead `jsonschema-form-fng` |
| `intersection` | degraded | String leaf |
| `any`, `unknown`, `never`, `null`, `undefined`, `void`, `nan`, `bigint` | degraded | String leaf |

---

## Public API surface

| Export | Status | Role |
|--------|--------|------|
| `zodToTree(schema)` | supported | Compile + default present |

Internal modules (`compile.ts`, `zodInternals.ts`) are not public API.

---

## Evidence

| Area | Primary source | Tests |
|------|----------------|-------|
| Structural compile | `src/compile.ts` | `zodToTree.test.ts` |
| Introspection | `src/zodInternals.ts` | `zodToTree.test.ts` |
| Default widgets | `packages/core/src/present/present.ts` | `conformance.test.ts` (oracle) |
| Degraded / ambiguous shapes | `compile.ts` dispatch | `zodToTree.test.ts` |
| Cross-front-end parity | — | `conformance.test.ts` |

When changing behavior, update **this file** and relevant capability tests in `zodToTree.test.ts` when the change is user-visible or non-obvious; straightforward dispatch in `compile.ts` / `zodInternals.ts` is sufficient evidence on its own.

---

## Known gaps (beads — not a second tracker)

| Gap | Bead |
|-----|------|
| Structural / discriminated unions | `jsonschema-form-miu` |
| Records / maps | `jsonschema-form-33i` |
| Tuples | `jsonschema-form-6xz` |
| Lazy / recursive graphs | `jsonschema-form-fng` |
| Default / prefault prefill | `jsonschema-form-2qx` |
| **This catalog** | `jsonschema-form-5ss.6` |

---

## Corrections vs common assumptions

- **Zod unions are not variant subforms.** Non-literal unions compile to a plain string `input` (`zodToTree.test.ts`), not a branch picker.
- **`z.discriminatedUnion` is not special-cased.** It introspects as `def.type === 'union'` and degrades the same way.
- **Single `z.literal(...)` is not a choice field** — string, number, and boolean literals all compile as plain scalar inputs without `facts.choices`. Use `z.enum` or a union of literals for choices.
- **`.default()` / `.prefault()` requiredness is supported** — `unwrap` marks the owning key optional. Only **prefill** of the default value is ignored at compile time (validation-only on parse); prefill UI is bead `jsonschema-form-2qx`.
- **`.nullable()` ≠ optional.** The key stays required unless wrapped in `.optional()` / `.nullish()`.
- **`.catch()` does not make a field optional.** Unlike `.default()`, the key remains required in the tree.
- **Validation is never the front-end's job.** Constraints copied to `facts.constraints` are HTML hints; refinements/transforms need side-loaded validation.
- **`origin.schema` is the author's Zod type**, not JSON Schema from `z.toJSONSchema()` (ADR 034).
