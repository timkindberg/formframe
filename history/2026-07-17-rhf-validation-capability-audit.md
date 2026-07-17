---
date: 2026-07-17T14:59:00-0400
researcher: Cursor Agent (Grok 4.5)
baseline_commit: cc1a8821a9f4b950bdaa9a44688c8896cca48612
repository: formframe
topic: "React Hook Form validation capability audit vs FormFrame matrix (#116 / #120)"
tags: [research, validation, React-Hook-Form, capability-matrix, recipe, wayfinder, issue-120]
status: complete
wayfinder: "#120"
parent: "#116"
access_date: 2026-07-17
---

# Research: RHF validation capability audit vs our matrix

**Date:** 2026-07-17  
**Wayfinder:** [#120](https://github.com/timkindberg/formframe/issues/120) (parent [#116](https://github.com/timkindberg/formframe/issues/116))  
**Local baseline:** `cc1a882`  
**Installed pins (examples/basic-react):** `react-hook-form@7.80.0`, `@hookform/resolvers@5.4.0`  
**Existing recipe:** [`examples/basic-react/src/App_12_React+ReactHookForm.tsx`](../examples/basic-react/src/App_12_React+ReactHookForm.tsx)  
**Seam target:** [#117](https://github.com/timkindberg/formframe/issues/117) — inject `errors: ValidationError[]` per field (pre-gated; no `show` flag)

### Claim-type legend

| Label | Meaning |
|-------|---------|
| **docs-normative** | Official RHF / resolvers docs |
| **public API** | Documented signatures / return shapes |
| **source-observed** | Behavior read from installed package source |
| **recipe-observed** | Behavior / friction in `App_12` |
| **prior-research** | Already established in `history/2026-07-13-upstream-async-validation-contracts-research.md` |

### Primary sources (this audit)

- RHF docs: [useForm](https://react-hook-form.com/docs/useform) (`mode` / `reValidateMode` / `resolver`), [formState](https://react-hook-form.com/docs/useform/formstate), [handleSubmit](https://react-hook-form.com/docs/useform/handlesubmit)
- Installed RHF **v7.80.0** bundle: `node_modules/react-hook-form/dist/index.esm.mjs` (`onChange`, `handleSubmit`, `shouldRenderByError`, `_runSchema`)
- `@hookform/resolvers` **v5.4.0** Standard Schema resolver: `node_modules/@hookform/resolvers/standard-schema/src/standard-schema.ts`
- `@standard-schema/utils` `getDotPath`: `node_modules/@standard-schema/utils/dist/index.js`
- Prior async/stale survey (RHF v7.81.0 source notes): [`history/2026-07-13-upstream-async-validation-contracts-research.md`](./2026-07-13-upstream-async-validation-contracts-research.md) §5.2
- Correction: issue text said “Standard Schema support (RHF ≥ 7.55)”. **RHF itself has no `~standard` path** (grep of installed package: none). v7.55 shipped resolver *output-type inference* ([release notes](https://github.com/react-hook-form/react-hook-form/releases/tag/v7.55.0)), not built-in Standard Schema. Interop is via **`@hookform/resolvers/standard-schema`** (resolver package ≥ 4.0.0).

---

## Summary

RHF already owns nearly the entire [#116](https://github.com/timkindberg/formframe/issues/116) capability matrix as **form-framework behavior**. The FormFrame RHF recipe’s job is thin glue: map RHF’s nested `FieldError` tree → per-path `ValidationError[]` for the [#117](https://github.com/timkindberg/formframe/issues/117) inject seam, wire `register` (already done), pick `mode`/`reValidateMode` instead of hand-gating display, and add a few recipe-local pieces RHF does not ship (DOM-order summary; pathless/whole-document issues; run-failure wrapping).

| Matrix capability | RHF ownership | App_12 today | Recipe glue needed? |
|-------------------|---------------|--------------|---------------------|
| Submit-time gating `onValid` | **Native** — `handleSubmit(onValid, onInvalid)` | Partial (`onValid` only) | Minimal (optional `onInvalid`) |
| Live / reactive revalidation | **Native** — `mode` + `reValidateMode` | Default (`onSubmit` → then `onChange` revalidate) | Config only |
| Touched / submit / always display | **Native via mode** (not a separate display gate) | Documented; default = submit-then-live | Config mapping (see §3) — **do not** hand-gate on `touchedFields` |
| Per-field errors + a11y | RHF errors + FormFrame render seam | Hand-rolled field + `role="alert"` | **Yes** — map → `ValidationError[]`, use `#117` `<Default errors={…}/>`; drop `role="alert"` |
| Validation summary (DOM order) | **Not provided** | Absent | **Yes** — recipe (~`fieldControlId` + flatten errors) |
| Cross-field / whole-document | Whole-form resolver yes; **pathless issues dropped** by `standardSchemaResolver` | Flat field schema only | **Yes** if matrix requires document-level / root errors |
| Async validator | Resolver may return `Promise`; SS resolver awaits | Sync AJV via `toStandardSchema` | Only if proving async — need async `~standard.validate` or custom resolver |
| Pending (`isValidating` / `isSubmitting`) | **Native** `formState` | Unused | Subscribe + UI when proving matrix |
| Stale-result protection | **Built-in** (`isFieldValueUpdated` gate) | N/A (sync) | None — rely on RHF |
| Run-failure vs invalid | Invalid = `{ errors }`; **throw is not a validation channel** | Unhandled | **Yes** if matrix requires — wrap resolver |
| Coerced / transformed submit output | Resolver `values` → `onValid` | Works (AJV coerce via SS `value`) | Type generics optional; keep purity (ADR 025) |
| Nested / array error paths | Nested `errors` via `toNestErrors` | Flat paths + `getNested` | Map nested → flat `ValidationError.path` |
| Standard Schema interop | Via `@hookform/resolvers/standard-schema` | Already wired | Keep; optional `zodResolver` / `ajvResolver` alternatives |

**Bottom line for #123:** RHF is a strong fit. Almost no FormFrame library work is required beyond the locked [#117](https://github.com/timkindberg/formframe/issues/117) inject seam. The recipe must stop re-composing the field, translate error shape, choose modes, and optionally add summary / root-error / run-failure wrappers for full matrix proof.

---

## 1. Submit-time validation gating `onValid`

**RHF:** `handleSubmit(onValid, onInvalid?)` runs the resolver (or built-ins), then calls `onValid(fieldValues)` only when `errors` is empty; otherwise `onInvalid` and focus-first-error. (**docs-normative** + **source-observed** `handleSubmit` @ v7.80.0: after `_runSchema()`, `fieldValues = cloneObject(values)` from the resolver, then branch on empty errors.)

**App_12:** `methods.handleSubmit((data) => setSubmitted(data))` — gates submit callback; no `onInvalid`.

**Glue:** None for basic gating. Optional: pass `onInvalid` for summary/focus UX. Submit button can read `formState.isSubmitting`.

---

## 2. Live / reactive revalidation

**RHF:** `mode` controls pre-submit triggers; `reValidateMode` controls post-submit re-triggers (`onChange` | `onBlur` | `onSubmit`, default `onChange`). Both are reactive after init. (**docs-normative**)

With a **resolver**, a field event still runs the **whole-form** resolver, but RHF only **commits the triggering field’s** error into `formState.errors` (`schemaErrorLookup` + `shouldRenderByError`). (**source-observed** `onChange` @ v7.80.0; **recipe-observed** in App_12 header comments.)

**App_12:** `useForm({ resolver })` — default `mode: 'onSubmit'`, `reValidateMode: 'onChange'`.

**Glue:** For matrix “live” scenarios, set e.g. `mode: 'onChange'` or `'onTouched'`. No custom scheduler.

---

## 3. Touched-gated display (touched / submit / always)

RHF does **not** expose FormFrame’s old `displayPolicy` triad as a separate layer. Display follows **when errors are committed**:

| Desired UX | RHF config | Notes |
|------------|------------|-------|
| **submit** (show after submit; then live) | default `mode: 'onSubmit'` + `reValidateMode: 'onChange'` | App_12 default |
| **touched** | `mode: 'onTouched'` | First blur, then change; field-scoped commit still applies |
| **always** (live from first interaction) | `mode: 'onChange'` or `'all'` | Perf cost on large forms (**docs-normative** warning) |

**Critical anti-pattern (App_12 already learned):** hand-filtering display with `touchedFields` **on top of** resolver errors under default `onSubmit` **swallows submit-time errors**. After [#117](https://github.com/timkindberg/formframe/issues/117), the recipe pre-gates by only injecting errors that RHF has already committed — **present == show**.

`formState.touchedFields` / `isSubmitted` remain available if a recipe wants custom UX beyond mode, but that is optional and easy to get wrong.

**Glue:** Document the three mode recipes; do not reintroduce `displayPolicy` in the library.

---

## 4. Per-field error placement + a11y

**RHF:** Nested `formState.errors` / `useFormState({ name })` for fine-grained subscribe. FieldError shape: `{ message?, type?, types? }`. (**docs-normative**)

**#117 seam:** `<Default of={field} errors={ValidationError[]} />` with `aria-invalid` / `aria-describedby={fieldErrorId(path)}`; **no** default `role="alert"`.

**App_12 friction (recipe-observed):**

- Re-composes label/description/control/error instead of `DefaultFieldRoot`.
- Builds `ValidationError`-unlike `{ message }` ad hoc.
- Uses `role="alert"` (conflicts with locked a11y contract).
- Duplicates control archetype switch + a11y that `DefaultControl` already owns.

**Glue (required for #123):**

1. Helper: RHF error at `node.path` → `ValidationError[]` (at least `{ path: node.path, message }`; optional `keyword` from `type`).
2. Once seam lands: `<Default of={node} errors={mapped} />` (or parts override) — delete `RHFField` re-composition.
3. Keep `register(node.path)` (and number `setValueAs`) on the control — either via customized `Control` part or a thin wrap; uncontrolled `register` remains the RHF-native binding (TanStack’s controlled bind is a separate axis).
4. Remove `role="alert"`.

---

## 5. Validation summary (DOM order)

**RHF:** No summary component. `errors` is a nested object, not DOM-ordered.

**#117:** `ValidationSummary` demoted to recipe; keep `fieldControlId` + `groupErrorsByPath`.

**Glue:** Recipe flattens nested RHF errors → `ValidationError[]`, sorts by schema/DOM field order (walk the form tree), links via `fieldControlId(path)`. ~10–20 lines once flatten helper exists.

---

## 6. Cross-field / whole-document rule

**RHF:** Resolver always sees full `values` — cross-field rules in the schema/validator work. Submit commits **all** errors; interactive revalidation field-scopes commit. (**docs-normative** resolver notes + **source-observed**)

**`standardSchemaResolver` gap (source-observed):** `parseErrorSchema` only keeps issues where `getDotPath(issue)` is truthy. `getDotPath` returns `null` when `issue.path` is missing/empty — **pathless / root document issues are silently dropped**.

**Glue if matrix requires whole-document errors:**

- Custom resolver wrapper: map pathless issues → `errors.root` / `setError('root', …)`, **or**
- Emit a synthetic path the summary reads, **or**
- Attach the issue to a chosen field path in the validator.

App_12’s schema has no cross-field rule today — matrix proof must add one.

---

## 7. Async validator

**RHF:** `_runSchema` is `async`; resolvers may return promises. `standardSchemaResolver` awaits `schema['~standard'].validate` if thenable. (**source-observed**)

**FormFrame today:** `Validator` is sync; `toStandardSchema` wraps sync validate. Async Standard Schema producers (e.g. Zod async refine via `~standard`) would flow through the same resolver without recipe changes.

**Pending UX:** `formState.isValidating` / `validatingFields` while the await is in flight. (**docs-normative**)

**Glue:** For async matrix rows, use an async Standard Schema (or custom async resolver). No FormFrame async runtime required in the RHF recipe. Debouncing is **not** built into RHF — recipe-local if needed (TanStack’s `asyncDebounceMs` is the contrast).

---

## 8. Pending signals (`isValidating` / `isSubmitting`)

| Flag | Meaning | Source |
|------|---------|--------|
| `isValidating` | Any in-flight validation | docs-normative |
| `validatingFields` | Per-field async validation map | docs-normative |
| `isSubmitting` | `handleSubmit` in progress | docs-normative |

Subscribe via Proxy rules (read before render / destructure). `useFormState` scopes subscriptions.

**App_12:** unused.

**Glue:** Wire button disabled / spinner from these when proving the matrix. No library status hooks.

---

## 9. Stale-result protection

**RHF (source-observed @ v7.80.0; detailed @ v7.81.0 in prior research):** after async `_runSchema` in `onChange`, `_updateIsFieldValueUpdated(fieldValue)`; if value changed during await, **return without applying** that run’s errors. No `AbortSignal` on the resolver API.

**Ordering note (prior-research):** `isValidating` is cleared immediately after await, **before** error publish — UI may briefly see “not validating” with old errors still showing.

**Glue:** None — do not reimplement stale gates in the recipe. Document the pending/error timing quirk if UI depends on strict ordering.

---

## 10. Run-failure vs invalid

| Channel | RHF behavior |
|---------|----------------|
| **Invalid** | Resolver returns `{ values: {}, errors: nested }` — first-class |
| **Run-failure (throw / rejected Promise from resolver)** | **Not** mapped to field errors. `handleSubmit`’s `_runSchema()` has **no try/catch** (**source-observed** @ v7.80.0) — rejection propagates; `isSubmitting` cleanup may not run cleanly |
| **`onValid` throw** | Caught; sets `isSubmitSuccessful: false`; rethrows (**docs-normative** + source) |
| **Server/submit errors** | App uses `setError('root.serverError', …)` pattern (**docs-normative**) |

`standardSchemaResolver` does not catch throws from `validate` — they become resolver promise rejections.

**Glue if matrix requires “run-failure ≠ invalid”:** wrap the resolver:

```ts
async (...args) => {
  try {
    return await inner(...args)
  } catch (e) {
    // recipe policy: surface as root error, rethrow, or setError
  }
}
```

Leave policy recipe-local (matches #116 “not yet specified”).

---

## 11. Coerced / transformed output on submit

**RHF:** On successful submit with resolver, `onValid` receives resolver `values` (parsed/transformed), not raw inputs. (**docs-normative** handleSubmit “Resolver with transformed values”; **source-observed** `fieldValues = cloneObject(values)`.)

**`standardSchemaResolver`:** success returns `result.value` unless `{ raw: true }`. (**source-observed**)

**App_12:** AJV coerce via FormFrame `toStandardSchema` → SS `value` → RHF `onValid`. Matches ADR 025 purity (clone inside AJV adapter).

**Glue:** Keep `toStandardSchema(createAjvValidator(...))` path (or `zodResolver` / native Zod SS). Optional `useForm<Input, unknown, Output>` generics for TS. Do not pass live RHF values into a mutating validator.

---

## 12. Nested / array error paths

**Resolvers:** `toNestErrors` builds nested `errors.foo.bar` / array indexes. (**public API** / source in `@hookform/resolvers`)

**RHF:** `get(errors, name)` / field-array root error helpers.

**App_12:** flat schema; `getNested(errors, node.path)` for dotted paths.

**Glue:** When mapping to `ValidationError[]`, flatten nested RHF errors to `{ path: 'a.b.0.c', message }` matching `node.path`. Prefer one shared flatten helper used by field inject + summary.

---

## 13. Standard Schema interop

| Path | Status |
|------|--------|
| `standardSchemaResolver(schema)` | **Supported** (@hookform/resolvers ≥ 4; App_12 uses this) |
| FormFrame `toStandardSchema(validator)` | Works as SS producer for AJV/Zod validators |
| `zodResolver` / `ajvResolver` | Available alternatives; not required if SS path stays |
| Built-in RHF Standard Schema (no resolvers package) | **Does not exist** in RHF 7.80.0 |

Async SS: resolver awaits Promise results. Sync FormFrame `Validator` remains fine for sync matrix rows.

**Glue:** Keep current SS wiring; document that `@hookform/resolvers` is a **recipe dependency**, not a FormFrame package dependency.

---

## Exact glue list for #123 (RHF recipe)

Ordered by necessity:

1. **Error shape adapter** — nested RHF `FieldError` → `ValidationError[]` (per path + flatten for summary).
2. **#117 inject** — `<Default of={field} errors={…} />`; delete hand-rolled field chrome; keep `register` on control.
3. **a11y align** — drop `role="alert"`; rely on `fieldErrorId` / `aria-*` from default field.
4. **Mode recipes** — document/config `onSubmit` / `onTouched` / `onChange` for submit / touched / always; never double-gate with `touchedFields` under `onSubmit`.
5. **Pending UI** — subscribe `isValidating` / `isSubmitting` for matrix proof.
6. **Validation summary** — flatten + DOM/schema order + `fieldControlId` links.
7. **Cross-field / pathless issues** — schema fixture + resolver wrapper or `root` mapping (`standardSchemaResolver` drops pathless).
8. **Run-failure wrapper** — only if proving failure ≠ invalid.
9. **Async fixture** — only if proving async; use async SS or custom resolver (RHF stale gate covers races).
10. **Deps** — keep `react-hook-form` + `@hookform/resolvers` in the example; do not promote to a maintained adapter package (ADR 024).

### Explicitly NOT recipe glue (RHF already owns)

- Submit gating / live revalidation scheduling  
- Touched-vs-submit commit policy (via `mode` / `reValidateMode`)  
- Stale async result suppression  
- Transformed `onValid` values from resolver  
- Fine-grained field rerenders (`useFormState({ name })`)

### Library seam dependency (not RHF-specific)

- [#117](https://github.com/timkindberg/formframe/issues/117) inject prop must land before App_12 can stop re-composing the field. Until then, App_12 remains evidence of friction, not the final recipe shape.

---

## App_12 coverage vs matrix (checklist for #123)

| Capability | Covered in App_12? |
|------------|--------------------|
| Submit `onValid` | Yes |
| Live revalidate after submit | Yes (default) |
| Touched mode | Documented only — not selected |
| Always / onChange mode | No |
| Per-field errors | Yes (hand-rolled) |
| a11y per #117 | Partial (has alert role; hand-rolled ids) |
| Summary | No |
| Cross-field / root | No |
| Async | No |
| isValidating / isSubmitting UI | No |
| Stale protection | Inherited if async added |
| Run-failure | No |
| Coerced submit output | Yes (age / AJV) |
| Nested/array paths | No (flat schema) |
| Standard Schema | Yes |

---

## Implications for #116 open questions

- **`standardSchema` interop:** Earns keep-as-recipe-helper for RHF (`toStandardSchema` + `standardSchemaResolver`). Does not need to live in the React package.
- **Run-failure vs invalid:** Remains **recipe-local** for RHF — upstream has no typed failure channel for throws; wrappers are app policy.

---

## References

### Docs
- https://react-hook-form.com/docs/useform
- https://react-hook-form.com/docs/useform/formstate
- https://react-hook-form.com/docs/useform/handlesubmit
- https://github.com/react-hook-form/resolvers (Standard Schema section)
- https://github.com/react-hook-form/react-hook-form/releases/tag/v7.55.0

### Installed source
- `react-hook-form@7.80.0` → `dist/index.esm.mjs`
- `@hookform/resolvers@5.4.0` → `standard-schema/src/standard-schema.ts`
- `@standard-schema/utils` → `getDotPath`

### Repo
- `examples/basic-react/src/App_12_React+ReactHookForm.tsx`
- `examples/basic-react/src/App_18_React+TanStackForm.tsx` (parallel friction)
- `history/2026-07-13-upstream-async-validation-contracts-research.md` §5.2
- Issues #116, #117, #120, #123
