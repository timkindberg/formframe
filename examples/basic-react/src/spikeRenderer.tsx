/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// SPIKE — recursive continuation renderer (ADR 010). Throwaway, loose types.
//
// Proves the one primitive end-to-end:
//   - renderNode(node)  ............ per-node hijack (top-level + scoped)
//   - node.Default ................. render this node's default
//   - node.Default parts={{…}} ..... swap individual parts, rest default
//   - part.Default ................. a single part (augment / place-yourself)
//   - node.Children ................ render child nodes through the resolver
//   - node.child(path).Default ..... render one specific child (custom order)
//   - <SchemaForm>{(root) => …}</> . place-yourself at the root
// ============================================================================
import React, { createContext, useContext, useMemo } from 'react'
import { jsonSchemaToTree } from '@jsonschema-form/core'
import type { JSONSchema } from '@jsonschema-form/core'

type RNode = any
type RPart = any
type RenderNode = (node: RNode) => React.ReactNode
type PartsOverrides = Record<string, (part: RPart) => React.ReactNode>

// The active node-selector, on context so Children / child() re-enter it.
const RenderNodeCtx = createContext<RenderNode>((node) => <node.Default />)

// ---- enrich a core part into { ...data, name, Default } -------------------
function enrichPart(name: string, data: any): RPart {
  return { name, ...data, Default: () => <DefaultPart name={name} part={data} /> }
}

function enrichParts(core: any): Record<string, RPart> {
  const out: Record<string, RPart> = {}
  for (const [name, data] of Object.entries(core.parts ?? {})) {
    if (data) out[name] = enrichPart(name, data)
  }
  return out
}

// ---- enrich a core node into the React-facing node ------------------------
function enrich(core: any): RNode {
  // Keyed map of enriched children by last path segment. Pure member access
  // (`node.children.street.Default`) so it works as a JSX tag — unlike the
  // `child('street')` method, which can't be a JSX tag name (no calls allowed).
  const children: Record<string, RNode> = {}
  for (const c of core.children ?? []) {
    children[String(c.path).split('.').pop() as string] = enrich(c)
  }
  return {
    path: core.path,
    nodeType: core.nodeType,
    widget: core.widget,
    isField: core.isField,
    isGroup: core.isGroup,
    isArray: core.isArray,
    validation: core.validation,
    parts: enrichParts(core),
    children, // keyed map for `<node.children.x.Default/>`
    child: (relPath: string) => {
      // dynamic/relative lookup (not usable as a JSX tag — assign to a Capital var)
      const full = core.path ? `${core.path}.${relPath}` : relPath
      const found = (core.children ?? []).find((c: any) => c.path === full)
      return found ? enrich(found) : null
    },
    // Render a child by (possibly dynamic) name as a JSX tag: <node.Child name="x" />.
    // The loose-typed counterpart to keyed `node.children.x` (which needs a literal key).
    Child: ({ name }: { name: string }) => {
      const full = core.path ? `${core.path}.${name}` : name
      const found = (core.children ?? []).find((c: any) => c.path === full)
      return found ? <Resolve core={found} /> : null
    },
    Default: (props?: { parts?: PartsOverrides; renderNode?: RenderNode }) => (
      <DefaultNode core={core} partsOverrides={props?.parts} scoped={props?.renderNode} />
    ),
    Children: () => <NodeChildren core={core} />,
  }
}

// ---- resolver: run the active renderNode against a core node --------------
function Resolve({ core }: { core: any }) {
  const renderNode = useContext(RenderNodeCtx)
  return <>{renderNode(enrich(core))}</>
}

function NodeChildren({ core }: { core: any }) {
  return (
    <>
      {(core.children ?? []).map((child: any) => (
        <Resolve key={child.path} core={child} />
      ))}
    </>
  )
}

// ---- default renderers -----------------------------------------------------
function DefaultPart({ name, part }: { name: string; part: any }) {
  if (name === 'label')
    return (
      <label htmlFor={part.attrs?.for}>
        {part.text}
        {part.showRequired && <span aria-hidden> *</span>}
      </label>
    )
  if (name === 'description')
    return <small style={{ display: 'block', color: '#666' }}>{part.text}</small>
  if (name === 'input') return <input {...part.attrs} style={{ display: 'block' }} />
  if (name === 'select')
    return (
      <select {...part.attrs} style={{ display: 'block' }}>
        <option value="">-- select --</option>
        {part.options?.map((o: any) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  return null
}

function DefaultField({ core, partsOverrides }: { core: any; partsOverrides?: PartsOverrides }) {
  const parts = enrichParts(core)
  const renderPart = (name: string) => {
    const p = parts[name]
    if (!p) return null
    const override = partsOverrides?.[name]
    return <React.Fragment key={name}>{override ? override(p) : <p.Default />}</React.Fragment>
  }
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      {renderPart('label')}
      {renderPart('description')}
      {parts.select ? renderPart('select') : renderPart('input')}
    </div>
  )
}

function DefaultGroup({ core }: { core: any }) {
  if (core.isRoot) return <NodeChildren core={core} />
  const parts = enrichParts(core)
  return (
    <fieldset style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #999' }}>
      {parts.label && <legend>{parts.label.text}</legend>}
      {parts.description && <small style={{ color: '#666' }}>{parts.description.text}</small>}
      <NodeChildren core={core} />
    </fieldset>
  )
}

function DefaultNode({
  core,
  partsOverrides,
  scoped,
}: {
  core: any
  partsOverrides?: PartsOverrides
  scoped?: RenderNode
}) {
  let content: React.ReactNode
  if (core.isField) content = <DefaultField core={core} partsOverrides={partsOverrides} />
  else if (core.isGroup) content = <DefaultGroup core={core} />
  else content = <NodeChildren core={core} /> // array / arrayItem fallback for the spike
  // A scoped renderNode applies only to this node's subtree.
  return scoped ? (
    <RenderNodeCtx.Provider value={scoped}>{content}</RenderNodeCtx.Provider>
  ) : (
    <>{content}</>
  )
}

// ---- the Form (root-as-a-node) --------------------------------------------
export function SchemaForm({
  schema,
  renderNode,
  onSubmit,
  children,
}: {
  schema: JSONSchema
  renderNode?: RenderNode
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void
  children?: (root: RNode) => React.ReactNode
}) {
  const core = useMemo(() => jsonSchemaToTree(schema), [schema])
  const resolver: RenderNode = renderNode ?? ((node) => <node.Default />)

  // Root's chrome lives in parts (react-layer): submit (+ the <form> element).
  const root = enrich(core)
  root.parts.submit = {
    name: 'submit',
    label: 'Submit',
    Default: () => <button type="submit">Submit</button>,
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSubmit?.(e)
  }

  return (
    <RenderNodeCtx.Provider value={resolver}>
      <form onSubmit={handleSubmit}>
        {children ? (
          children(root)
        ) : (
          <>
            <Resolve core={core} />
            <root.parts.submit.Default />
          </>
        )}
      </form>
    </RenderNodeCtx.Provider>
  )
}
