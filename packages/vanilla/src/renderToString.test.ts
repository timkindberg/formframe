import { describe, it, expect } from 'vitest'
import { jsonSchemaToTree } from '@jsonschema-form/core'
import type { JSONSchema } from '@jsonschema-form/core'
import { renderToString } from './renderToString'

const schema: JSONSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
    email: { type: 'string', format: 'email', title: 'Email' },
    color: { type: 'string', title: 'Color', enum: ['red', 'green'] },
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

  it('wraps in a form with a submit button', () => {
    expect(html).toContain('<form>')
    expect(html).toContain('<button type="submit">Submit</button>')
  })

  it('emits labels wired to inputs by id/for', () => {
    expect(html).toContain('<label for="name">Name')
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
          return `<div class="hand">${node.parts.input.Default()}${node.parts.label.Default()}</div>`
        }
        return node.Default()
      },
    })
    expect(html).toContain('<div class="hand">')
    // input rendered before label (custom order)
    expect(html.indexOf('id="name"')).toBeLessThan(
      html.indexOf('<label for="name">')
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
    expect(html).toContain('<label for="address.street">Street')
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
    expect(html).toContain('<label for="name">Name')
  })
})
