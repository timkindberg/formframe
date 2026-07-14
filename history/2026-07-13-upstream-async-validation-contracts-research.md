---
date: 2026-07-13T18:00:00-0400
researcher: Tim Kindberg
baseline_branch: origin/main
baseline_commit: 70243c66a70029171dbc3a1eec02ca494983c47e
repository: jsonschema-form
topic: "Upstream async validation contracts — Standard Schema, Zod, cancellation-capable validators, form libraries"
tags: [research, validation, async, Standard-Schema, Zod, TanStack-Form, React-Hook-Form, Final-Form, wayfinder]
status: complete
last_updated: 2026-07-13
last_updated_by: Tim Kindberg
---

# Research: Upstream Async Validation Contracts

**Date:** 2026-07-13T18:00:00-0400 (America/New_York)  
**Researcher:** Tim Kindberg  
**Local baseline:** `origin/main` @ [`70243c66`](https://github.com/timkindberg/jsonschema-form/commit/70243c66a70029171dbc3a1eec02ca494983c47e)  
**Repository:** jsonschema-form  
**Wayfinder ticket:** Survey upstream async validation contracts

## Research question

What constraints and established behavior do Standard Schema, Zod async refinements, cancellation-capable validators, and relevant form libraries impose or demonstrate for async validation **ordering**, **rejection**, **transformed output**, and **cancellation**?

This document records **upstream normative contracts and demonstrated behavior** only. It does **not** choose a FormFrame `Validator` interface. It establishes evidence-backed constraints and open questions for later FormFrame decisions.

**Access date for all external sources:** 2026-07-13.

### Claim-type legend

| Label | Meaning |
|-------|---------|
| **docs-normative** | Published spec or official library documentation |
| **public API** | Documented method signatures and return shapes |
| **source-observed** | Behavior read from upstream source at a pinned commit/tag; not separately documented as contract |
| **historical issue** | Closed bug/discussion report; illustrates past concern, not current unresolved status |
| **unresolved issue** | Open bug/discussion; not established behavior |
| **open proposal** | Unmerged PR or design draft; not shipped API |

Pinned upstream references used for source-observed claims (current as of 2026-07-13):

- Zod **v4.4.3**: [`1fb56a5`](https://github.com/colinhacks/zod/tree/1fb56a5c18c27102dbc92260a4007c7732a0ccca)
- TanStack Form **form-core v1.33.2**: [`5d11281`](https://github.com/TanStack/form/tree/5d1128141a705ebb24ade1275b3117bb4c8b1bdc)
- React Hook Form **v7.81.0**: [`46b217e`](https://github.com/react-hook-form/react-hook-form/tree/46b217e034dd92f7aa3cb3a478815556b416b299)
- Final Form **v5.0.1**: [release tag](https://github.com/final-form/final-form/releases/tag/v5.0.1)

---

## Summary

Upstream contracts split cleanly into three layers that a FormFrame orchestrator must not conflate:

1. **Schema validation contracts** (Standard Schema, Zod, Valibot, Effect Schema) define how a single `validate`/`parse` call resolves: success payload vs typed failure result, sync vs `Promise`, and post-transform `value`/`data`/`output`. They generally do **not** define cross-call stale suppression, pending UI semantics, or cooperative cancellation on the public `validate` surface.
2. **Cooperative work cancellation** (TanStack Form `AbortController` + `signal`; Effect `runPromise({ signal })`) is an **orchestration/runtime** concern, distinct from **stale-result authority** (ignore a late result because input changed).
3. **Form libraries** own orchestration: debounce, pending/`isValidating`, stale suppression, submit gating, and whether transformed schema output reaches `onSubmit`.

**Strongest cross-cutting constraints for FormFrame:**

- **Standard Schema typed validation failure** is `{ issues }` on the `Result` object. Thrown exceptions and rejected `Promise`s are **outside/unspecified** by that result contract. Success carries transformed output in `value`.
- **Zod async** is opt-in at runtime (`parseAsync` / `safeParseAsync`); sync paths throw on encountered `Promise`. TypeScript does not statically track async schemas (current API/type behavior; **historical issue** [#4980](https://github.com/colinhacks/zod/issues/4980) closed). Zod `~standard.validate` uses sync-then-async fallback **on every invocation** with **no cache** — async checks and any sync prefix work before the first async step may run twice per call (**source-observed** @ v4.4.3; intentional per maintainer in closed **historical issue** [#5137](https://github.com/colinhacks/zod/issues/5137)).
- **No surveyed schema `validate` API carries `AbortSignal`.** Cooperative cancellation exists only at orchestration layers (TanStack Form passes `signal` to field async validators; Effect cancels fibers via `runPromise` options).
- **Transformed submit output is an existing FormFrame invariant** at baseline: `useFormTree` passes `result.data` when present, else assembled input. Upstream form libraries **disagree** (TanStack Form docs: validation does not preserve Standard Schema transforms into `onSubmit`; RHF resolver returns parsed `values`).
- **Stale-result authority is FormFrame's to establish** for any async evolution. Whether FormFrame also offers cooperative cancellation is a **later choice** — not required together with stale suppression.
- **Stale-result handling in surveyed libraries is implementation-specific**, not uniformly specified: TanStack Form form-core v1.33.2 (abort + instance check); RHF v7.81.0 (`isFieldValueUpdated` stale gate + immediate `isValidating` clear before error publish); Final Form v5.0.1 (per-field async tracking per release notes).

---

## Local vocabulary (read-only, baseline `70243c66`)

From [`packages/core/src/validation.ts`](https://github.com/timkindberg/jsonschema-form/blob/70243c66a70029171dbc3a1eec02ca494983c47e/packages/core/src/validation.ts) and [`packages/react/src/useFormTree.tsx`](https://github.com/timkindberg/jsonschema-form/blob/70243c66a70029171dbc3a1eec02ca494983c47e/packages/react/src/useFormTree.tsx) at baseline:

- **`Validator`**: synchronous `(data) => ValidationResult<T>` (ADR 019)
- **`ValidationResult`**: `{ valid, errors, data? }` where `errors` is `ValidationError[]` and `data` is optional post-coercion/transform output (ADR 025 purity invariant)
- **`ValidationError`**: `{ path, message, keyword? }` — per-path error record in the validator seam
- **`errors`**: canonical owned term in `useFormTree` React state (`ValidationError[]`); distinct from Standard Schema's `issues` term at the interop boundary
- **Submit transformed output (existing invariant)**: on valid submit, `onValid` receives `result.data` when present, otherwise the assembled input:

```ts
onValid?.(result.data === undefined ? (data as Output) : result.data)
```

- **`fromStandardSchema`**: maps Standard Schema `issues` → `errors`; throws if `validate` returns a `Promise` (ADR 019 synchronous seam)

Whole-document validation is already the model (ADR 028). This research informs evolving the seam; it does not prescribe its shape.

---

## 1. Standard Schema V1

**Primary sources (docs-normative):**

- Spec: [standard-schema/packages/spec/schema.md](https://github.com/standard-schema/standard-schema/blob/main/packages/spec/schema.md) (published at [standardschema.dev/schema](https://standardschema.dev/schema))
- JSR types: [@standard-schema/spec `StandardSchemaV1`](https://jsr.io/@standard-schema/spec/doc/~/StandardSchemaV1)
- Sync-only consumer guidance: [standardschema.dev/schema FAQ](https://standardschema.dev/schema)
- Design discussion (**unresolved issue**): [Issue #22 — Explicit sync/async schemas](https://github.com/standard-schema/standard-schema/issues/22) (OPEN)

### Normative / public contract

| Topic | Contract | Source type |
|-------|----------|-------------|
| **Entry point** | `schema['~standard'].validate(value, options?)` | docs-normative |
| **Return type** | `Result<Output> \| Promise<Result<Output>>` — caller must handle both | docs-normative |
| **Success** | `{ value: Output, issues?: undefined }` — falsy/missing `issues` means success | docs-normative |
| **Typed validation failure** | `{ issues: ReadonlyArray<Issue> }` — presence of `issues` means failure | docs-normative |
| **Thrown exceptions / rejected Promises** | **Outside the typed `Result` contract** — unspecified how consumers should handle | gap |
| **Issue shape** | `{ message: string, path?: PropertyKey[] \| PathSegment[] }` | docs-normative |
| **Input vs output types** | `StandardSchemaV1<Input, Output>` advertises `types.input` / `types.output` when present | docs-normative |
| **Transformed output** | Success **`value` is the typed output** (post-transform/coerce per implementer) | docs-normative |
| **Options** | `libraryOptions?: Record<string, unknown>` only — **no `AbortSignal` or cancellation parameter in V1** | docs-normative |
| **Ordering** | **Unspecified** — single-call semantics only | gap |
| **Pending semantics** | **Unspecified** | gap |
| **Cancellation** | **Unspecified** on `validate` | gap |
| **Sync-only consumers** | May throw `TypeError` if `validate()` returns `Promise` (documented consumer pattern, not part of `Result` type) | docs-normative |

### Incidental implementation notes

- **unresolved issue** [#22](https://github.com/standard-schema/standard-schema/issues/22) (OPEN): maintainers rejected separate `SyncSchema` / `AsyncSchema` interfaces because Zod cannot know at schema construction time whether validation will be async.
- **docs-normative** [Effect Schema → Standard Schema](https://effect.website/docs/schema/standard-schema/): adapter attempts sync decode first; returns `Promise` when underlying schema has async components.

### Gaps / unspecified

- **Rejected `Promise`s** vs **`{ issues }`** — contract describes result objects, not promise rejection.
- **In-flight cancellation** and **stale-run suppression** — not in V1.
- **`libraryOptions`** — intentionally open; no cross-vendor cancellation convention.

---

## 2. Zod v4.4.3

**Primary sources:**

- **docs-normative / public API:** [zod.dev/basics](https://zod.dev/basics), [zod.dev/api](https://zod.dev/api) (refinements, `abort`, `when`, transforms)
- **source-observed** @ v4.4.3: [packages/zod/src/v4/core/parse.ts](https://github.com/colinhacks/zod/blob/1fb56a5c18c27102dbc92260a4007c7732a0ccca/packages/zod/src/v4/core/parse.ts)
- **source-observed** @ v4.4.3: [packages/zod/src/v4/core/schemas.ts `~standard`](https://github.com/colinhacks/zod/blob/1fb56a5c18c27102dbc92260a4007c7732a0ccca/packages/zod/src/v4/core/schemas.ts)
- **historical issue** (CLOSED): [#4980](https://github.com/colinhacks/zod/issues/4980) (no TS async tracking), [#5137](https://github.com/colinhacks/zod/issues/5137) (Standard Schema sync-then-async double-run — maintainer confirms intentional)
- **open proposal** (OPEN, unmerged): [PR #5948](https://github.com/colinhacks/zod/pull/5948) — `parseMaybeAsync` / `safeParseMaybeAsync`; explicitly does **not** rewire `~standard.validate`

### Normative / public API contract

| Topic | Contract | Source type |
|-------|----------|-------------|
| **Sync parse** | `.parse(input)` → output on success; throws `ZodError` on validation failure. Returns a **deep clone** of valid input | docs-normative |
| **Sync safe parse** | `.safeParse(input)` → `{ success: true, data }` or `{ success: false, error: ZodError }` — does not throw for validation failure | public API |
| **Async requirement** | Schemas with async refinements/transforms require `.parseAsync` / `.safeParseAsync`; sync methods error at runtime | docs-normative |
| **Async parse** | `.parseAsync` → `Promise<output>`; throws `ZodError` on validation failure | public API |
| **Async safe parse** | `.safeParseAsync` → `Promise<SafeParseResult>` | public API |
| **Rejection vs issues** | Validation failures → `ZodError` throw (parse) or `error` object (safeParse). **Refinement functions should not throw** | docs-normative |
| **Transformed output** | Success returns parsed/transformed output (`result.data` / return value). `z.input<>` vs `z.output<>` | docs-normative |
| **Ordering (interleaved transforms/refinements)** | **Execute in declaration order** when interleaved | docs-normative ([zod.dev/api](https://zod.dev/api)) |
| **Early termination** | `.refine(..., { abort: true })` stops further checks on failure; `.refine(..., { when })` gates execution | docs-normative |
| **Cancellation** | **No `AbortSignal` or cancellation API** on parse/validate surface | gap |

### Source-observed (not public contract)

- **`_parseAsync`** awaits a single `schema._zod.run(...)` product; encountered promises are awaited in traversal order ([parse.ts @ v4.4.3](https://github.com/colinhacks/zod/blob/1fb56a5c18c27102dbc92260a4007c7732a0ccca/packages/zod/src/v4/core/parse.ts)). No docs-normative claim of parallelism.
- **Late async results after input changes:** not specified; no cancellation API.

### Standard Schema bridge (Zod-specific; source-observed @ v4.4.3)

```ts
// packages/zod/src/v4/core/schemas.ts — lazy ~standard.validate (no cache)
validate: (value) => {
  try {
    const r = safeParse(inst, value);
    return r.success ? { value: r.data } : { issues: r.error?.issues };
  } catch (_) {
    return safeParseAsync(inst, value).then((r) =>
      r.success ? { value: r.data } : { issues: r.error?.issues }
    );
  }
}
```

- Sync-first, async-fallback because async-ness is not known statically (**historical issue** [#5137](https://github.com/colinhacks/zod/issues/5137) CLOSED; maintainer: intentional; **unresolved issue** [#22](https://github.com/standard-schema/standard-schema/issues/22) OPEN for spec-level split).
- **Every** `~standard.validate` call on an async schema: sync `safeParse` attempt (throws on encountered `Promise`), then `safeParseAsync` retry — **no memoization**. Async checks and sync prefix work before the first async step may therefore run **twice per invocation** (**source-observed** @ v4.4.3).
- **open proposal** [PR #5948](https://github.com/colinhacks/zod/pull/5948) (OPEN, unmerged): would add `parseMaybeAsync` with documented side-effect doubling risk for non-idempotent sync steps; does **not** change `~standard.validate`. Not shipped; cited only as proposed mitigation, not established behavior.

### Gaps / unspecified

- Type-level async tracking: not provided by current types (**historical issue** [#4980](https://github.com/colinhacks/zod/issues/4980) CLOSED; limitation remains in practice).
- User-thrown errors inside async refine: propagate as **rejected promise** (source-observed via `await` in `_parseAsync`; Valibot documents this explicitly).

---

## 3. Valibot (second Standard Schema implementer — async/sync split)

**Primary sources (docs-normative / public API):**

- [valibot.dev/guides/async-validation](https://valibot.dev/guides/async-validation/)
- [parseAsync](https://valibot.dev/api/parseAsync/), [safeParseAsync](https://valibot.dev/api/safeParseAsync/)
- [pipeAsync](https://valibot.dev/api/pipeAsync/), [checkAsync](https://valibot.dev/api/checkAsync/)

| Topic | Contract | Source type |
|-------|----------|-------------|
| **Sync vs async schemas** | Separate APIs (`pipe` vs `pipeAsync`, `object` vs `objectAsync`); type system prevents async-in-sync | docs-normative |
| **Ordering** | `pipeAsync` runs items **in order**; aborts early before next action if issues collected | docs-normative |
| **parseAsync** | Throws `ValiError` on validation failure | public API |
| **safeParseAsync** | `{ success, output }` or `{ success: false, issues }` | public API |
| **Rejection** | Non-`ValiError` throw inside async requirement → **promise rejects** | docs-normative |
| **Transformed output** | Success returns **`output`** | public API |
| **Cancellation** | **None** | gap |

Valibot can know sync vs async at construction time; Zod cannot — context for Standard Schema unified `validate` (**unresolved issue** [#22](https://github.com/standard-schema/standard-schema/issues/22) OPEN).

---

## 4. Cancellation-capable contract: Effect Schema / Effect runtime

**Primary sources:**

- **docs-normative:** [Effect — Running Effects](https://effect.website/docs/getting-started/running-effects/), [Creating Effects](https://effect.website/docs/getting-started/creating-effects/), [Schema → Standard Schema](https://effect.website/docs/schema/standard-schema/)
- **source-observed:** [Effect commit 817a04c](https://github.com/Effect-TS/effect/commit/817a04cb2df0f4140984dc97eb3e1bb14a6c4a38) — `runPromise` `signal` option

| Layer | Cancellation | Contract | Source type |
|-------|--------------|----------|-------------|
| **Standard Schema `validate`** (Effect adapter) | No `AbortSignal` on `validate` | `Result \| Promise<Result>`; defects → single issue without `path` | docs-normative |
| **Effect runtime** | `AbortSignal` on `Effect.runPromise(effect, { signal })` | Aborted signal interrupts fiber | source-observed |
| **Effect.async / Effect.promise** | Callback receives `signal: AbortSignal` | Cooperative cleanup hook | docs-normative |

Effect demonstrates **cooperative work cancellation** at the **runtime** layer. The Standard Schema `validate` surface has no cancellation channel. TanStack Form (below) is the clearest **form-orchestration** `signal` contract surveyed.

---

## 5. Form libraries — orchestration behavior

### 5.1 TanStack Form form-core v1.33.2

**Primary sources:**

- **docs-normative:** [Validation guide](https://tanstack.com/form/latest/docs/framework/react/guides/validation), [Submission handling](https://tanstack.com/form/latest/docs/framework/react/guides/submission-handling)
- **source-observed** @ v1.33.2: [FieldApi.ts](https://github.com/TanStack/form/blob/5d1128141a705ebb24ade1275b3117bb4c8b1bdc/packages/form-core/src/FieldApi.ts), [standardSchemaValidator.ts](https://github.com/TanStack/form/blob/5d1128141a705ebb24ade1275b3117bb4c8b1bdc/packages/form-core/src/standardSchemaValidator.ts)

| Topic | Behavior | Source type |
|-------|----------|-------------|
| **Sync/async ordering** | Sync validator runs first; async counterpart runs only if sync passes, unless `asyncAlways: true` | docs-normative |
| **Debouncing** | `asyncDebounceMs`, per-cause overrides | docs-normative |
| **Pending** | `isValidating` via ref counter (`startValidation` / `endValidation`) | source-observed |
| **Cooperative cancellation** | Per cause, `lastAbortController.abort()` before new run; passes `signal` into async validator context | source-observed |
| **Stale-result suppression** | After await: if `controller.signal.aborted`, resolve without applying errors; if `field.getInfo().instance !== field`, discard | source-observed |
| **Standard Schema sync path** | `standardSchemaValidators.validate` throws if `validate` returns `Promise` | source-observed |
| **Standard Schema async path** | `validateAsync` awaits `schema['~standard'].validate(value)` | source-observed |
| **Transformed output** | **Validation does not preserve transformed values.** `onSubmit` receives input-shaped `value`; docs instruct re-parsing in `onSubmit` | docs-normative |
| **Async throws** | Caught and normalized in field async path | source-observed |

### 5.2 React Hook Form v7.81.0

**Primary sources:**

- **docs-normative / public API:** [useForm — resolver](https://react-hook-form.com/docs/useform#resolver)
- **source-observed** @ v7.81.0: [createFormControl.ts](https://github.com/react-hook-form/react-hook-form/blob/46b217e034dd92f7aa3cb3a478815556b416b299/src/logic/createFormControl.ts)
- **historical issue** (CLOSED): [#10078](https://github.com/react-hook-form/react-hook-form/issues/10078) (async race report), [#13156](https://github.com/react-hook-form/react-hook-form/issues/13156) (pending/error timing report)
- **merged fix** in current source: [PR #13495](https://github.com/react-hook-form/react-hook-form/pull/13495) (merged 2026-06-03; present in v7.81.0 `createFormControl.ts`)

| Topic | Behavior | Source type |
|-------|----------|-------------|
| **Resolver contract** | `resolver(values, context, options)` → `Promise<{ values, errors }>` | docs-normative |
| **Transformed output** | Resolver returns **`values`** — typically schema-parsed/coerced output from `@hookform/resolvers` | docs-normative + ecosystem |
| **Pending** | `formState.isValidating`; per-field `validatingFields` | source-observed @ v7.81.0 |
| **Stale-result suppression** | After async resolver await: `_updateIsFieldValueUpdated(fieldValue)`; if `!isFieldValueUpdated`, emits pending non-error `fieldState` (PR #13495) and **returns before applying resolver errors** | source-observed @ v7.81.0 |
| **Pending/error ordering** | `_updateIsValidating([name])` (clears `isValidating`) runs **immediately after** `await _runSchema`, **before** stale gate and error publication — subscribers may observe `isValidating: false` while errors not yet updated | source-observed @ v7.81.0 |
| **Ordering** | Whole-form resolver on triggered fields; cross-field deps via `trigger` | source-observed |
| **Cancellation** | **No `AbortSignal`** in resolver API | gap |
| **Rejected resolver promise** | Not a documented validation-failure channel | gap |

Historical issues [#10078](https://github.com/react-hook-form/react-hook-form/issues/10078) and [#13156](https://github.com/react-hook-form/react-hook-form/issues/13156) document past race/timing concerns; current v7.81.0 source implements `isFieldValueUpdated` stale gate and PR #13495 fieldState emission. They do not establish remaining upstream gaps.

### 5.3 Final Form v5.0.1

**Primary sources:**

- **docs-normative:** [v5.0.1 release notes](https://github.com/final-form/final-form/releases/tag/v5.0.1)
- **historical issue** (CLOSED): [#509](https://github.com/final-form/final-form/issues/509) (async race; fed v5.0.1 fixes), [#166](https://github.com/final-form/final-form/issues/166) (rejected-promise loop; fixed v5.0.1)
- **unresolved issue** (OPEN): [#355](https://github.com/final-form/final-form/issues/355) (debounced pending promises block submit)

| Topic | Behavior | Source type |
|-------|----------|-------------|
| **Async validators** | May return `Promise`; submit waits for in-flight promises | public API |
| **Stale-result suppression** | v5.0.1 release: per-field async tracking so stale runs cannot overwrite current results ([#513](https://github.com/final-form/final-form/pull/513); design in closed [#509](https://github.com/final-form/final-form/issues/509)) | docs-normative (release note) |
| **Pending** | Per-field `validating` flag / counter | docs-normative (release note) |
| **Rejection** | v5.0.1: rejected async promises cleared to avoid infinite submit loop ([#530](https://github.com/final-form/final-form/pull/530); closed [#166](https://github.com/final-form/final-form/issues/166)) | docs-normative (release note) |
| **Cancellation** | **No `AbortSignal`**; debounced validators that never settle can block submit — caller must reject abandoned work (**unresolved issue** [#355](https://github.com/final-form/final-form/issues/355) OPEN) | unresolved issue |
| **Transformed output** | Validators return errors or undefined; not schema-transform native | public API |

### 5.4 Conform — out of scope

Conform's server-fallback async model ([conform.guide/validation](https://conform.guide/validation)) is **not in scope** for this FormFrame Validator seam survey. It targets a different architecture (client-sync + server `parseWithZod({ async: true })`, Mode 1 / framework-action patterns). Included only as boundary context:

- Client `onValidate` is synchronous by design (**docs-normative**).
- **unresolved issue** [#1095](https://github.com/edmundhung/conform/issues/1095) (OPEN): stale server `targetValue` during live typing — not established behavior.

---

## 6. Cross-source matrix

| Source | Ordering | Rejection / failure | Transformed output | Cooperative cancellation | Stale-result suppression | Pending semantics |
|--------|----------|---------------------|--------------------|--------------------------|--------------------------|-------------------|
| **Standard Schema V1** | Single call; internal order unspecified | Typed failure: **`{ issues }`**; throws/rejected Promise **unspecified** | Success **`value: Output`** | **Not in spec** | **Not in spec** | **Not in spec** |
| **Zod v4.4.3** | **Declaration order** (interleaved transforms/refinements) | `ZodError` throw / safeParse `error`; refine should not throw | **`data` / return** = output type | **None** | **None** | **None** |
| **Valibot** | Pipeline order; early abort on issues | `ValiError` throw / `issues`; foreign throw rejects promise | **`output`** | **None** | **None** | **None** |
| **Effect Schema (SS adapter)** | Unspecified at `validate` surface | Typed **`{ issues }`**; defects → issue w/o path | Decoded **`value`** | Runtime **`signal`** only (not on `validate`) | **Not in spec** | Runtime fiber state |
| **TanStack Form v1.33.2** | Sync then async; debounced | Async throws → field errors (source-observed) | **Not via validation**; re-parse at submit (docs) | **`AbortController` + `signal`** (source-observed) | Abort + instance check (source-observed) | **`isValidating` counter** (source-observed) |
| **RHF v7.81.0** | Resolver on trigger | Resolver returns `errors` object | Resolver **`values`** (parsed) | **None** | **`isFieldValueUpdated` gate** (source-observed) | **`isValidating` clears before error publish** (source-observed) |
| **Final Form v5.0.1** | Per-field async queues | Rejection handling per release note | Not schema-native | **None** (debounce must reject; #355 OPEN) | Per release note (#509 CLOSED) | **`validating` per field** |
| **Conform** *(out of scope)* | Server round-trip | Zod issues via `reply()` | Server-parsed submission | **None** | #1095 OPEN (unresolved) | Network latency |

### Cancellation vs stale-result (explicit separation)

| Mechanism | What it stops | Who owns it |
|-----------|---------------|-------------|
| **Cooperative cancellation** | In-flight async **work** (network, effect fiber) | Orchestrator optional feature (TanStack Form, Effect runtime) |
| **Stale-result suppression** | Applying **results** from an older validation **call** after newer input | **FormFrame must establish authority rules** for async evolution |

Schema `validate` APIs specify neither. FormFrame **must** define stale authority; cooperative cancellation is an **optional later choice**, not a package deal with stale suppression.

### Validated input snapshot vs returned/parsed data

| Layer | Input snapshot | Returned / parsed data |
|-------|----------------|------------------------|
| Standard Schema | `validate(unknown)` input | Success `value: Output` |
| Zod | `parse` input | `data` / return (transformed) |
| FormFrame `ValidationResult` (baseline) | Caller-owned assembled input | Optional `result.data`; submit uses `result.data ?? assembled` |
| TanStack Form `onSubmit` | `value` in handler | Docs: re-`parse` for transforms |
| RHF resolver | `values` arg to resolver | `values` in resolver result |

---

## 7. Evidence-backed constraints for later FormFrame decisions

These are **constraints and open questions**, not interface choices.

### Must respect (high confidence)

1. **Standard Schema interop is Promise-union, not async-only.** Sync consumers may throw on `Promise`. Baseline `fromStandardSchema` throws today (ADR 019). Async evolution needs a separate orchestration path.

2. **Success/failure encoding differs across layers.** Standard Schema typed failure: `issues` on `Result`. Zod/Valibot parse: throw or safe-parse error object. FormFrame baseline: `valid` + `errors` (mapped from Standard `issues` at the boundary). Async evolution must define normalization without breaking per-path `errors` reference stability.

3. **Transformed submit output is an existing invariant.** Baseline `useFormTree` already passes `result.data` when present, else assembled input. Any async evolution must **preserve** that contract (ADR 025), not re-litigate raw-vs-transformed at submit.

4. **Stale-result authority is orchestration, not schema.** No surveyed schema API suppresses late async refinements. `useFormTree` owns orchestration — async Validator evolution requires explicit authority rules (generation counter, value snapshot compare, abort-flag check, or equivalent). **Cooperative cancellation is optional** and separate.

5. **Pending semantics need first-class ownership.** Schema libraries expose no pending state. Form libraries use counters/flags (`isValidating`, `validating`). FormFrame needs explicit pending semantics compatible with ErrorStore reference stability and render-stability contracts — including whether `isValidating`-equivalent clears before or with error publication (RHF v7.81.0 clears first; TanStack Form v1.33.2 uses counter lifecycle).

6. **Zod `~standard.validate` double-run is current, intentional, and per-call.** Every async-schema invocation may execute sync prefix + async checks twice; no cache @ v4.4.3. FormFrame must account for cost/idempotency when calling Standard Schema validate on Zod schemas, or bypass via `parseAsync`.

7. **Whole-document validation is fixed.** ADR 028 rules out field-scoped validator contracts; live UX may still *display* field-keyed errors from a whole-document result.

### Open questions (require FormFrame design pass)

1. **Promise rejection policy:** When async validator throws or rejects (network 500), map to `errors`, silent ignore, or orchestration failure? Standard Schema typed `Result` is silent on rejection.

2. **Sync caller preservation:** What remains synchronous when Validator gains async? `fromStandardSchema` for sync-only callers? Dual entry points? `instanceof Promise` detection only?

3. **ErrorStore stability during pending:** When a new validation starts, do prior per-path error refs clear immediately, on completion, or only when superseded? Upstream patterns differ (RHF clears `isValidating` before publishing new errors; TanStack uses validation counter).

4. **Zod interop path:** Call `~standard.validate` (accepting per-call double-run), `parseAsync` directly, or detect async-capability once and route? PR #5948 `parseMaybeAsync` is an **open proposal** only.

5. **Stale authority mechanism:** Value snapshot compare (RHF-style), generation token, abort-flag (TanStack-style), or hybrid? FormFrame must choose; need not adopt cooperative cancellation.

---

## 8. Source gaps and parent-agent follow-up

| Gap | Status | Suggested follow-up |
|-----|--------|---------------------|
| Standard Schema **promise rejection** semantics | Unspecified | Track spec; until defined, treat as orchestration error |
| **`@hookform/resolvers` Standard Schema** async/stale bridge | Not read at source | Read `standardSchemaResolver` if RHF interop path expands |
| **Zod** internal await ordering beyond declaration order | Source-observed only | Cite v4.4.3 tests if ordering becomes hard requirement |
| **Valibot `~standard.validate`** async posture | Not read at source | Read Valibot implementation if SS interop path expands |
| **Final Form #355** debounced pending promises | **Unresolved** (OPEN) | Document workaround (reject abandoned promises) if debounce pattern adopted |
| **Conform #1095** stale `targetValue` | **Out of scope**; OPEN | None for FormFrame seam |

---

## References (primary)

### Standard Schema
- Spec: https://github.com/standard-schema/standard-schema/blob/main/packages/spec/schema.md
- Site: https://standardschema.dev/schema
- Issue #22 (OPEN): https://github.com/standard-schema/standard-schema/issues/22

### Zod v4.4.3
- Basics: https://zod.dev/basics
- API: https://zod.dev/api
- parse.ts @ v4.4.3: https://github.com/colinhacks/zod/blob/1fb56a5c18c27102dbc92260a4007c7732a0ccca/packages/zod/src/v4/core/parse.ts
- schemas.ts @ v4.4.3: https://github.com/colinhacks/zod/blob/1fb56a5c18c27102dbc92260a4007c7732a0ccca/packages/zod/src/v4/core/schemas.ts
- Issue #4980 (CLOSED): https://github.com/colinhacks/zod/issues/4980
- Issue #5137 (CLOSED): https://github.com/colinhacks/zod/issues/5137
- PR #5948 (OPEN): https://github.com/colinhacks/zod/pull/5948

### Valibot
- Async guide: https://valibot.dev/guides/async-validation/
- pipeAsync: https://valibot.dev/api/pipeAsync/

### Effect
- Running Effects: https://effect.website/docs/getting-started/running-effects/
- Schema → Standard Schema: https://effect.website/docs/schema/standard-schema/
- AbortSignal commit: https://github.com/Effect-TS/effect/commit/817a04cb2df0f4140984dc97eb3e1bb14a6c4a38

### TanStack Form form-core v1.33.2
- Validation: https://tanstack.com/form/latest/docs/framework/react/guides/validation
- Submission handling: https://tanstack.com/form/latest/docs/framework/react/guides/submission-handling
- FieldApi.ts @ v1.33.2: https://github.com/TanStack/form/blob/5d1128141a705ebb24ade1275b3117bb4c8b1bdc/packages/form-core/src/FieldApi.ts
- standardSchemaValidator.ts @ v1.33.2: https://github.com/TanStack/form/blob/5d1128141a705ebb24ade1275b3117bb4c8b1bdc/packages/form-core/src/standardSchemaValidator.ts

### React Hook Form v7.81.0
- useForm resolver: https://react-hook-form.com/docs/useform#resolver
- createFormControl.ts @ v7.81.0: https://github.com/react-hook-form/react-hook-form/blob/46b217e034dd92f7aa3cb3a478815556b416b299/src/logic/createFormControl.ts
- Issue #10078 (CLOSED): https://github.com/react-hook-form/react-hook-form/issues/10078
- Issue #13156 (CLOSED): https://github.com/react-hook-form/react-hook-form/issues/13156
- PR #13495 (merged): https://github.com/react-hook-form/react-hook-form/pull/13495

### Final Form v5.0.1
- Release: https://github.com/final-form/final-form/releases/tag/v5.0.1
- Issue #509 (CLOSED): https://github.com/final-form/final-form/issues/509
- Issue #166 (CLOSED): https://github.com/final-form/final-form/issues/166
- Issue #355 (OPEN): https://github.com/final-form/final-form/issues/355

### FormFrame baseline (local)
- validation.ts @ 70243c66: https://github.com/timkindberg/jsonschema-form/blob/70243c66a70029171dbc3a1eec02ca494983c47e/packages/core/src/validation.ts
- useFormTree.tsx @ 70243c66: https://github.com/timkindberg/jsonschema-form/blob/70243c66a70029171dbc3a1eec02ca494983c47e/packages/react/src/useFormTree.tsx
- standardSchema.ts @ 70243c66: https://github.com/timkindberg/jsonschema-form/blob/70243c66a70029171dbc3a1eec02ca494983c47e/packages/core/src/standardSchema.ts

### Out of scope
- Conform validation: https://conform.guide/validation
- Conform Issue #1095 (OPEN): https://github.com/edmundhung/conform/issues/1095
