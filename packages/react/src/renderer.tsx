// React adapter for Core's continuation engine (ADR 010 + ADR 013 + ADR 014).
//
// The recursion, enrichment, and scoping live in Core (`createContinuation`).
// This file is the **R = ReactNode** renderer set: per-part defaults as JSX, a
// `root` composer per node kind, and `combine` = a keyed fragment.
//
// Continuation handles are **called, not mounted** internally — `node.Default()`,
// `node.Children()`, `part.Default()` — exactly as the vanilla oracle calls them
// (ADR 015/016). A handle is a per-render closure; mounting one as `<x.Default/>`
// makes a *fresh component type every render*, so any real re-render remounts the
// subtree and discards uncontrolled DOM (typed values). Calling instead yields
// markup composed only of module-level component types (`NodeRenderer`,
// `ArrayStateProvider`, `PartHost`, the intrinsic elements), which reconcile in place. The
// engine threads the active resolver as a parameter and each handle closes over
// it, so a called `node.Default()` still sees the right (possibly scoped)
// resolver with no Context — the vanilla probe (ADR 008) proved Context was
// incidental; conformance keeps them honest.
//
// Consumers get JSX back via the **component re-entry layer** (ADR 017, below):
// `<Default of={node} />` / `<Children of={node} />` are module-level components
// that take the handle as a prop and delegate to its callable — JSX ergonomics
// with the same stable-type guarantee. The two IOC seams inject these helpers.
//
// Customization is by-reference over this set (ADR 013 / ADR 051): spread
// `nativeDefaults` and swap an entry, or `mergeDefaults(nativeDefaults, …)`.
// `createRenderer` binds a partial set whose gaps fall back to the visible
// `diagnosticDefaults` markers (the "floor"). `SchemaFields` is the
// batteries-included rung — the floor over `nativeDefaults` — and renders
// the form's *content only*; the `<form>` + submit button are the consumer's.
//
// Front-end-agnostic: this operates on the Core form *tree*, never a schema.
// Input packages compile their source before `useFormTree` binds React behavior.
import {
  useMemo,
  useState,
  useRef,
  useCallback,
  useContext,
  createContext,
  memo,
  Fragment,
  type ReactNode,
} from 'react'
import {
  createContinuation,
  mergeAdapter,
  type Continuation,
  type RendererAdapter,
  type PartialAdapter,
  type PartOverrideMap,
  type ArrayItemNode,
  type AnySchemaResolver,
  type AnyGroupNode,
  type AnyTreeNode,
  type FieldControl,
  type ControlKind,
  type ValidationError,
  type FormShape,
  type OriginOf,
  type TreeShapeOf,
} from '@formframe/core'
import type { EArray, EArrayItem, EField, EGroup } from './enriched'
import {
  resolveIntercept,
  interceptStabilityDeps,
  type Intercept,
  type InterceptFn,
} from './intercept'
import type { PartsBag } from './interceptRules'
import type { LayoutRoot } from './layoutShape'

// ---------------------------------------------------------------------------
// Public types — React instantiates the generic engine at R = ReactNode.
// ---------------------------------------------------------------------------

/**
 * Per-node render hook (IOC). Receives the enriched node and the injected
 * `{ Default, Children }` helpers; return custom JSX to hijack the node, or
 * `<Default of={node} />` to re-enter the engine. (`RenderHelpers`, `Default`,
 * and `Children` are defined in the component-handle layer below.)
 *
 * Also accepts path-map and `{ paths, where }` bag sugar — see `intercept.ts`.
 */
export type { Intercept, InterceptFn } from './intercept'
export type ReactDefaults = RendererAdapter<ReactNode>
export type ReactPartialDefaults = PartialAdapter<ReactNode>
export type { ENode, EField, EGroup, EArray, EArrayItem } from './enriched'

// ---------------------------------------------------------------------------
// Default renderer set (R = ReactNode)
//
// Near-styleless (ADR 012 §4): semantic markup + stable `jsf-*` class hooks, no
// inline styles. Parts are per-node-context — a field's label is a `<label>`, a
// group's is a `<legend>`. Kept identical to the vanilla oracle by conformance.
// ---------------------------------------------------------------------------

function DefaultFieldLabel({
  text,
  attrs,
  showRequired,
}: {
  text: string
  attrs: { id: string; for?: string }
  showRequired: boolean
}): ReactNode {
  // Neutral HTML attrs → React props: the only rename is `for`→`htmlFor`. Every
  // caption has an `id`; `for` is present only when it points at a single
  // control (omitted for a choicegroup, so `htmlFor={undefined}` drops out).
  const { for: htmlFor, ...rest } = attrs
  return (
    <label {...rest} htmlFor={htmlFor}>
      {text}
      {showRequired && <span aria-hidden> *</span>}
    </label>
  )
}

function DefaultDescription({ text }: { text: string }): ReactNode {
  return <small className="jsf-description">{text}</small>
}

/** When a field has errors, the root wraps its control in this provider.
 * Used by the default `DefaultControl` (and by customize `parts.Control` when
 * no render prop). Hand-wired control *overrides* get the same attrs as
 * `part.errorA11y` instead — no context read required in the callback. */
export interface FieldA11yState {
  errorId: string
}
export const FieldA11yContext = createContext<FieldA11yState | null>(null)

/** Spreadable aria attrs for *error state only* (`aria-invalid` /
 * `aria-describedby` → the field error list). Empty when nothing is shown —
 * so `aria-invalid` never disagrees with the error list. Structural label
 * a11y (`role`, `aria-labelledby`) stays on the control description itself. */
export type ErrorA11yProps = {
  'aria-invalid'?: true
  'aria-describedby'?: string
}

export function errorA11yProps(state: FieldA11yState | null): ErrorA11yProps {
  return state
    ? { 'aria-invalid': true, 'aria-describedby': state.errorId }
    : {}
}

/** Attach error-state a11y for a control *override*: merge into `attrs` when
 * the archetype has them (input/select/textarea); always expose top-level
 * `errorA11y` for choicegroup (no attrs bag — error aria goes on the wrapper). */
function enrichControlErrorA11y(
  control: FieldControl,
  errorA11y: ErrorA11yProps
): FieldControl & { errorA11y: ErrorA11yProps } {
  switch (control.kind) {
    case 'input':
      return {
        ...control,
        attrs: { ...control.attrs, ...errorA11y },
        errorA11y,
      }
    case 'select':
      return {
        ...control,
        attrs: { ...control.attrs, ...errorA11y },
        errorA11y,
      }
    case 'textarea':
      return {
        ...control,
        attrs: { ...control.attrs, ...errorA11y },
        errorA11y,
      }
    case 'choicegroup':
      return { ...control, errorA11y }
  }
}

/**
 * Bridge for `<Default of={field} errors={…} />` and {@link InjectFieldErrors}:
 * the ADR-017 component cannot forward `errors` through Core's
 * `node.Default(opts)` without a Core change, so it wraps the re-entry in this
 * provider. `null` = not injected (no errors); an array (including `[]`) =
 * recipe-pre-gated source of truth. Recipes write via the wrap / `errors` prop;
 * `DefaultFieldRoot` reads via {@link useInjectedFieldErrors}.
 */
const InjectedFieldErrorsContext = createContext<ValidationError[] | null>(null)

/** Read recipe-pre-gated errors written by {@link InjectFieldErrors} or
 * `<Default of={field} errors={…} />`. Empty when nothing was injected — the
 * library does not produce/store errors itself (ADR 050). */
function useInjectedFieldErrors(): ValidationError[] {
  return useContext(InjectedFieldErrorsContext) ?? []
}

/**
 * The unified control renderer (ADR 029 §5, v60): ONE `field.control` slot that
 * narrows on `control.kind` — the render archetype — instead of separate
 * `input`/`select` parts. A new widget is a new `kind` arm here, nothing in the
 * engine or the node type. a11y wiring (`aria-invalid`/`aria-describedby`) is
 * applied once, from the field root's `FieldA11yContext`, for every archetype.
 */
function DefaultControl(control: FieldControl): ReactNode {
  const a11yState = useContext(FieldA11yContext)
  const errorA11y = errorA11yProps(a11yState)
  switch (control.kind) {
    case 'input':
      return <input {...control.attrs} {...errorA11y} />
    case 'textarea':
      return <textarea {...control.attrs} {...errorA11y} />
    case 'select': {
      const { attrs, options } = control
      return (
        <select {...attrs} {...errorA11y}>
          {/* No blank placeholder for multiple — nothing to "un-select" to. */}
          {!attrs.multiple && <option value="">-- select --</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    }
    case 'choicegroup': {
      // Radio (single) or checkbox (multi) group — a set of native option inputs,
      // each implicitly labelled by its wrapping `<label>` (bd cm7). Group label
      // a11y is Core-derived (bd l8j): `control.role` (radiogroup|group) and
      // `aria-labelledby={control.labelledBy}` naming the group by its caption id —
      // no adapter recomputes the role. Error-state aria (`errorA11y`) is separate.
      // Each option is uncontrolled with a `value` attr (radio/checkbox use
      // `checked`, not `value`, so no controlled warning).
      return (
        <div
          className="jsf-choicegroup"
          role={control.role}
          aria-labelledby={control.labelledBy}
          {...errorA11y}
        >
          {control.options.map((o) => (
            <label key={o.attrs.id} className="jsf-choice">
              <input {...o.attrs} />
              <span className="jsf-choice-text">{o.label}</span>
            </label>
          ))}
        </div>
      )
    }
  }
}

function DefaultGroupLabel({ text }: { text: string }): ReactNode {
  return <legend>{text}</legend>
}

// ---------------------------------------------------------------------------
// Validation display (ADR 050) — runtime state, NOT an IR part.
//
// The library does NOT produce, schedule, or store validation errors — it only
// RENDERS them through the inject seam:
// `<Default of={field} errors={ValidationError[]} />` (recipe-pre-gated, present
// == show). With no injected `errors` a field emits NO error markup, so React
// still matches the vanilla oracle (see conformance.test.tsx).
// ---------------------------------------------------------------------------

/** Stable control `id` for a field path (matches Core's `attrs.id`). */
// Single source of truth for deriving a control's DOM id from its field path,
// paired with `fieldErrorId`. Identity today because Core already uses the
// dot-path as `attrs.id`; id-encoding for CSS-selector / URL-fragment-unsafe
// paths (dots, slashes, array indices) will land here so it changes in one place.
export function fieldControlId(path: string): string {
  return path
}

/** Stable error-list `id` for `aria-describedby` on the field control. */
export function fieldErrorId(path: string): string {
  return `${path}-errors`
}

/** Shared error-list markup for the inject path. No `role="alert"` —
 * assertive live regions re-announce on every keystroke under revalidate-on-
 * change; `aria-describedby` carries the message without the interruption. */
function FieldErrorsList({
  path,
  errors,
}: {
  path: string
  errors: ValidationError[]
}): ReactNode {
  return (
    <ul id={fieldErrorId(path)} className="jsf-field-errors">
      {errors.map((error, i) => (
        <li key={i}>{error.message}</li>
      ))}
    </ul>
  )
}

function renderPart(
  part: { Default(): ReactNode } | undefined,
  override: ((part: unknown) => ReactNode) | undefined
): ReactNode {
  if (!part) return null
  // Call, never mount: `part.Default()` returns a stable `PartHost` element.
  return override ? override(part) : part.Default()
}

/** Compose a field from its parts: label, description, control, and errors.
 * FormFrame error a11y (`FieldA11yContext` / enrich / `FieldErrorsList`) lives
 * here. `parts.control` overlays receive the enriched control plus `errorA11y`.
 * `parts.errors` overlays receive the visible `ValidationError[]`. */
function DefaultFieldRoot({
  node,
  overrides,
}: {
  node: EField
  overrides?: PartOverrideMap<ReactNode>
}): ReactNode {
  const issues = useInjectedFieldErrors()
  const visible = issues.length > 0
  const a11yState = visible ? { errorId: fieldErrorId(node.path) } : null
  const errorA11y = errorA11yProps(a11yState)

  const controlPart = node.parts.control
  const controlOverride = overrides?.['control']
  const control = controlOverride ? (
    controlOverride(enrichControlErrorA11y(controlPart, errorA11y))
  ) : (
    <FieldA11yContext.Provider value={a11yState}>
      {controlPart.Default()}
    </FieldA11yContext.Provider>
  )

  const errorsOverride = overrides?.['errors']
  const errorsNode: ReactNode = !visible ? null : errorsOverride ? (
    errorsOverride(issues)
  ) : (
    <FieldErrorsList path={node.path} errors={issues} />
  )

  return (
    <div className="jsf-field">
      {renderPart(node.parts.label, overrides?.['label'])}
      {renderPart(node.parts.description, overrides?.['description'])}
      {control}
      {errorsNode}
    </div>
  )
}

/** Compose a group: a captioned `<fieldset>`, or a plain `<div>` when nameless. */
function DefaultGroupRoot({
  node,
  children,
}: {
  node: EGroup
  children: ReactNode
}): ReactNode {
  const { label, description } = node.parts
  if (!label && !description) return <div className="jsf-group">{children}</div>
  return (
    <fieldset className="jsf-group">
      {label && label.Default()}
      {description && description.Default()}
      {children}
    </fieldset>
  )
}

function DefaultArrayLabel({ text }: { text: string }): ReactNode {
  return <legend>{text}</legend>
}

/**
 * Per-array action handlers, supplied by `ArrayStateProvider` to the add /
 * remove button parts through Context. Interactivity is per-adapter, *not* part
 * of the markup contract (ADR 008/013) — the string oracle has no Context and
 * renders the same buttons inert. Routing behavior through Context (rather than
 * a button prop) keeps a button's *markup* overridable without losing the
 * wiring, and isolates a button re-render from the items it sits beside.
 */
interface ArrayActions {
  add?: () => void
  remove?: () => void
}
const ArrayActionsContext = createContext<ArrayActions>({})

function DefaultAddButton({
  attrs,
  label,
}: {
  attrs: { type: 'button' }
  label: string
}): ReactNode {
  const { add } = useContext(ArrayActionsContext)
  return (
    <button {...attrs} onClick={add}>
      {label}
    </button>
  )
}

function DefaultRemoveButton({
  attrs,
  label,
}: {
  attrs: { type: 'button' }
  label: string
}): ReactNode {
  const { remove } = useContext(ArrayActionsContext)
  return (
    <button {...attrs} onClick={remove}>
      {label}
    </button>
  )
}

/**
 * Per-item Context boundary. Memoizing `actions` on `[remove, id]` — both stable
 * — keeps the value referentially constant across `ArrayStateProvider` re-renders, so a
 * sibling add/remove can never re-render this item's Remove button (a Context
 * consumer) even though it sits below a memo-bailed `NodeRenderer`.
 */
function ArrayItemActions({
  id,
  remove,
  children,
}: {
  id: number
  remove: (id: number) => void
  children: ReactNode
}): ReactNode {
  const actions = useMemo<ArrayActions>(
    () => ({ remove: () => remove(id) }),
    [remove, id]
  )
  return (
    <ArrayActionsContext.Provider value={actions}>
      {children}
    </ArrayActionsContext.Provider>
  )
}

/** A mounted array item: a stable synthetic id (its React key) + its Core item core. */
interface ArraySlot {
  id: number
  core: ArrayItemNode
}

/**
 * The stateful heart of array add/remove (React-only). It owns the list of item
 * *slots* — each a monotonic `id` (the React key / identity) paired with a `core`
 * minted at the item's **dense position**, so identity and path are decoupled.
 *
 * Re-pathing happens **event-time, in the state updater** (never during render),
 * keeping render pure (ADR 017): a slot whose position is unchanged keeps its
 * exact `core` reference, so `NodeRenderer`'s `memo` bails and it does not
 * re-render; a slot that shifts (after a remove) re-mints its `core` at the new
 * index, so just those survivors re-render to update their dense `name` attrs in
 * place — their React key is unchanged, so the DOM (and uncontrolled value)
 * survives. Appending shifts nothing, so it re-renders no existing item.
 *
 * Ids are never reused and are the React key only (identity); the item's path is
 * its dense position, re-minted on shift. This realizes ADR 016's lifted
 * constraint and reverses ADR 015 §6's stable-sparse paths (ADR 018).
 *
 * Lifted above the replaceable `array.root` template (ADR 051 §3): `createRenderer`
 * always wraps the merged template in this provider so add/remove state survives
 * custom layout. The template receives live slot children via the render prop.
 */
function ArrayStateProvider({
  node,
  children,
}: {
  node: EArray
  children: (items: ReactNode) => ReactNode
}): ReactNode {
  const seedCount = Object.keys(node.children).length
  // Monotonic id source — the React *key* only, never a path index. Seeded past
  // the initial items and advanced only in handlers (event-time, not in render).
  const nextId = useRef(seedCount)
  const [slots, setSlots] = useState<ArraySlot[]>(() =>
    Array.from({ length: seedCount }, (_, i) => ({
      id: i,
      core: node.getItem(i),
    }))
  )
  const itemPath = useCallback(
    (index: number) => (node.path ? `${node.path}.${index}` : String(index)),
    [node]
  )
  /** Re-mint cores for slots whose position changed; leave the rest by reference. */
  const densify = useCallback(
    (list: ArraySlot[]): ArraySlot[] =>
      list.map((slot, index) =>
        slot.core.path === itemPath(index)
          ? slot
          : { ...slot, core: node.getItem(index) }
      ),
    [node, itemPath]
  )
  const add = useCallback(() => {
    setSlots((s) => [
      ...s,
      { id: nextId.current++, core: node.getItem(s.length) },
    ])
  }, [node])
  // Drop by id, then re-path survivors densely. Unshifted survivors keep their
  // `core` (memo bail); shifted ones re-mint and re-render in place (value kept).
  const removeById = useCallback(
    (id: number) => {
      setSlots((s) => densify(s.filter((slot) => slot.id !== id)))
    },
    [densify]
  )
  const addActions = useMemo<ArrayActions>(() => ({ add }), [add])

  const items = slots.map((slot) => (
    <ArrayItemActions key={slot.id} id={slot.id} remove={removeById}>
      {node.renderItem(slot.core)}
    </ArrayItemActions>
  ))

  return (
    <ArrayActionsContext.Provider value={addActions}>
      {children(items)}
    </ArrayActionsContext.Provider>
  )
}

/** Compose an array from its parts and live slot children (like `DefaultGroupRoot`). */
function DefaultArrayRoot({
  node,
  children,
}: {
  node: EArray
  children: ReactNode
}): ReactNode {
  const { label, description, addButton } = node.parts
  return (
    <fieldset className="jsf-array">
      {label && label.Default()}
      {description && description.Default()}
      <div className="jsf-array-items">{children}</div>
      {addButton.Default()}
    </fieldset>
  )
}

/** Compose one array item: its content + the remove control. */
function DefaultArrayItemRoot({
  node,
  children,
}: {
  node: EArrayItem
  children: ReactNode
}): ReactNode {
  return (
    <div className="jsf-array-item">
      {children}
      {node.parts.removeButton.Default()}
    </div>
  )
}

/**
 * Stable host for one part's default (the engine's `renderPart` seam). Every
 * part renders through this ONE module-level component: the part's render thunk
 * arrives as a prop, so across re-renders the host type is constant and React
 * reconciles in place — it never remounts a per-render closure (which would
 * discard an uncontrolled `<input>`'s value). It also gives the part its own
 * fiber *below* whatever Provider its parent rendered, so a Context-reading part
 * (the array add/remove buttons) sees the actions — calling the thunk inline in
 * the parent would read Context from above that Provider and miss them.
 */
function PartHost({ render }: { render: () => ReactNode }): ReactNode {
  return render()
}

// The engine supplies each child's *relative* identity as `key` (a property name
// or positional index), stable across a dense array re-path — so the fragment key
// is stable too, and a surviving item reconciles in place instead of remounting
// (ADR 018). We render through it verbatim.
const combine: ReactDefaults['combine'] = ({ children }) => (
  <>
    {children.map((c) => (
      <Fragment key={c.key}>{c.node}</Fragment>
    ))}
  </>
)

/** Native HTML defaults — merge or spread this to override entries by reference. */
export const nativeDefaults: ReactDefaults = {
  field: {
    root: DefaultFieldRoot,
    label: DefaultFieldLabel,
    description: DefaultDescription,
    control: DefaultControl,
  },
  group: {
    root: DefaultGroupRoot,
    label: DefaultGroupLabel,
    description: DefaultDescription,
  },
  array: {
    root: DefaultArrayRoot,
    label: DefaultArrayLabel,
    description: DefaultDescription,
    addButton: DefaultAddButton,
  },
  arrayItem: {
    root: DefaultArrayItemRoot,
    removeButton: DefaultRemoveButton,
  },
  combine,
}

// ---------------------------------------------------------------------------
// Diagnostic renderer set — the floor's fallback (ADR 013).
//
// Every content entry renders a visible `[… not implemented]` marker echoing the
// node/part data, so an incomplete adapter still runs and tells you what's
// missing. `root`s still descend (compose parts / pass children through) so that
// filling one entry "lights it up" in place. `combine` is real plumbing.
// ---------------------------------------------------------------------------

function NotImplemented({
  kind,
  data,
}: {
  kind: string
  data: unknown
}): ReactNode {
  return (
    <span className="jsf-not-implemented" data-jsf-not-implemented={kind}>
      [… not implemented: {kind} {JSON.stringify(data)}]
    </span>
  )
}

export const diagnosticDefaults: ReactDefaults = {
  field: {
    root: ({ node, overrides }) => (
      <div
        className="jsf-not-implemented"
        data-jsf-not-implemented="field.root"
      >
        <NotImplemented
          kind="field"
          data={{ path: node.path, widget: node.widget }}
        />
        <DefaultFieldRoot node={node} overrides={overrides} />
      </div>
    ),
    label: (data) => <NotImplemented kind="label" data={data} />,
    description: (data) => <NotImplemented kind="description" data={data} />,
    control: (data) => <NotImplemented kind="control" data={data} />,
  },
  group: {
    root: ({ node, children }) => (
      <div
        className="jsf-not-implemented"
        data-jsf-not-implemented="group.root"
      >
        <NotImplemented kind="group" data={{ path: node.path }} />
        {children}
      </div>
    ),
    label: (data) => <NotImplemented kind="label" data={data} />,
    description: (data) => <NotImplemented kind="description" data={data} />,
  },
  array: {
    root: ({ node, children }) => (
      <div
        className="jsf-not-implemented"
        data-jsf-not-implemented="array.root"
      >
        <NotImplemented kind="array" data={{ path: node.path }} />
        {children}
      </div>
    ),
    label: (data) => <NotImplemented kind="label" data={data} />,
    description: (data) => <NotImplemented kind="description" data={data} />,
    addButton: (data) => <NotImplemented kind="addButton" data={data} />,
  },
  arrayItem: {
    root: ({ node, children }) => (
      <div
        className="jsf-not-implemented"
        data-jsf-not-implemented="arrayItem.root"
      >
        <NotImplemented kind="arrayItem" data={{ path: node.path }} />
        {children}
      </div>
    ),
    removeButton: (data) => <NotImplemented kind="removeButton" data={data} />,
  },
  combine,
}

/** Last-wins merge of renderer defaults (ADR 051). Core's engine name is `mergeAdapter`. */
export function mergeDefaults(
  base: ReactDefaults,
  over: ReactPartialDefaults
): ReactDefaults {
  return mergeAdapter(base, over)
}

// ---------------------------------------------------------------------------
// Component re-entry layer (ADR 017) — JSX handles over the callable engine.
//
// ADR 016 made the React fold render by *calling* `node.Default()` so the markup
// is built only from module-level component types (no per-render closure mounted
// as a fresh type → no remount). This layer restores JSX ergonomics WITHOUT
// reintroducing that closure: `<Default of={node} />` and `<Children of={node} />`
// are ONE module-level component each. They take the handle as a *prop* and
// delegate to the node's own bound callable, so they reconcile in place, work in-
// and out-of-position (`of={node.children.x}`), render parts too
// (`of={node.parts.label}`), and are null-safe (`of={undefined}` → nothing). The
// two IOC seams inject `{ Default, Children }` (`intercept` per node, `layout`
// at any container — ADR 053 / 054). Layout placements `Resolve` (intercept then
// template); intercept re-entry is the template. Both helpers are also exported.
// ---------------------------------------------------------------------------

/** Helpers handed to the IOC callbacks (also exported as top-level components). */
export interface RenderHelpers {
  Default: typeof Default
  Children: typeof Children
}

/**
 * Place-yourself callback (ADR 053 / 054). Same shape at the root (`SchemaFields
 * layout`) and on a nested container (`<Default of={group} layout={…} />`).
 */
export type NodeLayout<N = EGroup> = (
  node: N,
  helpers: RenderHelpers
) => ReactNode

/**
 * Layout's `<Default of={node} />` is placement (`Resolve` — intercept then
 * template). Intercept's `<Default of={node} />` is the template (no loop).
 * `layout` on Default sets place-mode for its callback.
 */
const PlaceModeCtx = createContext(false)
/** Nearest `<Default intercept>` while laying out nested placements. */
const PlacementInterceptCtx = createContext<Intercept | undefined>(undefined)

/** Live array item slots, published by {@link ArrayStateProvider} so a custom
 * `layout` on an array can place them via `<Children of={array} />`. Keyed by
 * path: a group layout containing `<Children of={someOtherArray} />` must not
 * pick up the items of the array whose layout it sits inside. */
const ArrayItemsCtx = createContext<{ path: string; items: ReactNode } | null>(
  null
)

const helpers: RenderHelpers = { Default, Children }

/** Adapt a user `InterceptFn` (node + helpers) to Core's 1-arg `Resolver`. */
const adaptResolver = (rn: InterceptFn): AnySchemaResolver<ReactNode> =>
  function resolveWithIntercept(node) {
    return (
      <PlaceModeCtx.Provider value={false}>
        {rn(node, helpers)}
      </PlaceModeCtx.Provider>
    )
  }

/**
 * Identity-stable `Intercept` → Core resolver, cached at module scope.
 *
 * `Default` runs for every placed node, so it cannot memoize this with a hook:
 * `interceptStabilityDeps` returns a *variable-length* array (`[]` for
 * `undefined`, `[fn]` for a function, N entries for a map/bag), and React
 * compares only the overlapping prefix of a resized dep list — so toggling an
 * intercept from `undefined` to a function kept the stale `undefined` resolver
 * (#168). `resolveIntercept` already caches lowered maps/bags on handler
 * identity, so a WeakMap on the lowered function is stable without hooks.
 */
const resolverByIntercept = new WeakMap<
  InterceptFn,
  AnySchemaResolver<ReactNode>
>()
function resolverFor(
  intercept: Intercept | undefined
): AnySchemaResolver<ReactNode> | undefined {
  if (!intercept) return undefined
  const lowered = resolveIntercept(intercept)
  let resolver = resolverByIntercept.get(lowered)
  if (!resolver) {
    resolver = adaptResolver(lowered)
    resolverByIntercept.set(lowered, resolver)
  }
  return resolver
}

/** The (post-adapt) opts every node's `Default` accepts. Widened so the generic
 * constraint covers both nodes and parts and `of.Default(...)` needs no cast;
 * the precise per-node `parts` type still comes from `DefaultOptsOf<H>` below. */
interface NodeDefaultOpts {
  parts?: PartOverrideMap<ReactNode>
  renderNode?: AnySchemaResolver<ReactNode>
}

// Extract the opts the *actual* handle accepts: a node yields `{ parts, renderNode }`
// (precise per node), a part yields none — so `parts` is offered only where it
// means something, carrying the node's own override types.
type DefaultOptsOf<H> = H extends { Default(opts?: infer O): ReactNode }
  ? O
  : never

/** Widen Core's schema-part overrides with the runtime Errors slot +
 * `errorA11y` on control (neither is a Core IR part — both are React
 * presentation). For input/select/textarea, error-state a11y is also merged
 * into `attrs` so `{...c.attrs}` carries aria-invalid / aria-describedby.
 *
 * Prefer the handle's live `parts.control` type when present — that is how
 * `ControlProps<'input'>['node']` flows a kind-narrowed control into
 * `<Default of={node} parts={{ control: (c) => … }}>` without a `c.kind` guard.
 * Fall back to Core's wide PartsOverrides parameter when `of` is a plain EField. */
type ControlOverrideOf<H, P> = H extends { parts: { control: infer C } }
  ? (part: C & { errorA11y: ErrorA11yProps }) => ReactNode
  : P extends { control?: (part: infer C) => ReactNode }
    ? (part: C & { errorA11y: ErrorA11yProps }) => ReactNode
    : (part: { errorA11y: ErrorA11yProps }) => ReactNode

type WidenParts<H, P> = P extends object
  ? Omit<P, 'control'> & {
      control?: ControlOverrideOf<H, P>
      /** Visible field errors (ADR 047 / ADR 050). Present == show. */
      errors?: (errors: ValidationError[]) => ReactNode
    }
  : P

/**
 * `<Default parts={{ control }}>` / intercept `{ control: X }` renderer.
 * Pass `K` to skip the `c.kind` guard — `ControlOverride<'input'>` sees
 * `c.attrs` as `HtmlInputAttrs`. Bivariant like `InterceptHandler` so a
 * kind-narrowed renderer is a legal `DefaultParts['control']`. Path-generic
 * intercept maps (#87) will infer `K` from the key.
 */
export type ControlOverride<K extends ControlKind = ControlKind> = {
  bivarianceHack(
    part: Extract<FieldControl, { kind: K }> & { errorA11y: ErrorA11yProps }
  ): ReactNode
}['bivarianceHack']

/** Field-complete `<Default parts>` map (plus listed array keys). Path-map
 * intercept parts objects use this same shape — `{ control: X }` is literally
 * `<Default of={node} parts={{ control: X }} />`. `root` is not a key here
 * (Default *is* root). */
export type DefaultParts = {
  label?: (part: EField['parts']['label']) => ReactNode
  description?: (part: NonNullable<EField['parts']['description']>) => ReactNode
  control?: ControlOverride
  errors?: (errors: ValidationError[]) => ReactNode
  addButton?: (part: EArray['parts']['addButton']) => ReactNode
  removeButton?: (part: EArrayItem['parts']['removeButton']) => ReactNode
}

function isHandlerPartsBag(parts: object): parts is PartsBag {
  return Object.prototype.hasOwnProperty.call(parts, 'Control')
}

/** Core `rebind` is on node handles, not part handles (a part has only
 * `Default()`), so re-enrich only when the handle actually offers it. */
function rebindHandle<H>(
  of: H,
  resolver: AnySchemaResolver<ReactNode>
): unknown {
  const rebind = (
    of as { rebind?: (r: AnySchemaResolver<ReactNode>) => unknown }
  ).rebind
  return typeof rebind === 'function' ? rebind.call(of, resolver) : of
}

/** An array node handle — has the stateful `renderItem` seam `ArrayStateProvider`
 * drives. Narrowed structurally so parts and other kinds fall through. */
function isArrayHandle(of: unknown): of is EArray {
  return (
    typeof of === 'object' &&
    of !== null &&
    (of as { isArray?: boolean }).isArray === true &&
    typeof (of as { renderItem?: unknown }).renderItem === 'function'
  )
}

function handlerBagToOverrides(bag: PartsBag): PartOverrideMap<ReactNode> {
  return {
    label: () => <bag.Label />,
    description: () => <bag.Description />,
    control: () => <bag.Control />,
    errors: (errs) => <bag.Errors errors={errs as ValidationError[]} />,
  }
}

type DefaultExtra<H> =
  DefaultOptsOf<H> extends {
    parts?: infer P
    renderNode?: unknown
  }
    ? {
        parts?: WidenParts<H, P>
        intercept?: Intercept
        layout?: NodeLayout<H>
      }
    : Record<never, never>

/**
 * Render any handle's default — a node, a child node, or a part (anything with a
 * `.Default()`). `of={null/undefined}` renders nothing, so optional parts and
 * absent children are safe. `parts` / `intercept` / `layout` apply only to nodes
 * (a part's type offers none). `errors` injects per-field `ValidationError[]`
 * for field nodes — recipe-pre-gated (present == show); omit for no errors (the
 * library does not produce/store them itself — ADR 050). Stable module-level
 * type → reconciles in place.
 *
 * `layout` is fractal SchemaFields (ADR 054): skip this node's template and
 * place its children. A bare nested `<Default of={child} />` still goes through
 * intercept; adding `parts` to a placement makes it a template call instead
 * (the two cannot compose — an intercept that replaces the node has nowhere to
 * apply part overrides). `intercept` without `layout` is a scoped resolver for
 * this template call (nearest scope wins). `layout` + `intercept` together:
 * layout first, and the callback receives a handle **rebound** to that scope so
 * `Children` / `child` / `children.x` / `renderItem` resolve through it too.
 *
 * `layout` on an array re-installs add/remove state (the template it skips is
 * where that state lives), so `<Children of={array} />` yields live slots.
 *
 * A layout that **reorders** placements must key them (`key={node.path}`) —
 * placements bypass the engine's `combine`, which supplies child keys in the
 * normal walk, so React would otherwise reconcile by position and leave an
 * uncontrolled value attached to the wrong field.
 *
 * `parts` is the camelCase Default map (`{ control: X }`) or the handler
 * placeable bag (`{ Control, Label, … }`) for intercept pass-through.
 */
export function Default<
  H extends { Default(opts?: NodeDefaultOpts): ReactNode },
>(
  props: {
    of: H | null | undefined
    errors?: ValidationError[]
  } & DefaultExtra<H>
): ReactNode
export function Default<
  H extends { Default(opts?: NodeDefaultOpts): ReactNode },
>(props: {
  of: H | null | undefined
  errors?: ValidationError[]
  parts: PartsBag
  intercept?: Intercept
  layout?: NodeLayout<H>
}): ReactNode
export function Default<
  H extends { Default(opts?: NodeDefaultOpts): ReactNode },
>(props: {
  of: H | null | undefined
  errors?: ValidationError[]
  parts: DefaultParts
  intercept?: Intercept
  layout?: NodeLayout<H>
}): ReactNode
export function Default<
  H extends { Default(opts?: NodeDefaultOpts): ReactNode },
>(props: {
  of: H | null | undefined
  errors?: ValidationError[]
  parts?: unknown
  intercept?: Intercept
  layout?: NodeLayout<H>
}): ReactNode {
  const place = useContext(PlaceModeCtx)
  const ambient = useContext(PlacementInterceptCtx)
  const { of, errors } = props
  if (of == null) return null
  const {
    parts: rawParts,
    intercept,
    layout,
  } = props as {
    parts?: PartOverrideMap<ReactNode> | PartsBag
    intercept?: Intercept
    layout?: NodeLayout<H>
  }
  const parts =
    rawParts && isHandlerPartsBag(rawParts)
      ? handlerBagToOverrides(rawParts)
      : rawParts
  const render = (): ReactNode => {
    if (layout) {
      // The scope's resolver is this node's own `intercept`, else the nearest
      // enclosing placement intercept. `rebind` re-enriches the handle against
      // it (Core) so EVERY handle the callback touches agrees — `Children()`,
      // `child()`, `children.x`, `Resolve()`, and an array's `renderItem` —
      // instead of only the placements that happen to go through `<Default>`.
      // Without it, `<Children of={node} />` inside a scoped layout silently
      // rendered through the OUTER resolver (ADR 054 "nearest scope wins").
      const scopeIntercept = intercept ?? ambient
      const scopeResolver = resolverFor(scopeIntercept)
      const scoped = (
        scopeResolver ? rebindHandle(of, scopeResolver) : of
      ) as typeof of
      const body = (
        <PlaceModeCtx.Provider value={true}>
          <PlacementInterceptCtx.Provider value={scopeIntercept}>
            {layout(scoped, helpers)}
          </PlacementInterceptCtx.Provider>
        </PlaceModeCtx.Provider>
      )
      // A custom array layout replaces `array.root`, which is where
      // `createRenderer` installs add/remove state — so install it here too, or
      // the add button is inert and `<Children/>` shows static seed items
      // instead of live slots (ADR 051 §3 / #145).
      if (!isArrayHandle(scoped)) return body
      const arrayNode = scoped
      return (
        <ArrayStateProvider node={arrayNode}>
          {(items) => (
            <ArrayItemsCtx.Provider value={{ path: arrayNode.path, items }}>
              {body}
            </ArrayItemsCtx.Provider>
          )}
        </ArrayStateProvider>
      )
    }
    // `parts` is a TEMPLATE instruction, so it deliberately wins over an
    // ambient placement intercept: the inline overlay at the placement site is
    // the more specific instruction (same "nearest scope wins" rule). An
    // intercept that replaces the node outright cannot also honor part
    // overrides, so the two do not compose — see ADR 054.
    if (parts || intercept) {
      return of.Default({ parts, renderNode: resolverFor(intercept) })
    }
    const resolve = (
      of as {
        Resolve?: (opts?: {
          renderNode?: AnySchemaResolver<ReactNode>
        }) => ReactNode
      }
    ).Resolve
    if (place && typeof resolve === 'function') {
      const scopeResolver = resolverFor(ambient)
      return scopeResolver ? resolve({ renderNode: scopeResolver }) : resolve()
    }
    return of.Default()
  }
  // `of.Default()` calls `DefaultFieldRoot` as a function (engine contract), so
  // its hooks run in whatever component invokes it. Bridge `errors` by mounting
  // a child under the provider and invoking the thunk THERE — same PartHost
  // pattern — otherwise `useContext` would look above this Default, miss the
  // provider we are about to return, and ignore the inject.
  if (errors === undefined) return render()
  return (
    <InjectedFieldErrorsContext.Provider value={errors}>
      <InjectedErrorsGate render={render} />
    </InjectedFieldErrorsContext.Provider>
  )
}

/** Invoke `of.Default()` under `InjectedFieldErrorsContext` (see Default above). */
function InjectedErrorsGate({
  render,
}: {
  render: () => ReactNode
}): ReactNode {
  return render()
}

/**
 * Wrap field markup so {@link DefaultFieldRoot} sees recipe-pre-gated errors
 * without calling `<Default of={field} errors={…} />` from a custom
 * `defaults.field.root` (that would mean the current merged defaults and
 * infinite-loop). Call the previous root, then wrap its result:
 *
 * ```tsx
 * <InjectFieldErrors errors={errors}>
 *   <Root node={node} overrides={overrides} />
 * </InjectFieldErrors>
 * ```
 *
 * where `Root` is `nativeDefaults.field.root` (or the previous merged root),
 * not `<Default of={node} />`.
 */
export function InjectFieldErrors({
  errors,
  children,
}: {
  errors: ValidationError[]
  children: ReactNode
}): ReactNode {
  return (
    <InjectedFieldErrorsContext.Provider value={errors}>
      {children}
    </InjectedFieldErrorsContext.Provider>
  )
}

/**
 * Render a container handle's children through the active resolver. Null-safe
 * and kind-safe: a non-container (a field) or `null/undefined` renders nothing.
 */
export function Children({
  of,
}: {
  of: { Children?(): ReactNode; path?: string } | null | undefined
}): ReactNode {
  const arrayItems = useContext(ArrayItemsCtx)
  if (!of || typeof of.Children !== 'function') return null
  // Inside a custom array `layout`, the array's children are the provider's
  // LIVE slots (added/removed at runtime), not Core's static seed children.
  if (arrayItems && arrayItems.path === of.path) return arrayItems.items
  // Otherwise the handle's own bound resolver is already correct: a scoped
  // layout receives a `rebind`-ed handle, so `Children()` resolves through the
  // scoped intercept without this component knowing about it.
  return of.Children()
}

// ---------------------------------------------------------------------------
// The renderer (front-end-agnostic — takes the Core tree, not a schema)
// ---------------------------------------------------------------------------

/** Root place-yourself (ADR 053 / 054 / 055). Same callback as nested `Default layout`. */
export type SchemaFieldsLayout<
  TS extends FormShape = FormShape,
  Origin = unknown,
> = NodeLayout<LayoutRoot<TS, Origin>>

export interface SchemaFieldsProps<F extends AnyGroupNode = AnyGroupNode> {
  /** The Core form tree (e.g. from `jsonSchemaToTree`). */
  form: F
  /** Per-node intercept (ADR 010 / ADR 051). Omit to render every node's default. */
  intercept?: Intercept
  /**
   * Place-yourself at the root (ADR 010 / ADR 053 / ADR 054). Named prop so the
   * callback infers `{ root, Default, Children }` — JSX `children` does not.
   * Nested `<Default of={node} />` placements resolve through `intercept`.
   * Omit to let the engine walk the tree (defaults + `intercept`).
   *
   * `root.children` is keyed off the tree's own `FormShape` brand (ADR 055), so
   * a branded tree (`jsonSchemaToTree` / `zodToTree`) needs no kind guards here
   * — `root.children.contacts` is already an `EArray`. `useFormTree` binds the
   * same callback; this prop reads the brand straight off `form`.
   */
  layout?: SchemaFieldsLayout<TreeShapeOf<F>, OriginOf<F>>
}

const defaultResolver: AnySchemaResolver<ReactNode> = (node) => node.Default()

// Minimal ambient so the dev-only guard below typechecks without pulling in
// `@types/node`; consumer bundlers (webpack/vite/esbuild) statically replace
// `process.env.NODE_ENV`, so the whole branch is dead-code-eliminated in prod.
declare const process: { env: { NODE_ENV?: string } } | undefined

/**
 * The floor (ADR 013 / ADR 051): bind a defaults object and get a `SchemaFields`
 * component. The set is partial — missing content entries fall back to the
 * visible `diagnosticDefaults` markers, so an incomplete set still runs.
 * `SchemaFields` is just `createRenderer(nativeDefaults)`. Kind-wide look
 * belongs here; per-node customization is the `intercept` prop.
 *
 * Renders the form's *content only* — wrap it in your own `<form>` + submit.
 */
export function createRenderer(defaults: ReactPartialDefaults) {
  const merged = mergeDefaults(diagnosticDefaults, defaults)
  const rendererDefaults: ReactDefaults = {
    ...merged,
    array: {
      ...merged.array,
      root: (props) => (
        <ArrayStateProvider node={props.node}>
          {(items) => merged.array.root({ ...props, children: items })}
        </ArrayStateProvider>
      ),
    },
  }

  // Tie the knot: the engine renders each child through `renderChild`, which
  // emits this memoized per-node component; the component calls back into the
  // engine to resolve its own node. Identity is stable — a module-stable
  // component type, a `path` key (applied by `combine`), and a referentially
  // stable `core` prop (the tree is memoized upstream) — so `React.memo` bails
  // out and a state change re-renders only the nodes that actually changed,
  // leaving uncontrolled inputs (and their typed values) mounted in place.
  function NodeRendererImpl({
    core,
    resolver,
  }: {
    core: AnyTreeNode
    resolver: AnySchemaResolver<ReactNode>
  }): ReactNode {
    return engine.resolve(core, resolver)
  }
  const NodeRenderer = memo(NodeRendererImpl)

  const engine: Continuation<ReactNode> = createContinuation<ReactNode>(
    rendererDefaults,
    {
      renderChild: (core, resolver) => (
        <NodeRenderer core={core} resolver={resolver} />
      ),
      renderPart: (render) => <PartHost render={render} />,
    }
  )

  return function SchemaFields<F extends AnyGroupNode>({
    form,
    intercept,
    layout,
  }: SchemaFieldsProps<F>) {
    // Dev-only remount guard (bd jsonschema-form-108): `intercept` changing
    // identity between renders defeats the `memo` bail below no matter WHY it
    // changed — a hand-rolled unstable resolver, or the low-level
    // `interceptRules(build)` called fresh inline (that sugar has no `useRef`
    // of its own to hold an identity across renders; only `useInterceptRules`
    // does). `useInterceptRules` already warns on an unstable *builder*; this
    // mirrors that warning one layer down, at the prop `SchemaFields` actually
    // consumes, so the footgun is loud even when a consumer bypasses the hook.
    //
    // A DELIBERATE rebuild (e.g. `useInterceptRules(tree, build, [dep])` after
    // `dep` changes) also changes this prop's identity ONCE, then stabilizes —
    // that is the documented, non-silent contract of `deps` and must NOT warn.
    // An unmemoized inline call instead changes it on EVERY render, forever, so
    // we only flag TWO consecutive changes (never a chance to stabilize) —
    // one-off deliberate swaps stay silent; persistent churn is still loud.
    const prevIntercept = useRef(intercept)
    const consecutiveChanges = useRef(0)
    const warnedUnstableIntercept = useRef(false)
    const isFunctionIntercept = typeof intercept === 'function'
    const changedThisRender =
      isFunctionIntercept && intercept !== prevIntercept.current
    consecutiveChanges.current = changedThisRender
      ? consecutiveChanges.current + 1
      : 0
    if (
      typeof process !== 'undefined' &&
      process.env.NODE_ENV !== 'production' &&
      isFunctionIntercept &&
      consecutiveChanges.current >= 2 &&
      !warnedUnstableIntercept.current
    ) {
      warnedUnstableIntercept.current = true
      console.error(
        '[formframe] SchemaFields: the `intercept` prop changed identity on ' +
          'consecutive renders, which remounts every matched field (losing ' +
          'focus and uncontrolled DOM state). Memoize it — hoist a ' +
          '`interceptRules(…)` call to module scope, or bind it with ' +
          '`useInterceptRules`, which holds a stable identity for you. ' +
          'Calling `interceptRules(…)` inline in the render body (without the ' +
          'hook) rebuilds it fresh every render.'
      )
    }
    prevIntercept.current = intercept

    const resolvedIntercept = useMemo(
      () => (intercept ? resolveIntercept(intercept) : undefined),
      // Map/bag sugar: stabilize on handler/pred identity, not the map object.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- interceptStabilityDeps
      interceptStabilityDeps(intercept)
    )

    // Adapt the user's 2-arg `Intercept` to Core's 1-arg `Resolver`, injecting
    // the handle helpers. Memoized on resolved identity so map/bag sugar stays
    // stable when handler references are stable even if the map object is new.
    const resolver = useMemo<AnySchemaResolver<ReactNode>>(
      () =>
        resolvedIntercept ? adaptResolver(resolvedIntercept) : defaultResolver,
      [resolvedIntercept]
    )
    // `LayoutRoot` is a phantom narrowing of the SAME `EGroup` handle (ADR 055):
    // `children` re-keyed off the brand `form` carries. Runtime is unchanged.
    const root = useMemo(
      () =>
        engine.enrich(form, resolver) as unknown as LayoutRoot<
          TreeShapeOf<F>,
          OriginOf<F>
        >,
      [form, resolver]
    )
    return (
      <>
        {layout ? (
          <PlaceModeCtx.Provider value={true}>
            {layout(root, helpers)}
          </PlaceModeCtx.Provider>
        ) : (
          <NodeRenderer core={form} resolver={resolver} />
        )}
      </>
    )
  }
}

/** Batteries-included: the floor over `nativeDefaults`. */
export const SchemaFields = createRenderer(nativeDefaults)
