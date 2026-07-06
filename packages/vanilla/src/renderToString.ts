// Vanilla (no-framework) renderer — the second-implementation probe (ADR 008)
// and the conformance oracle (bead 0mw).
//
// The recursion, enrichment, and scoping live in Core's continuation engine
// (`createContinuation`, ADR 014). This file is purely the **R = string**
// renderer set: per-part defaults as HTML strings, a `root` composer per node
// kind, and `combine` = concat. There is no Context and no bespoke fold here —
// the engine threads the active resolver as a parameter, which is all an eager
// string fold ever needed.
//
// Customization mirrors React (ADR 013): spread `defaultAdapter` to swap an
// entry by reference, or hand `createRenderer` a partial set whose gaps fall
// back to the visible `diagnosticAdapter` markers. `renderToString` is the
// batteries rung and emits the form's *content only* — the `<form>` + submit
// button are the consumer's.

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
// Public types — the enriched node handed to `renderNode`, at R = string.
// ---------------------------------------------------------------------------

export type RenderNode = Resolver<string>
export type VanillaAdapter = RendererAdapter<string>
export type VanillaPartialAdapter = PartialAdapter<string>
export type VNode = ENode<string>
export type VField = EField<string>
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
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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
// Default renderer set (R = string)
//
// Near-styleless on purpose (ADR 012 §4): semantic markup + stable `jsf-*`
// class hooks, no inline styles. The React defaults emit the same markup —
// kept honest by the cross-framework conformance suite (packages/react
// src/conformance.test.tsx), which treats this output as the oracle.
// ---------------------------------------------------------------------------

type StringPart = { Default(): string }

const defaultAdapterImpl: VanillaAdapter = {
  field: {
    root({ node, overrides }) {
      const renderPart = (
        part: StringPart | undefined,
        name: string
      ): string => {
        if (!part) return ''
        const override = overrides?.[name]
        return override ? override(part) : part.Default()
      }
      const control = renderPart(node.parts.control, 'control')
      return `<div class="jsf-field">${renderPart(
        node.parts.label,
        'label'
      )}${renderPart(node.parts.description, 'description')}${control}</div>`
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
      const req = showRequired ? '<span aria-hidden="true"> *</span>' : ''
      return `<label${renderAttrs(attrs)}>${escapeText(text)}${req}</label>`
    },

    description({ text }) {
      return `<small class="jsf-description">${escapeText(text)}</small>`
    },

    // One unified control slot (ADR 029 §5, v60): narrow on `control.kind`.
    control(control: FieldControl) {
      switch (control.kind) {
        case 'input':
          return `<input${renderAttrs(control.attrs)}>`
        case 'textarea':
          return `<textarea${renderAttrs(control.attrs)}></textarea>`
        case 'select': {
          const opts = control.options
            .map(
              (o) =>
                `<option value="${escapeAttr(String(o.value))}">${escapeText(
                  o.label
                )}</option>`
            )
            .join('')
          // No blank placeholder for multiple — nothing to "un-select" to.
          const placeholder = control.attrs.multiple
            ? ''
            : '<option value="">-- select --</option>'
          return `<select${renderAttrs(control.attrs)}>${placeholder}${opts}</select>`
        }
        case 'choicegroup': {
          // Radio/checkbox group — one implicitly-labelled option input each,
          // mirroring the React markup exactly (bd cm7). Group a11y is Core-derived
          // (bd l8j): `control.role` + `aria-labelledby` naming it by its caption id.
          const opts = control.options
            .map(
              (o) =>
                `<label class="jsf-choice"><input${renderAttrs(
                  o.attrs
                )}><span class="jsf-choice-text">${escapeText(
                  o.label
                )}</span></label>`
            )
            .join('')
          return `<div class="jsf-choicegroup" role="${control.role}" aria-labelledby="${escapeAttr(
            control.labelledBy
          )}">${opts}</div>`
        }
      }
    },
  },

  group: {
    root({ node, children }) {
      const { label, description } = node.parts
      if (!label && !description)
        return `<div class="jsf-group">${children}</div>`
      const legend = label ? label.Default() : ''
      const desc = description ? description.Default() : ''
      return `<fieldset class="jsf-group">${legend}${desc}${children}</fieldset>`
    },

    label({ text }) {
      return `<legend>${escapeText(text)}</legend>`
    },

    description({ text }) {
      return `<small class="jsf-description">${escapeText(text)}</small>`
    },
  },

  array: {
    root({ node, children }) {
      const { label, description, addButton } = node.parts
      const legend = label ? label.Default() : ''
      const desc = description ? description.Default() : ''
      return `<fieldset class="jsf-array">${legend}${desc}<div class="jsf-array-items">${children}</div>${addButton.Default()}</fieldset>`
    },

    label({ text }) {
      return `<legend>${escapeText(text)}</legend>`
    },

    description({ text }) {
      return `<small class="jsf-description">${escapeText(text)}</small>`
    },

    addButton({ attrs, label }: { attrs: { type: 'button' }; label: string }) {
      return `<button${renderAttrs(attrs)}>${escapeText(label)}</button>`
    },
  },

  arrayItem: {
    root({ node, children }) {
      return `<div class="jsf-array-item">${children}${node.parts.removeButton.Default()}</div>`
    },

    removeButton({
      attrs,
      label,
    }: {
      attrs: { type: 'button' }
      label: string
    }) {
      return `<button${renderAttrs(attrs)}>${escapeText(label)}</button>`
    },
  },

  combine({ children }) {
    return children.map((c) => c.node).join('')
  },
}

/** The real defaults — spread this to override entries by reference. */
export const defaultAdapter = defaultAdapterImpl

// ---------------------------------------------------------------------------
// Diagnostic renderer set — the floor's fallback (ADR 013).
// ---------------------------------------------------------------------------

function notImplemented(kind: string, data: unknown): string {
  return `<span class="jsf-not-implemented" data-jsf-not-implemented="${escapeAttr(
    kind
  )}">[… not implemented: ${escapeText(kind)} ${escapeText(
    JSON.stringify(data)
  )}]</span>`
}

export const diagnosticAdapter: VanillaAdapter = {
  field: {
    root({ node, overrides }) {
      return `<div class="jsf-not-implemented" data-jsf-not-implemented="field.root">${notImplemented(
        'field',
        { path: node.path, widget: node.widget }
      )}${defaultAdapterImpl.field.root({ node, overrides })}</div>`
    },
    label: (data) => notImplemented('label', data),
    description: (data) => notImplemented('description', data),
    control: (data) => notImplemented('control', data),
  },
  group: {
    root({ node, children }) {
      return `<div class="jsf-not-implemented" data-jsf-not-implemented="group.root">${notImplemented(
        'group',
        { path: node.path }
      )}${children}</div>`
    },
    label: (data) => notImplemented('label', data),
    description: (data) => notImplemented('description', data),
  },
  array: {
    root({ node, children }) {
      return `<div class="jsf-not-implemented" data-jsf-not-implemented="array.root">${notImplemented(
        'array',
        { path: node.path }
      )}${children}</div>`
    },
    label: (data) => notImplemented('label', data),
    description: (data) => notImplemented('description', data),
    addButton: (data) => notImplemented('addButton', data),
  },
  arrayItem: {
    root({ node, children }) {
      return `<div class="jsf-not-implemented" data-jsf-not-implemented="arrayItem.root">${notImplemented(
        'arrayItem',
        { path: node.path }
      )}${children}</div>`
    },
    removeButton: (data) => notImplemented('removeButton', data),
  },
  combine: defaultAdapterImpl.combine,
}

// ---------------------------------------------------------------------------
// Public entry — takes the Core tree (front-end-agnostic, like SchemaFields)
// ---------------------------------------------------------------------------

/**
 * The floor (ADR 013): bind a renderer set and get a `renderToString`-style
 * function. The `adapter` is partial — missing content entries fall back to the
 * `diagnosticAdapter` markers. Emits the form's *content only*.
 */
export function createRenderer(adapter: VanillaPartialAdapter) {
  const engine = createContinuation<string>(
    mergeAdapter(diagnosticAdapter, adapter)
  )
  return function renderToString(
    form: GroupNode,
    options: RenderToStringOptions = {}
  ): string {
    const resolver: RenderNode =
      options.renderNode ?? ((node) => node.Default())
    return engine.resolve(form, resolver)
  }
}

/** Batteries-included: the floor over the real `defaultAdapter`. */
export const renderToString = createRenderer(defaultAdapter)
