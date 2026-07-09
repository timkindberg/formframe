# ADR 034: The Zod Front-End Compiles by Direct Introspection

**Date:** 2026-07-09
**Status:** Accepted (bd `4qe`, PR C)
**Deciders:** Tim Kindberg
**Extends:** ADR 033 (Core is schema-agnostic — neutral compile-in seam + per-schema
input packages), ADR 029 (`present()` over neutral facts), ADR 030 (container facts
+ subtree collapse)

## Context

ADR 033 made Core schema-agnostic and proved the seam with a single front-end,
`@jsonschema-form/input-jsonschema`. The whole point of that work was to let a
*second* schema language compile into the same neutral tree without touching Core.
Zod (bd `4qe`) is that second front-end — and the one that validates the seam,
because Zod is not a document format like JSON Schema: it is a runtime object graph
of `ZodType` instances.

There are two ways to turn a Zod schema into the neutral tree:

- **(a) Zod → JSON Schema → tree.** Convert with `z.toJSONSchema()` and reuse
  `input-jsonschema`. Tempting (zero new compiler), but it is exactly the lossy
  round-trip ADR 033 called out: `z.toJSONSchema()` drops or approximates anything
  without a JSON Schema analogue (transforms, refinements, branded/custom types,
  some unions), and it would make `origin.schema` a *synthesized* JSON Schema, not
  the author's real `ZodType` — so a consumer resolver could never reach the Zod
  schema it owns. It would also re-prove the coupling ADR 033 removed, just one
  layer out.
- **(b) Direct introspection → tree.** Walk the `ZodType` graph and call Core's
  neutral builders, exactly as the JSON Schema front-end walks keywords.

## Decision

**`@jsonschema-form/input-zod` compiles by direct introspection of Zod's internal
schema definition — no Zod → JSON Schema conversion.** It mirrors
`input-jsonschema` structurally: a pure transcriber that reads a schema, produces
neutral `facts`/`parts`/`children`, and calls Core's neutral builders
(`createFieldNode`/`createGroupNode`/`createArrayNode`/`createArrayItemNode`). It
decides **no** widgets and collapses **no** subtrees — all lowering stays in
`present()` (ADR 030 §3), inherited for free. Core imports nothing from it.

### 1. Introspection surface: `schema._zod.def`

Zod 4 exposes each schema's definition at `schema._zod.def`, discriminated on
`def.type` (`'string' | 'number' | 'boolean' | 'object' | 'array' | 'enum' |
'literal' | 'union' | 'optional' | 'default' | 'nullable' | …`). All internal
access is isolated in one module (`zodInternals.ts`) behind typed helpers
(`defOf`, `unwrap`, `readScalar`, `readChoices`, `readArrayLength`, `readMeta`), so
the compiler works against a neutral surface and the `_zod` cast lives in exactly
one place. If Zod restructures its internals, `zodInternals.ts` is the only file to
touch.

### 2. Zod → neutral-facts mapping

| Zod | Neutral facts |
|-----|---------------|
| `z.object({...})` | `GroupNode`, `valueShape: 'object'`, one child per `shape` entry |
| `z.array(el)` | `ArrayNode`, `valueShape: 'array'`, `item` descriptor from `el` |
| `z.string()` | leaf, `primitive: 'string'` |
| `z.number()` / `z.int()` / `.int()` | `primitive: 'number'` / `'integer'` |
| `z.boolean()` | `primitive: 'boolean'` |
| `.min/.max` (string/array) | `constraints.minLength/maxLength` / `minItems/maxItems` |
| `.min/.max` (number) | `constraints.minimum/maximum` |
| `.regex(re)` | `constraints.pattern = re.source` |
| `.email()`/`.url()`/`z.date()` | `facts.format = 'email'/'url'/'date'` (→ input type in `present()`) |
| `z.enum([...])` / union of `z.literal(...)` | `facts.choices` (scalar) or container `choices` (array) |
| `.meta({title,description})` / `.describe(...)` | `facts.label` / `facts.description` |

**Requiredness rides on the wrapper chain.** A property is required unless its
wrapper chain includes `optional`, `default`, or `prefault` (so `.nullish()` — an
`optional` of a `nullable` — is optional, but `.nullable()` alone is not: the key
must be present, its value may be null). `unwrap()` peels every wrapper carrying an
`innerType`, so the rule is structural, not a hard-coded wrapper list.

**`origin.schema` is the declared (still-wrapped) `ZodType`, pinned `S = ZodType`.**
A consumer resolver reading `facts.origin.schema` off a Zod-built tree gets the
author's real schema (ADR 033 §4), not `unknown` and not a synthesized JSON Schema.

### 3. Choices XOR item, and collapse, are inherited — not re-implemented

A finite scalar-choice element set (`z.array(z.enum(...))`) self-identifies as
container `choices`; an open-ended element source carries an `item` descriptor.
That is the same self-identifying contract `input-jsonschema` produces, so the
default `present()` rule collapses a scalar-choice array into one
multiselect/checkboxes leaf and leaves object/open arrays decomposed — with **zero**
Zod-specific presentation code. This is the payoff of ADR 030/033: the second
front-end fills neutral facts and inherits all lowering.

## Consequences

- **The seam is proven.** A second, structurally-different front-end compiles into
  the same tree and reuses `present()`, submit, and every consumer adapter
  unchanged. This is the concrete evidence ADR 033 was the right cut.
- **Zod v4 only.** v3 and v4 have different introspection internals; supporting
  both would fork `zodInternals.ts`. v4 is current; a v3 shim is deferred until
  someone needs it (ADR 008 — earn the second implementation first).
- **Unsupported constructs degrade, they don't crash.** A non-literal union, a
  transform/pipe, or a branded type compiles to its best neutral approximation (a
  plain field) rather than throwing; a lossy conversion path was explicitly
  rejected. Widening coverage (discriminated unions, records, tuples) is
  incremental and gated by real need.
- **`present()` stays the sole home of lowering.** The front-end never names a
  widget, so React ≡ vanilla and the collapse rules hold identically for Zod.
