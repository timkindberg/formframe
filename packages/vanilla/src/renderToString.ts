// Vanilla (no-framework) renderer — the second-implementation probe (ADR 008).
//
// It implements the SAME continuation contract as the React engine (ADR 010):
//   renderNode(node)  ........... per-node hijack
//   node.Default()    ........... render this node's default
//   node.Children()   ........... render child nodes through the resolver
//   node.child(path)  ........... look up one enriched child
//   node.parts.X.Default() ...... render a single part (place-yourself)
//   node.Default({ renderNode }). a renderNode scoped to this subtree
//
// The one telling difference from React: there is no Context. The active
// resolver is **threaded as a parameter** down the eager fold — which is
// exactly `walk`'s handler-inheritance (ADR 005). React needs Context only
// because component rendering is lazy; an eager string fold does not.
//
// Output is an HTML string, so this doubles as the conformance oracle.

import type {
  AnyNode,
  ContainerNode,
  FieldNode,
  GroupNode,
  InputFieldNode,
  SelectFieldNode,
  ArrayNode,
  ArrayItemNode,
  InputFieldParts,
  SelectFieldParts,
  GroupParts,
  ArrayParts,
  ArrayItemParts,
  HtmlInputAttrs,
  HtmlSelectAttrs,
  SelectOption,
} from '@jsonschema-form/core'

// ---------------------------------------------------------------------------
// Public types — the enriched node handed to `renderNode`
// ---------------------------------------------------------------------------

export type RenderNode = (node: VNode) => string

type WithDefault<T> = T & { Default(): string }

/** Each object-valued part gains a string `Default()`; primitives pass through. */
type EnrichedParts<P> = {
  [K in keyof P]: NonNullable<P[K]> extends object
    ? WithDefault<NonNullable<P[K]>>
    : P[K]
}

interface FieldExtras {
  Default(opts?: { renderNode?: RenderNode }): string
}

interface ContainerExtras {
  Children(): string
  child(relativePath: string): VNode | undefined
  Default(opts?: { renderNode?: RenderNode }): string
}

export type VInputField = Omit<InputFieldNode, 'parts'> & {
  parts: EnrichedParts<InputFieldParts>
} & FieldExtras
export type VSelectField = Omit<SelectFieldNode, 'parts'> & {
  parts: EnrichedParts<SelectFieldParts>
} & FieldExtras
export type VField = VInputField | VSelectField

export type VGroup = Omit<GroupNode, 'parts'> & {
  parts: EnrichedParts<GroupParts>
} & ContainerExtras
export type VArray = Omit<ArrayNode, 'parts'> & {
  parts: EnrichedParts<ArrayParts>
} & ContainerExtras
export type VArrayItem = Omit<ArrayItemNode, 'parts'> & {
  parts: EnrichedParts<ArrayItemParts>
} & ContainerExtras

export type VNode = VField | VGroup | VArray | VArrayItem

export interface RenderToStringOptions {
  /** Per-node hijack. Omit to render every node's default. */
  renderNode?: RenderNode
}

// ---------------------------------------------------------------------------
// HTML serialization helpers
// ---------------------------------------------------------------------------

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;')
}

/** Serialize an attrs object to ` k="v"` pairs; `true` is bare, falsy omitted. */
function renderAttrs(attrs: object): string {
  const out: string[] = []
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue
    if (value === true) {
      out.push(key)
      continue
    }
    out.push(`${key}="${escapeAttr(String(value))}"`)
  }
  return out.length ? ' ' + out.join(' ') : ''
}

// ---------------------------------------------------------------------------
// Default template-set (the built-in defaults, as HTML strings)
//
// Near-styleless on purpose (ADR 012 §4): semantic markup + stable `jsf-*`
// class hooks, no inline styles. The React defaults still carry inline styles;
// aligning the two is a conformance finding tracked separately.
// ---------------------------------------------------------------------------

function renderPart(name: string, data: object): string {
  switch (name) {
    case 'label': {
      const p = data as {
        text: string
        attrs: { for: string }
        showRequired: boolean
      }
      const req = p.showRequired ? '<span aria-hidden="true"> *</span>' : ''
      return `<label${renderAttrs(p.attrs)}>${escapeText(p.text)}${req}</label>`
    }
    case 'description': {
      const p = data as { text: string }
      return `<small class="jsf-description">${escapeText(p.text)}</small>`
    }
    case 'input': {
      const p = data as { attrs: HtmlInputAttrs }
      return `<input${renderAttrs(p.attrs)}>`
    }
    case 'select': {
      const p = data as { attrs: HtmlSelectAttrs; options: SelectOption[] }
      const opts = p.options
        .map(
          (o) =>
            `<option value="${escapeAttr(String(o.value))}">${escapeText(
              o.label
            )}</option>`
        )
        .join('')
      return `<select${renderAttrs(
        p.attrs
      )}><option value="">-- select --</option>${opts}</select>`
    }
    default:
      return ''
  }
}

function renderField(core: FieldNode): string {
  const label = renderPart('label', core.parts.label)
  const description = core.parts.description
    ? renderPart('description', core.parts.description)
    : ''
  const control =
    core.widget === 'input'
      ? renderPart('input', core.parts.input)
      : renderPart('select', core.parts.select)
  return `<div class="jsf-field">${label}${description}${control}</div>`
}

function renderGroup(core: GroupNode, childrenHtml: string): string {
  if (core.isRoot) return childrenHtml
  const { label, description } = core.parts
  const legend = label ? `<legend>${escapeText(label.text)}</legend>` : ''
  const desc = description
    ? `<small class="jsf-description">${escapeText(description.text)}</small>`
    : ''
  return `<fieldset class="jsf-group">${legend}${desc}${childrenHtml}</fieldset>`
}

// ---------------------------------------------------------------------------
// Engine — recursion + scoping via parameter threading (no Context)
// ---------------------------------------------------------------------------

function renderChildren(core: ContainerNode, renderNode: RenderNode): string {
  return core.children.map((child) => resolve(child, renderNode)).join('')
}

function renderDefaultNode(core: AnyNode, renderNode: RenderNode): string {
  if (core.isField) return renderField(core)
  if (core.isGroup) return renderGroup(core, renderChildren(core, renderNode))
  // array / arrayItem: structural pass-through for now (interactivity deferred)
  return renderChildren(core, renderNode)
}

function enrichParts(parts: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, data] of Object.entries(parts)) {
    out[name] =
      data && typeof data === 'object'
        ? { ...data, Default: () => renderPart(name, data) }
        : data
  }
  return out
}

function enrich(core: AnyNode, renderNode: RenderNode): VNode {
  const parts = enrichParts(core.parts)
  const Default = (opts?: { renderNode?: RenderNode }) =>
    renderDefaultNode(core, opts?.renderNode ?? renderNode)

  if (core.isField) {
    return { ...core, parts, Default } as unknown as VField
  }

  const Children = () => renderChildren(core, renderNode)
  const child = (relativePath: string): VNode | undefined => {
    const full = core.path ? `${core.path}.${relativePath}` : relativePath
    const found = core.children.find((c) => c.path === full)
    return found ? enrich(found, renderNode) : undefined
  }
  return { ...core, parts, Default, Children, child } as unknown as VNode
}

/** Run the active resolver against a core node. */
function resolve(core: AnyNode, renderNode: RenderNode): string {
  return renderNode(enrich(core, renderNode))
}

// ---------------------------------------------------------------------------
// Public entry — takes the Core tree (front-end-agnostic, like FormRenderer)
// ---------------------------------------------------------------------------

export function renderToString(
  form: GroupNode,
  options: RenderToStringOptions = {}
): string {
  const resolver: RenderNode = options.renderNode ?? ((node) => node.Default())
  const body = resolve(form, resolver)
  // Form chrome (submit) is the adapter's concern, not Core's — see ADR 013.
  return `<form>${body}<button type="submit">Submit</button></form>`
}
