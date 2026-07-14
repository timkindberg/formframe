# ADR 042: Validation-Run Authority, Staleness, and Failure Semantics

**Date:** 2026-07-14
**Status:** Accepted (bd `jsonschema-form-9jk.1.4`)
**Deciders:** Tim Kindberg
**Extends:** ADR 019 (side-loaded validation), ADR 021 (live validation
orchestration), ADR 023 (per-path publication stability), ADR 027 (touched
tracking and error display policy), ADR 028 (whole-document validation),
ADR 041 (async validator is a sibling seam)

## Context

ADR 041 added `AsyncValidator` as a Promise-returning sibling of `Validator` and
established that `useFormTree` — not the validator seam and not Core — owns the
relationships among concurrent validation runs. It named the vocabulary
(validation run, result, invalid result, run failure, authoritative run, stale
run) but deliberately left the operational semantics to a follow-on decision.

Once validation can be asynchronous, runs overlap in time. Live-input runs and
submit runs can be in flight together; a run can resolve out of start order; a
run can throw or reject instead of producing a verdict. Without explicit rules
a consumer can see a stale verdict flash over current input, lose the current
error picture to a transient network failure, or submit data that was never
validated.

The upstream survey (`history/2026-07-13-upstream-async-validation-contracts-research.md`)
showed the shape of the answer. TanStack Form and Final Form both separate
*staleness by run identity* from *cancellation by abort*; React Hook Form uses a
value-snapshot compare. No surveyed schema `validate` API carries an
`AbortSignal`, and none persists superseded runs. Stale-result authority is
FormFrame's to establish; cooperative cancellation is an optional, separable
concern.

This ADR fixes the authority, staleness, and failure semantics. It does **not**
decide pending-state or retained-error *timing* (deferred to `jsonschema-form-9jk.1.5`),
submit snapshot / transformed-output mechanics (`jsonschema-form-9jk.1.6`), the
public *names* of the pending and failure surfaces, or the shape of the submit
callback API (deferred to the v1 DX epic `jsonschema-form-5ss`).

## Decision

### 1. One shared-state authority track

Displayed `errors` and the run-failure surface are owned by the newest-*started*
run. Live-input runs and submit runs compete on the same track: a submit run
publishes to shared state exactly like any other run. The submit *callback*
(`onValid`) is judged independently, on the submit run's own click-time result,
not on whatever currently owns shared state. (The detailed submit-snapshot
mechanics belong to `jsonschema-form-9jk.1.6`.)

### 2. Authority rule: start-order generation counter

Authority is decided by a monotonic generation counter owned entirely by
`useFormTree`. Every run — sync or async, live or submit — increments the
counter and captures its value at the moment it *starts*. This mechanism touches
neither the `Validator` / `AsyncValidator` seam nor Core.

A value-snapshot compare (RHF-style) was rejected because it reintroduces the
value-diffing that whole-document validation (ADR 028) avoids and is fragile
against equal-but-rerun values. An abort flag was rejected because it conflates
cancellation with staleness — the separation ADR 041 requires and that TanStack
and Final Form both keep.

### 3. Staleness: supersede-on-start

A run becomes stale the instant a newer run starts, regardless of completion
order. On resolve, a run may publish only if
`capturedGeneration === currentGeneration`. A run that started earlier but
resolves first is suppressed and never touches shared state — no flash of a
verdict measured against input the user has already changed.

### 4. The generation check is one gate over all channels

The generation check is a single per-run authority gate applied once at resolve.
It governs everything a run publishes to shared state together: the `errors`
verdict, the run-failure surface, and the settle signal. A stale run is silent
on every channel. Authority is a property of the run, not of each output
channel, so a stale run can never surface a failure while its errors are
suppressed.

### 5. Cancellation is out of scope and non-load-bearing

Correctness rests entirely on the generation counter. The system is fully
correct with zero cancellation: a superseded run runs to completion, resolves,
and is dropped by the gate. No `AbortSignal` is added to the seam (honoring
ADR 041). If cooperative cancellation is added later it is a resource
optimization only — never a prerequisite for staleness and never a determinant
of authority — and an aborted run collapses into the "stale = silent" case.
Stale (and future-aborted) runs are discarded, not retained; the generation gate
is the single natural site for optional dev-only instrumentation, but no
stale-run store is specified.

### 6. Run-failure representation

When the *authoritative* run fails (throws or rejects):

- The last-known `errors` are **retained**, not cleared. A transient failure
  must not read as "now valid" when the truth is "unknown."
- The failure is exposed on a **surface separate from `errors`**, carrying the
  raw thrown/rejected reason as `unknown`. It is not merged into `errors[]` and
  not normalized into a synthetic `ValidationError` — `ValidationResult` stays a
  pure verdict (ADR 041) and per-path `errors` references stay stable
  (ADR 023).
- The failure surface obeys the same authority track (see 4). Only the
  authoritative run's failure is visible; it is cleared or replaced by the next
  authoritative publication — a later success publishes `errors: []` and clears
  the failure, a later invalid result publishes errors and clears the failure, a
  later failure replaces it.

The exact *timing* of clearing (on the next run's start vs. its completion) is
part of the retained-error question deferred to `jsonschema-form-9jk.1.5`.

### 7. Submit gating and the no-silent-submit guarantee

- A run failure is not a valid verdict, so a failing submit run **never** calls
  `onValid`. Submitting on a failed validation would accept never-validated
  input.
- A submit-run failure flows through the same authority-gated failure surface as
  a live failure; there is no separate submit-failure channel.
- `submitted` latches true on every submit attempt regardless of the outcome
  (ADR 027 display policy does not care *why* validation did not pass).
- **No-silent-submit guarantee:** every submit attempt drives observable state —
  invalid publishes `errors`, failure publishes the failure surface, `submitted`
  always latches — with zero handlers wired. This structurally avoids the
  RHF-style perceptual no-op where an unhandled invalid path produces no visible
  effect. It cannot prevent the separate "consumer never rendered the error
  surface" case; a dev-mode safeguard for that is a presentation/DX affordance,
  not a run-semantics one.

## Consequences

- `useFormTree` gains a generation counter and, at each run's resolve, a single
  authority gate deciding whether that run publishes. Pending state, retained
  errors, submit snapshots, and surface naming remain to be decided.
- The failure surface is new observable state alongside `errors`. Its public
  name is not fixed here.
- Sync validators keep publishing immediately (ADR 041): a sync run increments
  and captures the counter, so an earlier async run resolving after it is
  correctly suppressed.
- Cancellation can be layered on later with no change to any semantics decided
  here.
- A recommended default for the failure surface — logging an unhandled run
  failure to `console.error` so a thrown validator or network error is never
  swallowed — is left to the DX follow-up (`jsonschema-form-5ss`), together with
  the unified-`onSubmit` outcome-union API-shape question and a dev-mode
  no-error-UI warning.

## Alternatives Considered

- **Supersede-on-publish (latest *completed* run wins).** Rejected: a fast but
  superseded run would flash its verdict against input the user already changed.
  Supersede-on-start drops it instead.
- **Value-snapshot authority (RHF `isFieldValueUpdated`).** Rejected: reintroduces
  value-diffing that ADR 028's whole-document model avoids; fragile when the same
  value is deliberately re-validated.
- **Abort-flag authority (TanStack signal check).** Rejected as the *authority*
  mechanism because it couples cancellation to staleness; ADR 041 keeps them
  separate. Abort remains available later as an optional optimization on top of
  the generation gate.
- **Per-channel authority gates.** Rejected: would let a stale run surface a
  failure while suppressing its errors — an incoherent picture.
- **Merge failures into `errors` / a `valid:false` result.** Rejected by ADR 041:
  a failure has no verdict and no field path; synthesizing one corrupts the
  error model.
- **Clear `errors` on failure.** Rejected: reads as "now valid" when the state is
  actually "unknown"; retaining the last picture is safer.
- **A unified `onSubmit(outcome)` union / RHF-style second `onInvalid`
  callback.** Deferred to the DX epic. Because invalid and failed outcomes
  already reach observable state, the success-only callback avoids taxing the
  common case; the API-shape trade-off is a public-API decision, not a
  run-semantics one.
- **Persist stale runs for observability.** Rejected as speculative
  infrastructure; no surveyed library does it. The generation gate is noted as
  the future instrumentation site if the need is ever proven.

---

**Relates to:** ADR 008 (a seam is earned by a second implementation), ADR 020
(shared validation contract), `jsonschema-form-9jk.1` (async validation
semantics map), `jsonschema-form-9jk.1.5` (pending and retained-error behavior),
`jsonschema-form-9jk.1.6` (submit snapshots and transformed output),
`jsonschema-form-5ss` (v1 DX finish).
