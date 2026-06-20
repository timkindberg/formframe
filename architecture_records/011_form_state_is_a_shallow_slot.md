# ADR 011: Form-State Is a Shallow Slot; Validation and UI Are the Primary Swaps

**Date:** 2026-06-19
**Status:** Accepted
**Deciders:** Tim Kindberg

## Context

The original `README.md` framed the "Form Library layer" (RHF/TanStack/Formik) as a primary pluggable layer. But in a schema-driven form the end user never *sees* the form lib — it's plumbing slotted into an adapter. Validation and UI, by contrast, are visible and are where teams have strong existing investments. So which slots deserve real swap investment?

## Decision

**Form-state is a *shallow* capability slot, lower priority than validation and UI.**

- **The default form-state is a *headless* form adapter** — one that wraps no external library. The minimal headless adapter is **native `<form>` + FormData**: uncontrolled, submit-time, zero value-driven re-renders, zero dependencies. It covers the static 80%.
- **External form-lib adapters (RHF, TanStack Form) are *optional*,** justified by two things only — never "swap for its own sake":
  1. **Reactivity** — live/conditional behavior (show B when A==X, live validation errors, dirty/touched, reactive arrays) that native FormData can't do (it's submit-time only). A native adapter *could* watch blur/change events to enable some of this; a form lib does it properly.
  2. **Interop** — backing our forms with a team's existing form infrastructure (shared resolver, submit pipeline, devtools).
  We do **not** chase every form lib (no Formik-and-friends). Native + at most RHF / TanStack.
- **Validation and UI are the primary swap axes** — visible, high-investment, swapped in first (ADR 008 phasing).

**Coupling to keep honest:** *live* validation display requires reactive form-state. Submit-time validation runs on the native adapter; live validation needs a reactive adapter (a form lib, or a first-party store).

**Deferred — a first-party reactive store.** A richer *headless* form adapter (our own, or TanStack Store) would give live behavior dependency-free, but it brushes the "Core stateless, don't compete with form libs" principle and adds dependency/scope. **Defer it (YAGNI) — feel the pain that forces the reach for it** (VNDLY's live tenant rules are the likely trigger). Until then: native for static forms, an RHF/TanStack adapter when live behavior is needed.

## Consequences

- Phase A ships dependency-free (native form-state); validation and UI adapters come **before** any form-lib adapter.
- "Form-state adapter" is a spectrum: *headless* (native → first-party store) and *wrapped* (RHF/TanStack) — same slot, different depth.
- Re-prioritizes the original README's "form library layer is primary" framing; that framing is superseded.

## Alternatives Considered

- **Treat form-lib swapping as a marquee axis** (original framing) — rejected: invisible to users in the common case, high maintenance for low visible value.
- **Build a first-party reactive store now** — deferred: YAGNI until a concrete live-form need forces it.

---

**Relates to:** ADR 007 (Core stateless / form-lib owns state), ADR 008 (phasing & reference stack), the Standard Schema validation seam. **Supersedes:** the "Form Library layer is a primary pluggable layer" framing in `README.md`.
