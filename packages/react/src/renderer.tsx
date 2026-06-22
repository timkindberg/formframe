// React adapter for Core's continuation engine (ADR 010 + ADR 014).
//
// The recursion, enrichment, and scoping live in Core (`createContinuation`).
// This file is the **R = ReactNode** adapter: the default template-set as JSX,
// plus `combine` = a keyed fragment. Notably there is no Context here anymore —
// the engine threads the active resolver as a parameter and each node's
// `Default`/`Children` closes over it, so a lazily-rendered `<node.Default/>`
// still sees the right (possibly scoped) resolver. The vanilla probe (ADR 008)
// proved that Context was incidental; conformance keeps the two renderers honest.
//
// Front-end-agnostic: this operates on the Core form *tree*, never a schema.
// The JSON Schema entry point (`jsonSchemaToTree`) is imported only by the
// `useSchemaForm` convenience hook — so a future Zod/TS front-end is a drop-in.
import { useMemo, Fragment, type ReactNode, type FormEvent } from 'react'
import {
  createContinuation,
  type ContinuationAdapter,
  type PartOverrideMap,
  type PartView,
  type ENode as CoreENode,
  type EField as CoreEField,
  type EGroup as CoreEGroup,
  type EArray as CoreEArray,
  type EArrayItem as CoreEArrayItem,
  type Resolver,
  type GroupNode,
} from '@jsonschema-form/core'

// ---------------------------------------------------------------------------
// Public types — React instantiates the generic engine at R = ReactNode.
// ---------------------------------------------------------------------------

/** Per-node render hook: return custom JSX to hijack, or `<node.Default/>`. */
export type RenderNode = Resolver<ReactNode>
export type ENode = CoreENode<ReactNode>
export type EField = CoreEField<ReactNode>
export type EGroup = CoreEGroup<ReactNode>
export type EArray = CoreEArray<ReactNode>
export type EArrayItem = CoreEArrayItem<ReactNode>

// ---------------------------------------------------------------------------
// Default template-set (R = ReactNode)
//
// Near-styleless (ADR 012 §4): semantic markup + stable `jsf-*` class hooks, no
// inline styles. Kept identical to the vanilla oracle by the conformance suite.
// ---------------------------------------------------------------------------

/** One part's default markup — passed to the engine by reference (`part: DefaultPart`). */
function DefaultPart(view: PartView): ReactNode {
  switch (view.name) {
    case 'label':
      return (
        <label htmlFor={view.data.attrs?.for}>
          {view.data.text}
          {view.data.showRequired && <span aria-hidden> *</span>}
        </label>
      )
    case 'description':
      return <small className="jsf-description">{view.data.text}</small>
    case 'input':
      return <input {...view.data.attrs} />
    case 'select':
      return (
        <select {...view.data.attrs}>
          <option value="">-- select --</option>
          {view.data.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    default:
      return null
  }
}

/** A field's default: label, description, and the widget control. */
function DefaultField({
  node,
  overrides,
}: {
  node: EField
  overrides?: PartOverrideMap<ReactNode>
}): ReactNode {
  const parts = node.parts as Record<string, { Default(): ReactNode } | undefined>
  const render = (name: string): ReactNode => {
    const part = parts[name]
    if (!part) return null
    const override = overrides?.[name]
    return override ? override(part) : <part.Default />
  }
  const control = node.widget === 'input' ? render('input') : render('select')
  return (
    <div className="jsf-field">
      {render('label')}
      {render('description')}
      {control}
    </div>
  )
}

/** A group's default: a captioned `<fieldset>`, or a plain `<div>` when nameless. */
function DefaultGroup({
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
      {label && <legend>{label.text}</legend>}
      {description && (
        <small className="jsf-description">{description.text}</small>
      )}
      {children}
    </fieldset>
  )
}

// ---------------------------------------------------------------------------
// The R = ReactNode adapter — default template-set passed by reference.
// ---------------------------------------------------------------------------

const adapter: ContinuationAdapter<ReactNode> = {
  part: DefaultPart,
  field: DefaultField,
  group: DefaultGroup,
  combine: ({ children }) => (
    <>
      {children.map((c) => (
        <Fragment key={c.key}>{c.node}</Fragment>
      ))}
    </>
  ),
}

const engine = createContinuation<ReactNode>(adapter)

const defaultResolver: RenderNode = (node) => <node.Default />

// ---------------------------------------------------------------------------
// Form renderer (front-end-agnostic — takes the Core tree, not a schema)
// ---------------------------------------------------------------------------

export interface FormRendererProps {
  /** The Core form tree (e.g. from `jsonSchemaToTree`). */
  form: GroupNode
  renderNode?: RenderNode
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void
  /** Place-yourself at the root: receives the enriched root node. */
  children?: (root: EGroup) => ReactNode
}

export function FormRenderer({
  form,
  renderNode,
  onSubmit,
  children,
}: FormRendererProps) {
  const resolver = renderNode ?? defaultResolver
  const root = useMemo(
    () => engine.enrich(form, resolver) as EGroup,
    [form, resolver]
  )

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSubmit?.(e)
  }

  return (
    <form onSubmit={handleSubmit}>
      {children ? (
        children(root)
      ) : (
        <>
          {engine.resolve(form, resolver)}
          <button type="submit">Submit</button>
        </>
      )}
    </form>
  )
}
