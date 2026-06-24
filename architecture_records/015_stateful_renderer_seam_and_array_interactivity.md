# ADR 015: The Stateful-Renderer Seam — Identity-Stable React Fold + Array Interactivity

**Date:** 2026-06-23
**Status:** Accepted
**Deciders:** Tim Kindberg

## Context

ADR 014 moved the continuation fold into Core and left two open items it called out explicitly: **arrays/array-items were structural pass-throughs** (no add/remove UI), and the React fold rendered each node as a fresh `<node.Default/>` lazy component. Closing the first surfaced a latent defect in the second.

**The red flag.** Because `enrich` mints a fresh `Default` closure every time it runs, `<node.Default/>` had a **new component-type identity on every render**. React reconciles by type, so any re-render above the form (or any array state change) **remounted whole subtrees** — destroying uncontrolled `<input>` DOM and **wiping the user's typed-in values**. A schema-driven form library that loses input on an unrelated re-render is not shippable. The fix had to make the React output behave like a **hand-crafted React tree**: a state change re-renders only the nodes that actually changed; everything else keeps its identity (and its DOM, and its value).

This is the kind of thing ADR 008 says a second implementation should force, and bead **bi4** (array add/remove) was that forcing function: arrays *need* local state, and you cannot build trustworthy array state on a fold that remounts on every tick.

## Decision

A small set of **engine seams** plus a **React-only stateful layer**. None of it touches the string oracle (vanilla stays eager and stateless), so cross-framework conformance (ADR 008) still holds as a *markup* contract.

### 1. `renderChild` — a recursion-strategy seam in Core

`createContinuation<R>(adapter, { renderChild? })`. `renderChild(childCore, resolver)` is *how the fold renders one child*. Default is the eager fold (`resolve` inline) — exactly what vanilla wants. React overrides it to emit a **memoized per-node component** that calls back into `resolve`. Same algorithm, two evaluation strategies; output must match (conformance).

### 2. `NodeRenderer` — the identity-stable React unit

React renders the tree as a module-stable, `React.memo`'d `NodeRenderer`, one per node, `path`-keyed (via `combine`), with a referentially-stable `core` prop (the tree is memoized upstream). So:

- an unrelated parent re-render **bails out** at the root `NodeRenderer` — no remount, values preserved;
- a localized state change re-renders only the affected node; stable-`core` siblings bail.

**Resolver flows as a prop, not via Context.** This *extends* ADR 014's headline finding ("Context was incidental for scoping"): the engine already threads the (possibly scoped) resolver as a parameter, so `renderChild` hands it to `NodeRenderer` as a prop. Scoped `renderNode` works for free; a stable resolver (the common case) lets `memo` bail. A Context for the resolver would *fight* scoping (it would need injected provider boundaries) for no memo benefit — both prop and Context re-render equally under an inline `renderNode`. So: still no resolver Context, consistent with 014.

### 3. Arrays/array-items are first-class kinds now

`partKind` covers all four kinds; `array.root`/`arrayItem.root` compose like `group.root` — `{ node, children }`, where the add/remove controls are *parts* (`array.addButton`, `arrayItem.removeButton`) composed from `node.parts`. The default set (React + vanilla) emits identical markup; this closes ADR 014's "arrays are pass-through" open item.

### 4. `EArray.renderItem` — the seam where a stateful adapter owns identity

The engine is **stateless**, so it cannot own a mutable item list. The enriched array gains `renderItem(itemCore)` (= render a *caller-owned* item core through the active resolver). React's `ArrayRoot` (a `useState` component) holds the list of **slots** — each a monotonic `id` that is *both* the React key *and* the item's path index, paired with a Core item core minted once via `getItem(id)`. Caching the core is what lets `memo` bail; **append** mounts one new item and re-renders nothing else; **remove** unmounts exactly the dropped item and leaves every survivor untouched.

### 5. Interactivity is per-adapter behavior, via a *behavior* Context — never the markup contract

Add/remove handlers reach the button parts through a small `ArrayActionsContext` (React-only). This is deliberately a Context — it carries **behavior**, not markup — so overriding a button's *markup* never loses its wiring, and a button re-render never cascades into the items. The string oracle has no Context and renders the same buttons **inert**; the conformance canonicalizer drops `on*` handlers, so React-with-handlers ≡ vanilla-inert.

The per-item Context value must be **referentially stable**, or it defeats the very memo floor decision 2 buys: a Context change re-renders consumers *through* a memo-bailed `NodeRenderer`, so a fresh `{ remove }` object on every `ArrayRoot` render re-renders every existing item's Remove button on each add/remove. We bind it once: a stable `removeById` plus the primitive `id`, memoized inside a per-item `ArrayItemActions` boundary. The counting test (decision 7) caught this exactly — `removeButton` ran twice on a single add — and now pins it at one.

### 6. Stable paths over reindexing (and where density lives)

Ids are never reused, so after removing the first of two, the survivor *stays* `contacts.1`. Reindexing survivors to be contiguous would re-path them, and the **path-keyed child fold would remount them** — losing the very values we protect. We chose identity preservation. Dense, 0-based **submission** is therefore a submit-time concern (today `unflatten` yields a sparse array), tracked as a follow-up — not a reason to churn React identity on every remove.

### 7. The perf contract is a number, not a proxy — a counting adapter

DOM-identity/value preservation is a strong *proxy* (a remount **is** a value loss), but it cannot see a re-render that happens to keep the same DOM. So the contract is also stated directly: a `RendererAdapter` that tallies each node/part renderer invocation by path (`render-counts.test.tsx`). It pins three numbers — an unrelated parent re-render runs **zero** node renderers (the decision-2 floor); an **add** re-renders nothing in the existing items, *including* their Remove buttons (exactly one `removeButton`, the new one); a **remove** re-renders nothing in the survivor. The adapter is just the public renderer surface instrumented, so it doubles as the worked example that the surface is fully swappable.

## Consequences

- **The form behaves like a hand-written React tree.** No remounts on unrelated re-renders; localized re-renders; uncontrolled values survive add/remove. This is the headline win, enforced two ways: `render-stability.test.tsx` + `arrays.test.tsx` (DOM identity + value preservation) and `render-counts.test.tsx` (the contract as hard render counts, via the counting adapter).
- **The engine stays stateless.** State lives in the React adapter (`ArrayRoot`'s `useState`). A Core-level "store" is **deliberately deferred** until a *second* stateful adapter (a vanilla-DOM renderer) forces the shape — ADR 008, again. `renderChild`/`renderItem` are the seams that second adapter will reuse.
- **Conformance is unchanged in spirit.** It remains a *markup* contract; behavior (handlers, local state) is explicitly outside it. Vanilla renders the controls inert and still matches.
- **Known gap, tracked:** non-contiguous paths → sparse submission until a densification policy is chosen (densify in `unflatten` vs. a display-index remap). Filed as a follow-up; it crosses Core's submit semantics, so it is a decision to make deliberately, not in passing.
- **Deferred:** reviving the `App_07` arrays example and the vanilla-DOM adapter that would validate the stateful seam end-to-end. Both filed. (The render-count contract, originally deferred, is now in — decision 7.)

## Alternatives Considered

- **Keep `<node.Default/>` as a fresh-closure component** — rejected: it is the remount/value-loss bug itself.
- **Resolver via Context** — rejected: no memo benefit over a prop, and it fights scoping (which the engine already solves by parameter threading). Extends ADR 014's "Context was incidental."
- **Reindex array items to contiguous paths on remove** — rejected for the UI: re-paths survivors → path-keyed remount → value loss. Density belongs at submit time.
- **Push array state into a Core store now** — deferred (ADR 008): one stateful adapter does not earn the abstraction; build it in React, let a second adapter force the seam.
- **A React-Profiler-based render-count test** — rejected in favor of the counting *adapter* (decision 7): it needs no profiler API, reads as per-path numbers, and is itself a swappability demo. We started with DOM identity + value preservation as the proxy and hardened to counts once the behavior existed.

---

**Relates to:** ADR 008 (second implementation earns a seam — bi4/arrays forced this; the vanilla-DOM adapter will validate it), ADR 010 (continuation contract — `renderChild`/`renderItem` are new re-entry seams), ADR 013 (renderer-adapter compound — arrays/arrayItems join `field`/`group` as first-class kinds), ADR 014 (the Core fold this refines for React; closes its "arrays are pass-through" open item and extends its "Context was incidental" finding to the resolver).
