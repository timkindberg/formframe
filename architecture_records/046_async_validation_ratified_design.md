# ADR 046: Async Validation — Ratified Design and Implementation Test Matrix

**Date:** 2026-07-14
**Status:** Accepted (bd `jsonschema-form-9jk.1.8`)
**Deciders:** Tim Kindberg
**Consolidates:** ADR 041 (async validator is a sibling seam), ADR 042
(validation-run authority, staleness, and failure), ADR 043 (submit snapshots and
`isSubmitting`), ADR 044 (pending state, retained errors, store ownership),
ADR 045 (async Standard-Schema interop and conformance)
**Builds on:** ADR 019 (side-loaded validation), ADR 020 (contract suite),
ADR 023 (per-path store + reference stability), ADR 025 (purity/transformed data),
ADR 026 (Standard Schema at the boundary), ADR 027 (display policy), ADR 028
(whole-document validation)

## Context

The `jsonschema-form-9jk.1` map broke "evolve the Validator seam to support async
validation with stale-result protection" into six decisions (`9jk.1.1`–`9jk.1.7`),
recorded across ADRs 041–045. This ADR is the **final ratification** (`9jk.1.8`):
it asserts that those decisions compose into one implementation-ready design with
no unresolved behavior, reconciles the pieces where they intersect, and fixes the
implementation test matrix. It introduces **no new decisions** and does **not**
implement the feature.

## Decision

### 1. The design is ratified as implementation-ready

ADRs 041–045 are internally consistent and jointly complete. The only items left
open are **public surface names** for `isValidating`, `isSubmitting`, and the
run-failure surface, deferred to the DX epic (`5ss`) by design. These are not
blockers: implementation proceeds on provisional names, and renaming later is
mechanical.

### 2. Three counters, one owner (`useFormTree`), no conflation

| Counter | Kind | Purpose | Source |
| --- | --- | --- | --- |
| `generation` | monotonic id | authority / staleness — *which* run may publish | ADR 042 |
| `isValidating` | in-flight count | observable "a verdict is being computed" | ADR 044 |
| `isSubmitting` | in-flight count | observable submit lifecycle through async `onValid` | ADR 043 |

`generation` decides **publication rights**; the two reference counts drive
**observable booleans** (derived `count > 0`). They coexist without conflict and
are all owned by `useFormTree`, with the booleans living in the ADR 023 store and
read via `useSyncExternalStore` selectors (ADR 044).

### 3. Canonical submit lifecycle (one async submit)

The point where ADR 042, 043, and 044 all act at once. For a submit whose
validator and `onValid` are both async:

- **click** — `submitted` ← true (latches, ADR 042 §7); `generation` ← ++g (capture
  `g`); `isValidating`++; `isSubmitting`++; the FormData snapshot is assembled
  synchronously (ADR 043 §1).
- **validation resolves** — `isValidating`-- unconditionally. **Publication is
  gated** (ADR 042): if `g === currentGeneration`, `errors` is replaced diff-wise
  and the failure surface set/cleared; if superseded, the run is silent on every
  channel. **`onValid` is ungated** (ADR 043 §3), judged on this run's *own*
  verdict: valid ⇒ `onValid(result.data ?? snapshot)` with `isSubmitting` still
  raised; invalid or failure ⇒ no `onValid`, and `isSubmitting`--.
- **`onValid` settles** (resolve or reject) — `isSubmitting`--. A rejection is the
  consumer's concern and is **not** routed through the run-failure surface
  (ADR 043 §5).

**Load-bearing consequence:** a *superseded* submit publishes nothing to `errors`
(gate) yet **still fires `onValid`** with its click-time data (ungated) — the form
may hand validated data to the consumer while the visible errors belong to a newer
run. Double-submit is this same flow twice, each with its own `g` and snapshot,
`isSubmitting` counting 2; both may fire `onValid`.

### 4. Retained errors compose with authority

Stale-while-revalidate (ADR 044) and supersede-on-start (ADR 042) compose cleanly:
errors hold the last authoritative verdict through the pending window and are
replaced only when a **still-current** run resolves. A superseded run never
touches them. Replacement is per-path diff-wise (ADR 023), so only genuinely
changed fields re-render; the submit reveal costs O(errored fields), not O(fields)
(ADR 044 §5, refining ADR 027).

### 5. Implementation test matrix

The gate suite (ADR 009) must cover, grouped by source decision:

**Seam (ADR 041, 045)**
- A sync `Validator` publishes immediately; an `AsyncValidator` is awaited before
  publish.
- The single `useFormTree({ validator })` slot accepts either and branches on the
  **result's Promise-shape**, never on validator identity/origin.
- `createZodAsyncValidator` validates an async Zod schema in one `safeParseAsync`
  pass and preserves `keyword` (Zod `issue.code`).
- `fromStandardSchemaAsync` consumes sync **and** async Standard schemas uniformly
  (single execution); `toStandardSchemaAsync` emits a Promise-returning
  `~standard.validate`.
- Sync `fromStandardSchema` still **throws** on a Promise-returning schema.

**Authority / staleness (ADR 042)**
- An earlier-started run that resolves *after* a newer run started is dropped
  (supersede-on-start), touching no shared state.
- The generation check is one gate over `errors` + failure + settle together — a
  stale run is silent on every channel.
- A sync run increments and captures the counter, so an async run that started
  earlier and resolves later is correctly suppressed.

**Pending (ADR 044)**
- `isValidating` is reference-counted, any-origin, `true` while ≥1 run is in
  flight, `false` at zero.
- No per-field pending: a field reads the form-scope signal.
- Flipping `isValidating`/`isSubmitting` re-renders only components that read them
  (store + `useSyncExternalStore`), not the whole form.

**Retained errors (ADR 044)**
- While a newer run is pending, prior errors stay visible unchanged (never blanked
  at start).
- Resolve replaces diff-wise: success ⇒ shared empty ref; invalid ⇒ new set with
  unchanged paths keeping their references; failure ⇒ errors retained.
- Only fields whose displayed errors changed re-render; the submit reveal is
  O(errored fields).

**Submit (ADR 043)**
- The validator sees the click-time assembled snapshot, never a resolve-time
  re-read.
- `onValid` receives `result.data` when present, else the snapshot, only on the
  submit run's own valid verdict.
- A superseded submit suppresses `errors` yet still fires `onValid` with click-time
  data.
- Two overlapping submits each fire `onValid` on their own snapshot;
  `isSubmitting` counts 2 and clears at 0.
- `onValid` may return a Promise; `isSubmitting` spans it; a rejection clears
  `isSubmitting` without touching the run-failure surface.
- `submitted` latches on every attempt; no-silent-submit (every attempt drives
  observable state).

**Failure (ADR 042)**
- An authoritative run failure retains the last `errors` and sets a separate
  failure surface carrying the raw reason (`unknown`).
- A stale run's failure is silent.
- The next authoritative publication clears/replaces the failure (success ⇒ `[]` +
  clear; invalid ⇒ errors + clear; failure ⇒ replace).

**Conformance (ADR 020, 045)**
- The validator-agnostic suite runs its per-call invariants (purity, no-aliasing,
  verdict, transformed value) in an async mode over `AsyncValidator`s, including
  `fromStandardSchemaAsync` and `createZodAsyncValidator`.
- ADR 042 ordering/staleness assertions live in `useFormTree` tests, not the
  per-call suite.

**Cancellation (ADR 042 §5)**
- Correctness holds with zero cancellation: a superseded run runs to completion,
  resolves, and is dropped by the gate; no `AbortSignal` on the seam.

## Consequences

- Implementation of the async validation feature may begin against this matrix;
  it is the "done" oracle for the `9jk.1` work handed to the Validation track.
- The `9jk.1` map is fully resolved (all children `9jk.1.1`–`9jk.1.8` closed).
- Provisional names (`isValidating`, `isSubmitting`, failure surface) are the only
  deferred item, owned by `5ss`; implementation should treat them as rename-later.

## Alternatives Considered

- **Fold the ratification into one of ADRs 041–045.** Rejected: the value of the
  ratification is the *cross-ADR* reconciliation (three counters, the submit
  lifecycle) and the single test matrix, which no individual decision ADR owns.
- **Block implementation until surface names are fixed.** Rejected: names are a DX
  concern (`5ss`), mechanical to change, and independent of every behavior above;
  blocking on them would stall implementation for no correctness gain.
- **Re-open any of 041–045 during ratification.** Not needed: the completeness pass
  found the pieces consistent; the superseded-submit-still-fires-`onValid`
  interaction is the only subtle composition and is now explicit (§3).

---

**Relates to:** the whole `9jk.1` async-validation map and ADRs 041–045 it
consolidates; ADR 009 (the gate suite this matrix feeds); `jsonschema-form-5ss`
(v1 DX finish — final surface names, unified `onSubmit` shape); `jsonschema-form-8f6`
(submit-outcome API-shape and no-error-UI safeguards). Hands a resolved,
test-mapped design to the Validation implementation track.

---

## Post-implementation review addendum (2026-07-15)

After the feature landed (PR #71), a tri-lens library review (adversarial /
type-DX / library-author — full record in
`history/2026-07-15-9jk-async-validation-tribe-review.md`) audited the shipped
surface. All three verdicts were ship-with-fixes; no design decision above was
reopened. The fixes applied in response:

- **Single async detector (soundness).** Async branching went through
  `instanceof Promise` in the sync `fromStandardSchema` but a `.then` duck-type in
  the store — so a cross-realm/library **thenable** could slip through sync
  consume and read as a false valid verdict. Both now use one exported
  `isThenable` in Core (§ Seam, ADR 041/045).
- **`ValidationResult` is a discriminated union on `valid`** with `data?: never`
  on the invalid arm; the submit-time `as Output` is documented as an intentional
  assertion boundary (see ADR 025 addendum, 2026-07-15).
- **Reference-count floor.** `statusStore` `decValidating`/`decSubmitting` now
  no-op at zero, so a double-settle bug can't drive a count negative and wedge a
  pending boolean (§ Pending, ADR 044).
- **Failure DX + coverage.** Added `formatValidationFailure(unknown): string|null`
  beside `useValidationFailure`, and a React-level test asserting a rejecting
  validator surfaces through the hook (the matrix's Failure row previously had
  only store-level coverage).
- **Docs truth.** README now leads with the batteries-included bound
  `SchemaFields`, documents the **superseded-submit-still-fires-`onValid`** hazard
  (§3 above) with a "disable submit while pending" guard, and documents that
  `onValid` rejections are the consumer's concern (§3). Stale JSDoc/comments
  (`Validator` "async is future", `displayPolicy` referencing the removed
  `validation`) were corrected. (No migration note is warranted — nothing is
  published yet.)

**Deferred (captured, not blocking):** a per-field double-subscription micro-cost
in the default field renderer; `FormStoreProvider` erasing the `Output` generic;
the `Output` default differing between `useFormTree` (`Record<string, unknown>`)
and `createFormStore` (`unknown`); and an optional future `onSubmitError` /
`AbortSignal`-on-submit for unmount-during-flight. These are ergonomics/among the
`5ss` DX-finish and `8f6` submit-outcome threads, not correctness gaps.
