# ADR 048: Front-ends brand the tree with a resolved `FormShape`; React binds off it

- **Status:** Accepted
- **Date:** 2026-07-14
- **Supersedes the recipe half of:** ADR 047 §4 (the per-front-end typed-binding
  "recipe"); builds on ADR 033 (Core is schema-agnostic), ADR 035 (React binds
  trees, not schemas), ADR 039 (sister front-ends share a conformance oracle).
- **bd:** `jsonschema-form-bh7.3` (epic `jsonschema-form-bh7`)

## Context

ADR 047 gave `customize` a path-narrowed surface (`FieldProps<S,P>` etc.), but
the narrowing types are owned by the front-end (`input-jsonschema`,
`input-zod`) and differ per front-end, while React's `customize` is deliberately
source-agnostic and imports no front-end. The two were bridged by a **recipe** —
a mostly-types module (`customizeJsonSchema.ts` / `customizeZod.ts`) the consumer
pasted in, which imported one front-end's inference and re-typed the registrar.

App17 (ADR 008 forcing function) proved the two recipes are **byte-identical
except the import line**. That is the tell: the binding is front-end-agnostic and
should not be duplicated per front-end. It wants to move *into* the tree.

## Decision

**The front-end computes a resolved, front-end-agnostic `FormShape` and brands
its tree with it; React reads the `FormShape` off the tree and types the customize
registrar generically, importing no front-end.** The recipe evaporates, and so do
any prospective `react-jsonschema` / `react-zod` bridge packages.

### 1. `FormShape` — a neutral type surface (Core owns the contract)

```ts
type DescriptionState = 'present' | 'absent' | 'optional'

interface FormShape {
  fields: Record<string, { value: unknown; widget: WidgetName; description: DescriptionState }>
  groups: Record<string, { description: DescriptionState }>
  arrays: Record<string, { description: DescriptionState }>
}
```

Core owns this interface because it is expressed purely in Core vocabulary
(`WidgetName`, and a description tri-state), with no schema concepts.

### 2. Split of responsibility (the perf-conscious seam)

The front-end projects only the **schema-specific** facts per path — `value`,
`widget`, and `description` state — eagerly mapped over its own `FieldPaths`.
The **widget → control → parts composition is neutral** and moves to **Core**,
keyed on `WidgetName` + `DescriptionState` (not on a schema):

```ts
// Core (neutral, lazy — instantiated only for the paths a handler actually touches)
type ControlForWidget<W extends WidgetName> = Extract<FieldControl, { kind: WidgetToControlKind<W> }>
type FieldPartsData<W extends WidgetName, D extends DescriptionState> = { Label; Control: ControlForWidget<W>; Errors } & DescriptionSlot<D>
type GroupPartsData<D extends DescriptionState> = { Label } & DescriptionSlot<D>
```

Only `value` is eagerly resolved over every path (cheap, bounded by the depth
limit). The expensive `FieldControl` extraction + parts assembly stays **lazy** —
Core composes it per handled path when React indexes `FieldPartsData<…>`. This is
the answer to the open perf risk: we do **not** eagerly resolve every path's
control+parts.

So a front-end's inference layer only has to provide the **five navigation
primitives** — `SchemaAt` / `ValueAt` / `KindOf` (→ `FieldPaths`/`GroupPaths`) /
`WidgetAt` (via `DefaultWidgetAt`) / `HasDescription` — plus assemble them into a
`FormShapeOf<S>`. The conformance oracle (bd bh7.4) enforces exactly this set.

### 3. `TypedTree` brand + generic front-end signatures

```ts
interface TypedTree<TS extends FormShape = FormShape> extends GroupNode {
  readonly [FORM_SHAPE]?: TS  // phantom — never present at runtime; asserted by the front-end cast
}
type ShapeOf<T> = T extends TypedTree<infer TS> ? TS : FormShape

jsonSchemaToTree<const S extends JSONSchema>(schema: S): TypedTree<FormShapeOf<S>>
zodToTree<S extends ZodType>(schema: S): TypedTree<FormShapeOf<S>>
```

The `<const S>` capture replaces the `defineSchema` helper — an inline schema
literal is captured with no `as const` and no separate type alias.

### 4. React binds off the tree

```ts
renderNodeRules(...builds): RenderNode                      // the neutral primitive (renamed from `customize`)
useRenderNodeRules<TS extends FormShape>(tree: TypedTree<TS>, build): RenderNode
```

`useRenderNodeRules` reads `TS` from the tree's phantom, types the registrar's
`field`/`group` off `TS['fields']`/`TS['groups']`, derives `parts` via Core's
neutral `FieldPartsData`/`GroupPartsData`, and bakes in the `useMemo` (stable
resolver identity is the runtime contract). The `tree` argument is a **type
carrier** at compile time and a hook for a future dev-time "unknown path"
warning at runtime.

### 5. Naming

`customize` is retired. The primitive is `renderNodeRules(...)` (it builds a
`RenderNode` from selector rules); the hook is `useRenderNodeRules(tree, rules)`.
The name discloses that the hook is **sugar over `renderNode`** — it grants no
capability a hand-written `renderNode` lacks, only tree-typed authoring, baked
memoization, and the selector cascade. Layering: `renderNode` (floor) ‹
`renderNodeRules()` (rule sugar) ‹ `useRenderNodeRules()` (typed + memoized).

## Consequences

- **Recipes deleted.** `customizeJsonSchema.ts` / `customizeZod.ts` and
  `defineSchema` are gone; consumers call `jsonSchemaToTree(schema)` then
  `useRenderNodeRules(tree, rules)`. No import-swap, no `S` annotations.
- **React stays front-end-agnostic** and gains the *only* typed binding — so no
  `react-jsonschema` / `react-zod` packages are needed.
- **Front-ends shrink** to the five navigation primitives + a `FormShapeOf<S>`
  assembly; Core owns the widget→control→parts composition once.
- **Description asymmetry preserved** (ADR 047 follow-up): JSON Schema reports
  `'present' | 'absent'` (it can prove presence from the literal); Zod reports
  `'optional'` (descriptions are runtime-registry-only) — both flow through the
  same neutral `DescriptionState`.
- **Perf (measured)**: eager `FormShapeOf` resolution is **linear in path count,
  ~6 type-instantiations/path, with no measurable `tsc` check-time impact** — A/B
  via `--extendedDiagnostics` gave +5.8% instantiations for a ~195-path schema and
  +8.8% for a ~670-field one (3.6× paths → 3.4× cost, no superlinear blowup), both
  flat on check time. The expensive `FieldControl` extraction + parts assembly
  stays lazy (Core), so real cost tracks the paths you customize, not the schema
  size. The recipe is retained in git history as a fallback.
