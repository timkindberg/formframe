// Vanilla (no-framework) renderer — the second-implementation probe (ADR 008)
// and the conformance oracle (bead 0mw).
//
// The recursion, enrichment, and scoping now live in Core's continuation engine
// (`createContinuation`, ADR 014). This file is purely the **R = string**
// adapter: the default template-set as HTML strings, plus `combine` = concat.
// There is no Context and no bespoke fold here — the engine threads the active
// resolver as a parameter, which is all an eager string fold ever needed.

import {
  createContinuation,
  type ContinuationAdapter,
  type PartView,
  type ENode,
  type EField,
  type EGroup,
  type EArray,
  type EArrayItem,
  type EInputField,
  type ESelectField,
  type GroupNode,
  type Resolver,
} from '@jsonschema-form/core'

// ---------------------------------------------------------------------------
// Public types — the enriched node handed to `renderNode`, at R = string.
// ---------------------------------------------------------------------------

export type RenderNode = Resolver<string>
export type VNode = ENode<string>
export type VField = EField<string>
export type VInputField = EInputField<string>
export type VSelectField = ESelectField<string>
export type VGroup = EGroup<string>
export type VArray = EArray<string>
export type VArrayItem = EArrayItem<string>

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
// Default template-set (R = string)
//
// Near-styleless on purpose (ADR 012 §4): semantic markup + stable `jsf-*`
// class hooks, no inline styles. The React defaults emit the same markup —
// kept honest by the cross-framework conformance suite (packages/react
// src/conformance.test.tsx), which treats this output as the oracle.
// ---------------------------------------------------------------------------

function renderPart(view: PartView): string {
  switch (view.name) {
    case 'label': {
      const { text, attrs, showRequired } = view.data
      const req = showRequired ? '<span aria-hidden="true"> *</span>' : ''
      return `<label${attrs ? renderAttrs(attrs) : ''}>${escapeText(
        text
      )}${req}</label>`
    }
    case 'description':
      return `<small class="jsf-description">${escapeText(view.data.text)}</small>`
    case 'input':
      return `<input${renderAttrs(view.data.attrs)}>`
    case 'select': {
      const opts = view.data.options
        .map(
          (o) =>
            `<option value="${escapeAttr(String(o.value))}">${escapeText(
              o.label
            )}</option>`
        )
        .join('')
      return `<select${renderAttrs(
        view.data.attrs
      )}><option value="">-- select --</option>${opts}</select>`
    }
    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// The R = string adapter
// ---------------------------------------------------------------------------

type StringPart = { Default(): string }

const adapter: ContinuationAdapter<string> = {
  part: renderPart,

  field({ node, overrides }) {
    const parts = node.parts as Record<string, StringPart | undefined>
    const render = (name: string): string => {
      const part = parts[name]
      if (!part) return ''
      const override = overrides?.[name]
      return override ? override(part) : part.Default()
    }
    const control = node.widget === 'input' ? render('input') : render('select')
    return `<div class="jsf-field">${render('label')}${render(
      'description'
    )}${control}</div>`
  },

  group({ node, children }) {
    const { label, description } = node.parts
    if (!label && !description) return `<div class="jsf-group">${children}</div>`
    const legend = label ? `<legend>${escapeText(label.text)}</legend>` : ''
    const desc = description
      ? `<small class="jsf-description">${escapeText(description.text)}</small>`
      : ''
    return `<fieldset class="jsf-group">${legend}${desc}${children}</fieldset>`
  },

  combine({ children }) {
    return children.map((c) => c.node).join('')
  },
}

const engine = createContinuation<string>(adapter)

// ---------------------------------------------------------------------------
// Public entry — takes the Core tree (front-end-agnostic, like FormRenderer)
// ---------------------------------------------------------------------------

export function renderToString(
  form: GroupNode,
  options: RenderToStringOptions = {}
): string {
  const resolver: RenderNode = options.renderNode ?? ((node) => node.Default())
  const body = engine.resolve(form, resolver)
  // Form chrome (submit) is the adapter's concern, not Core's — see ADR 013.
  return `<form>${body}<button type="submit">Submit</button></form>`
}
