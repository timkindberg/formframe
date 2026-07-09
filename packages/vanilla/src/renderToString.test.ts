import { describe, it, expect } from 'vitest'
import { jsonSchemaToTree } from '@jsonschema-form/input-jsonschema'
import type { JSONSchema } from '@jsonschema-form/input-jsonschema'
import {
  renderToString,
  createRenderer,
  defaultAdapter,
} from './renderToString'

const schema: JSONSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
    email: { type: 'string', format: 'email', title: 'Email' },
    // 6 options (> OPTION_COUNT_THRESHOLD) so the default lands on a <select>;
    // the radio/checkbox-group rendering is exercised in the conformance suite.
    color: {
      type: 'string',
      title: 'Color',
      enum: ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow'],
    },
    address: {
      type: 'object',
      title: 'Address',
      properties: {
        street: { type: 'string', title: 'Street' },
      },
    },
  },
  required: ['name'],
}

describe('renderToString — default rendering', () => {
  const form = jsonSchemaToTree(schema)
  const html = renderToString(form)

  it('renders content only — no form chrome (consumer owns <form> + submit)', () => {
    expect(html).not.toContain('<form')
    expect(html).not.toContain('<button')
    // it starts straight in on the field markup
    expect(html.startsWith('<div class="jsf-field">')).toBe(true)
  })

  it('emits labels wired to inputs by id/for', () => {
    expect(html).toContain('<label id="name-label" for="name">Name')
    expect(html).toContain('id="name"')
    expect(html).toContain('name="name"')
  })

  it('derives the email input type from schema', () => {
    expect(html).toContain('type="email"')
  })

  it('renders an enum as a select with options', () => {
    expect(html).toContain('<select')
    expect(html).toContain('<option value="red">red</option>')
    expect(html).toContain('<option value="green">green</option>')
  })

  it('renders a nested group as a fieldset with a legend', () => {
    expect(html).toContain('<fieldset class="jsf-group">')
    expect(html).toContain('<legend>Address</legend>')
  })

  it('renders a nameless group as a plain div, not a fieldset', () => {
    const nameless = jsonSchemaToTree({
      type: 'object',
      properties: {
        meta: {
          type: 'object',
          properties: { note: { type: 'string', title: 'Note' } },
        },
      },
    })
    const out = renderToString(nameless)
    expect(out).toContain('<div class="jsf-group">')
    expect(out).not.toContain('<fieldset')
    expect(out).toContain('<label id="meta.note-label" for="meta.note">Note')
  })

  it('marks required fields with an asterisk', () => {
    expect(html).toContain('<span aria-hidden="true"> *</span>')
  })
})

describe('renderToString — continuation model', () => {
  const form = jsonSchemaToTree(schema)

  it('renderNode hijacks one node; the rest stay default', () => {
    const html = renderToString(form, {
      renderNode: (node) =>
        node.isField && node.path === 'name'
          ? '<p>custom-name</p>'
          : node.Default(),
    })
    expect(html).toContain('<p>custom-name</p>')
    expect(html).toContain('<select') // color untouched
  })

  it('place-yourself: compose a field from its part Defaults', () => {
    const html = renderToString(form, {
      renderNode: (node) => {
        if (node.isField && node.widget === 'input' && node.path === 'name') {
          return `<div class="hand">${node.parts.control.Default()}${node.parts.label.Default()}</div>`
        }
        return node.Default()
      },
    })
    expect(html).toContain('<div class="hand">')
    // input rendered before label (custom order)
    expect(html.indexOf('id="name"')).toBeLessThan(
      html.indexOf('<label id="name-label" for="name">')
    )
  })

  it('node.Children() re-enters the resolver for descendants', () => {
    const html = renderToString(form, {
      renderNode: (node) =>
        node.isGroup && node.path === 'address'
          ? `<section class="addr">${node.Children()}</section>`
          : node.Default(),
    })
    expect(html).toContain('<section class="addr">')
    expect(html).toContain(
      '<label id="address.street-label" for="address.street">Street'
    )
  })

  it('node.Default({ renderNode }) scopes a resolver to that subtree only', () => {
    const html = renderToString(form, {
      renderNode: (node) => {
        if (node.isGroup && node.path === 'address') {
          return node.Default({
            renderNode: (n) =>
              n.isField && n.path === 'address.street'
                ? '<p>scoped-street</p>'
                : n.Default(),
          })
        }
        return node.Default()
      },
    })
    // the scoped override fires inside address…
    expect(html).toContain('<p>scoped-street</p>')
    // …but the top-level name field is untouched by the scoped resolver
    expect(html).toContain('<label id="name-label" for="name">Name')
  })
})

describe('createRenderer — the floor (ADR 013)', () => {
  const form = jsonSchemaToTree(schema)

  it('an empty partial set renders diagnostic markers, not defaults', () => {
    const render = createRenderer({})
    const html = render(form)
    expect(html).toContain('not implemented')
    expect(html).not.toContain('<input')
  })

  it('a supplied entry renders for real; the rest stay diagnostic', () => {
    const render = createRenderer({
      field: {
        control: (control) =>
          control.kind === 'input'
            ? `<input data-floor${attrsId(control.attrs.id)}>`
            : '',
      },
    })
    const html = render(form)
    // the implemented input is real…
    expect(html).toContain('data-floor')
    // …but its sibling label is still a diagnostic marker
    expect(html).toContain('not implemented: label')
  })

  it('createRenderer(defaultAdapter) equals the batteries renderToString', () => {
    const render = createRenderer(defaultAdapter)
    expect(render(form)).toBe(renderToString(form))
  })
})

function attrsId(id: string): string {
  return ` id="${id}"`
}
