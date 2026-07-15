// The typed binding for `renderNodeRules` (ADR 048) — the former per-front-end
// "recipe", now generic and living in React. It reads the resolved `FormShape` a
// front-end brands onto its tree (`jsonSchemaToTree` / `zodToTree`) and re-types
// the neutral rule registrar off it. React imports NO front-end: the brand is the
// front-end-agnostic seam, so one binding serves every front-end.
//
// This is pure sugar over the low-level `renderNode` prop — it grants nothing a
// hand-written resolver can't do. What it adds: (1) tree-typed authoring, (2)
// baked memoization, (3) the selector cascade. Layering: `renderNode` (floor) ‹
// `renderNodeRules()` (rule sugar) ‹ `useRenderNodeRules()` (typed + memoized).
import { useRef, type ReactNode } from 'react'
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

// Minimal ambient so the dev-only guard below typechecks without pulling in
// `@types/node`; consumer bundlers (webpack/vite/esbuild) statically replace
// `process.env.NODE_ENV`, so the whole branch is dead-code-eliminated in prod.
declare const process: { env: { NODE_ENV?: string } } | undefined

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
  /** The field's value, narrowed to the schema type at `P` — but **`| undefined`
   * until a reactive form-state adapter lands** (ADR 047 §7): the uncontrolled
   * runtime passes `undefined` today, so the type must not promise a value it
   * cannot deliver (bd bh7.7). The narrowed member is the forward-compatible
   * shape — guard before reading. */
  value: TS['fields'][P]['value'] | undefined
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
 * (ADR 048). Sugar over `renderNode`:
 *   • **tree-typed authoring** — `r.field('name', …)` autocompletes real paths and
 *     narrows `value`/`parts` off the `FormShape` the front-end branded onto the
 *     tree (React imports no front-end);
 *   • **guaranteed-stable resolver** — the builder is captured ONCE and the
 *     `RenderNode` identity is held for the component's lifetime, so
 *     `NodeRenderer`'s memo bail holds even if you pass an inline `(r) => …`.
 *     A per-render-new resolver would remount every handler subtree and drop
 *     input focus / local state (bd bh7.5);
 *   • **selector cascade** — the `field`/`group` registrar instead of a per-node
 *     `if` ladder.
 *
 * The `tree` argument is a compile-time type carrier (the runtime is source-
 * agnostic) and a seam for a future dev-time "unknown path" warning.
 *
 * Rules are STRUCTURAL — a stylesheet, not reactive state (ADR 047 §1/§7). The
 * builder is read once on first render; swapping it later has no effect (and warns
 * in dev). Reactive behavior belongs INSIDE a handler (it is a real component that
 * may call hooks), not in rebuilding the rule set.
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

  // Capture the builder ONCE and hold the resolver for the component's lifetime.
  // Rules are structural (ADR 047 §1/§7), so a stable identity is mandatory: a new
  // resolver each render remounts every matched handler subtree and drops input
  // focus / local state. A ref (not `useMemo`, which React is free to discard)
  // guarantees the stability even for an inline builder. bd bh7.5.
  const firstBuild = useRef(build)
  const resolverRef = useRef<RenderNode>()
  const resolver = (resolverRef.current ??= renderNodeRules(
    firstBuild.current as unknown as RulesBuild
  ))

  // Dev-only: a changed builder identity is either an inline closure (the remount
  // trap) or an attempt at dynamic rules (unsupported — captured once above).
  // Warn once so the footgun is loud, not silent. Stripped in production.
  const warned = useRef(false)
  if (
    typeof process !== 'undefined' &&
    process.env.NODE_ENV !== 'production' &&
    build !== firstBuild.current &&
    !warned.current
  ) {
    warned.current = true
    // eslint-disable-next-line no-console
    console.error(
      '[formframe] useRenderNodeRules: the `build` function changed identity ' +
        'between renders, so it is being ignored — rules are captured once (like ' +
        'a stylesheet). An inline `(r) => …` also defeats memoization and would ' +
        'remount fields (losing focus). Hoist the builder to a module-scope const ' +
        'or wrap it in useCallback. Put reactive behavior inside a handler, not in ' +
        'rebuilding rules. See ADR 047 §1/§7.'
    )
  }

  return resolver
}
