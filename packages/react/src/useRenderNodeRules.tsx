// The typed binding for `renderNodeRules` (ADR 042) — the former per-front-end
// "recipe", now generic and living in React. It reads the resolved `FormShape` a
// front-end brands onto its tree (`jsonSchemaToTree` / `zodToTree`) and re-types
// the neutral rule registrar off it. React imports NO front-end: the brand is the
// front-end-agnostic seam, so one binding serves every front-end.
//
// This is pure sugar over the low-level `renderNode` prop — it grants nothing a
// hand-written resolver can't do. What it adds: (1) tree-typed authoring, (2)
// baked memoization, (3) the selector cascade. Layering: `renderNode` (floor) ‹
// `renderNodeRules()` (rule sugar) ‹ `useRenderNodeRules()` (typed + memoized).
import { useMemo, type ReactNode } from 'react'
import type {
  FieldPartsData,
  FormShape,
  GroupPartsData,
  TypedTree,
} from '@formframe/core'
import type { EField, EGroup, RenderNode } from './renderer'
import {
  renderNodeRules,
  type PartComponent,
  type RulesBuild,
} from './renderNodeRules'

/** Flatten a mapped/conditional type so editors hover it as a plain object
 * literal instead of the raw generic expression. Display-only — no runtime, and
 * it does not change assignability. */
type Pretty<T> = { [K in keyof T]: T[K] } & {}

/** Wrap each present part's DATA payload as a placeable `PartComponent`. An
 * OPTIONAL part (e.g. Zod's `Description?`) stays optional here — `parts.X` is
 * then `PartComponent<…> | undefined`, so you guard before placing it — while
 * `NonNullable` keeps the render-prop payload clean (no `| undefined`). */
type SlotsOf<D> = Pretty<{
  [K in keyof D]: PartComponent<NonNullable<D[K]>>
}>

/**
 * Path-narrowed field handler props for a resolved {@link FormShape} `TS` at leaf
 * path `P`: `value`/`parts` narrow off the tree's brand; `Default` re-enters the
 * node. Annotate a hoisted handler as `FieldProps<Shape, 'name'>` where
 * `type Shape = FormShapeOf<typeof schema>` (from the front-end); inline handlers
 * inside `useRenderNodeRules` need no annotation.
 */
export type FieldProps<
  TS extends FormShape,
  P extends keyof TS['fields'] & string,
> = Pretty<{
  path: P
  node: EField
  value: TS['fields'][P]['value']
  Default: () => ReactNode
  parts: SlotsOf<
    FieldPartsData<TS['fields'][P]['widget'], TS['fields'][P]['description']>
  >
}>

/** Path-narrowed group handler props for a resolved {@link FormShape} `TS` at
 * group path `P`. */
export type GroupProps<
  TS extends FormShape,
  P extends keyof TS['groups'] & string,
> = Pretty<{
  path: P
  node: EGroup
  Default: () => ReactNode
  parts: SlotsOf<GroupPartsData<TS['groups'][P]['description']>>
  children: ReactNode
}>

/**
 * The path-narrowed registrar for a resolved {@link FormShape} `TS` — the neutral
 * {@link RuleRegistrar} re-typed so `field`/`group` accept only real paths and
 * hand back narrowed props. Annotate a module-scope (stable) builder as
 * `(r: TypedRuleRegistrar<Shape>) => void`, or pass the builder inline to
 * `useRenderNodeRules` where `TS` is inferred from the tree.
 */
export interface TypedRuleRegistrar<TS extends FormShape> {
  field<P extends keyof TS['fields'] & string>(
    path: P,
    Handler: (props: FieldProps<TS, P>) => ReactNode
  ): void
  group<P extends keyof TS['groups'] & string>(
    path: P,
    Handler: (props: GroupProps<TS, P>) => ReactNode
  ): void
}

/**
 * Bind typed selector rules to a memoized `RenderNode` for `<SchemaFields>`
 * (ADR 042). Sugar over `renderNode`:
 *   • **tree-typed authoring** — `r.field('name', …)` autocompletes real paths and
 *     narrows `value`/`parts` off the `FormShape` the front-end branded onto the
 *     tree (React imports no front-end);
 *   • **baked memoization** — the resolver identity is stable, so `NodeRenderer`'s
 *     memo bail holds (an un-memoized resolver remounts handler subtrees, losing
 *     focus/local state);
 *   • **selector cascade** — the `field`/`group` registrar instead of a per-node
 *     `if` ladder.
 *
 * The `tree` argument is a compile-time type carrier (the runtime is source-
 * agnostic) and a seam for a future dev-time "unknown path" warning.
 *
 * Pass a STABLE builder — a module-scope const or a `useCallback` — so the
 * `[build]` dependency doesn't rebuild every render.
 *
 * ```ts
 * const tree = useMemo(() => jsonSchemaToTree(schema), [])   // brands with FormShapeOf<S>
 * const renderNode = useRenderNodeRules(tree, rules)         // rules: (r: TypedRuleRegistrar<Shape>) => void
 * return <Fields renderNode={renderNode} />
 * ```
 */
export function useRenderNodeRules<TS extends FormShape, Origin>(
  tree: TypedTree<TS, Origin>,
  build: (r: TypedRuleRegistrar<TS>) => void
): RenderNode {
  // `tree` is a compile-time type carrier only (the runtime is source-agnostic);
  // referenced here to reserve it for a future dev-time path-validation warning.
  void tree
  return useMemo(() => renderNodeRules(build as unknown as RulesBuild), [build])
}
