// Vanilla real-DOM renderer — third RendererAdapter implementation (ADR 008).
//
// Same continuation fold as renderToString.ts, but R = Node: parts build
// actual DOM via document.createElement. Markup structure and jsf-* hooks
// mirror the string oracle exactly so DOM ≡ string parity is testable.
//
// Static rendering only — array add/remove buttons are inert markup (no handlers).

import {
  createContinuation,
  mergeAdapter,
  type RendererAdapter,
  type PartialAdapter,
  type ENode,
  type EField,
  type EGroup,
  type EArray,
  type EArrayItem,
  type GroupNode,
  type Resolver,
  type FieldControl,
} from '@jsonschema-form/core'

// ---------------------------------------------------------------------------
// Public types — enriched nodes at R = Node.
// ---------------------------------------------------------------------------

export type DomRenderNode = Resolver<Node>
export type DomAdapter = RendererAdapter<Node>
export type DomPartialAdapter = PartialAdapter<Node>
export type DomVNode = ENode<Node>
export type DomField = EField<Node>
export type DomGroup = EGroup<Node>
export type DomArray = EArray<Node>
export type DomArrayItem = EArrayItem<Node>

export interface RenderToDomOptions {
  /** Per-node hijack. Omit to render every node's default. */
  renderNode?: DomRenderNode
}

// ---------------------------------------------------------------------------
// DOM construction helpers
// ---------------------------------------------------------------------------

type DomPart = { Default(): Node }

/** Original attrs keyed as the string oracle emits them (DOM APIs normalize casing). */
const oracleAttrs = new WeakMap<Element, object>()

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;')
}

/** Mirror renderToString.ts `renderAttrs` — byte-compatible with the string oracle. */
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

const VOID_TAGS = new Set(['input'])

function setAttrs(el: Element, attrs: object): void {
  oracleAttrs.set(el, attrs)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue
    if (value === true) {
      el.setAttribute(key, '')
      continue
    }
    el.setAttribute(key, String(value))
  }
}

function appendChild(parent: Node, child: Node | string): void {
  if (typeof child === 'string') {
    parent.appendChild(document.createTextNode(child))
    return
  }
  parent.appendChild(child)
}

function appendChildren(parent: Node, children: (Node | string)[]): void {
  for (const child of children) {
    appendChild(parent, child)
  }
}

function createEl(
  tag: string,
  attrs?: object,
  ...children: (Node | string)[]
): HTMLElement {
  const el = document.createElement(tag)
  if (attrs) setAttrs(el, attrs)
  appendChildren(el, children)
  return el
}

function appendRendered(parent: Node, rendered: Node): void {
  if (rendered.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    while (rendered.firstChild) {
      parent.appendChild(rendered.firstChild)
    }
    return
  }
  parent.appendChild(rendered)
}

// ---------------------------------------------------------------------------
// Default renderer set (R = Node) — mirrors renderToString.ts markup exactly.
// ---------------------------------------------------------------------------

const defaultAdapterImpl: DomAdapter = {
  field: {
    root({ node, overrides }) {
      const renderPart = (
        part: DomPart | undefined,
        name: string
      ): Node | string => {
        if (!part) return ''
        const override = overrides?.[name]
        const rendered = override ? override(part) : part.Default()
        return rendered
      }

      const control = renderPart(node.parts.control, 'control')

      return createEl(
        'div',
        { class: 'jsf-field' },
        renderPart(node.parts.label, 'label'),
        renderPart(node.parts.description, 'description'),
        control
      )
    },

    label({
      text,
      attrs,
      showRequired,
    }: {
      text: string
      attrs: { id: string; for?: string }
      showRequired: boolean
    }) {
      const label = createEl('label', attrs, text)
      if (showRequired) {
        appendChild(label, createEl('span', { 'aria-hidden': 'true' }, ' *'))
      }
      return label
    },

    description({ text }) {
      return createEl('small', { class: 'jsf-description' }, text)
    },

    // One unified control slot (ADR 029 §5, v60): narrow on `control.kind`. Mirrors
    // the string oracle's markup exactly so DOM ≡ string parity holds.
    control(control: FieldControl) {
      switch (control.kind) {
        case 'input':
          return createEl('input', control.attrs)
        case 'textarea':
          return createEl('textarea', control.attrs)
        case 'select': {
          const select = document.createElement('select')
          setAttrs(select, control.attrs)
          if (!control.attrs.multiple) {
            appendChild(
              select,
              createEl('option', { value: '' }, '-- select --')
            )
          }
          for (const option of control.options) {
            appendChild(
              select,
              createEl('option', { value: String(option.value) }, option.label)
            )
          }
          return select
        }
        case 'choicegroup': {
          // Mirror renderToString.ts markup exactly so DOM ≡ string parity holds.
          // Group a11y is Core-derived (bd l8j): `control.role` + `aria-labelledby`.
          const wrap = createEl('div', {
            class: 'jsf-choicegroup',
            role: control.role,
            'aria-labelledby': control.labelledBy,
          })
          for (const option of control.options) {
            const label = createEl('label', { class: 'jsf-choice' })
            appendChild(label, createEl('input', option.attrs))
            appendChild(
              label,
              createEl('span', { class: 'jsf-choice-text' }, option.label)
            )
            appendChild(wrap, label)
          }
          return wrap
        }
      }
    },
  },

  group: {
    root({ node, children }) {
      const { label, description } = node.parts
      if (!label && !description) {
        const div = createEl('div', { class: 'jsf-group' })
        appendRendered(div, children)
        return div
      }
      const fieldset = createEl('fieldset', { class: 'jsf-group' })
      if (label) appendRendered(fieldset, label.Default())
      if (description) appendRendered(fieldset, description.Default())
      appendRendered(fieldset, children)
      return fieldset
    },

    label({ text }) {
      return createEl('legend', undefined, text)
    },

    description({ text }) {
      return createEl('small', { class: 'jsf-description' }, text)
    },
  },

  array: {
    root({ node, children }) {
      const { label, description, addButton } = node.parts
      const fieldset = createEl('fieldset', { class: 'jsf-array' })
      if (label) appendRendered(fieldset, label.Default())
      if (description) appendRendered(fieldset, description.Default())
      const items = createEl('div', { class: 'jsf-array-items' })
      appendRendered(items, children)
      appendRendered(fieldset, items)
      appendRendered(fieldset, addButton.Default())
      return fieldset
    },

    label({ text }) {
      return createEl('legend', undefined, text)
    },

    description({ text }) {
      return createEl('small', { class: 'jsf-description' }, text)
    },

    addButton({ attrs, label }: { attrs: { type: 'button' }; label: string }) {
      return createEl('button', attrs, label)
    },
  },

  arrayItem: {
    root({ node, children }) {
      const div = createEl('div', { class: 'jsf-array-item' })
      appendRendered(div, children)
      appendRendered(div, node.parts.removeButton.Default())
      return div
    },

    removeButton({
      attrs,
      label,
    }: {
      attrs: { type: 'button' }
      label: string
    }) {
      return createEl('button', attrs, label)
    },
  },

  combine({ children }) {
    const fragment = document.createDocumentFragment()
    for (const child of children) {
      appendRendered(fragment, child.node)
    }
    return fragment
  },
}

/** The real defaults — spread this to override entries by reference. */
export const defaultDomAdapter = defaultAdapterImpl

// ---------------------------------------------------------------------------
// Diagnostic renderer set — floor fallback (ADR 013).
// ---------------------------------------------------------------------------

function notImplemented(kind: string, data: unknown): HTMLElement {
  return createEl(
    'span',
    { class: 'jsf-not-implemented', 'data-jsf-not-implemented': kind },
    `[… not implemented: ${kind} ${JSON.stringify(data)}]`
  )
}

export const diagnosticDomAdapter: DomAdapter = {
  field: {
    root({ node, overrides }) {
      const div = createEl('div', {
        class: 'jsf-not-implemented',
        'data-jsf-not-implemented': 'field.root',
      })
      appendRendered(
        div,
        notImplemented('field', { path: node.path, widget: node.widget })
      )
      appendRendered(div, defaultAdapterImpl.field.root({ node, overrides }))
      return div
    },
    label: (data) => notImplemented('label', data),
    description: (data) => notImplemented('description', data),
    control: (data) => notImplemented('control', data),
  },
  group: {
    root({ node, children }) {
      const div = createEl('div', {
        class: 'jsf-not-implemented',
        'data-jsf-not-implemented': 'group.root',
      })
      appendRendered(div, notImplemented('group', { path: node.path }))
      appendRendered(div, children)
      return div
    },
    label: (data) => notImplemented('label', data),
    description: (data) => notImplemented('description', data),
  },
  array: {
    root({ node, children }) {
      const div = createEl('div', {
        class: 'jsf-not-implemented',
        'data-jsf-not-implemented': 'array.root',
      })
      appendRendered(div, notImplemented('array', { path: node.path }))
      appendRendered(div, children)
      return div
    },
    label: (data) => notImplemented('label', data),
    description: (data) => notImplemented('description', data),
    addButton: (data) => notImplemented('addButton', data),
  },
  arrayItem: {
    root({ node, children }) {
      const div = createEl('div', {
        class: 'jsf-not-implemented',
        'data-jsf-not-implemented': 'arrayItem.root',
      })
      appendRendered(div, notImplemented('arrayItem', { path: node.path }))
      appendRendered(div, children)
      return div
    },
    removeButton: (data) => notImplemented('removeButton', data),
  },
  combine: defaultAdapterImpl.combine,
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Bind a DOM renderer set and get a `renderToDom`-style function. Partial
 * adapter gaps fall back to `diagnosticDomAdapter`. Emits content only.
 */
export function createDomRenderer(adapter: DomPartialAdapter) {
  const engine = createContinuation<Node>(
    mergeAdapter(diagnosticDomAdapter, adapter)
  )
  return function renderToDom(
    form: GroupNode,
    options: RenderToDomOptions = {}
  ): Node {
    const resolver: DomRenderNode =
      options.renderNode ?? ((node) => node.Default())
    return engine.resolve(form, resolver)
  }
}

/** Batteries-included DOM renderer over `defaultDomAdapter`. */
export const renderToDom = createDomRenderer(defaultDomAdapter)

/**
 * Serialize a DOM render result with the same HTML rules as `renderToString`.
 * Native `outerHTML` differs on boolean attrs and camelCase names; use this
 * for oracle parity checks.
 */
export function serializeDomToOracleHtml(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeText(node.textContent ?? '')
  }
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    return Array.from(node.childNodes).map(serializeDomToOracleHtml).join('')
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    const attrs = oracleAttrs.get(el)
    const open = `${tag}${attrs ? renderAttrs(attrs) : ''}`
    if (VOID_TAGS.has(tag)) {
      return `<${open}>`
    }
    const kids = Array.from(el.childNodes)
      .map(serializeDomToOracleHtml)
      .join('')
    return `<${open}>${kids}</${tag}>`
  }
  return ''
}
