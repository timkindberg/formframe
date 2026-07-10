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
// Customization is by-reference over this set (ADR 013): spread `defaultAdapter`
// and swap an entry, or hand `createRenderer` a partial set whose gaps fall back
// to the visible `diagnosticAdapter` markers (the "floor"). `SchemaFields` is
// the batteries-included rung — the floor over `defaultAdapter` — and renders
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
  useLayoutEffect,
  useSyncExternalStore,
  createContext,
  memo,
  Fragment,
  type ReactNode,
} from 'react'
import { createIssueStore, EMPTY_ISSUES, type IssueStore } from './issueStore'
import { createTouchedStore, type TouchedStore } from './touchedStore'
import {
  shouldDisplayFieldErrors,
  DEFAULT_SHOW_ERRORS_WHEN,
  type ShowErrorsWhen,
} from './displayPolicy'
import {
  createContinuation,
  mergeAdapter,
  type Continuation,
  type RendererAdapter,
  type PartialAdapter,
  type PartOverrideMap,
  type AnyNode,
  type ArrayItemNode,
  type ENode as CoreENode,
  type EField as CoreEField,
  type EGroup as CoreEGroup,
  type EArray as CoreEArray,
  type EArrayItem as CoreEArrayItem,
  type Resolver,
  type GroupNode,
  type FieldControl,
  type ValidationIssue,
} from '@jsonschema-form/core'

// ---------------------------------------------------------------------------
// Public types — React instantiates the generic engine at R = ReactNode.
// ---------------------------------------------------------------------------

/**
 * Per-node render hook (IOC). Receives the enriched node and the injected
 * `{ Default, Children }` helpers; return custom JSX to hijack the node, or
 * `<Default of={node} />` to re-enter the engine. (`RenderHelpers`, `Default`,
 * and `Children` are defined in the component-handle layer below.)
 */
export type RenderNode = (node: ENode, helpers: RenderHelpers) => ReactNode
export type ReactAdapter = RendererAdapter<ReactNode>
export type ReactPartialAdapter = PartialAdapter<ReactNode>
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

/** When a field has issues, the root wraps its control in this provider. */
interface FieldA11yState {
  errorId: string
}
const FieldA11yContext = createContext<FieldA11yState | null>(null)

/**
 * The unified control renderer (ADR 029 §5, v60): ONE `field.control` slot that
 * narrows on `control.kind` — the render archetype — instead of separate
 * `input`/`select` parts. A new widget is a new `kind` arm here, nothing in the
 * engine or the node type. a11y wiring (`aria-invalid`/`aria-describedby`) is
 * applied once, from the field root's `FieldA11yContext`, for every archetype.
 */
function DefaultControl(control: FieldControl): ReactNode {
  const a11y = useContext(FieldA11yContext)
  const a11yProps = a11y
    ? { 'aria-invalid': true as const, 'aria-describedby': a11y.errorId }
    : {}
  switch (control.kind) {
    case 'input':
      return <input {...control.attrs} {...a11yProps} />
    case 'textarea':
      return <textarea {...control.attrs} {...a11yProps} />
    case 'select': {
      const { attrs, options } = control
      return (
        <select {...attrs} {...a11yProps}>
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
      // each implicitly labelled by its wrapping `<label>` (bd cm7). Group a11y is
      // Core-derived (bd l8j): `control.role` (radiogroup|group) and
      // `aria-labelledby={control.labelledBy}` naming the group by its caption id —
      // no adapter recomputes the role. Each option is uncontrolled with a `value`
      // attr (radio/checkbox use `checked`, not `value`, so no controlled warning).
      return (
        <div
          className="jsf-choicegroup"
          role={control.role}
          aria-labelledby={control.labelledBy}
          {...a11yProps}
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
// Validation display (ADR 019 + ADR 023) — runtime state, NOT an IR part.
//
// Validation issues are produced by a side-loaded `Validator` (at submit or live)
// and are pure runtime state, so they never live in the schema-derived `parts`.
// They are held in an external per-path store (ADR 023) read through
// `useSyncExternalStore`, NOT a single Context value: a Context update re-renders
// every consumer (the whole form on one keystroke — the RJSF perf trap), whereas
// the store hands each field a stable per-path snapshot, so a validation pass
// re-renders only the fields whose issues actually changed. With no
// `ValidationProvider` (the store is `null` — e.g. the conformance oracle) every
// field reads `EMPTY_ISSUES` and emits NO error markup, so React still matches
// the vanilla oracle.
// ---------------------------------------------------------------------------

const ValidationStoreContext = createContext<IssueStore | null>(null)

/** The touched store + chosen display policy (ADR 027) for the fields below.
 * Null (no provider) means no gating — a field always shows whatever issues it
 * has, exactly as before ADR 027. */
interface DisplayPolicy {
  store: TouchedStore
  mode: ShowErrorsWhen
}
const DisplayPolicyContext = createContext<DisplayPolicy | null>(null)

/** Stable empty touched set so an unset `touched` prop never triggers a notify. */
const EMPTY_TOUCHED: ReadonlySet<string> = new Set()

/**
 * Provide validation issues to the fields below (ADR 019/023) and, optionally, a
 * touched/submit-aware error *display* policy (ADR 027).
 *
 * `issues` is mirrored into the per-path issue store as before. `touched` (the
 * set of blurred field paths), `submitted`, and `showErrorsWhen` drive *when*
 * each field reveals its errors: the default `'touched'` gates on this field's
 * touched slice + the submit flag (RHF-style — so you must feed `touched`/
 * `submitted`, as `useFormTree` does, or nothing appears), `'submit'` waits for
 * a submit attempt, and `'always'` shows issues the moment they exist. Both
 * stores diff per path and notify, so a keystroke or a blur re-renders only the
 * field it concerns.
 */
export function ValidationProvider({
  issues,
  touched = EMPTY_TOUCHED,
  submitted = false,
  showErrorsWhen = DEFAULT_SHOW_ERRORS_WHEN,
  children,
}: {
  issues: ValidationIssue[]
  touched?: ReadonlySet<string>
  submitted?: boolean
  showErrorsWhen?: ShowErrorsWhen
  children: ReactNode
}): ReactNode {
  // One store per provider instance — lazy-init via useState so each is created
  // once and stays referentially stable across renders (no ref-in-render).
  const [store] = useState(() => createIssueStore(issues))
  const [touchedStore] = useState(() => createTouchedStore(touched, submitted))
  // Push new state into the stores after commit (never during render). Each
  // store preserves per-path identity for unchanged paths, so this notifies only
  // the fields that actually changed.
  useLayoutEffect(() => {
    store.setResult(issues)
  }, [store, issues])
  useLayoutEffect(() => {
    touchedStore.sync(touched, submitted)
  }, [touchedStore, touched, submitted])
  const policy = useMemo<DisplayPolicy>(
    () => ({ store: touchedStore, mode: showErrorsWhen }),
    [touchedStore, showErrorsWhen]
  )
  return (
    <ValidationStoreContext.Provider value={store}>
      <DisplayPolicyContext.Provider value={policy}>
        {children}
      </DisplayPolicyContext.Provider>
    </ValidationStoreContext.Provider>
  )
}

const NEVER_SUBSCRIBE = () => () => {}
const getEmptyIssues = () => EMPTY_ISSUES

/**
 * The issues for one field path (empty array when none) — for custom renderers.
 * Subscribes to ONLY this path's slice via `useSyncExternalStore`, so this field
 * re-renders only when its own issues change (ADR 023). No provider → always
 * `EMPTY_ISSUES`, no subscription.
 */
export function useFieldIssues(path: string): ValidationIssue[] {
  const store = useContext(ValidationStoreContext)
  return useSyncExternalStore(
    store ? store.subscribe : NEVER_SUBSCRIBE,
    store ? () => store.getIssues(path) : getEmptyIssues,
    store ? () => store.getIssues(path) : getEmptyIssues
  )
}

/** All current issues (flat) — for summaries and custom UX. */
export function useValidationIssues(): ValidationIssue[] {
  const store = useContext(ValidationStoreContext)
  return useSyncExternalStore(
    store ? store.subscribe : NEVER_SUBSCRIBE,
    store ? store.getAll : getEmptyIssues,
    store ? store.getAll : getEmptyIssues
  )
}

const alwaysShow = () => true

/**
 * Whether a field's errors should be *displayed* right now (ADR 027): the chosen
 * policy applied to this field's touched slice + the submit flag. No provider or
 * the default `'always'` policy → always `true` (issues show as soon as they
 * exist). Under `'touched'`/`'submit'` it subscribes to only this path's touched
 * state, so the field re-renders only when its own display decision flips (e.g.
 * on its own blur, or once on submit) — never when a sibling is touched.
 */
export function useFieldErrorDisplay(path: string): boolean {
  const policy = useContext(DisplayPolicyContext)
  const getSnapshot = policy
    ? () =>
        shouldDisplayFieldErrors(policy.mode, {
          touched: policy.store.getTouched(path),
          submitted: policy.store.isSubmitted(),
        })
    : alwaysShow
  return useSyncExternalStore(
    policy ? policy.store.subscribe : NEVER_SUBSCRIBE,
    getSnapshot,
    getSnapshot
  )
}

/**
 * The form-level display policy (ADR 027) for aggregates like `ValidationSummary`
 * that decide visibility once for the whole form rather than per field: the chosen
 * `mode` plus whether a submit has been attempted. Subscribes to ONLY the single
 * `submitted` flag — never the per-path touched slices — so it stays fan-out-free
 * and hook-safe (no per-path hook loops), re-rendering just once when submit flips.
 * No provider → `{ mode: 'always', submitted: false }`, i.e. no gating, mirroring
 * `useFieldErrorDisplay`.
 */
export function useDisplayPolicy(): {
  mode: ShowErrorsWhen
  submitted: boolean
} {
  const policy = useContext(DisplayPolicyContext)
  const getSubmitted = policy ? () => policy.store.isSubmitted() : () => false
  const submitted = useSyncExternalStore(
    policy ? policy.store.subscribe : NEVER_SUBSCRIBE,
    getSubmitted,
    getSubmitted
  )
  return { mode: policy ? policy.mode : 'always', submitted }
}

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

/** A field's own issues, or nothing. Isolated consumer: re-renders on validation
 * without disturbing its sibling input (so typed values survive a failed submit). */
function DefaultFieldErrors({ path }: { path: string }): ReactNode {
  const issues = useFieldIssues(path)
  const show = useFieldErrorDisplay(path)
  if (!show || issues.length === 0) return null
  return (
    <ul id={fieldErrorId(path)} className="jsf-field-errors" role="alert">
      {issues.map((issue, i) => (
        <li key={i}>{issue.message}</li>
      ))}
    </ul>
  )
}

/** Compose a field from its parts: label, description, and the widget control. */
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
  // One unified control slot (ADR 029 §5, v60) — no widget narrowing here; the
  // archetype lives in `control.kind`, read only by the control renderer.
  const control = renderSlot(node.parts.control, 'control')
  const issues = useFieldIssues(node.path)
  const show = useFieldErrorDisplay(node.path)
  const a11y =
    show && issues.length > 0 ? { errorId: fieldErrorId(node.path) } : null
  return (
    <div className="jsf-field">
      {renderSlot(node.parts.label, 'label')}
      {renderSlot(node.parts.description, 'description')}
      <FieldA11yContext.Provider value={a11y}>
        {control}
      </FieldA11yContext.Provider>
      <DefaultFieldErrors path={node.path} />
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
const combine: ReactAdapter['combine'] = ({ children }) => (
  <>
    {children.map((c) => (
      <Fragment key={c.key}>{c.node}</Fragment>
    ))}
  </>
)

/** The real defaults — spread this to override entries by reference. */
export const defaultAdapter: ReactAdapter = {
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

export const diagnosticAdapter: ReactAdapter = {
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

/** Adapt a user `RenderNode` (node + helpers) to Core's 1-arg `Resolver`. */
const adaptResolver =
  (rn: RenderNode): Resolver<ReactNode> =>
  (node) =>
    rn(node, helpers)

/** The (post-adapt) opts every node's `Default` accepts. Widened so the generic
 * constraint covers both nodes and parts and `of.Default(...)` needs no cast;
 * the precise per-node `parts` type still comes from `DefaultOptsOf<H>` below. */
interface NodeDefaultOpts {
  parts?: PartOverrideMap<ReactNode>
  renderNode?: Resolver<ReactNode>
}

// Extract the opts the *actual* handle accepts: a node yields `{ parts, renderNode }`
// (precise per node), a part yields none — so `parts` is offered only where it
// means something, carrying the node's own override types.
type DefaultOptsOf<H> = H extends { Default(opts?: infer O): ReactNode }
  ? O
  : never
type DefaultExtra<H> =
  DefaultOptsOf<H> extends {
    parts?: infer P
    renderNode?: unknown
  }
    ? { parts?: P; renderNode?: RenderNode }
    : Record<never, never>

/**
 * Render any handle's default — a node, a child node, or a part (anything with a
 * `.Default()`). `of={null/undefined}` renders nothing, so optional parts and
 * absent children are safe. `parts` / `renderNode` apply only to nodes (a part's
 * type offers neither). Stable module-level type → reconciles in place.
 */
export function Default<
  H extends { Default(opts?: NodeDefaultOpts): ReactNode },
>(props: { of: H | null | undefined } & DefaultExtra<H>): ReactNode {
  const { of } = props
  if (of == null) return null
  const { parts, renderNode } = props as {
    parts?: PartOverrideMap<ReactNode>
    renderNode?: RenderNode
  }
  if (!parts && !renderNode) return of.Default()
  return of.Default({
    parts,
    renderNode: renderNode ? adaptResolver(renderNode) : undefined,
  })
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
  form: GroupNode
  /** Per-node hijack (ADR 010). Omit to render every node's default. */
  renderNode?: RenderNode
  /** Place-yourself at the root: receives the enriched root + injected helpers. */
  children?: (root: EGroup, helpers: RenderHelpers) => ReactNode
}

const defaultResolver: Resolver<ReactNode> = (node) => node.Default()

/**
 * The floor (ADR 013): bind a renderer set and get a `SchemaFields` component.
 * The `adapter` is partial — missing content entries fall back to the visible
 * `diagnosticAdapter` markers, so an incomplete set still runs. `SchemaFields`
 * is just `createRenderer(defaultAdapter)`.
 *
 * Renders the form's *content only* — wrap it in your own `<form>` + submit.
 */
export function createRenderer(adapter: ReactPartialAdapter) {
  const merged = mergeAdapter(diagnosticAdapter, adapter)

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
    core: AnyNode
    resolver: Resolver<ReactNode>
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
    renderNode,
    children,
  }: SchemaFieldsProps) {
    // Adapt the user's 2-arg `RenderNode` to Core's 1-arg `Resolver`, injecting
    // the handle helpers. Memoized on `renderNode` so a stable hook keeps a
    // stable resolver identity (the `memo` bail); an inlined hook re-renders.
    const resolver = useMemo<Resolver<ReactNode>>(
      () => (renderNode ? adaptResolver(renderNode) : defaultResolver),
      [renderNode]
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

/** Batteries-included: the floor over the real `defaultAdapter`. */
export const SchemaFields = createRenderer(defaultAdapter)
