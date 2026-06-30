# ADR 026: Speak Standard Schema at the Boundary, Don't Become It

**Date:** 2026-06-30
**Status:** Proposed
**Deciders:** Tim Kindberg

## Context

`jsonschema-form-r1p` asks whether to align our `Validator` seam (ADR 019) with
[Standard Schema](https://standardschema.dev) — the cross-library interface that
form/router tooling uses to consume "a schema for validation" without per-library
adapters. Two real forces motivate it:

1. **Emit.** The RHF spike (ADR 024) hand-rolled a `validatorResolver` plus a
   `setNested` walker to feed our validator's issues into React Hook Form. RHF
   *already ships* `standardSchemaResolver` (`@hookform/resolvers/standard-schema`),
   which calls `schema['~standard'].validate(values)` and does the nested-error
   mapping itself (`getDotPath` + `toNestErrors`). If our validator can present a
   Standard Schema, that entire recipe shim collapses to one import.
2. **Consume.** The bead's framing — "so Zod/Valibot/ArkType plug in natively."
   Those libraries implement Standard Schema directly. If our seam accepts a
   Standard Schema, a user can pass `zodSchema` with no `createZodValidator`
   wrapper at all.

ADR 025 already nudged us toward the spec: validator success now carries
`result.data` (the coerced value), which is exactly Standard Schema's success
shape `{ value }`. The convergence was deliberate; this ADR decides how far to
take it.

### The spec (v1), inlined

```ts
interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) =>
      | { value: Output; issues?: undefined }            // success
      | { issues: ReadonlyArray<Issue> }                 // failure
      | Promise<…>                                        // may be async
    readonly types?: { input: Input; output: Output }
  }
}
interface Issue { message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }
```

How it differs from our `Validator`:

| Axis | Our `Validator` (ADR 019/025) | Standard Schema |
| --- | --- | --- |
| Shape | bare function `(data) => result` | object carrying a `~standard` prop |
| Verdict | explicit `valid: boolean` | absence of `issues` = success |
| Output | `data?` (optional, coerced) | `value` (required on success) |
| Issue path | dot-string `contacts.0.email` | segment array `['contacts',0,'email']` |
| Issue extras | `keyword` (JSON Schema vocabulary) | none — `message` + `path` only |
| Timing | synchronous (ADR 019) | sync **or** `Promise` |

## Decision

**Speak Standard Schema at the boundary; do not replace the internal
`Validator`.** Add two pure, ~20-line adapters to Core:

```ts
toStandardSchema(validator: Validator<T>, vendor?): StandardSchemaV1<unknown, T>
fromStandardSchema(schema: StandardSchemaV1<unknown, O>): Validator<O>
```

The Standard Schema v1 interface is **inlined** into Core (the spec is explicitly
copy/paste-licensed for this), so Core stays zero-dependency while a value typed
as our `StandardSchemaV1` remains structurally identical to `@standard-schema/spec`'s
— consumers accept it directly.

### Why adapt, not adopt

The honest reason is **one architectural fact, not a list of conveniences**: this
library is addressed by a **dot-string path**, and that choice is load-bearing.
`issue.path` is deliberately the *same string* as `node.path` (`contacts.0.email`) —
how the parser, continuation engine, array repathing, the reactive `IssueStore`
keys, `ValidationSummary` anchors, and relative `getField` queries all locate a
field — and, most importantly, it is what makes the typed `FieldPath<S>`
autocomplete possible, because that path is a TypeScript template-literal type
(`contacts.${number}.email`). Standard Schema addresses issues by a **segment
array** (`['contacts', 0, 'email']`), which a template-literal type cannot express.

These are two different addressing models, so a translation between them is
**unavoidable somewhere**. Adopting Standard wholesale does not delete that
translation — it pushes it inward, forcing either every internal path-consumer to
speak arrays, or `node.path` itself to become an array (which guts the `FieldPath`
typing that is a headline feature). Keeping a thin `ValidationIssue { path: string }`
localizes the translation to one place — the boundary — which is exactly what
`toStandardSchema`/`fromStandardSchema` are. The cost is paid once, by whoever
crosses into the foreign ecosystem, not by every internal consumer.

The reasons one might *expect* to matter here mostly don't, and it's worth being
explicit so this isn't read as more than it is:

- **Keyword is *not* the reason.** `keyword` is barely consumed (one cosmetic read
  in the RHF example) and, crucially, Standard issues are structurally extensible —
  an adopted contract could still carry `{ message, path, keyword }`. Keyword
  neither blocks adoption nor argues for adapting.
- **Sync-vs-async is orthogonal.** Whether we adapt or adopt, we type our own use as
  synchronous and throw on a returned `Promise` (what `fromStandardSchema` does).
- **Blast radius is cost, not principle.** Rewriting the internal readers would be
  work, but for a pre-1.0 library that is not a design argument; the addressing
  model is.

And adoption's real payoff is **not** forfeited by staying thin: `fromStandardSchema`
already makes any Standard-Schema library a `Validator` with no per-library package,
so "Zod just works" is available either way (see Consequences).

### Mappings the adapters own

- `result.data ?? input` → Standard's required success `value` (and back: `value`
  → our `data`).
- dot-path ⇄ segment array (`''` ⇄ no path). This re-uses the same dot-path
  convention as `jsonPointerToPath` (ADR 018); the existing ambiguity of a literal
  `.` in a key is unchanged, not worsened.
- `keyword` is **dropped** when emitting and **absent** when consuming — Standard
  has no slot for it.
- A Promise from a consumed schema **throws** (sync seam).

## Consequences

- **The RHF recipe loses its shim.** `validatorResolver` + `setNested` become
  `standardSchemaResolver(toStandardSchema(validator))`. The recipe shrinks to RHF's
  own documented path, and the spike's remaining glue (already de-fanged by ADR 025)
  disappears. TanStack Form (native Standard Schema support) works the same way.
- **Zero-wrapper Zod/Valibot/ArkType.** `fromStandardSchema(zodSchema)` is a
  `Validator` with no adapter package. Caveat: it is *keyword-less* (Standard drops
  Zod's `code`); `createZodValidator` stays the higher-fidelity option when you want
  `keyword`. Both coexist — generic interop vs. rich mapping.
- **Core stays zero-dep.** Types inlined; two pure functions; no runtime import.
- **Backward compatible.** Purely additive — new exports, no change to `Validator`,
  `ValidationResult`, or any adapter.
- **`data` vs `value` rename is now moot.** ADR 025 deferred renaming `data`→`value`
  to "the Standard-Schema alignment that motivates it." This is that alignment, and
  the answer is: keep `data` internally, let `toStandardSchema` project it onto
  `value`. No rename, no churn.

## Alternatives Considered

- **Adopt Standard Schema as the `Validator` contract (replace).** Rejected for now,
  on the addressing-model argument above: our spine is the dot-string `node.path` /
  `issue.path` that powers the typed `FieldPath<S>`, and Standard's segment-array
  path cannot be a template-literal type. Adopting would force a translation inward
  or push `node.path` to arrays, weakening a headline feature — for interop we
  already get from `fromStandardSchema`. *Not* rejected for keyword/sync/blast-radius
  (those don't decide it). Revisit if the typed-path story is ever reworked or async
  lands; the adapters make that migration incremental rather than a big-bang.
- **Fuse `~standard` onto the validator itself (a callable that is also a
  `StandardSchemaV1`).** Deferred. It would let consumers skip the
  `toStandardSchema(...)` wrapper (`standardSchemaResolver(validator)` directly), but
  it forces *every* validator — including hand-written ones and test fakes — to carry
  `~standard`, making the contract heavier for implementers, against the thin-contract
  decision. Keep `toStandardSchema` as the opt-in bridge; revisit only if the wrapper
  proves annoying in real recipes.
- **Rename `result.data` → `value` now.** Unnecessary (see Consequences). The
  boundary adapter is the seam that needs the spec's name, and it has it.
- **Put the adapters in a new `@jsonschema-form/standard-schema` package.** Rejected
  (ADR 008) — two tiny pure functions over types Core already owns. Core is their
  natural home; a package can be carved later if a non-Core consumer needs them
  without pulling Core.
- **Depend on `@standard-schema/spec` for the types.** Rejected — the spec ships as
  copy/paste precisely so libraries stay dependency-free; inlining honors Core's
  zero-dep rule and avoids a version-coupling on a 1.x types package.
- **Carry `keyword` as a vendor field on the emitted Standard issue.** Deferred.
  Structurally possible (consumers ignore unknown props) but it muddies a clean
  spec object and no consumer reads it today; revisit if a real need appears.
- **Do nothing / document compatibility only.** Rejected — interop *is* the product
  pitch under ADR 024 (adapters are patterns enabled by seams). A first-class
  `toStandardSchema` is the smallest thing that makes "bring your own form library"
  real instead of aspirational.

### Adjacent, deliberately out of scope

Standard Schema has a sibling **Standard JSON Schema** spec (a `~standard.jsonSchema`
converter for tools that emit JSON Schema). We are a JSON Schema *front-end*, so
exposing that from our tree is a genuine future opportunity — but it concerns the
schema-conversion seam, not the Validator seam, and is its own ADR if pursued.

---

**Relates to:** ADR 019 (the seam this keeps and wraps), ADR 025 (`data` already
shaped success toward `{ value }`), ADR 020 (contract suite — adapters are pure and
unit-tested, no new universal invariant needed), ADR 024 (the RHF recipe this
simplifies), ADR 008 (interop earned by two real consumers — emit for RHF/TanStack,
consume for Zod/Valibot/ArkType — without growing the core contract),
`jsonschema-form-1oz` (keyword vocabulary, the thing the boundary hop loses).
