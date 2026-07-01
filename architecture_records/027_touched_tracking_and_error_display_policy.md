# ADR 027: Touched Tracking + `showErrorsWhen` Display Policy

**Date:** 2026-06-30
**Status:** Proposed
**Deciders:** Tim Kindberg

## Context

Reactive validation (ADR 021) reports a field's issues the moment the validator
sees them — so an empty required field screams "required" before the user has
even reached it, and a half-typed email shows "invalid format" on the first
keystroke. React Hook Form (and every hand-built form worth using) avoids this
with a **display policy**: don't show a field's error until it's been *touched*
(focused then blurred), and reveal everything on submit. The maintainer wants
this behaviour; the RHF spike (ADR 024) confirmed our `Validator` seam survives
alongside a form library, so this is a native feature we own, not something we
punt entirely to an adapter.

The key insight is that **"when to validate" and "when to display" are
orthogonal**, and we already separate them:

- **When to validate** is the event the consumer wires — `onInput` (per
  keystroke), `onChange` (blur, for text), or submit-only. That is ADR 021.
- **When to display** is this ADR: a pure function of *what issues exist*, *which
  fields the user has touched*, and *the chosen policy*.

Conflating them is RHF's `mode`/`reValidateMode` tangle. Keeping them separate
means live validation can keep running for aria/summary/analytics while the
per-field error UI stays quiet until the field is touched.

## Decision

Add a **display policy** layered over the ADR 023 store, in three pieces that
mirror the ADR 023 discipline (agnostic core logic + per-path subscription + a
thin React binding).

### 1. A pure, framework-agnostic policy function

```ts
type ShowErrorsWhen = 'always' | 'touched' | 'submit'
function shouldDisplayFieldErrors(
  mode: ShowErrorsWhen,
  state: { touched: boolean; submitted: boolean }
): boolean
```

- `'always'` → `true` (report as soon as the validator produces the issue — the
  pre-027 behaviour, now the explicit opt-out).
- `'touched'` → `touched || submitted` (RHF-style: quiet until the field blurs,
  then everything on submit).
- `'submit'` → `submitted` (only after a submit attempt).

It is a total function of `(issues-exist, touched, submitted, mode)` — trivially
unit-testable, no React, no DOM. This is the "policy fn → shown paths" the work
item called for, expressed per-field so the caller stays fan-out-free.

### 2. A per-path touched store

A tiny store shaped exactly like `issueStore` (ADR 023): `getTouched(path)`
returns a **stable boolean** and `setTouched(path)` flips one path and notifies,
so marking field A touched re-renders **only** field A. `submitted` is a single
boolean that flips once (on the first submit attempt); its one-time O(fields)
re-render to reveal all errors is acceptable and intended.

### 3. React binding

- `useSchemaForm` owns `touched`/`submitted` alongside `errors` (form-state lives
  in one place), exposes a **form-level** `handleBlur` — wire
  `<form onBlur={handleBlur}>` and it marks `event.target.name` (which *is* the
  field's dot-path) touched, one handler for the whole form — and flips
  `submitted` inside `submit`.
- `ValidationProvider` gains `touched` / `submitted` / `showErrorsWhen` props
  (all optional; `showErrorsWhen` omitted ⇒ `'touched'`, the default policy) and
  mirrors them into the touched store + a small policy context, exactly as it
  already mirrors `issues` into the issue store.
- The default renderer gates on a new `useFieldErrorDisplay(path)` hook (reads the
  field's touched slice + `submitted` + `mode`): `DefaultFieldErrors` renders
  nothing until display is allowed, and the `aria-invalid`/`aria-describedby`
  wiring is gated the same way so a11y and visible state never disagree.

### Default is `'touched'`; `'always'` is the opt-out

The library default is `'touched'` — the RHF-style UX is what almost every form
actually wants, and shipping the good behaviour by default beats making everyone
opt in. `'always'` (report the instant an issue exists) stays a first-class,
one-prop opt-out for the cases that want it (live-reporting demos, dashboards,
anything that surfaces issues eagerly).

The consequence of the default being `'touched'` is that display now *depends on
state the provider must be fed*: a `ValidationProvider` only reveals a field's
error once that field is in `touched` or `submitted` is set. `useSchemaForm`
supplies both (`handleBlur` marks touched; `submit` flips `submitted`), so the
common wiring "just works". But a bare `<ValidationProvider issues={errors}>`
with no `touched`/`submitted` will now show **nothing** — pass those props (the
normal path) or `showErrorsWhen="always"` to report unconditionally.

## Consequences

- **Behaviour change, not purely additive.** Flipping the default to `'touched'`
  changes what existing consumers see: errors stay quiet until touch/submit. The
  migration is one prop — `showErrorsWhen="always"` restores the pre-027 "report
  immediately" behaviour. In-repo, feature tests that assert error *visibility*
  for a non-display reason (a11y wiring, the ADR 021 reactive suite, the ADR 023
  render-count contract) opt into `'always'` so each stays scoped to its own
  concern; submit-time and touched suites feed `touched`/`submitted` and exercise
  the new default directly.
- **Verified, not hoped.** A render-count test asserts blurring field A reveals
  only A's error and does **not** re-render sibling B, and that submit reveals all
  — the ADR 023 invariant extended to the touched dimension.
- **a11y stays coherent.** Because the aria attrs and the visible error list read
  the *same* gate, a hidden error is also not announced; a shown one is.
- **Orthogonal to validation timing.** `revalidate` (ADR 021) is unchanged; you
  can validate live and still display on touch. Display gating adds only a
  per-path touched subscription — no new whole-form work.
- **Touched display reveals an issue that *exists*.** Because "when to validate"
  and "when to display" are separate, the touched policy can only show an issue
  the validator has already produced. So pair it with **validate-on-blur** —
  `onBlur={(e) => { handleBlur(e); revalidate(e) }}` — otherwise a field the user
  tabs through without typing is marked touched but has no computed issue, and its
  error appears only once some later `revalidate` (e.g. the first keystroke in
  another field) runs the whole-form validator. `revalidate` accepts any form
  event carrying the form as `currentTarget`, so it attaches to `onBlur` as well
  as `onInput`/`onChange`.
- **Boundary held (ADR 011/024).** Native owns values + issues + **touched** +
  display policy. `dirty` / `reset` / `watch` / async / cross-field remain the
  form-library adapter's job; this ADR does not grow into a form-state engine.

## Alternatives Considered

- **Fold "when to display" into "when to validate"** (RHF's `mode`) — rejected:
  couples two independent axes and would force live validation off to get quiet
  errors. Ours keeps live validation running under a quiet display.
- **Track touched inside the issue store** — rejected: different shape and
  lifecycle (touched is monotonic per session; issues churn every pass). A
  parallel store keeps each store's invariant simple.
- **Per-input `onBlur` wiring** — rejected in favour of one form-level `onBlur`
  (focusout bubbles), matching how `revalidate` reads one form-level event; no
  per-widget plumbing, works for any custom control that sets `name`.
- **Gate only the visible list, not aria** — rejected: screen-reader users would
  hear errors sighted users don't see.

---

**Relates to:** ADR 011 (form-state shallow slot — touched is the next slice),
ADR 021 (reactive validation — produces the issues this ADR decides *when to
show*), ADR 023 (the per-path store this policy layers over), ADR 024 (native vs.
form-library-adapter boundary), ADR 013 (consumer owns the `<form>`, so blur is
wired by the consumer).
