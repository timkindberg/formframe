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
// The JSON Schema entry point (`jsonSchemaToTree`) is imported only by the
// `useSchemaForm` convenience hook — so a future Zod/TS front-end is a drop-in.
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
  groupIssuesByPath,
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
  type HtmlInputAttrs,
  type HtmlSelectAttrs,
  type SelectOption,
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
  attrs: { for: string }
  showRequired: boolean
}): ReactNode {
  return (
    <label htmlFor={attrs.for}>
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

function DefaultInput({ attrs }: { attrs: HtmlInputAttrs }): ReactNode {
  const a11y = useContext(FieldA11yContext)
  return (
    <input
      {...attrs}
      {...(a11y
        ? { 'aria-invalid': true as const, 'aria-describedby': a11y.errorId }
        : {})}
    />
  )
}

function DefaultSelect({
  attrs,
  options,
}: {
  attrs: HtmlSelectAttrs
  options: SelectOption[]
}): ReactNode {
  const a11y = useContext(FieldA11yContext)
  return (
    <select
      {...attrs}
      {...(a11y
        ? { 'aria-invalid': true as const, 'aria-describedby': a11y.errorId }
        : {})}
    >
      <option value="">-- select --</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function DefaultGroupLabel({ text }: { text: string }): ReactNode {
  return <legend>{text}</legend>
}

// ---------------------------------------------------------------------------
// Validation display (ADR 019) — runtime state, NOT an IR part.
//
// Validation issues are produced at submit by a side-loaded `Validator` and are
// pure runtime state, so they live in React Context keyed by `node.path` — never
// in the schema-derived `parts`. The default empty map means a field with no
// issues (and any tree rendered with no `ValidationProvider`, e.g. the
// conformance oracle) emits NO error markup, so React still matches vanilla.
// ---------------------------------------------------------------------------

const EMPTY_ISSUES: ValidationIssue[] = []
const ValidationContext = createContext<Map<string, ValidationIssue[]>>(
  new Map()
)

/**
 * Provide submit-time issues to the fields below (ADR 019). A stable module-level
 * type: updating `issues` re-renders only the per-field error consumers (and
 * recomputes the path map), leaving the uncontrolled inputs mounted in place.
 */
export function ValidationProvider({
  issues,
  children,
}: {
  issues: ValidationIssue[]
  children: ReactNode
}): ReactNode {
  const byPath = useMemo(() => groupIssuesByPath(issues), [issues])
  return (
    <ValidationContext.Provider value={byPath}>
      {children}
    </ValidationContext.Provider>
  )
}

/** The issues for one field path (empty array when none) — for custom renderers. */
export function useFieldIssues(path: string): ValidationIssue[] {
  return useContext(ValidationContext).get(path) ?? EMPTY_ISSUES
}

/** All current issues (flat) — for summaries and custom UX. */
export function useValidationIssues(): ValidationIssue[] {
  const byPath = useContext(ValidationContext)
  return useMemo(() => {
    const all: ValidationIssue[] = []
    for (const issues of byPath.values()) {
      all.push(...issues)
    }
    return all
  }, [byPath])
}

/** Stable control `id` for a field path (matches Core's `attrs.id`). */
export function fieldControlId(path: string): string {
  return path
}

/** Stable error-list `id` for `aria-describedby` / summary anchor targets. */
export function fieldErrorId(path: string): string {
  return `${path}-errors`
}

/** A field's own issues, or nothing. Isolated consumer: re-renders on validation
 * without disturbing its sibling input (so typed values survive a failed submit). */
function DefaultFieldErrors({ path }: { path: string }): ReactNode {
  const issues = useFieldIssues(path)
  if (issues.length === 0) return null
  return (
    <ul
      id={fieldErrorId(path)}
      className="jsf-field-errors"
      role="alert"
      aria-live="polite"
    >
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
  // Narrowing on `widget` reaches the variant-specific control part (ADR 012).
  const control =
    node.widget === 'input'
      ? renderSlot(node.parts.input, 'input')
      : renderSlot(node.parts.select, 'select')
  const issues = useFieldIssues(node.path)
  const a11y =
    issues.length > 0 ? { errorId: fieldErrorId(node.path) } : null
  return (
    <div className="jsf-field">
      {renderSlot(node.parts.label, 'label')}
      {renderSlot(node.parts.description, 'description')}
      <FieldA11yContext.Provider value={a11y}>{control}</FieldA11yContext.Provider>
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
    input: DefaultInput,
    select: DefaultSelect,
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
    input: (data) => <NotImplemented kind="input" data={data} />,
    select: (data) => <NotImplemented kind="select" data={data} />,
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
