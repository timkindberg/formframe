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
// `ArrayRoot`, `PartHost`, the intrinsic elements), which reconcile in place. The
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
  type ENode as CoreENode,
  type EField as CoreEField,
  type EGroup as CoreEGroup,
  type EArray as CoreEArray,
  type EArrayItem as CoreEArrayItem,
  type AnySchemaResolver,
  type AnyGroupNode,
  type AnyTreeNode,
  type FieldControl,
  type ValidationError,
} from '@formframe/core'

// ---------------------------------------------------------------------------
// Public types — React instantiates the generic engine at R = ReactNode.
// ---------------------------------------------------------------------------

/**
 * Per-node render hook (IOC). Receives the enriched node and the injected
 * `{ Default, Children }` helpers; return custom JSX to hijack the node, or
 * `<Default of={node} />` to re-enter the engine. (`RenderHelpers`, `Default`,
 * and `Children` are defined in the component-handle layer below.)
 */
export type Intercept = (node: ENode, helpers: RenderHelpers) => ReactNode
export type ReactDefaults = RendererAdapter<ReactNode>
export type ReactPartialDefaults = PartialAdapter<ReactNode>
export type ENode = CoreENode<ReactNode>
export type EField = CoreEField<ReactNode>
export type EGroup = CoreEGroup<ReactNode>
export type EArray = CoreEArray<ReactNode>
export type EArrayItem = CoreEArrayItem<ReactNode>

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
 * Internal bridge for `<Default of={field} errors={…} />`: the ADR-017
 * component cannot forward `errors` through Core's `node.Default(opts)` without
 * a Core change, so it wraps the re-entry in this provider. `null` = not
 * injected (no errors); an array (including `[]`) = recipe-pre-gated source of
 * truth. Not a public seam — recipes pass the prop, not this context.
 */
const InjectedFieldErrorsContext = createContext<ValidationError[] | null>(null)

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

/** Compose a field from its parts: label, description, control, and errors.
 * `parts.control` overrides receive the enriched control plus `a11y` (spreadable
 * aria attrs). `parts.errors` overrides receive the visible `ValidationError[]`
 * — same fractal hijack as label/control (ADR 047), including on the
 * `<Default errors={…} />` inject path. */
function DefaultFieldRoot({
  node,
  overrides,
}: {
  node: EField
  overrides?: PartOverrideMap<ReactNode>
}): ReactNode {
  const renderSlot = (
    part: { Default(): ReactNode } | undefined,
    name: string
  ): ReactNode => {
    if (!part) return null
    const override = overrides?.[name]
    // Call, never mount: `part.Default()` returns a stable `PartHost` element.
    return override ? override(part) : part.Default()
  }
  // Inject-only (ADR 050): no `errors` prop via `<Default errors={…} />`
  // means no errors and no a11y error state — the library renders, it does
  // not produce/store validation errors.
  const injected = useContext(InjectedFieldErrorsContext)
  const issues = injected ?? []
  const visible = issues.length > 0
  const a11yState = visible ? { errorId: fieldErrorId(node.path) } : null
  const errorA11y = errorA11yProps(a11yState)

  // Control override: merge error-state a11y into `attrs` when the archetype
  // has them (input/select/textarea) so `{...c.attrs}` is enough. Always also
  // expose `errorA11y` for choicegroup (no top-level attrs — error aria goes
  // on the wrapper; `role` / `labelledBy` stay structural).
  const controlPart = node.parts.control
  const controlOverride = overrides?.['control']
  const control = controlOverride ? (
    controlOverride(enrichControlErrorA11y(controlPart, errorA11y))
  ) : (
    <FieldA11yContext.Provider value={a11yState}>
      {controlPart.Default()}
    </FieldA11yContext.Provider>
  )

  // Errors override (runtime slot — not a Core IR part) receives the visible
  // issues; otherwise the default list renders the injected errors, if any.
  const errorsOverride = overrides?.['errors']
  const errorsNode: ReactNode = !visible ? null : errorsOverride ? (
    errorsOverride(issues)
  ) : (
    <FieldErrorsList path={node.path} errors={issues} />
  )

  return (
    <div className="jsf-field">
      {renderSlot(node.parts.label, 'label')}
      {renderSlot(node.parts.description, 'description')}
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
 * Per-array action handlers, supplied by the stateful `ArrayRoot` to the add /
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
 * — keeps the value referentially constant across `ArrayRoot` re-renders, so a
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
 */
function ArrayRoot({ node }: { node: EArray }): ReactNode {
  const { label, description, addButton } = node.parts
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

  return (
    <fieldset className="jsf-array">
      {label && label.Default()}
      {description && description.Default()}
      <div className="jsf-array-items">
        {slots.map((slot) => (
          <ArrayItemActions key={slot.id} id={slot.id} remove={removeById}>
            {node.renderItem(slot.core)}
          </ArrayItemActions>
        ))}
      </div>
      <ArrayActionsContext.Provider value={addActions}>
        {addButton.Default()}
      </ArrayActionsContext.Provider>
    </fieldset>
  )
}

/** Compose an array: delegate to the stateful `ArrayRoot` (manages its items). */
function DefaultArrayRoot({
  node,
}: {
  node: EArray
  children: ReactNode
}): ReactNode {
  return <ArrayRoot node={node} />
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
// two IOC seams inject `{ Default, Children }`; both are also exported to import.
// ---------------------------------------------------------------------------

/** Helpers handed to the IOC callbacks (also exported as top-level components). */
export interface RenderHelpers {
  Default: typeof Default
  Children: typeof Children
}

const helpers: RenderHelpers = { Default, Children }

/** Adapt a user `Intercept` (node + helpers) to Core's 1-arg `Resolver`. */
const adaptResolver =
  (rn: Intercept): AnySchemaResolver<ReactNode> =>
  (node) =>
    rn(node, helpers)

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

type DefaultExtra<H> =
  DefaultOptsOf<H> extends {
    parts?: infer P
    renderNode?: unknown
  }
    ? { parts?: WidenParts<H, P>; intercept?: Intercept }
    : Record<never, never>

/**
 * Render any handle's default — a node, a child node, or a part (anything with a
 * `.Default()`). `of={null/undefined}` renders nothing, so optional parts and
 * absent children are safe. `parts` / `intercept` apply only to nodes (a part's
 * type offers neither). `errors` injects per-field `ValidationError[]` for
 * field nodes — recipe-pre-gated (present == show); omit for no errors (the
 * library does not produce/store them itself — ADR 050). Stable module-level
 * type → reconciles in place.
 */
export function Default<
  H extends { Default(opts?: NodeDefaultOpts): ReactNode },
>(
  props: {
    of: H | null | undefined
    errors?: ValidationError[]
  } & DefaultExtra<H>
): ReactNode {
  const { of, errors } = props
  if (of == null) return null
  const { parts, intercept } = props as {
    parts?: PartOverrideMap<ReactNode>
    intercept?: Intercept
  }
  const render = (): ReactNode =>
    !parts && !intercept
      ? of.Default()
      : of.Default({
          parts,
          renderNode: intercept ? adaptResolver(intercept) : undefined,
        })
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
 * Render a container handle's children through the active resolver. Null-safe
 * and kind-safe: a non-container (a field) or `null/undefined` renders nothing.
 */
export function Children({
  of,
}: {
  of: { Children?(): ReactNode } | null | undefined
}): ReactNode {
  return of && typeof of.Children === 'function' ? of.Children() : null
}

// ---------------------------------------------------------------------------
// The renderer (front-end-agnostic — takes the Core tree, not a schema)
// ---------------------------------------------------------------------------

export interface SchemaFieldsProps {
  /** The Core form tree (e.g. from `jsonSchemaToTree`). */
  form: AnyGroupNode
  /** Per-node intercept (ADR 010 / ADR 051). Omit to render every node's default. */
  intercept?: Intercept
  /** Place-yourself at the root: receives the enriched root + injected helpers. */
  children?: (root: EGroup, helpers: RenderHelpers) => ReactNode
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
    merged,
    {
      renderChild: (core, resolver) => (
        <NodeRenderer core={core} resolver={resolver} />
      ),
      renderPart: (render) => <PartHost render={render} />,
    }
  )

  return function SchemaFields({
    form,
    intercept,
    children,
  }: SchemaFieldsProps) {
    // Dev-only remount guard (bd jsonschema-form-108): `intercept` changing
    // identity between renders defeats the `memo` bail below no matter WHY it
    // changed — a hand-rolled unstable resolver, or the low-level
    // `renderNodeRules(build)` called fresh inline (that sugar has no `useRef`
    // of its own to hold an identity across renders; only `useRenderNodeRules`
    // does). `useRenderNodeRules` already warns on an unstable *builder*; this
    // mirrors that warning one layer down, at the prop `SchemaFields` actually
    // consumes, so the footgun is loud even when a consumer bypasses the hook.
    //
    // A DELIBERATE rebuild (e.g. `useRenderNodeRules(tree, build, [dep])` after
    // `dep` changes) also changes this prop's identity ONCE, then stabilizes —
    // that is the documented, non-silent contract of `deps` and must NOT warn.
    // An unmemoized inline call instead changes it on EVERY render, forever, so
    // we only flag TWO consecutive changes (never a chance to stabilize) —
    // one-off deliberate swaps stay silent; persistent churn is still loud.
    const prevIntercept = useRef(intercept)
    const consecutiveChanges = useRef(0)
    const warnedUnstableIntercept = useRef(false)
    const changedThisRender = intercept !== prevIntercept.current
    consecutiveChanges.current = changedThisRender
      ? consecutiveChanges.current + 1
      : 0
    if (
      typeof process !== 'undefined' &&
      process.env.NODE_ENV !== 'production' &&
      consecutiveChanges.current >= 2 &&
      !warnedUnstableIntercept.current
    ) {
      warnedUnstableIntercept.current = true
      console.error(
        '[formframe] SchemaFields: the `intercept` prop changed identity on ' +
          'consecutive renders, which remounts every matched field (losing ' +
          'focus and uncontrolled DOM state). Memoize it — hoist a ' +
          '`renderNodeRules(…)` call to module scope, or bind it with ' +
          '`useRenderNodeRules`, which holds a stable identity for you. ' +
          'Calling `renderNodeRules(…)` inline in the render body (without the ' +
          'hook) rebuilds it fresh every render.'
      )
    }
    prevIntercept.current = intercept

    // Adapt the user's 2-arg `Intercept` to Core's 1-arg `Resolver`, injecting
    // the handle helpers. Memoized on `intercept` so a stable hook keeps a
    // stable resolver identity (the `memo` bail); an inlined hook re-renders.
    const resolver = useMemo<AnySchemaResolver<ReactNode>>(
      () => (intercept ? adaptResolver(intercept) : defaultResolver),
      [intercept]
    )
    const root = useMemo(
      () => engine.enrich(form, resolver) as EGroup,
      [form, resolver]
    )
    return (
      <>
        {children ? (
          children(root, helpers)
        ) : (
          <NodeRenderer core={form} resolver={resolver} />
        )}
      </>
    )
  }
}

/** Batteries-included: the floor over `nativeDefaults`. */
export const SchemaFields = createRenderer(nativeDefaults)
