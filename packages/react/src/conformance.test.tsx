// Cross-framework conformance (bead jsonschema-form-0mw).
//
// The contract (ADR 008/013): every renderer that folds over the Core tree must
// emit the SAME HTML for the same schema. We treat @jsonschema-form/vanilla as
// the oracle — its eager string fold is the reference — and assert the live
// React DOM normalizes to the identical shape. When we add a third adapter
// (Vue, vanilla-DOM, …) it joins this table and must agree too.
//
// Both renderers emit *content only* (chrome is the consumer's, ADR 013), so we
// wrap each side in a `<form>` purely to give the canonical comparison a shared
// root element — the library renders nothing of the `<form>` itself.
//
// Two axes are checked:
//   1. default rendering   — no renderNode, every node renders its default
//   2. override rendering  — paired React/vanilla resolvers that express the
//                            SAME customization must still produce identical DOM
//                            (this is what proves the continuation re-entry
//                            points — Default / Children / parts.X.Default — mean
//                            the same thing in both frameworks).
//
// Comparison is structural, not textual: both outputs are parsed into real DOM
// and serialized canonically (tags lowercased, attributes sorted, inline styles
// and event handlers dropped, whitespace-only text collapsed). That lets a
// framework differ on attribute order / self-closing / boolean-attr spelling
// without being a "difference" — only the meaningful DOM shape is compared.

import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { present, defaultPresentation, layered } from '@jsonschema-form/core'
import type { PresentationResolver } from '@jsonschema-form/core'
import { jsonSchemaToTree } from '@jsonschema-form/input-jsonschema'
import type { JSONSchema } from '@jsonschema-form/input-jsonschema'
import {
  renderToString,
  type RenderNode as VanillaRenderNode,
} from '@jsonschema-form/vanilla'
import { SchemaFields, type RenderNode as ReactRenderNode } from './renderer'

/**
 * The tree the adapters actually render is the *presented* tree (ADR 029), so
 * conformance folds over `present(...)`, not the raw parse. With just the
 * default rule this is identity-preserving (proving present(default) is a safe
 * no-op across the whole widget/container matrix); with a consumer resolver it
 * exercises the derivers through the render pipeline in both frameworks.
 */
function presented(
  schema: JSONSchema,
  resolver?: PresentationResolver
): ReturnType<typeof jsonSchemaToTree> {
  return present(
    jsonSchemaToTree(schema),
    resolver ? layered(defaultPresentation, resolver) : defaultPresentation
  )
}

/** Canonical, framework-neutral serialization of a DOM subtree. */
function canonical(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const attrs = Array.from(el.attributes)
    .filter((a) => a.name !== 'style' && !a.name.startsWith('on'))
    .map((a) => [a.name, a.value] as [string, string])
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([n, v]) => (v === '' ? n : `${n}="${v}"`))
    .join(' ')
  const open = attrs ? `${tag} ${attrs}` : tag

  let kids = ''
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      kids += canonical(node as Element)
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').trim()
      if (text) kids += text
    }
  })
  return `<${open}>${kids}</${tag}>`
}

type Tree = ReturnType<typeof jsonSchemaToTree>

/** Vanilla oracle → canonical <form> (chrome-free content wrapped for compare). */
function vanillaDom(tree: Tree, renderNode?: VanillaRenderNode): string {
  const html = renderToString(tree, renderNode ? { renderNode } : {})
  const doc = new DOMParser().parseFromString(
    `<form>${html}</form>`,
    'text/html'
  )
  const form = doc.querySelector('form')
  if (!form) throw new Error('vanilla output has no <form>')
  return canonical(form)
}

/** Live React → canonical <form> (chrome-free content wrapped for compare). */
async function reactDom(
  tree: Tree,
  renderNode?: ReactRenderNode
): Promise<string> {
  await render(
    <form>
      <SchemaFields form={tree} renderNode={renderNode} />
    </form>
  )
  const el = document.querySelector('form')
  if (!el) throw new Error('react output has no <form>')
  return canonical(el)
}

// ---------------------------------------------------------------------------
// Axis 1 — default rendering across widgets / containers
// ---------------------------------------------------------------------------

const defaultSchemas: Record<string, JSONSchema> = {
  // A small scalar enum (≤ threshold) defaults to a radio group (bd cm7); this is
  // the first multi-element control archetype to go through conformance.
  'flat fields + radio (small enum)': {
    type: 'object',
    properties: {
      name: { type: 'string', title: 'Name' },
      color: { type: 'string', title: 'Color', enum: ['red', 'green'] },
    },
    required: ['name'],
  },
  'every input widget + validation attrs': {
    type: 'object',
    properties: {
      handle: { type: 'string', title: 'Handle', minLength: 3, maxLength: 20 },
      email: { type: 'string', format: 'email', title: 'Email' },
      age: { type: 'number', title: 'Age', minimum: 0, maximum: 120 },
      count: { type: 'integer', title: 'Count' },
      agree: { type: 'boolean', title: 'Agree' },
    },
    required: ['handle', 'email'],
  },
  // Small scalar + array enums default to radio / checkbox groups, with a
  // description caption to prove the shared field chrome wraps groups too.
  'radio + checkboxes + description': {
    type: 'object',
    properties: {
      size: {
        type: 'string',
        title: 'Size',
        description: 'Pick one',
        enum: ['s', 'm', 'l'],
      },
      tags: {
        type: 'array',
        title: 'Tags',
        items: { enum: ['a', 'b', 'c'] },
      },
    },
  },
  // Above the threshold the same enums fall back to <select> / multi-<select>,
  // so both single-element choice archetypes are also covered by default.
  'select + multiselect (large enums)': {
    type: 'object',
    properties: {
      size: {
        type: 'string',
        title: 'Size',
        enum: ['xs', 's', 'm', 'l', 'xl', 'xxl'],
      },
      tags: {
        type: 'array',
        title: 'Tags',
        items: { enum: ['a', 'b', 'c', 'd', 'e', 'f'] },
      },
    },
  },
  'nested group': {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email', title: 'Email' },
      address: {
        type: 'object',
        title: 'Address',
        description: 'Where you live',
        properties: {
          street: { type: 'string', title: 'Street' },
          zip: { type: 'string', title: 'Zip' },
        },
      },
    },
    required: ['email'],
  },
  'format-driven input types': {
    type: 'object',
    properties: {
      birthdate: { type: 'string', format: 'date', title: 'Birthdate' },
      appointment: {
        type: 'string',
        format: 'date-time',
        title: 'Appointment',
      },
      alarm: { type: 'string', format: 'time', title: 'Alarm' },
      website: { type: 'string', format: 'url', title: 'Website' },
      accent: { type: 'string', format: 'color', title: 'Accent' },
    },
  },
  'array of objects (minItems renders an item)': {
    type: 'object',
    properties: {
      contacts: {
        type: 'array',
        title: 'Contacts',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', title: 'Contact name' },
          },
        },
      },
    },
  },
}

describe('conformance: default rendering — react DOM ≡ vanilla oracle', () => {
  for (const [name, schema] of Object.entries(defaultSchemas)) {
    it(`agrees on "${name}"`, async () => {
      const tree = presented(schema)
      const oracle = vanillaDom(tree)
      const react = await reactDom(tree)
      expect(react).toBe(oracle)
    })
  }
})

// The `textarea` widget (ADR 029 §5, v60) is the proof that adding a widget is a
// `control.kind` arm + a per-adapter branch — no engine or node change. It is
// resolver-opt-in (no default rule picks it), so it's presented via a resolver
// and then rendered by *both* adapters' defaults; parity holds by construction.
describe('conformance: textarea widget (resolver opt-in) — react ≡ vanilla', () => {
  const schema: JSONSchema = {
    type: 'object',
    properties: {
      bio: { type: 'string', title: 'Bio', minLength: 10, maxLength: 500 },
    },
    required: ['bio'],
  }
  const toTextarea: PresentationResolver = (f) =>
    f.path === 'bio' ? { widget: 'textarea' } : undefined

  it('renders a <textarea> and agrees across frameworks', async () => {
    const tree = presented(schema, toTextarea)
    const oracle = vanillaDom(tree)
    const react = await reactDom(tree)
    expect(react).toBe(oracle)
    // The archetype actually took effect (a textarea, not the default input).
    expect(oracle).toContain('<textarea')
    expect(oracle).toContain('maxlength="500"')
    expect(oracle).not.toContain('<input')
  })
})

// ---------------------------------------------------------------------------
// Axis 2 — override rendering: paired resolvers expressing the same intent
// ---------------------------------------------------------------------------

const overrideSchema: JSONSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
    color: { type: 'string', title: 'Color', enum: ['red', 'green'] },
  },
  required: ['name'],
}

interface OverrideCase {
  name: string
  schema: JSONSchema
  react: ReactRenderNode
  vanilla: VanillaRenderNode
}

const overrideCases: OverrideCase[] = [
  {
    name: 'wrap each field in <section> (Default re-entry)',
    schema: overrideSchema,
    react: (node, { Default }) =>
      node.isField ? (
        <section data-jsf-wrap="field">
          <Default of={node} />
        </section>
      ) : (
        <Default of={node} />
      ),
    vanilla: (node) =>
      node.isField
        ? `<section data-jsf-wrap="field">${node.Default()}</section>`
        : node.Default(),
  },
  {
    name: 'place-yourself: hand-compose one field from parts',
    schema: overrideSchema,
    react: (node, { Default }) => {
      if (node.isField && node.path === 'name' && node.widget === 'input') {
        return (
          <div className="hand">
            <Default of={node.parts.label} />
            <Default of={node.parts.control} />
          </div>
        )
      }
      return <Default of={node} />
    },
    vanilla: (node) => {
      if (node.isField && node.path === 'name' && node.widget === 'input') {
        return `<div class="hand">${node.parts.label.Default()}${node.parts.control.Default()}</div>`
      }
      return node.Default()
    },
  },
]

describe('conformance: override rendering — react DOM ≡ vanilla oracle', () => {
  for (const { name, schema, react, vanilla } of overrideCases) {
    it(`agrees on "${name}"`, async () => {
      const tree = presented(schema)
      const oracle = vanillaDom(tree, vanilla)
      const reactOut = await reactDom(tree, react)
      expect(reactOut).toBe(oracle)
    })
  }
})

// ---------------------------------------------------------------------------
// Axis 3 — presentation stage: a resolver-driven widget renders identically
// ---------------------------------------------------------------------------

describe('conformance: presentation stage — react DOM ≡ vanilla oracle', () => {
  it('a resolver-forced multiselect (hint-less scalar enum) agrees in both adapters', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        tags: { type: 'string', title: 'Tags', enum: ['a', 'b', 'c'] },
      },
    }
    const toMultiselect: PresentationResolver = (f) =>
      f.path === 'tags' ? { widget: 'multiselect' } : undefined
    // The SAME presented tree feeds both adapters — present() is upstream of the
    // fold, so the widget swap is a single decision both renderers inherit.
    const tree = presented(schema, toMultiselect)
    const oracle = vanillaDom(tree)
    const react = await reactDom(tree)
    expect(react).toBe(oracle)
  })
})
