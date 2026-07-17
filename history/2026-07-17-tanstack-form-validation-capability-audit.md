---
date: 2026-07-17T15:06:00-0400
researcher: Cursor Agent (Grok 4.5)
baseline_commit: cc1a8821a9f4b950bdaa9a44688c8896cca48612
repository: formframe
topic: "TanStack Form validation capability audit vs FormFrame matrix (#116 / #121)"
tags: [research, validation, TanStack-Form, capability-matrix, recipe, wayfinder, issue-121]
status: complete
wayfinder: "#121"
parent: "#116"
sibling: "#120"
access_date: 2026-07-17
---

# Research: TanStack Form validation capability audit vs our matrix

**Date:** 2026-07-17  
**Wayfinder:** [#121](https://github.com/timkindberg/formframe/issues/121) (parent [#116](https://github.com/timkindberg/formframe/issues/116); sibling RHF audit [#120](https://github.com/timkindberg/formframe/issues/120))  
**Local baseline:** `cc1a882`  
**Installed pins (examples/basic-react):** `@tanstack/react-form@1.33.2` / `@tanstack/form-core@1.33.2`  
**Existing spike:** [`examples/basic-react/src/App_18_React+TanStackForm.tsx`](../examples/basic-react/src/App_18_React+TanStackForm.tsx)  
**Seam target:** [#117](https://github.com/timkindberg/formframe/issues/117) — inject `errors: ValidationError[]` per field (pre-gated; no `show` flag)  
**Companion audit:** [`history/2026-07-17-rhf-validation-capability-audit.md`](./2026-07-17-rhf-validation-capability-audit.md)

### Claim-type legend

| Label | Meaning |
|-------|---------|
| **docs-normative** | Official TanStack Form docs |
| **public API** | Documented interfaces / option shapes |
| **source-observed** | Behavior read from installed `@tanstack/form-core@1.33.2` |
| **recipe-observed** | Behavior / friction in `App_18` |
| **prior-research** | `history/2026-07-13-upstream-async-validation-contracts-research.md` §5.1 |

### Primary sources (this audit)

- Docs: [Validation](https://tanstack.com/form/latest/docs/framework/react/guides/validation), [Submission handling](https://tanstack.com/form/latest/docs/framework/react/guides/submission-handling), [FormValidators](https://tanstack.com/form/latest/docs/reference/interfaces/FormValidators)
- Installed form-core **v1.33.2:** `standardSchemaValidator.ts`, `FieldApi.ts`, `FormApi.ts`, `ValidationLogic.ts` (`revalidateLogic`)
- Prior async/stale survey @ same pin: [`history/2026-07-13-upstream-async-validation-contracts-research.md`](./2026-07-13-upstream-async-validation-contracts-research.md) §5.1
- Correction to issue text: “TanStack Form is not yet an example dependency” is **stale** — `#117` spike already added `@tanstack/react-form` to `examples/basic-react` and shipped `App_18`. #124 promotes that spike; it does not greenfield the dep.

---

## Summary

TanStack Form also covers nearly the full [#116](https://github.com/timkindberg/formframe/issues/116) matrix, with a **different ownership shape** than RHF: cause-keyed validators (`onChange` / `onBlur` / `onSubmit` / `onMount` + async twins), first-party Standard Schema (no resolvers package), built-in `asyncDebounceMs` + `AbortSignal`, and **no preserved schema transforms on submit**.

| Matrix capability | TanStack ownership | App_18 today | Recipe glue needed? |
|-------------------|--------------------|--------------|---------------------|
| Submit-time gating `onValid` | **Native** — `handleSubmit` → `onSubmit` / `onSubmitInvalid`; `canSubmit` | Partial (`onSubmit` only) | Minimal (`onSubmitInvalid`, subscribe `canSubmit`/`isSubmitting`) |
| Live / reactive revalidation | **Native** — put validators on `onChange` / `onBlur`; or `revalidateLogic({ mode, modeAfterSubmission })` + `onDynamic` | `onChange` + `onSubmit` SS | Config only |
| Touched / submit / always display | **Cause selection** (+ field `validate` no-ops until touched; change marks touched) | Live after first change | Map causes / `revalidateLogic` (see §3) — inject only committed errors |
| Per-field errors + a11y | `field.state.meta.errors` / `errorMap` + FormFrame seam | Hand-rolled field + `role="alert"` + **controlled bind** | **Yes** — map issues → `ValidationError[]`, `#117` inject; **also** controlled `value`/`onChange`/`onBlur` (separate axis) |
| Validation summary (DOM order) | **Not provided** | Absent | **Yes** — recipe |
| Cross-field / whole-document | Form-level validators + `fields` / `form` error maps; pathless → `""` key (**kept**, not dropped) | Flat schema only | Light — root/`""` path mapping for summary |
| Async validator | `on*Async` + SS async path; sync SS **throws** if `validate` returns Promise | Sync only | Use `onChangeAsync` / `onSubmitAsync` + debounce for matrix proof |
| Pending (`isValidating` / `isSubmitting`) | **Native** field/form meta counters | Unused | Subscribe via `form.Subscribe` / field meta |
| Stale-result protection | **AbortController** + instance check (**source-observed**) | N/A (sync) | None — rely on TanStack; pass `signal` in custom async validators |
| Run-failure vs invalid | Async **catch normalizes throw → error** (**source-observed**); sync SS Promise misuse throws hard | Unhandled | Mostly free for async; document sync SS pitfall |
| Coerced / transformed submit output | **Does NOT preserve** SS output — `onSubmit` gets input-shaped `value`; docs say re-parse | Passes raw `value` | **Yes** — re-`validate`/`parse` in `onSubmit` for coerced output |
| Nested / array error paths | Form-level SS builds paths; arrays become `foo[0].bar` when value is array | Flat only | **Yes** — normalize TanStack path ↔ FormFrame `contacts.0.email` |
| Standard Schema interop | **Built-in** (`standardSchemaValidators`) | Already wired via `toStandardSchema` | Keep; no `@hookform/resolvers` equivalent needed |

**Bottom line for #124:** Strong fit, with **more recipe glue than RHF** on three axes: (1) controlled control wiring, (2) re-parse transforms on submit, (3) array path bracket vs dot-index. Dep is already in the example — promote `App_18`, don’t reinstall.

---

## Dependency note (for #124)

| Fact | Detail |
|------|--------|
| Already present | `examples/basic-react/package.json` → `"@tanstack/react-form": "^1.33.2"` |
| Spike file | `App_18_React+TanStackForm.tsx` (parallel to App_12) |
| #124 work | Wire #117 inject seam + matrix fixtures; rename/promote spike; optional App switcher entry |
| Package boundary | Recipe only (ADR 024) — do **not** publish a FormFrame TanStack adapter package |

---

## 1. Submit-time validation gating `onValid`

**TanStack:** `form.handleSubmit()` marks all fields touched, runs `validateAllFields('submit')` then form `validate('submit')`, calls `onSubmit({ value })` only if valid; otherwise `onSubmitInvalid`. (**docs-normative** + **source-observed** `_handleSubmit` @ v1.33.2)

`canSubmit` is false when invalid **after** touch / mount errors; before any interaction it stays true even if “technically” invalid (**docs-normative**).

**App_18:** `onSubmit: ({ value }) => setSubmitted(value)`; no `onSubmitInvalid`.

**Glue:** Optional `onSubmitInvalid`; button via `form.Subscribe` → `canSubmit` / `isSubmitting` (prefer `aria-disabled` per docs a11y note).

---

## 2. Live / reactive revalidation

**TanStack** has no single `mode` string on `useForm` by default. Timing is **which validator keys you register**:

| Cause | Sync | Async |
|-------|------|-------|
| change | `onChange` | `onChangeAsync` (+ `onChangeAsyncDebounceMs` / `asyncDebounceMs`) |
| blur | `onBlur` | `onBlurAsync` |
| submit | `onSubmit` | `onSubmitAsync` |
| mount | `onMount` | — |
| dynamic | `onDynamic` | `onDynamicAsync` (used by `revalidateLogic`) |

**`revalidateLogic({ mode, modeAfterSubmission })`** (**docs-normative** / `ValidationLogic.ts`): RHF-shaped strategy — default `mode: 'submit'`, `modeAfterSubmission: 'change'` — runs the `onDynamic` validator on the watched event after submission state flips. Explicit comment in source: *“forces a form's validation logic to be ran as if it were a React Hook Form validation logic.”*

Sync-then-async: async twin runs only if sync passes, unless `asyncAlways: true`. (**docs-normative**)

**App_18:** `validators: { onChange: standard, onSubmit: standard }` — live from first change + submit gate.

**Glue:** For matrix parity with RHF defaults, prefer `validationLogic: revalidateLogic()` + `onDynamic: standard` (submit-then-change), or keep explicit `onSubmit` / `onChange` keys and document the mapping.

---

## 3. Touched-gated display (touched / submit / always)

| Desired UX | TanStack approach |
|------------|-------------------|
| **submit** | Validators only on `onSubmit` / `onSubmitAsync`, **or** `revalidateLogic({ mode: 'submit' })` + `onDynamic` |
| **touched** (blur-first) | Put rules on `onBlur` (then optionally `onChange` after submit via `revalidateLogic`) |
| **always** (live) | `onChange` / `onChangeAsync` (App_18) |

**Mechanics (source-observed):**

- `FieldApi.validate` **returns `[]` immediately if `!isTouched`** — no field validation until touched.
- `FormApi.setFieldValue` sets **`isTouched: true`** — so the first `handleChange` both marks touched and runs `validate('change')`.
- `handleBlur` marks touched + validates `'blur'`.
- `_handleSubmit` marks **all** fields touched before validating.

So “touched” here means **interacted** (change or blur), not RHF’s blur-then-change `onTouched` unless you place validators on blur.

**#117:** Recipe pre-gates by injecting only errors already in `field.state.meta.errors` (present == show). Do not add a second `isTouched` display filter on top of empty error arrays.

**Glue:** Document cause/`revalidateLogic` recipes; align with RHF audit’s anti-pattern warning (don’t double-gate).

---

## 4. Per-field error placement + a11y

**TanStack:** Per-field `meta.errors` (array) and `meta.errorMap` keyed by cause. With form-level Standard Schema, docs type form `errorMap.onChange` as `Record<string, StandardSchemaV1Issue[]>`. Field render props re-render on that field’s store. (**docs-normative**)

**App_18 friction (recipe-observed):**

- **A (same as RHF):** re-composes entire field; `role="alert"`.
- **B (TanStack-only):** **controlled** binding — must overlay `value` / `onChange` / `onBlur` / `name` on `control.attrs` (uncontrolled-native). Out of scope for #117; **in scope for #124**.

**Glue:**

1. Map `field.state.meta.errors` (issues or strings) → `ValidationError[]` with `path: node.path`.
2. `#117` `<Default of={node} errors={…} />`; drop hand-rolled chrome / `role="alert"`.
3. Keep controlled bind on the Control part (or thin wrapper) — this is extra vs RHF `register`.

---

## 5. Validation summary (DOM order)

**TanStack:** No summary. Aggregate via `form.state.errorMap` / field metas / `form.Subscribe`.

**Glue:** Same as RHF recipe — flatten to `ValidationError[]`, DOM/schema order, `fieldControlId`. Include `""` / form-level string errors for document-level issues.

---

## 6. Cross-field / whole-document rule

**TanStack:** Form-level function validators may return `{ form, fields: { 'path': msg } }`. Form-level Standard Schema fans issues into `form` + `fields` maps via `prefixSchemaToErrors`. (**docs-normative** + **source-observed**)

**Pathless issues:** empty `issue.path` → key `""` in the map (**kept**). Contrast: RHF `standardSchemaResolver` **drops** pathless issues.

**Glue:** Map `""` / `form` bucket → summary or a synthetic root; add a cross-field fixture for matrix proof. Field overwrite note: field-level errors can overwrite form-level field errors for the same cause (**docs-normative**).

---

## 7. Async validator + `asyncDebounceMs`

**TanStack:** First-class `onChangeAsync` / `onBlurAsync` / `onSubmitAsync` at form and field level; `asyncDebounceMs` and per-cause `onChangeAsyncDebounceMs` etc. (**docs-normative**)

**Standard Schema:**

- Sync `standardSchemaValidators.validate`: if `~standard.validate` returns a Promise → **throws** `'async function passed to sync validator'`. (**source-observed**)
- Async path: `validateAsync` awaits. Put async schemas on `on*Async` keys.

**App_18:** sync SS on sync keys only.

**Glue:** For async matrix rows use `onSubmitAsync` / `onChangeAsync` + debounce; do not hang a Promise-returning SS on sync `onChange`.

---

## 8. Pending signals (`isValidating` / `isSubmitting`)

| Flag | Where | Notes |
|------|-------|-------|
| `isValidating` | field + form meta | Counter via `startValidation` / `endValidation` (**source-observed** / prior-research) |
| `isFieldsValidating` | form state | Aggregate |
| `isSubmitting` | form state | Await work inside `onSubmit` so flag clears correctly (**docs-normative**) |

**Glue:** `form.Subscribe` / field meta for matrix UI. No library status hooks.

---

## 9. Stale-result protection

**TanStack (source-observed @ v1.33.2 / prior-research):**

- Aborts prior `AbortController` per cause before a new async run; passes `signal` into async validator context.
- After await: if `controller.signal.aborted`, resolve without applying; if `field.getInfo().instance !== field`, discard.

**Contrast to RHF:** cooperative cancellation **and** stale suppression, not value-snapshot compare alone.

**Glue:** None for SS path. Custom async validators should honor `signal` when doing fetch work.

---

## 10. Run-failure vs invalid

| Channel | Behavior |
|---------|----------|
| **Invalid** | Return string / issue map / SS `{ issues }` — first-class |
| **Async throw** | Caught in field async path; `rawError = e` then `normalizeError` — **becomes field error** (**source-observed**) |
| **Sync SS returning Promise** | Hard throw from `standardSchemaValidators.validate` |
| **`onSubmit` throw** | Separately from validation; not surveyed as field-error mapping |

**Contrast to RHF:** RHF resolver throws are **not** a validation channel; TanStack async throws **are** (normalized to errors). Closer to “run-failure collapses into invalid” unless the recipe distinguishes by error shape/type.

**Glue:** For matrix “run-failure ≠ invalid,” wrap validators to catch and route to a dedicated root/form error or telemetry; default TanStack behavior will otherwise show them as field errors.

---

## 11. Coerced / transformed output on submit

**Docs-normative (critical divergence from RHF):**

> Validation will not provide you with transformed values. … The value passed to the `onSubmit` function will always be the input data. To receive the output data of a Standard Schema, parse it in the `onSubmit` function.

**App_18:** `setSubmitted(value)` — input-shaped (AJV coerce in SS `value` is **discarded** by TanStack’s validation path).

**Glue (required for matrix “coerced output on submit”):**

```ts
onSubmit: ({ value }) => {
  const result = standard['~standard'].validate(value) // or validator(value)
  // use result.value / ValidationResult.data
}
```

Keep ADR 025 purity (clone inside AJV). This is the largest **behavioral** gap vs the RHF recipe for the same AJV SS.

---

## 12. Nested / array error paths

**FormFrame:** `node.path` / `ValidationError.path` use **dot + numeric segments** (`contacts.0.email`). (**packages/core** `validation.ts` / `standardSchema.ts`)

**TanStack `prefixSchemaToErrors`:** when walking issues against form values, array segments become **`contacts[0].email`**. (**source-observed**) Docs examples use bracket paths for form→field error maps.

**Flat fields:** identical (`email`). **Nested arrays:** path mismatch risk between `field.name` / `node.path` and SS-fanout keys.

**Glue:** Normalize bracket ↔ dotted paths when mapping issues → `ValidationError[]` and when naming `<form.Field name={…}>`. Prove with an array fixture in #124. Field-array shift helpers in form-core also assume `[index]` keys.

---

## 13. Standard Schema interop

| Path | Status |
|------|--------|
| Pass SS object as form/field validator | **Native** — no resolvers package |
| FormFrame `toStandardSchema(validator)` | Works (App_18) |
| Sync vs async SS | Must match validator key (`onChange` vs `onChangeAsync`) |
| Transforms | Validate-only; re-parse on submit (§11) |

**Glue:** Keep SS wiring; document sync/async key pairing. Prefer form-level SS for whole-document + field fan-out (matches App_18 / RHF whole-form resolver mental model).

---

## Exact glue list for #124 (TanStack recipe)

1. **Error shape adapter** — `meta.errors` / SS issues → `ValidationError[]` (normalize array paths).
2. **#117 inject** — `<Default of={field} errors={…} />`; delete hand-rolled field chrome.
3. **Controlled control bind** — `value` / `onChange` / `onBlur` / `name` on Control (TanStack-only vs RHF).
4. **a11y align** — drop `role="alert"`.
5. **Cause / `revalidateLogic` recipes** — map submit / touched / always; don’t double-gate display.
6. **Re-parse on submit** — apply SS/`Validator` again for coerced `data` / `value`.
7. **Pending UI** — `isValidating` / `isSubmitting` / `canSubmit` via Subscribe.
8. **Validation summary** — flatten + `fieldControlId`; include `""` form errors.
9. **Cross-field fixture** — form-level rule; pathless → `""` (already kept).
10. **Async fixture** — `on*Async` + `asyncDebounceMs`; never put Promise SS on sync keys.
11. **Run-failure policy** — optional wrap if matrix needs throw ≠ invalid (default: throws become errors).
12. **Promote App_18** — dep already present; no new package install required for the happy path.

### Explicitly NOT recipe glue (TanStack already owns)

- Submit gating / cause-based scheduling / `revalidateLogic`  
- Debounced async + AbortSignal stale handling  
- Fine-grained field subscriptions (`form.Field`)  
- Built-in Standard Schema adapter  

### Library seam dependency

- [#117](https://github.com/timkindberg/formframe/issues/117) inject prop — same as RHF — before the spike can stop re-composing the field.

---

## App_18 coverage vs matrix (checklist for #124)

| Capability | Covered in App_18? |
|------------|--------------------|
| Submit `onSubmit` | Yes |
| Live `onChange` | Yes |
| Submit-then-live via `revalidateLogic` | No |
| Blur-first / touched | No |
| Per-field errors | Yes (hand-rolled) |
| a11y per #117 | Partial (`role="alert"`) |
| Controlled bind | Yes (required) |
| Summary | No |
| Cross-field / root `""` | No |
| Async + debounce | No |
| isValidating / isSubmitting UI | No |
| Stale / AbortSignal | Inherited if async added |
| Run-failure | Default async normalize only |
| Coerced submit output | **No** (passes input `value`) |
| Nested/array paths | No (flat schema) |
| Standard Schema | Yes |

---

## Side-by-side with RHF (#120) — recipe-relevant deltas

| Topic | RHF | TanStack |
|-------|-----|----------|
| Timing API | `mode` / `reValidateMode` | Validator causes + optional `revalidateLogic` |
| Standard Schema | `@hookform/resolvers/standard-schema` | Built-in |
| Pathless issues | **Dropped** | Kept under `""` |
| Transforms on submit | Resolver `values` → `onValid` | **Must re-parse** in `onSubmit` |
| Control wiring | Uncontrolled `register` | Controlled bind |
| Async debounce | Not built-in | `asyncDebounceMs` |
| Stale / cancel | Value snapshot; no signal | AbortController + signal |
| Async throw | Not a validation channel | Normalized to error |
| Array paths | Nested object / numeric keys via `toNestErrors` | Prefer `foo[0].bar` in fan-out |
| Example dep | Already in App_12 | Already in App_18 (issue text outdated) |

These deltas are exactly what #125 (“prove identical behavior across recipes”) must normalize in fixtures or accept as recipe-local policy.

---

## Implications for #116 open questions

- **`standardSchema` interop:** Stronger keep-signal for TanStack (native consumer) than for RHF (resolvers bridge). Still recipe-side, not a React package export.
- **Run-failure vs invalid:** TanStack defaults to collapsing async throws into errors; RHF does not. Foundational vs recipe-local remains open — recipes will diverge unless #125 picks a shared policy wrapper.

---

## References

### Docs
- https://tanstack.com/form/latest/docs/framework/react/guides/validation
- https://tanstack.com/form/latest/docs/framework/react/guides/submission-handling
- https://tanstack.com/form/latest/docs/reference/interfaces/FormValidators

### Installed source (`@tanstack/form-core@1.33.2`)
- `src/standardSchemaValidator.ts`
- `src/FieldApi.ts` (`validate`, async AbortController path)
- `src/FormApi.ts` (`_handleSubmit`, `canSubmit`, `setFieldValue` touched)
- `src/ValidationLogic.ts` (`revalidateLogic`)

### Repo
- `examples/basic-react/src/App_18_React+TanStackForm.tsx`
- `examples/basic-react/package.json` (`@tanstack/react-form`)
- `history/2026-07-13-upstream-async-validation-contracts-research.md` §5.1
- `history/2026-07-17-rhf-validation-capability-audit.md`
- Issues #116, #117, #121, #124
