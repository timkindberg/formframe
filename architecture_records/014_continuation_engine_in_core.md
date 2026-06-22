# ADR 014: The Continuation Engine Belongs to Core — One Fold, Many Result Types

**Date:** 2026-06-21
**Status:** Accepted
**Deciders:** Tim Kindberg

## Context

ADR 010 introduced recursive **continuation rendering** (`renderNode` + `node.Default`/`Children`/`child`/`parts.X.Default`) and implemented it in the React package. ADR 008 then said a seam is only real once a **second implementation** forces it. The `@jsonschema-form/vanilla` probe (a no-framework, string-output renderer) was that second implementation, and the cross-framework conformance suite (bead 0mw) proved the two renderers emit **byte-identical normalized DOM** for the same tree — across widgets, nested groups, arrays, and `renderNode` overrides.

That left two renderers carrying a **duplicated continuation algorithm**: enrichment (attaching the re-entry handles to a node), the recursion, child-path resolution, and scoping. The markup differed (JSX vs strings) but the *fold* was the same function written twice. Per the vanilla findings, the **algorithmic** duplication dominated; the markup duplication was small. Duplicated logic that two renderers must keep in lockstep is exactly what drifts and breaks conformance.

So the seam is earned. The fold is Core's job anyway: the README frames Core as "the form-tree IR **plus the recursive fold over it**," and `walk<R>` (ADR 005) is already a generic, handler-inheriting fold. The continuation engine is `walk<R>` made **re-entrant** — same eager fold, but every node is handed to a `resolver` that may hijack it or call back in.

## Decision

### 1. Core owns a generic continuation engine

`createContinuation<R>(adapter)` lives in `@jsonschema-form/core`, generic over the renderer's **result type `R`**. The engine owns:

- **enrichment** — wrapping a Core node with `Default` / `Children` / `child` / a keyed `children` map / `parts.X.Default`;
- **recursion** — dispatch on `isField` / `isGroup` / root / array;
- **scoping** — the active resolver is threaded as a plain parameter down the fold (`Default({ renderNode })` re-threads it for a subtree).

The enriched-node types (`ENode<R>`, `EField<R>`, `EGroup<R>`, …) and `Resolver<R>` are Core types. Adapters alias them: React at `R = ReactNode`, vanilla at `R = string`.

### 2. An adapter supplies only the `R`-specific surface

```ts
interface ContinuationAdapter<R> {
  field(node: EField<R>, overrides?): R          // compose a field's parts
  group(node: EGroup<R>, children: R): R         // a non-root group's shell
  part(name: string, data: object): R            // one part's default markup
  combine(children: ChildResult<R>[]): R         // React: keyed fragment; vanilla: concat
}
```

That is the whole framework-specific footprint: the default **template-set** and how to **combine** children. Root groups are transparent (their default is just their children); arrays/array-items are structural pass-throughs for now (interactivity deferred). `useSchemaForm` and `renderToString` stay as the per-framework entry points and form chrome.

### 3. The headline finding: React's Context was incidental, not essential

The React engine previously used a `RenderNodeContext` to scope `renderNode` to a subtree, because each node rendered as its own lazy component and had to *discover* the active resolver. With the engine, each node's `Default`/`Children` **closes over the resolver at enrich time**, so a lazily-rendered `<node.Default/>` already carries the right (possibly scoped) resolver — **no Context**. Scoping is just **parameter threading**, i.e. `walk`'s handler-inheritance (ADR 005), realized in React by closures instead of a provider.

So the **eager string fold (vanilla) and the lazy React fold are the same algorithm**. We treat vanilla's eager fold as the **reference semantics** — it is the simplest, most direct reading of the continuation contract — and React as a **conforming** implementation whose laziness is an internal detail. The conformance suite is what licenses that claim: we proved equivalence *first*, then extracted, so the extraction could not silently change behavior.

### 4. Conformance is the enabling safety net, not an afterthought

This refactor crosses the Core boundary and rewrites both renderers. It was safe to do unsupervised only because the gate proved React ≡ vanilla before and after. Conformance graduates from "nice cross-check" to **the precondition for moving shared logic into Core**.

## Consequences

- **One source of truth for the fold.** Enrichment/recursion/scoping live once in Core. Renderers shrank to a template-set + `combine`; React lost its Context, `Resolve`, and `NodeChildren` plumbing.
- **The IR's mandate is now literal.** Core is "the tree **plus the fold**"; `createContinuation` is the fold, `walk` its non-re-entrant sibling. A future Vue/Solid/vanilla-DOM adapter implements `ContinuationAdapter<R>` and inherits the algorithm — and must pass conformance.
- **Markup duplication remains, deliberately.** The per-kind default markup still exists twice (JSX vs strings). That is `R`-specific and small; unifying it behind an abstract `h(tag, attrs, …children): R` hyperscript (which would also fold ADR 013's template-set into Core) is a *separate*, not-yet-earned move — a third target, now a smaller prize than the algorithm was.
- **Open items unchanged.** Arrays/array-items are still pass-through and submit chrome is still hand-placed (ADR 013 open questions stand). Parts-overrides are now uniformly supported by the engine, so vanilla gained them for free.

## Alternatives Considered

- **Leave the algorithm duplicated in each renderer** — rejected: it is the high-drift, conformance-breaking duplication; ADR 008's rule-of-three is satisfied.
- **Unify the markup too, via an abstract `h`** — deferred: the markup duplication is small, and a hyperscript powerful enough for React (keys, fragments, future event handlers/refs) is a real new seam that the current two implementations don't yet force.
- **Keep React's Context for scoping** — rejected: the probe showed it was incidental; dropping it removed code and unified the two renderers on one algorithm.
- **Generalize over a "scheduler" so the engine itself is lazy or eager** — rejected as over-engineering: laziness is React's private concern (closures already carry the resolver); the engine stays eager and simple.

---

**Relates to:** ADR 005 (`walk<R>` — the non-re-entrant fold this generalizes), ADR 008 (swappability earned by a second implementation — the vanilla probe), ADR 010 (continuation rendering — the contract, formerly React-only, now Core), ADR 012 (typed IR; the discriminated `EField<R>` mirrors `FieldNode`), ADR 013 (engine vs template-set decomposition — this realizes the engine half; the injectable template-set/`h` unification remains deferred).
