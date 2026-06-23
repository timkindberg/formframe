// React adapter for Core's continuation engine (ADR 010 + ADR 013 + ADR 014).
//
// The recursion, enrichment, and scoping live in Core (`createContinuation`).
// This file is the **R = ReactNode** renderer set: per-part defaults as JSX, a
// `root` composer per node kind, and `combine` = a keyed fragment. There is no
// Context here — the engine threads the active resolver as a parameter and each
// node's `Default`/`Children` closes over it, so a lazily-rendered
// `<node.Default/>` still sees the right (possibly scoped) resolver. The vanilla
// probe (ADR 008) proved Context was incidental; conformance keeps them honest.
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
import { useMemo, Fragment, type ReactNode } from 'react'
import {
  createContinuation,
  mergeAdapter,
  type RendererAdapter,
  type PartialAdapter,
  type PartOverrideMap,
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
} from '@jsonschema-form/core'

// ---------------------------------------------------------------------------
// Public types — React instantiates the generic engine at R = ReactNode.
// ---------------------------------------------------------------------------

/** Per-node render hook: return custom JSX to hijack, or `<node.Default/>`. */
export type RenderNode = Resolver<ReactNode>
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

function DefaultInput({ attrs }: { attrs: HtmlInputAttrs }): ReactNode {
  return <input {...attrs} />
}

function DefaultSelect({
  attrs,
  options,
}: {
  attrs: HtmlSelectAttrs
  options: SelectOption[]
}): ReactNode {
  return (
    <select {...attrs}>
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

/** Compose a field from its parts: label, description, and the widget control. */
function DefaultFieldRoot({
  node,
  overrides,
}: {
  node: EField
  overrides?: PartOverrideMap<ReactNode>
}): ReactNode {
  const renderPart = (
    part: { Default(): ReactNode } | undefined,
    name: string
  ): ReactNode => {
    if (!part) return null
    const override = overrides?.[name]
    return override ? override(part) : <part.Default />
  }
  // Narrowing on `widget` reaches the variant-specific control part (ADR 012).
  const control =
    node.widget === 'input'
      ? renderPart(node.parts.input, 'input')
      : renderPart(node.parts.select, 'select')
  return (
    <div className="jsf-field">
      {renderPart(node.parts.label, 'label')}
      {renderPart(node.parts.description, 'description')}
      {control}
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
      {label && <label.Default />}
      {description && <description.Default />}
      {children}
    </fieldset>
  )
}

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
      <div className="jsf-not-implemented" data-jsf-not-implemented="field.root">
        <NotImplemented kind="field" data={{ path: node.path, widget: node.widget }} />
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
      <div className="jsf-not-implemented" data-jsf-not-implemented="group.root">
        <NotImplemented kind="group" data={{ path: node.path }} />
        {children}
      </div>
    ),
    label: (data) => <NotImplemented kind="label" data={data} />,
    description: (data) => <NotImplemented kind="description" data={data} />,
  },
  combine,
}

// ---------------------------------------------------------------------------
// The renderer (front-end-agnostic — takes the Core tree, not a schema)
// ---------------------------------------------------------------------------

export interface SchemaFieldsProps {
  /** The Core form tree (e.g. from `jsonSchemaToTree`). */
  form: GroupNode
  /** Per-node hijack (ADR 010). Omit to render every node's default. */
  renderNode?: RenderNode
  /** Place-yourself at the root: receives the enriched root node. */
  children?: (root: EGroup) => ReactNode
}

const defaultResolver: RenderNode = (node) => <node.Default />

/**
 * The floor (ADR 013): bind a renderer set and get a `SchemaFields` component.
 * The `adapter` is partial — missing content entries fall back to the visible
 * `diagnosticAdapter` markers, so an incomplete set still runs. `SchemaFields`
 * is just `createRenderer(defaultAdapter)`.
 *
 * Renders the form's *content only* — wrap it in your own `<form>` + submit.
 */
export function createRenderer(adapter: ReactPartialAdapter) {
  const engine = createContinuation<ReactNode>(
    mergeAdapter(diagnosticAdapter, adapter)
  )
  return function SchemaFields({
    form,
    renderNode,
    children,
  }: SchemaFieldsProps) {
    const resolver = renderNode ?? defaultResolver
    const root = useMemo(
      () => engine.enrich(form, resolver) as EGroup,
      [form, resolver]
    )
    return <>{children ? children(root) : engine.resolve(form, resolver)}</>
  }
}

/** Batteries-included: the floor over the real `defaultAdapter`. */
export const SchemaFields = createRenderer(defaultAdapter)
