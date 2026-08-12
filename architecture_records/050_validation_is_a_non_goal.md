# ADR 050: Validation Is a Non-Goal — Library Renders Errors; Recipes Produce Them

**Date:** 2026-07-17
**Status:** Accepted (GitHub [#119](https://github.com/timkindberg/formframe/issues/119); home base [#116](https://github.com/timkindberg/formframe/issues/116))
**Deciders:** Tim Kindberg
**Supersedes:** ADR 019, ADR 021, ADR 023, ADR 025, ADR 026, ADR 027,
ADR 036 (`036_spreadable_validation_capability.md` — not the dual-build ADR),
ADR 041, ADR 042, ADR 043, ADR 044, ADR 045, ADR 046
**Annotates:** ADR 011 (YAGNI on a first-party store stands; "validation as a
primary swap axis" does not), ADR 024 (recipes-not-packages stands; "validation
adapters remain packages" does not)
**Builds on:** ADR 008 (earn the seam), ADR 024 (adapters are recipes),
ADR 037 (`ValidationError` terminology — kept as a display type)

## Context

The original product model treated validation as a first-class capability slot:
Core owned a neutral `Validator` contract ([ADR 019](./019_validation_as_a_side_loaded_slot.md));
React owned runtime that scheduled runs, stored errors/touched/pending, and gated
submit ([ADR 021](./021_reactive_validation.md), [ADR 023](./023_reactive_state_subscription_store.md),
[ADR 027](./027_touched_tracking_and_error_display_policy.md), and the async cluster
[ADR 041](./041_async_validator_is_a_sibling_seam.md)–[ADR 046](./046_async_validation_ratified_design.md)).
Maintained adapter packages (`validation-ajv`, `validation-zod`, `validation-contract`)
filled the slot ([ADR 020](./020_shared_validation_contract_package.md),
[ADR 024](./024_adapters_are_patterns_not_packages.md)).

That model competed with the form frameworks consumers already use. React Hook
Form and TanStack Form **own** validation + form state (`formState.errors`,
`touchedFields`, `mode` / revalidation, `isValidating` / `isSubmitting`, resolvers /
Standard Schema). A library-owned validation runtime duplicates their job instead
of composing with it. VNDLY — the first real consumer — will use RHF. PR #71's
async-validation work effectively built the first-party reactive store that
[ADR 011](./011_form_state_is_a_shallow_slot.md) deferred as YAGNI.

Wayfinder map [#116](https://github.com/timkindberg/formframe/issues/116) records
the keep/cut decision. The field error-presentation seam is locked by
[#117](https://github.com/timkindberg/formframe/issues/117): inject errors as a
prop on `<Default of={field} errors={…} />`, recipe-pre-gated, with a11y wiring
in the library.

## Decision

**Validation production is a non-goal for FormFrame.** The library **renders**
errors; **recipes produce** them.

### 1. What the library owns (render)

- Schema → form-tree IR + front-ends; `SchemaFields` / parts / customize.
- Native `<form>` + FormData submit for the zero-dependency path.
- **Display types:** `ValidationError`, `groupErrorsByPath` (path-keyed for field
  placement).
- **Field error-presentation seam** ([#117](https://github.com/timkindberg/formframe/issues/117)):
  `<Default of={field} errors={ValidationError[]} />` (per-path, recipe-pre-gated —
  no library `show` flag); `aria-invalid` / `aria-describedby` + `fieldErrorId`
  (no `role="alert"`); movable `Errors` / `Control` parts; `fieldControlId`.

### 2. What recipes own (produce)

Anything that owns, schedules, or stores error / touched / pending / submit-gating
state — including `formStore`, `statusStore`, `errorStore`, `touchedStore`,
`displayPolicy`, status hooks, `ValidationProvider` / `FormStoreProvider`,
`useFormTree`'s `validator` option + submit-gating, the `Validator` /
`AsyncValidator` / `ValidationResult` runtime, Standard Schema interop at the
library boundary (tentative), and the maintained `validation-*` packages.
`ValidationSummary` is recipe-local.

Native, RHF, and TanStack recipes each wire a chosen form framework and inject
errors into the seam. Capability parity across recipes is proven by the harness
in [#118](https://github.com/timkindberg/formframe/issues/118) /
[#125](https://github.com/timkindberg/formframe/issues/125), not by a library
runtime.

### 3. How this revises earlier framing

| Prior claim | Now |
| --- | --- |
| Validation is a primary swap axis (ADR 011 / Phase B) | **UI** remains a primary swap; **validation is BYO via form-framework recipes** |
| Side-loaded `Validator` slot on Core (ADR 019+) | Demoted — display types + render seam only |
| First-party reactive validation store (ADR 021/023/027/036/041–046) | Demoted — form frameworks own that state; ADR 011's **no first-party store** YAGNI is reaffirmed |
| Validation adapters stay maintained packages (ADR 024) | Demoted to recipes / removed from the product surface |

### 4. Consolidation (this ADR's mechanical sibling)

ADR sprawl from the validation track is relieved in the same change as this
decision ([#119](https://github.com/timkindberg/formframe/issues/119)):

- Status index at [`architecture_records/README.md`](./README.md).
- Superseded validation ADRs stay **in place** with `Superseded by ADR 050`
  status + a short note (same pattern as ADR 004 / ADR 022). They are **not**
  moved to `architecture_records/superseded/` — moving would churn every
  cross-link for little gain once the index exists; `ARCHITECTURE.md` remains
  the living current snapshot.

## Consequences

- Implementation tickets under [#116](https://github.com/timkindberg/formframe/issues/116)
  extract the keep-seam and demote the cut surface; this ADR does not delete code.
- ADR 008 still applies: the error-presentation seam was earned by a third recipe
  (TanStack alongside RHF), not invented for one adapter.
- ADR 037's `error`/`errors` vocabulary on owned display interfaces remains in force.
- ADR 020 / ADR 028 are not formally superseded here (outside the named cluster)
  but their premises (maintained validation-contract package; whole-document
  library-owned reactive validate cost) no longer describe the product goal —
  clean up with the demotion implementation.
- **[#126](https://github.com/timkindberg/formframe/issues/126) completed the
  demotion implementation**: `validation-ajv`/`validation-zod`/
  `validation-contract` are now private recipe/test-support packages (kept in
  place, not deleted); `useFormTree` lost its `validator` option and
  submit-gating; the error/touched/display-policy store moved out of
  `packages/react` into example recipes. ADR 020 and ADR 028 are now formally
  marked `Superseded by ADR 050`.
- Docs and Phase B framing that put "validation first" as a library slot should
  point here; recipes + the render seam replace that roadmap item.

## Alternatives Considered

- **Keep the library-owned validation runtime and treat RHF/TanStack as optional
  wrappers around it.** Rejected: competes with the frameworks' core job; duplicates
  error/touched/pending/mode; PR #71 already showed the speculative store ADR 011
  deferred.
- **Ship maintained `validation-*` packages plus thin form-lib recipes.** Rejected
  for production of errors: resolvers / Standard Schema already fill that role in
  RHF/TanStack. Thin display helpers may remain only if all recipes need them.
- **Archive superseded ADRs into `architecture_records/superseded/`.** Rejected for
  now — status annotations + README index match existing practice and avoid mass
  link updates. Revisit if the flat directory becomes hard to navigate.

---

**Relates to:** [#116](https://github.com/timkindberg/formframe/issues/116) (home base),
[#117](https://github.com/timkindberg/formframe/issues/117) (seam),
[#119](https://github.com/timkindberg/formframe/issues/119) (this write-up),
ADR 008, ADR 011 (annotated), ADR 024 (annotated), ADR 037 (kept).
