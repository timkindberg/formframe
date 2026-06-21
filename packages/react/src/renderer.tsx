/* eslint-disable @typescript-eslint/no-explicit-any */
// Typed recursive continuation renderer (ADR 010).
//
// Front-end-agnostic: this operates on the Core form *tree*, never a schema.
// The JSON Schema entry point (`jsonSchemaToTree`) is imported only by the
// `useSchemaForm` convenience hook — so a future Zod/TS front-end is a drop-in.
//
// Phase-A typing: nodes are fully typed (the discriminated `ENode` union);
// part-level overrides are keyed by part name. Full path-typing (the
// `<fields.address.street/>` factory skin) is deferred to epic 6nb.
import React, {
  createContext,
  useContext,
  useMemo,
  type FC,
  type ReactNode,
} from 'react'
import type {
  AnyNode,
  FieldNode,
  InputFieldNode,
  SelectFieldNode,
  GroupNode,
  ArrayNode,
  ArrayItemNode,
} from '@jsonschema-form/core'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Per-node render hook: return custom JSX to hijack, or `<node.Default/>`. */
export type RenderNode = (node: ENode) => ReactNode

/** A part gains a `.Default` renderer; non-object parts pass through. */
type EnrichPart<T> = T extends object ? T & { Default: FC } : T
type EnrichedParts<P> = { [K in keyof P]: EnrichPart<P[K]> }

/** Override individual parts of a node; each receives the enriched part. */
type PartsOverrides<P> = {
  [K in keyof P]?: (part: EnrichPart<NonNullable<P[K]>>) => ReactNode
}

/**
 * Enriched field node — a leaf: parts + Default, no child nodes.
 *
 * Distributive over the widget-discriminated `FieldNode` union (ADR 012): each
 * variant's `parts`/overrides are keyed by *its own* parts, so narrowing on
 * `node.widget` reaches `input` (input widget) or `select` (select widgets).
 * A non-distributive `FieldNode & {…}` would collapse to the union's *common*
 * keys and lose `input`/`select`.
 */
type EFieldOf<N extends FieldNode> = N & {
  parts: EnrichedParts<N['parts']>
  Default: FC<{ parts?: PartsOverrides<N['parts']> }>
}
export type EField = EFieldOf<InputFieldNode> | EFieldOf<SelectFieldNode>

type EContainer<N extends GroupNode | ArrayNode | ArrayItemNode> = N & {
  parts: EnrichedParts<N['parts']>
  /** Children keyed by last path segment — `node.children.street.Default`. */
  children: Record<string, ENode>
  /** Dynamic/relative child lookup (not usable as a JSX tag). */
  child: (relativePath: string) => ENode | undefined
  /** Render all child nodes through the resolver. */
  Children: FC
  Default: FC<{ parts?: PartsOverrides<N['parts']>; renderNode?: RenderNode }>
}

export type EGroup = EContainer<GroupNode>
export type EArray = EContainer<ArrayNode>
export type EArrayItem = EContainer<ArrayItemNode>
export type ENode = EField | EGroup | EArray | EArrayItem

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

const RenderNodeContext = createContext<RenderNode>((node) => <node.Default />)

function Resolve({ core }: { core: AnyNode }) {
  const renderNode = useContext(RenderNodeContext)
  return <>{renderNode(enrich(core))}</>
}

function NodeChildren({
  core,
}: {
  core: GroupNode | ArrayNode | ArrayItemNode
}) {
  return (
    <>
      {core.children.map((child) => (
        <Resolve key={child.path} core={child} />
      ))}
    </>
  )
}

function enrichParts(parts: object): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [name, data] of Object.entries(parts)) {
    out[name] =
      data && typeof data === 'object'
        ? { ...data, Default: () => <DefaultPart name={name} part={data} /> }
        : data
  }
  return out
}

function enrich(core: AnyNode): ENode {
  const parts = enrichParts(core.parts)

  if (core.isField) {
    const Default: FC<{ parts?: any }> = (props) => (
      <DefaultNode core={core} partsOverrides={props?.parts} />
    )
    return { ...core, parts, Default } as unknown as EField
  }

  // container: group | array | arrayItem
  const childrenMap: Record<string, ENode> = {}
  for (const c of core.children) {
    childrenMap[c.path.split('.').pop() as string] = enrich(c)
  }
  const Default: FC<{ parts?: any; renderNode?: RenderNode }> = (props) => (
    <DefaultNode
      core={core}
      partsOverrides={props?.parts}
      scoped={props?.renderNode}
    />
  )
  const Children: FC = () => <NodeChildren core={core} />
  const child = (relativePath: string): ENode | undefined => {
    const full = core.path ? `${core.path}.${relativePath}` : relativePath
    const found = core.children.find((c) => c.path === full)
    return found ? enrich(found) : undefined
  }
  return {
    ...core,
    parts,
    children: childrenMap,
    child,
    Children,
    Default,
  } as unknown as ENode
}

// ---------------------------------------------------------------------------
// Default renderers
// ---------------------------------------------------------------------------

function DefaultPart({ name, part }: { name: string; part: any }) {
  switch (name) {
    case 'label':
      return (
        <label htmlFor={part.attrs?.for}>
          {part.text}
          {part.showRequired && <span aria-hidden> *</span>}
        </label>
      )
    case 'description':
      return (
        <small style={{ display: 'block', color: '#666' }}>{part.text}</small>
      )
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

function DefaultField({
  core,
  partsOverrides,
}: {
  core: FieldNode
  partsOverrides?: Record<string, (part: any) => ReactNode>
}) {
  const parts = enrichParts(core.parts)
  const render = (name: string) => {
    const p = parts[name]
    if (!p) return null
    const override = partsOverrides?.[name]
    return (
      <React.Fragment key={name}>
        {override ? override(p) : <p.Default />}
      </React.Fragment>
    )
  }
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      {render('label')}
      {render('description')}
      {parts.select ? render('select') : render('input')}
    </div>
  )
}

function DefaultGroup({ core }: { core: GroupNode }) {
  if (core.isRoot) return <NodeChildren core={core} />
  const { label, description } = core.parts
  return (
    <fieldset
      style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #999' }}
    >
      {label && <legend>{label.text}</legend>}
      {description && (
        <small style={{ color: '#666' }}>{description.text}</small>
      )}
      <NodeChildren core={core} />
    </fieldset>
  )
}

function DefaultNode({
  core,
  partsOverrides,
  scoped,
}: {
  core: AnyNode
  partsOverrides?: Record<string, (part: any) => ReactNode>
  scoped?: RenderNode
}) {
  let content: ReactNode
  if (core.isField)
    content = <DefaultField core={core} partsOverrides={partsOverrides} />
  else if (core.isGroup) content = <DefaultGroup core={core} />
  // array / arrayItem: render children (dynamic add/remove UI is a follow-up)
  else content = <NodeChildren core={core} />

  return scoped ? (
    <RenderNodeContext.Provider value={scoped}>
      {content}
    </RenderNodeContext.Provider>
  ) : (
    <>{content}</>
  )
}

// ---------------------------------------------------------------------------
// Form renderer (front-end-agnostic — takes the Core tree, not a schema)
// ---------------------------------------------------------------------------

export interface FormRendererProps {
  /** The Core form tree (e.g. from `jsonSchemaToTree`). */
  form: GroupNode
  renderNode?: RenderNode
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void
  /** Place-yourself at the root: receives the enriched root node. */
  children?: (root: EGroup) => ReactNode
}

export function FormRenderer({
  form,
  renderNode,
  onSubmit,
  children,
}: FormRendererProps) {
  const resolver: RenderNode = renderNode ?? ((node) => <node.Default />)
  const root = useMemo(() => enrich(form) as EGroup, [form])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSubmit?.(e)
  }

  return (
    <RenderNodeContext.Provider value={resolver}>
      <form onSubmit={handleSubmit}>
        {children ? (
          children(root)
        ) : (
          <>
            <Resolve core={form} />
            <button type="submit">Submit</button>
          </>
        )}
      </form>
    </RenderNodeContext.Provider>
  )
}
