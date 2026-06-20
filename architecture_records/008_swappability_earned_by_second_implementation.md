# ADR 008: Swappability Is Earned by a Second Implementation

**Date:** 2026-06-18
**Status:** Accepted
**Deciders:** Tim Kindberg

## Context

The library's prime directive is extreme swappability (any framework × validation × form-lib × UI). Designing all those seams up front requires taste and tends to produce speculative, wrong abstractions from a single example — exactly the work that needs human pairing and *cannot* be run by an autonomous loop.

## Decision

**Do not design seams speculatively. Let the second implementation force them.**

- **Phase A** — build Core + the **zero-dependency reference stack** and get the golden scenarios green, with the stubborn Core boundary as the *only* hard architectural gate:
  - Framework: **React** · Form-state: **native `<form>` + FormData** (uncontrolled, submit-time) · Validation: **none** · UI: **bare default templates**
  - A real, coherent stack — native form-state is the *uncontrolled* adapter (zero value-driven re-renders), not a placeholder.
- **Phase B** — fill/swap one slot at a time, letting each *first real adapter* carve its seam (contract tests + a fake adapter written *at that moment*). **Priority: validation and UI first** (the visible, high-investment swaps); **form libs last and optional** (ADR 011):
  - Validation → **AJV**, then **Zod** (via Standard Schema) · UI → **Chakra**, then **raw React + Tailwind** · Form-state → **RHF** / **TanStack Form** (optional — reactivity + interop)
  - Framework stays React for now (YAGNI; no second framework yet).

**Rule-of-three, enforced by the loop:** the agent may not extract an abstraction until a second real adapter demands it. To keep extraction cheap, Phase-A "everything-else" must stay **honestly decomposed into well-named files/folders** even while it cross-imports freely — so a seam extraction is "promote a folder to a package," not "untangle a hairball."

## Consequences

- **Pros:** abstractions shaped by two real cases are rarely wrong; each "add a second impl" is a concrete, testable goal — i.e. loop-friendly.
- **Cons:** Phase-A "everything-else" is intentionally monolith-ish; some rework when seams are extracted (bounded by the honest-decomposition rule).
- **Performance is a per-adapter characteristic, not a universal guarantee.** Some form libs (e.g. Formik) are inherently slow. We gate only our *own* non-degradation: the library must add no re-renders on top of the host form lib's reactivity. With RHF's field-level subscriptions, "typing in field A must not re-render field B" must hold *because we didn't break it*.

## Alternatives Considered

- **Design all seams up front** — rejected: speculative, taste-heavy, premature abstraction, and un-loopable.

---

**Relates to:** ADR 006 (adapters as the extension model), ADR 007 (modes & customization).
