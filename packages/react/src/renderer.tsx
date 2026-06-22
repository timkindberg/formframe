/* eslint-disable @typescript-eslint/no-explicit-any */
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

function DefaultPart({ name, part }: { name: string; part: any }): ReactNode {
  switch (name) {
    case 'label':
      return (
        <label htmlFor={part.attrs?.for}>
          {part.text}
          {part.showRequired && <span aria-hidden> *</span>}
        </label>
      )
    case 'description':
      return <small className="jsf-description">{part.text}</small>
    case 'input':
      return <input {...part.attrs} />
    case 'select':
      return (
        <select {...part.attrs}>
          <option value="">-- select --</option>
          {part.options?.map((o: any) => (
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

// ---------------------------------------------------------------------------
// The R = ReactNode adapter
// ---------------------------------------------------------------------------

type ReactPart = { Default: () => ReactNode }

const adapter: ContinuationAdapter<ReactNode> = {
  part: (name, data) => <DefaultPart name={name} part={data} />,

  field: (node, overrides) => {
    const parts = node.parts as Record<string, ReactPart | undefined>
    const render = (name: string): ReactNode => {
      const part = parts[name]
      if (!part) return null
      const override = overrides?.[name]
      return (
        <Fragment key={name}>
          {override ? override(part as never) : <part.Default />}
        </Fragment>
      )
    }
    const control = node.widget === 'input' ? render('input') : render('select')
    return (
      <div className="jsf-field">
        {render('label')}
        {render('description')}
        {control}
      </div>
    )
  },

  group: (node, children) => {
    const { label, description } = node.parts
    return (
      <fieldset className="jsf-group">
        {label && <legend>{label.text}</legend>}
        {description && (
          <small className="jsf-description">{description.text}</small>
        )}
        {children}
      </fieldset>
    )
  },

  combine: (children) => (
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
