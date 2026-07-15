// The render-node rules layer (ADR 041/042) — a form-scope selector registry
// whose handlers are **mounted components** receiving **arrangeable parts** as
// props. `renderNodeRules` (formerly `customize`) is sugar over `renderNode`.
//
// This rides entirely on the ADR 010/016/017 engine: `renderNodeRules(build)`
// returns an ordinary `RenderNode` (the low-level continuation primitive), so
// there is NO Core change and no new engine seam. Everything here is React sugar:
//
//  • §1 Handlers are components, not called callbacks. A matched selector renders
//    `<Handler {...props} />` (mounted), so each handler gets its own fiber and
//    `useState`/`useFieldErrors`/… are legal at the top level, lint-clean. The
//    ADR-016 stable-type rule is preserved by requiring **stable handler
//    identity** (module-level components / hoisted rules, never inline closures).
//  • §2 Parts are provided, arrangeable, stable components — full layout IOC. Each
//    `parts.X` is ONE module-level, context-reading component, so passing the bag
//    as a prop costs nothing and never remounts. Every part is render-prop-
//    hijackable: `<parts.X />` (default) or `<parts.X render={data => …} />`.
//    `Errors` is promoted out of the field Root to a movable part (ADR 041 §2);
//    the control↔errors a11y linkage is carried by shared ids + `FieldA11yContext`
//    (derived from the path + validation store), NOT a fixed layout, so it holds
//    wherever the parts land.
//  • §3 Selectors + precedence. `r.field(path)`, `r.group(path)`, `r.array(path)`,
//    `r.control(kind)`, `r.allFields/allGroups/allArrays`, `r.where(pred)`,
//    `r.default()`. One winning rule per node by specificity (exact path >
//    predicate > control kind > kind > default), CSS-cascade style — order-
//    independent across axes.
//
// This is the SOURCE-AGNOSTIC runtime (operates on the Core tree). Path/value/
// control/parts narrowing is layered generically by `useRenderNodeRules`, which
// reads the resolved `FormShape` a front-end brands onto the tree (ADR 042) — it
// re-types this surface, it does not re-implement it.
import { createContext, useContext, type ReactNode } from 'react'
import type {
  ControlKind,
  FieldControl,
  ValidationError,
} from '@formframe/core'
import {
  FieldA11yContext,
  fieldErrorId,
  useFieldErrorDisplay,
  useFieldErrors,
  type EArray,
  type EField,
  type EGroup,
  type ENode,
  type RenderHelpers,
  type RenderNode,
} from './renderer'

// ---------------------------------------------------------------------------
// The active-node handle the parts read (the current node + the engine helpers).
// ---------------------------------------------------------------------------

interface Handle {
  node: ENode
  helpers: RenderHelpers
}
const HandleCtx = createContext<Handle | null>(null)

// ---------------------------------------------------------------------------
// Part payloads — the narrowed `data` each part hands its `render` prop (§2).
// The runtime data is whatever the current node carries; the front-end narrows
// these per path (e.g. `Control` → the pre-narrowed `FieldControl` member).
// ---------------------------------------------------------------------------

/** Label caption data. `attrs`/`showRequired` are present on field captions and
 * absent on group/array captions (which are text-only) — hence optional here. */
export interface LabelData {
  text: string
  attrs?: { id: string; for?: string }
  showRequired?: boolean
}
export interface TextData {
  text: string
}

/**
 * A **placeable part component** — render it as JSX. `<Part />` emits the default
 * markup; `<Part render={data => …} />` hand-authors it from the part's narrowed
 * `data` (the type shown inside `PartComponent<…>` on hover). It is an ordinary
 * React component, so it composes and re-renders like any other.
 */
export type PartComponent<D> = (props: {
  render?: (data: D) => ReactNode
}) => ReactNode

// ---------------------------------------------------------------------------
// The part components (module-level, stable identity, context-reading).
// ---------------------------------------------------------------------------

/** Shared a11y derivation: a field with currently-displayed issues links its
 * control to the error list by id, so `Control` and `Errors` stay wired together
 * no matter where a handler places them (ADR 041 §2). */
function useFieldA11y(path: string): { errorId: string } | null {
  const issues = useFieldErrors(path)
  const show = useFieldErrorDisplay(path)
  return show && issues.length > 0 ? { errorId: fieldErrorId(path) } : null
}

function Label({
  render,
}: {
  render?: (data: LabelData) => ReactNode
}): ReactNode {
  const h = useContext(HandleCtx)
  if (!h) return null
  const parts = h.node.parts
  const label = 'label' in parts ? parts.label : undefined
  if (!label) return null
  return render ? render(label) : <h.helpers.Default of={label} />
}

function Description({
  render,
}: {
  render?: (data: TextData) => ReactNode
}): ReactNode {
  const h = useContext(HandleCtx)
  if (!h) return null
  const parts = h.node.parts
  const description = 'description' in parts ? parts.description : undefined
  if (!description) return null
  return render ? render(description) : <h.helpers.Default of={description} />
}

function Control({
  render,
}: {
  render?: (data: FieldControl) => ReactNode
}): ReactNode {
  const h = useContext(HandleCtx)
  const path = h && h.node.isField ? h.node.path : ''
  // Hook runs unconditionally (rules-of-hooks); ignored for non-field handles.
  const a11y = useFieldA11y(path)
  if (!h || !h.node.isField) return null
  const control = h.node.parts.control
  // A render-prop control is hand-authored: the consumer owns a11y by spreading
  // `c.attrs` and adding their own (ADR 041 §5). The default control gets the
  // linkage via `FieldA11yContext`, exactly as the field Root does.
  if (render) return render(control)
  return (
    <FieldA11yContext.Provider value={a11y}>
      <h.helpers.Default of={control} />
    </FieldA11yContext.Provider>
  )
}

// Errors are RUNTIME validation state (not a schema part), read from the store —
// possible only because parts are real components (ADR 041 §2). The id/class/role
// match the default field Root's error list, so promoting Errors to a movable
// part keeps `aria-describedby` (set by `Control`) pointing at a real element.
function Errors({
  render,
}: {
  render?: (data: ValidationError[]) => ReactNode
}): ReactNode {
  const h = useContext(HandleCtx)
  const path = h && h.node.isField ? h.node.path : ''
  const issues = useFieldErrors(path)
  const show = useFieldErrorDisplay(path)
  if (!path || !show || issues.length === 0) return null
  if (render) return render(issues)
  return (
    <ul id={fieldErrorId(path)} className="jsf-field-errors" role="alert">
      {issues.map((issue, i) => (
        <li key={i}>{issue.message}</li>
      ))}
    </ul>
  )
}

/** The full parts bag (field slots). One stable module-level object — passing it
 * as a prop never remounts. Group/array handlers see the same object; the field-
 * only slots (`Control`/`Errors`) no-op for them. The front-end narrows the bag
 * per path (presence + control kind); the runtime is always this object. */
export interface PartsBag {
  Label: PartComponent<LabelData>
  Description: PartComponent<TextData>
  Control: PartComponent<FieldControl>
  Errors: PartComponent<ValidationError[]>
}
const partsBag: PartsBag = { Label, Description, Control, Errors }

/** Whole-node re-entry (the top-level `Default` prop, §2): re-enters the engine
 * for the current node. Exclusive with hand-arranging the parts. */
const DefaultSlot = (): ReactNode => {
  const h = useContext(HandleCtx)
  return h ? <h.helpers.Default of={h.node} /> : null
}

// ---------------------------------------------------------------------------
// Handler props (source-agnostic). The front-end re-types these per path — this
// is the neutral floor those narrowed types are assignable to.
// ---------------------------------------------------------------------------

export interface FieldHandlerProps {
  node: EField
  path: string
  /** Typed to the schema facts at this path by the front-end; `unknown` here.
   * Type-only until a reactive form-state adapter lands (ADR 041 §7). */
  value: unknown
  /** Re-enter the engine for the whole node (exclusive with the parts). */
  Default: () => ReactNode
  parts: PartsBag
}
export interface GroupHandlerProps {
  node: EGroup
  path: string
  Default: () => ReactNode
  parts: PartsBag
  children: ReactNode
}
export interface ArrayHandlerProps {
  node: EArray
  path: string
  Default: () => ReactNode
  parts: PartsBag
  children: ReactNode
}
export interface NodeHandlerProps {
  node: ENode
  path: string
  value: unknown
  Default: () => ReactNode
  parts: PartsBag
  children: ReactNode
}

export type FieldHandler = (props: FieldHandlerProps) => ReactNode
export type GroupHandler = (props: GroupHandlerProps) => ReactNode
export type ArrayHandler = (props: ArrayHandlerProps) => ReactNode
export type NodeHandler = (props: NodeHandlerProps) => ReactNode

/** The selector registry (§3). Register rules by axis; a single node picks one
 * winning rule by specificity. Handlers must be stable references (§1). */
export interface RuleRegistrar {
  /** Exact field path (highest specificity). */
  field(path: string, Handler: FieldHandler): void
  /** Exact (non-root) group path. */
  group(path: string, Handler: GroupHandler): void
  /** Exact array path. */
  array(path: string, Handler: ArrayHandler): void
  /** By control archetype (`input`/`select`/`textarea`/`choicegroup`). */
  control(kind: ControlKind, Handler: FieldHandler): void
  /** Blanket: every field. */
  allFields(Handler: FieldHandler): void
  /** Blanket: every non-root group. */
  allGroups(Handler: GroupHandler): void
  /** Blanket: every array. */
  allArrays(Handler: ArrayHandler): void
  /** Arbitrary neutral-facts predicate (below exact path, above kind). */
  where(predicate: (node: ENode) => boolean, Handler: NodeHandler): void
  /** Fallback for any node no other rule matched (lowest specificity). */
  default(Handler: NodeHandler): void
}

// CSS-cascade specificity (ADR 041 §3): exact path > predicate > control kind >
// kind > default. Distinct per axis so the winner is order-independent across
// axes; ties within an axis never overlap on one node (different paths/kinds).
const SPECIFICITY = {
  path: 400,
  where: 300,
  control: 200,
  kind: 100,
  default: 0,
} as const

interface RuntimeProps {
  node: ENode
  path: string
  value: unknown
  Default: () => ReactNode
  parts: PartsBag
  children?: ReactNode
}

interface Rule {
  specificity: number
  match: (node: ENode) => boolean
  Handler: (props: RuntimeProps) => ReactNode
}

/** A rules builder — registers selector rules on the registrar (§3). */
export type RulesBuild = (r: RuleRegistrar) => void

/**
 * Build a `RenderNode` from selector rules (ADR 041/042) — sugar over the
 * low-level `renderNode`, granting no capability a hand-written resolver lacks.
 * Memoize the result in the consumer (`useMemo`, or use `useRenderNodeRules`
 * which bakes it in) so the resolver identity is stable — an inline call rebuilds
 * it every render and defeats the `NodeRenderer` memo bail.
 *
 * Accepts multiple builders that **compose as ordinary functions** (ADR 041 §6):
 * `renderNodeRules(appRules, formRules)` layers a lower-precedence app scope under
 * a higher-precedence form scope. The cascade is `app-scope < form-scope`, and one
 * scope's rules already sit `adapter < rules < inline` relative to the engine
 * defaults and inline `<Default parts={…}/>`. At EQUAL specificity the later
 * (higher-scope) rule wins, exactly like the CSS cascade.
 */
export function renderNodeRules(...builds: RulesBuild[]): RenderNode {
  const rules: Rule[] = []
  const add = (
    specificity: number,
    match: Rule['match'],
    Handler: unknown
  ): void => {
    rules.push({ specificity, match, Handler: Handler as Rule['Handler'] })
  }
  const r: RuleRegistrar = {
    field: (path, H) =>
      add(SPECIFICITY.path, (n) => n.isField && n.path === path, H),
    group: (path, H) =>
      add(
        SPECIFICITY.path,
        (n) => n.isGroup && !n.isRoot && n.path === path,
        H
      ),
    array: (path, H) =>
      add(SPECIFICITY.path, (n) => n.isArray && n.path === path, H),
    control: (kind, H) =>
      add(
        SPECIFICITY.control,
        (n) => n.isField && n.parts.control.kind === kind,
        H
      ),
    allFields: (H) => add(SPECIFICITY.kind, (n) => n.isField, H),
    allGroups: (H) => add(SPECIFICITY.kind, (n) => n.isGroup && !n.isRoot, H),
    allArrays: (H) => add(SPECIFICITY.kind, (n) => n.isArray, H),
    where: (predicate, H) => add(SPECIFICITY.where, predicate, H),
    // A catch-all for the concrete nodes a consumer authors (never the transparent
    // root shell nor a structural array-item wrapper).
    default: (H) =>
      add(SPECIFICITY.default, (n) => !n.isRoot && !n.isArrayItem, H),
  }
  // Compose builders in order (app scope first, form scope last), so later-
  // registered rules carry higher indices and win ties (§6 cascade).
  for (const build of builds) build(r)
  // Sort by specificity desc; at EQUAL specificity the LATER-registered rule wins
  // (higher index first) — CSS-cascade / spread semantics for `renderNodeRules(app, form)`.
  const sorted = rules
    .map((rule, i) => ({ rule, i }))
    .sort((a, b) => b.rule.specificity - a.rule.specificity || b.i - a.i)
    .map((x) => x.rule)

  // eslint-disable-next-line react/display-name -- returns a RenderNode, not a component
  return (node, helpers) => {
    const rule = sorted.find((rl) => rl.match(node))
    if (!rule) return <helpers.Default of={node} />
    const Handler = rule.Handler
    const isContainer = node.isGroup || node.isArray || node.isArrayItem
    // Inner content is real React `{children}` for containers (§2) — the engine's
    // `Children` re-entry, so nested nodes still flow through the resolver.
    const inner = isContainer ? <helpers.Children of={node} /> : undefined
    return (
      <HandleCtx.Provider value={{ node, helpers }}>
        <Handler
          node={node}
          path={node.path}
          value={undefined}
          Default={DefaultSlot}
          parts={partsBag}
        >
          {inner}
        </Handler>
      </HandleCtx.Provider>
    )
  }
}
