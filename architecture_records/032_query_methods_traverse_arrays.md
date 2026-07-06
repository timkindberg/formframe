# ADR 032: The Query Surface (`getField` / `getAllFields`) Traverses Arrays, Consistent with `walk()`

**Date:** 2026-07-06
**Status:** Proposed (bd `s8i`, `1nx`)
**Deciders:** Tim Kindberg
**Relates to:** ADR 006 (neutral IR waist), ADR 018 (dense dynamic arrays), ADR 029
(presentation stage over neutral facts). Discovered from the PR #33 (`7mr`) edge-case tests.

## Context

Container nodes expose three query methods (`ContainerMethods` in `nodeTypes.ts`):
`walk(handlers)`, `getField(path)`, and `getAllFields()`. They were **not** consistent
about arrays:

- **`walk()`** recurses through *everything* — groups, arrays, and array items alike
  (`walkNode` in `utils.ts`).
- **`getField()`** and **`getAllFields()`** on a `GroupNode` recursed **only into child
  `group`s**, never into `array` children.

So from the root a consumer could `walk()` to every leaf, but:

- `getField('org.department.members.0.name')` returned **`undefined`** — a field inside a
  dynamic array was reachable only by hand-walking to the item group and calling the
  *relative* `itemGroup.getField('name')`, or via `walk()` (bd `s8i`).
- `getAllFields()` **omitted every leaf inside an array subtree**, so the "flat list of all
  leaves" silently disagreed with `walk({ field })` whenever arrays were present (bd `1nx`).

This is a real gap for consumers that hold only the root node (validation summaries,
autofocus-first-error, field enumeration). The `ArrayNode` / `ArrayItemNode` already had
their own `getField`/`getAllFields`, but (a) the `GroupNode` never called them, and (b)
their path semantics were absolute-ish and inconsistent with the group's relative-path
convention, so they were effectively dead code.

The options on the table (from the bd issues) were: (1) traverse arrays and implement;
(2) add an opt-in flag (`{ includeArrayItems: true }`); (3) document the limitation.

## Decision

### 1. The query surface reflects the **instantiated tree** — the same nodes `walk()` visits

`getField`, `getAllFields`, and `walk` all range over the **currently compiled** tree.
For a dynamic array that means its **instantiated items** (initially `minItems`; ADR 018
keeps them dense). They are not schema projections of hypothetical items. To project a
not-yet-added item's shape, use the existing escape hatch `arrayNode.getItem(index)` and
query *that* (this is what submit assembly does with `getItem(0)`).

Making all three methods agree on "the instantiated tree" is the invariant this ADR
establishes: **`getAllFields()` ≡ `walk({ field: f => f })`**, and `getField(p)` returns a
node iff `walk` would visit a leaf at that absolute path.

### 2. `getField(path)` resolves through arrays; a **numeric segment selects an item by index**

`getField` keeps its relative-path convention (path is relative to the callee; ADR 006).
Recursion now includes `array` children: when the target falls inside an array's subtree,
the array consumes the next segment as an **item index** and delegates the remainder to
that item. Examples (from the root):

- `getField('members.0.name')` → item `0`'s `name` leaf.
- `getField('members.0.address.city')` → through the item group into a nested group.
- `getField('matrix.0.1')` → nested arrays chain index-by-index.
- A non-numeric segment where an index is expected, or an index outside the instantiated
  range, returns `undefined` (consistent with §1 — that node isn't in the tree).

### 3. `getAllFields()` includes array-item leaves

`GroupNode.getAllFields` recurses into `array` children (which already fold over their
items). The result is the complete flat leaf list, arrays included — equal to
`walk({ field })`.

### 4. Rejected: an opt-in flag or a documented limitation

- **Opt-in `{ includeArrayItems: true }`** — rejected. It would make `getAllFields()`
  disagree with `walk()` by default and push array-awareness onto every consumer for no
  benefit; there is no meaningful use case for "all leaves *except* those in arrays."
- **Document the limitation** — rejected. The inconsistency with `walk()` is a bug, not a
  contract; leaving it documented would force consumers into `walk()` boilerplate for the
  common "find/enumerate a field" case.

## Consequences

- **One mental model for the whole query surface:** walk, enumerate, and look up all see
  the same instantiated tree; numeric segments are array indices. `getItem(i)` remains the
  way to reach shape for an item that has not been added yet.
- **Behavior change (pre-1.0, acceptable):** `getField(...through an array...)` now returns
  the leaf instead of `undefined`, and `getAllFields()` now includes array-item leaves. The
  `deepNesting` test that asserted the old `undefined` is updated to assert resolution.
- **The `ArrayNode`/`ArrayItemNode` query methods become live and consistent** with the
  group's relative-path convention (previously unreachable / absolute-ish).
- **No new API surface.** `ContainerMethods` keeps the same three signatures; only their
  documented reach changes. `getItem` is unchanged.
