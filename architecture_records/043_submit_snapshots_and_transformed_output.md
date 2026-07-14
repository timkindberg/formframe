# ADR 043: Submit Snapshots, Transformed Output, and `isSubmitting`

**Date:** 2026-07-14
**Status:** Accepted (bd `jsonschema-form-9jk.1.6`)
**Deciders:** Tim Kindberg
**Extends:** ADR 011 (form-state is a shallow slot), ADR 019 (side-loaded
validation), ADR 025 (validator purity and transformed data), ADR 027 (touched
tracking and error display policy), ADR 041 (async validator is a sibling seam),
ADR 042 (validation-run authority, staleness, and failure)

## Context

ADR 042 fixed how concurrent validation runs compete for shared state (a
start-order generation counter, supersede-on-start staleness, one gate over all
channels) and established the principle that a submit **callback** is judged on
its own click-time result, independently of whatever owns shared state. It
deliberately deferred the *mechanics* of submit snapshots and transformed-output
delivery to this ADR.

Once submit validation can be asynchronous, a window opens between the submit
event and its resolution. During that window the user can edit fields, a live
run can start and supersede the submit run for shared state, and a second submit
can fire. This ADR pins the mechanics precisely enough to be implementation- and
test-ready. It does **not** re-decide the authority model (ADR 042), the seam
(ADR 041), or purity (ADR 025).

## Decision

### 1. The submit snapshot is the click-time assembled object

A submit run validates the plain object assembled **synchronously at the submit
event**, by reading `FormData` off the form and running the existing assembly
(omit-empty, force-array, checkbox, unflatten). That frozen snapshot — never a
resolve-time re-read of the DOM — is what the (possibly async) validator sees and
what flows onward. This is the only coherent choice under async: the form may
have changed or unmounted by the time the validator resolves, and the user was
never shown a verdict against those later values. (Restates `9jk.1.2` /
ADR 042 §1 as a hard contract; matches today's sync code.)

### 2. Transformed output reaches `onValid` from the click-time verdict

When a submit run's **own** result is valid, `onValid` is called with
`result.data` when the validator provides transformed output, else the click-time
snapshot (ADR 025 fallback). The value is always fresh and never a reference to
caller input (ADR 025 purity). Because the transformed data is computed from the
click-time snapshot, it is internally consistent with what was validated even
though it is delivered at resolve time and may no longer match the visible form.
`onValid` fires only for a valid verdict; an invalid verdict or a run failure
never calls it (ADR 042 §6–7).

### 3. The submit run is dual-natured: gated publication, ungated callback

A submit run plays two decoupled roles:

- **As a validation run**, it publishes `errors` / the failure surface to shared
  state through the *same* generation gate as any run (ADR 042 §2–4). A submit
  run superseded by a later run has its shared-state publication **suppressed**.
- **As a submit**, it drives `onValid` off its **own click-time verdict,
  ungated by authority**.

Consequently a superseded submit still calls `onValid` with its click-time
(transformed) data *even while the visible `errors` belong to a newer run*. This
decoupling — gated shared-state publication, ungated callback — is the crux
mechanic: authority governs what the form *displays*, not whether a submit the
user already committed to is *honored*.

### 4. Double-submit is allowed; the consumer prevents it

Overlapping submits are permitted. Each captures its own click-time snapshot,
validates independently, and each valid one calls `onValid` with its own data —
concurrently in flight if the validators and callbacks are async. The library
adds **no** submit-in-flight gating. Preventing a duplicate submit is the
end-developer's responsibility, done by disabling the submit control while a
submit is in progress. That obligation is what earns the `isSubmitting` signal
(§5).

### 5. `isSubmitting`: reference-counted, spanning the async callback

The native form-state exposes an `isSubmitting` signal, form-scoped:

- **Reference-counted, not a bare boolean.** A counter tracks submits in flight;
  `isSubmitting` is the derived `count > 0`. A plain boolean breaks under
  overlap: with submits A and B in flight, A resolving would flip the flag false
  and re-enable the control while B is still running.
- **The window spans the whole submit, including the async callback.** A submit
  counts as "in flight" from the submit event until its `onValid` **settles**
  (resolves or rejects). A submit whose validation comes back invalid or failed
  clears immediately, with no `onValid`. Covering the callback is the point: if
  `isSubmitting` dropped the instant validation passed, the disabled control
  would re-enable while the consumer's API call was still running, defeating the
  double-submit guard it exists to power.
- **`onValid` is therefore awaitable:** `(data) => void | Promise<void>`. A
  returned promise extends the in-flight window until it settles.
- **`onValid` rejection** decrements the counter like any settle but is otherwise
  the consumer's concern. It is **not** routed through the validator
  run-failure surface of ADR 042 §6 (that surface is for validator throws /
  rejections producing no verdict). Any first-class "submit callback failed"
  affordance is deferred to the DX epic `5ss`.

### 6. `isSubmitting` is distinct from validation-pending

`isSubmitting` describes the **submit lifecycle** (click → callback settle). It
is *not* the general validation-pending state — the "a run is computing a
verdict" signal for any run, live or submit — which `9jk.1.5` decides. A submit's
validation-pending window is a *sub-interval* of its `isSubmitting` window (the
latter extends through the async callback). The two are different surfaces and
must not be collapsed. Final public names for `isSubmitting` and the
`9jk.1.5` pending / failure surfaces are fixed together in `5ss`; `isSubmitting`
is provisional (a `submitting` spelling parallel to the existing `submitted`
latch is the leading alternative).

### 7. This is the native floor, ceded to a real form-state owner

Per ADR 011 the form-state slot is shallow: native `<form>` + `FormData` is the
default, and RHF / TanStack are optional owners. `isSubmitting`, the submit
snapshot, and callback dispatch defined here are the **native default's**
behavior — the floor for consumers who do *not* bring a form library. When RHF
or TanStack occupies the form-state slot, it owns submit orchestration and its
own submitting flag, and this native path steps aside. This is deliberately a
minimal native floor, not an attempt to reproduce RHF's breadth.

## Consequences

- `useFormTree` gains an in-flight submit counter and derives `isSubmitting`
  from it; `submit(onValid)` awaits an async `onValid` to bound the window.
- The submit callback type widens to `(data) => void | Promise<void>`
  (backward compatible: a `void` return settles synchronously).
- The dual-role rule means the existing "submit run publishes `errors`" behavior
  is now explicitly gated by the ADR 042 generation counter, while `onValid`
  dispatch bypasses that gate — two code paths off one run.
- No submit-in-flight gating is added; the double-submit guard lives in consumer
  UI wired to `isSubmitting`.
- Naming of `isSubmitting` and the pending/failure surfaces converges in `5ss`.

## Alternatives Considered

- **Resolve-time DOM re-read for the submit snapshot.** Rejected: incoherent
  under async (form may have changed/unmounted; user saw no verdict for those
  values). Click-time capture is forced by ADR 042 §1.
- **Gate `onValid` on the submit run still being authoritative.** Rejected: would
  refuse to honor a submit the user committed to just because they kept typing.
  ADR 042 §1 chose click-time callback independence; §3 here makes the mechanic
  explicit.
- **Library-level double-submit gating (ignore/queue the second submit).**
  Rejected: over-reach for the native floor; the consumer disabling the control
  via `isSubmitting` is simpler and matches how form libraries already work. Any
  richer submit-queue policy belongs to a form-state owner, not the native path.
- **Plain-boolean `isSubmitting`.** Rejected: breaks under overlapping submits;
  reference counting is required for a correct "any in flight" signal.
- **`isSubmitting` covers only validation, not the callback.** Rejected: the
  control would re-enable before the API call finished, defeating the guard.
- **Route `onValid` rejection through the ADR 042 failure surface.** Rejected:
  that surface represents a validator producing no verdict; a rejected consumer
  API call is a different concern, deferred to `5ss`.

---

**Relates to:** ADR 011 (shallow form-state slot — the native floor this
extends), ADR 025 (transformed-output contract this delivers),
ADR 041 (async sibling seam), ADR 042 (authority/staleness/failure this builds
on), `jsonschema-form-9jk.1` (async validation semantics map),
`jsonschema-form-9jk.1.5` (validation-pending and retained-error behavior —
distinct from `isSubmitting`), `jsonschema-form-9jk.1.8` (final ratification),
`jsonschema-form-5ss` (v1 DX finish — final surface names, unified `onSubmit`
shape, submit-callback-failure affordance).
