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
import { useMemo, useRef, type ReactNode } from 'react'
import type {
  ControlKind,
  FieldControl,
  FieldPartsBase,
  FieldPartsData,
  FormShape,
  GroupPartsData,
  TypedTree,
  ValidationError,
} from '@formframe/core'
import type { EArray, EField, EGroup, RenderNode } from './renderer'
import {
  renderNodeRules,
  type PartComponent,
  type RuleRegistrar,
  type RulesBuild,
} from './renderNodeRules'

// Minimal ambient so the dev-only guard below typechecks without pulling in
// `@types/node`; consumer bundlers (webpack/vite/esbuild) statically replace
// `process.env.NODE_ENV`, so the whole branch is dead-code-eliminated in prod.
declare const process: { env: { NODE_ENV?: string } } | undefined

/** Flatten a mapped/conditional type so editors hover it as a plain object
 * literal instead of the raw generic expression. Display-only — no runtime, and
 * it does not change assignability.
 *
 * TYPE TOUR: re-mapping every key (`[K in keyof T]: T[K]`) and intersecting `& {}`
 * forces TS to EVALUATE the type eagerly, so a hover shows `{ Label: …; Control: … }`
 * instead of `SlotsOf<FieldPartsData<'input', 'present'>>`. Pure editor ergonomics —
 * this is the single biggest lever on "do the types FEEL nice on hover". */
type Pretty<T> = { [K in keyof T]: T[K] } & {}

/** Wrap each present part's DATA payload as a placeable `PartComponent`. An
 * OPTIONAL part (e.g. Zod's `Description?`) stays optional here — `parts.X` is
 * then `PartComponent<…> | undefined`, so you guard before placing it — while
 * `NonNullable` keeps the render-prop payload clean (no `| undefined`).
 *
 * TYPE TOUR: a mapped type `[K in keyof D]` PRESERVES each key's `?`, so an
 * optional data slot maps to an optional component slot (guard before you place
 * it). `NonNullable<D[K]>` then strips the `| undefined` from the payload the
 * render prop receives — you guard once at placement, never again inside. */
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
   * shape — guard before reading.
   *
   * TYPE TOUR: a type that promises more than the runtime delivers is worse than a
   * loose type — it invites `value.trim()` that crashes. The `| undefined` makes
   * the compiler force a guard TODAY; when live values arrive the schema half is
   * already correct and only the `| undefined` drops off. Honesty over optimism. */
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

/** Path-narrowed array handler props for a resolved {@link FormShape} `TS` at
 * array path `P` — the group-shaped caption parts plus the rendered items as
 * `children`. */
export type ArrayProps<
  TS extends FormShape,
  P extends keyof TS['arrays'] & string,
> = Pretty<{
  path: P
  node: EArray
  Default: () => ReactNode
  parts: SlotsOf<GroupPartsData<TS['arrays'][P]['description']>>
  children: ReactNode
}>

/** The parts DATA bag for a `control(kind)` rule: `Control` is pre-narrowed to the
 * archetype `K`, but a control selector spans MANY paths, so `Label`/`Description`
 * cannot be proven and `Description` is optional (guard before placing). */
type ControlPartsData<K extends ControlKind> = {
  Label: FieldPartsBase['label']
  Control: Extract<FieldControl, { kind: K }>
  Errors: ValidationError[]
  Description?: NonNullable<FieldPartsBase['description']>
}

/** Handler props for a `control(kind)` rule: `parts.Control` is narrowed to `K`,
 * but `path`/`value` stay wide because the rule matches every field of that
 * archetype, not one path (ADR 047 §3/§5).
 *
 * TYPE TOUR: narrow only what is PROVABLE. A `control('select')` rule fires on many
 * paths, so their shared truth is "the control is a select" — that we narrow. The
 * path and value differ per match, so pinning them to one type would be a lie;
 * `path: string` / `value: unknown` is the honest ceiling. Contrast `FieldProps`,
 * which keys off ONE path and can narrow everything. */
export type ControlProps<K extends ControlKind> = Pretty<{
  path: string
  node: EField
  value: unknown
  Default: () => ReactNode
  parts: SlotsOf<ControlPartsData<K>>
}>

/** The three path axes a resolved {@link FormShape} `TS` partitions its paths
 * into — one path string belongs to exactly one of these (never two). */
type FieldPath<TS extends FormShape> = keyof TS['fields'] & string
type GroupPath<TS extends FormShape> = keyof TS['groups'] & string
type ArrayPath<TS extends FormShape> = keyof TS['arrays'] & string

// TYPE TOUR — cross-kind DX (bd q8v): before this, `r.field('address', …)` on
// `'address'` (really a group) errored as `Argument of type '"address"' is not
// assignable to parameter of type '"name" | "plan"'` — legible (it lists valid
// field paths) but not PEDAGOGICAL (it never says "'address' IS a real path,
// just the wrong axis"). Each `<Axis>PathArg` below is the identity on a path
// that belongs to its OWN axis (so valid calls are untouched), but resolves to a
// literal-string ERROR MESSAGE — not a union — when `P` belongs to one of the
// OTHER two axes. TypeScript's "not assignable" diagnostic then prints that
// message verbatim as the expected type, so the error itself names the fix
// ("use r.group(), not r.field()"). A path on NO axis (a genuine typo) falls
// through to the plain union, unchanged from before. `P` is inferred as an
// ordinary `string` type parameter (same mechanism as `GuardSchema` in
// `jsonSchemaToTree`, ADR 049) — the conditional lives in the checked position,
// not the inference position, so valid-path autocomplete is unaffected.
type FieldPathArg<TS extends FormShape, P extends string> =
  P extends FieldPath<TS>
    ? P
    : P extends GroupPath<TS>
      ? `'${P}' is a group path here — use r.group(), not r.field()`
      : P extends ArrayPath<TS>
        ? `'${P}' is an array path here — use r.array(), not r.field()`
        : FieldPath<TS>

type GroupPathArg<TS extends FormShape, P extends string> =
  P extends GroupPath<TS>
    ? P
    : P extends FieldPath<TS>
      ? `'${P}' is a field path here — use r.field(), not r.group()`
      : P extends ArrayPath<TS>
        ? `'${P}' is an array path here — use r.array(), not r.group()`
        : GroupPath<TS>

type ArrayPathArg<TS extends FormShape, P extends string> =
  P extends ArrayPath<TS>
    ? P
    : P extends FieldPath<TS>
      ? `'${P}' is a field path here — use r.field(), not r.array()`
      : P extends GroupPath<TS>
        ? `'${P}' is a group path here — use r.group(), not r.array()`
        : ArrayPath<TS>

/**
 * The path-narrowed registrar for a resolved {@link FormShape} `TS` — the neutral
 * {@link RuleRegistrar} re-typed so the path axes (`field`/`group`/`array`) accept
 * only real paths and hand back narrowed props, and `control(kind)` narrows its
 * `Control` part to the archetype. The cross-node axes (`allFields`/`allGroups`/
 * `allArrays`/`where`/`default`) are inherited UN-narrowed from the neutral
 * registrar — they inherently match many nodes, so their props stay the neutral
 * floor (no path to narrow off). Inheriting them (rather than omitting) means
 * every selector is present and usable on the typed registrar — no "typing cliff"
 * where reaching for `r.array`/`r.control`/`r.where` falls off the typed surface
 * (bd bh7.6).
 *
 * Annotate a module-scope (stable) builder as `(r: TypedRuleRegistrar<Shape>) =>
 * void`, or pass the builder inline to `useRenderNodeRules` where `TS` is inferred
 * from the tree.
 *
 * TYPE TOUR — re-typing SOME methods of an interface: `Omit` the ones you want to
 * replace (`field`/`group`/`array`/`control`), then `&`-intersect narrowed versions
 * back on. Everything you did NOT omit (`allFields`/`allGroups`/`allArrays`/`where`/
 * `default`) rides along inherited from the neutral registrar. That is the whole
 * fix for the "typing cliff" (bh7.6): before, this was a hand-written interface with
 * only `field`/`group`, so reaching for `r.array` was a "property does not exist"
 * error — the typed surface was a strict SUBSET of the runtime one. Now it is a
 * complete superset.
 */
export type TypedRuleRegistrar<TS extends FormShape> = Omit<
  RuleRegistrar,
  'field' | 'group' | 'array' | 'control'
> & {
  field<P extends string>(
    path: FieldPathArg<TS, P>,
    Handler: (props: FieldProps<TS, Extract<P, FieldPath<TS>>>) => ReactNode
  ): void
  group<P extends string>(
    path: GroupPathArg<TS, P>,
    Handler: (props: GroupProps<TS, Extract<P, GroupPath<TS>>>) => ReactNode
  ): void
  array<P extends string>(
    path: ArrayPathArg<TS, P>,
    Handler: (props: ArrayProps<TS, Extract<P, ArrayPath<TS>>>) => ReactNode
  ): void
  control<K extends ControlKind>(
    kind: K,
    Handler: (props: ControlProps<K>) => ReactNode
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
 * in dev, bd bh7.5). Reactive behavior belongs INSIDE a handler (it is a real
 * component that may call hooks), not in rebuilding the rule set.
 *
 * DYNAMIC RULE SETS (bd jsonschema-form-108): if the rules themselves must change
 * shape — a feature flag or locale swaps which fields exist, not just what a
 * handler renders — pass an explicit `deps` array (3rd arg), exactly like
 * `useMemo`/`useEffect`. The resolver then rebuilds (and matched fields
 * deliberately remount) whenever a listed dep changes:
 *
 * ```ts
 * const renderNode = useRenderNodeRules(tree, (r) => { … uses locale … }, [locale])
 * ```
 *
 * Don't reach for `useCallback(build, [locale])` instead: `useCallback` gives the
 * BUILDER a new identity when a listed dep changes (which this hook still only
 * warns about, per the stylesheet contract above) — it does not rebuild anything.
 * Worse, a `useCallback` with an INCOMPLETE deps list keeps the SAME identity
 * while its closed-over value drifts, and this hook has no way to see that a
 * same-reference function's insides changed — it stays silent, and your rules
 * are frozen at whatever they were on the first render. `deps` sidesteps the
 * whole class of bug: you declare what should trigger a rebuild, and the hook
 * rebuilds on exactly that, the same way `useMemo`'s deps do.
 *
 * OVERRIDES (bd bh7.8, resolved): if you re-present with `overrideWidgets(map)` via
 * `useFormTree`, type this hook off the returned `form` (which carries the override
 * re-narrowing) rather than the pre-override input tree — then the typed `Control`
 * is provably what renders. Typing off the pre-override tree still reflects the
 * DEFAULT presentation (correct for that tree, but not for an overridden `form`).
 *
 * ```ts
 * const tree = useMemo(() => jsonSchemaToTree(schema), [])
 * const { form } = useFormTree(tree, { resolvePresentation: overrideWidgets(MAP) })
 * const renderNode = useRenderNodeRules(form, rules)  // types track the overrides
 * return <Fields renderNode={renderNode} />
 * ```
 */
export function useRenderNodeRules<TS extends FormShape, Origin>(
  tree: TypedTree<TS, Origin>,
  build: (r: TypedRuleRegistrar<TS>) => void,
  deps?: readonly unknown[]
): RenderNode {
  // `tree` is a compile-time type carrier only (the runtime is source-agnostic);
  // referenced here to reserve it for a future dev-time path-validation warning.
  void tree

  // TYPE TOUR (runtime, not types) — the focus-loss BLOCKER fix (bh7.5). Think of
  // rules as a STYLESHEET: read once, not reactive state. We stash the builder in a
  // ref on first render and never rebuild, so the returned `RenderNode` keeps ONE
  // identity for the component's life. Why it matters: React diffs by identity — a
  // fresh resolver each render looks like a different component type, so it UNMOUNTS
  // and remounts every matched field, and a remounted <input> loses focus mid-type.
  // `useRef` (not `useMemo`, which React may throw away and recompute) is what makes
  // this a guarantee even when the caller passes an inline `(r) => …`.
  const firstBuild = useRef(build)
  const resolverRef = useRef<RenderNode>()
  const onceResolver = (resolverRef.current ??= renderNodeRules(
    firstBuild.current as unknown as RulesBuild
  ))

  // Dev-only: a changed builder identity is either an inline closure (the remount
  // trap) or an attempt at dynamic rules without declaring `deps` (unsupported —
  // captured once above). Warn once so the footgun is loud, not silent. Stripped
  // in production. Skipped when `deps` is supplied — that path below owns
  // rebuilding deliberately, so an identity change is expected, not a footgun.
  const warned = useRef(false)
  if (
    !deps &&
    typeof process !== 'undefined' &&
    process.env.NODE_ENV !== 'production' &&
    build !== firstBuild.current &&
    !warned.current
  ) {
    warned.current = true
    console.error(
      '[formframe] useRenderNodeRules: the `build` function changed identity ' +
        'between renders, so it is being ignored — rules are captured once (like ' +
        'a stylesheet). An inline `(r) => …` also defeats memoization and would ' +
        'remount fields (losing focus). Hoist the builder to a module-scope const, ' +
        'or if the rule SET must genuinely change shape, pass an explicit `deps` ' +
        'array (3rd arg) instead of relying on a wrapped useCallback identity — ' +
        'see the DYNAMIC RULE SETS section in the doc comment on this hook. Put ' +
        'reactive per-render behavior INSIDE a handler, not in rebuilding rules. ' +
        'See ADR 047 §1/§7.'
    )
  }

  // Explicit escape hatch (bd jsonschema-form-108): the caller owns reactivity via
  // `deps`, exactly like `useMemo`. Every dep change is a DELIBERATE rebuild (and
  // remount of matched fields) — never silent staleness, unlike a `useCallback`
  // whose deps list is missing something the builder closes over. Falls back to
  // the once-only resolver when `deps` is omitted (the default stylesheet path).
  // `deps` is caller-owned and intentionally opaque to this hook — it is NOT a
  // real dependency of the factory in the exhaustive-deps sense, it is the
  // caller's declared reactivity contract, so the lint rule is disabled below.
  const depsOrOnce = deps ?? [onceResolver]
  return useMemo(
    () =>
      deps ? renderNodeRules(build as unknown as RulesBuild) : onceResolver,
    depsOrOnce // eslint-disable-line react-hooks/exhaustive-deps -- `depsOrOnce` IS the full, caller-declared dependency contract
  )
}
