# ADR 044: Pending State, Retained Errors, and Store Ownership

**Date:** 2026-07-14
**Status:** Accepted (bd `jsonschema-form-9jk.1.5`)
**Deciders:** Tim Kindberg
**Extends:** ADR 011 (form-state is a shallow slot), ADR 023 (per-path
publication stability), ADR 027 (touched tracking and error display policy —
**refined** here), ADR 028 (whole-document validation), ADR 042 (validation-run
authority, staleness, and failure), ADR 043 (submit snapshots and `isSubmitting`)

## Context

ADR 042 fixed which validation run is authoritative and established that a
run's verdict publishes to shared state only at **resolve** (supersede-on-start).
It deferred to this issue the *timing* of clearing/replacing errors during the
window between a newer run's start and its resolution, and the observability of
"a verdict is being computed."

Once validation is asynchronous, that pending window is real and visible: a user
edits, a new run starts, and some time passes before a verdict lands. Two
questions follow — what happens to the errors already on screen during that
window, and how does a consumer even observe that a run is in flight — plus a
third that the maintainer raised as non-negotiable: none of this may cost a
re-render in a field whose rendered output did not change.

## Decision

### 1. Stale-while-revalidate: retained errors, held as-is

While a newer validation run is pending, the currently displayed errors **remain
visible, unchanged**, holding the last authoritative verdict until the pending
run resolves and publishes a replacement. Errors are never blanked at a new
run's *start*.

Clearing on start was rejected for the same reason ADR 042 §6 rejected clearing
on failure: a transient blank reads as "now valid" when the truth is "unknown,"
and it fights the authority model, which already only swaps errors at resolve.

Staleness is **not** a third data state on the errors. The canonical error data
stays a clean "last authoritative verdict." A consumer that wants to visually
mark stale errors (dim, annotate, spinner-over) composes that itself from
`errors` + `isValidating` (§3). We expose the signal, not a pre-baked stale mode.

### 2. Resolve replaces the whole-document verdict, written per-path diff-wise

On resolve, the authoritative run replaces the verdict, but the replacement is
written into the per-path store **diff-wise** (ADR 023), never as a blanket swap:

- **success** → every path's errors become the shared stable-empty reference;
  only paths that *had* errors change snapshot, so only they re-render.
- **invalid** → the new error set is written per path; a path whose error is
  unchanged keeps its **existing stable reference**, so a field whose error text
  did not change does not re-render even though a new run published.
- **failure** (ADR 042 §6) → errors are retained untouched (no path changes → no
  field re-renders), the failure surface is set, and `isValidating` decrements.

### 3. `isValidating`: a form-scope, reference-counted "verdict in flight"

The native form-state exposes an `isValidating` boolean:

- **Reference-counted, derived boolean.** A store-internal counter tracks
  in-flight validation runs; `isValidating` is `count > 0`. A bare boolean breaks
  under overlap (a live run and a submit run, or two rapid live runs) — the first
  resolver would read "settled" while another run is pending. The counter is
  store-internal; the hook exposes only the boolean.
- **Any-origin.** `isValidating` means "a verdict is being computed," regardless
  of whether the run is live or a submit run's validation phase. During a submit,
  `isValidating` is true through validation, then drops when the verdict resolves;
  `isSubmitting` (ADR 043) continues on through the async `onValid`. The two
  overlap by design, and `isSubmitting` is the strict time-superset.
- **Form scope only; no per-field pending.** Validation is whole-document
  (ADR 028), so "a verdict is being computed" is a form-scope fact — there is no
  independent per-field pending truth. A field wanting a per-field spinner reads
  the same form-scope signal; we do not manufacture false per-field granularity.

### 4. Ownership: all form/validation state lives in the store, read via selectors

The store (ADR 023 discipline: framework-agnostic store + per-slot subscription +
thin React binding, read through `useSyncExternalStore`) is **the** state place.
Everything lives there:

- per-path `errors`, per-path `touched`,
- form-scope `submitted` (latched "was a submit ever attempted"),
- form-scope `isSubmitting` (in-flight submit count, ADR 043),
- form-scope `isValidating` (in-flight validation-run count, §3).

`submitted` and `isSubmitting` are distinct pieces of state (a monotonic latch vs.
a rising/falling count) and both live in the store. This resolves the `9jk.1`
map's open "hook-level vs store" question decisively toward **store** — nothing
rides in broadcast React context, because a context value flip re-renders the
whole subtree beneath the provider (React Hook Form's original re-render problem,
which it later escaped via subscription reads).

Signals are read through dedicated selector hooks — `useIsValidating()`,
`useIsSubmitting()`, the existing per-path error/touched hooks — so only
components that *read* a signal and whose derived snapshot *changed* re-render.

### 5. No wasted re-render, including the submit reveal (refines ADR 027)

ADR 027 accepted a one-time O(fields) re-render when `submitted` flips on submit
(to reveal all errors). **This ADR tightens that to zero waste.** No field
subscribes to raw `submitted`; each field subscribes via a selector returning
*its own effective displayed errors* — already gated by the ADR 027
`showErrorsWhen` policy — with a **stable empty-array reference** for the
no-error case. When `submitted` flips, `useSyncExternalStore` recomputes each
subscribed field's snapshot, but only fields that **actually have an error to
reveal** see a changed snapshot and re-render; a clean field's snapshot stays the
same frozen `[]` and React bails. "Reveal all on submit" therefore costs
O(errored fields), never O(fields).

The invariant, stated once for the whole form: **the only components that
re-render on any status or verdict change are those whose rendered output
actually changed.** `submitted`, `isSubmitting`, `isValidating`, and every
verdict replacement obey it.

## Consequences

- The validation store gains form-scope slots (`submitted`, `isSubmitting`,
  `isValidating`) alongside its per-path slices, plus selector hooks. Reference
  counts for the two in-flight signals are store-internal.
- `submitted` moves off plain hook state/context into the store; the per-field
  error-display selector folds `submitted` in, so ADR 027's O(fields) submit
  sweep is superseded by an O(errored-fields) one.
- `useFormTree` drives the store: each run start increments `isValidating`; each
  resolve performs the §2 diff-wise write and decrements; submit start/settle
  drives `isSubmitting` (ADR 043); the first submit latches `submitted`.
- Stale-error styling is a consumer/presentation composition over `errors +
  isValidating`; no stale data state is added.
- A form-level `ValidationSummary` (ADR 027) is a single component and may read
  `submitted`/`errors` directly — O(1) components, not O(fields).
- Public *names* for `isValidating` / `isSubmitting` are finalized with the other
  surface names in the DX epic (`5ss`); the spellings here are provisional.

## Alternatives Considered

- **Clear errors on the new run's start.** Rejected: transient "no errors" reads
  as valid during an async round-trip (ADR 042 §6 logic); fights the
  publish-at-resolve authority model.
- **A first-class stale-marked error state.** Rejected: bakes UI intent into the
  canonical error data; consumers derive staleness from `errors + isValidating`.
- **`isValidating` scoped to live runs only.** Rejected: then "is a verdict being
  computed?" has no single truthful answer and a form spinner must OR two signals.
- **Per-field pending state.** Rejected: validation is whole-document (ADR 028);
  per-field pending would be false granularity.
- **Bare-boolean pending signals.** Rejected: break under overlapping runs;
  reference counting is required.
- **Pending state as hook state / React context.** Rejected: a context flip
  re-renders the whole subtree — the RHF footgun. The store + `useSyncExternalStore`
  selector reads confine re-renders to genuine subscribers.
- **Accept ADR 027's one-time O(fields) submit sweep.** Rejected per maintainer
  directive: "one-shot" is no excuse to re-render a field whose output did not
  change. Folding `submitted` into per-field display selectors makes the reveal
  O(errored fields).

---

**Relates to:** ADR 011 (shallow form-state slot — `isValidating`/`isSubmitting`
are the native floor's two honest in-flight signals, ceded to a form-state owner
when present), ADR 023 (per-path store + reference stability this leans on),
ADR 027 (display policy — its O(fields) submit sweep refined here), ADR 028
(whole-document validation), ADR 042 (authority/staleness/failure — its deferred
clear/replace *timing* decided here), ADR 043 (`isSubmitting`, whose read
mechanics this places in the store), `jsonschema-form-9jk.1` (async validation
semantics map), `jsonschema-form-9jk.1.8` (final ratification), `jsonschema-form-5ss`
(v1 DX finish — final surface names).
