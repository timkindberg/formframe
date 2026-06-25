// @vitest-environment happy-dom

import { describe, it, expect } from 'vitest'
import { jsonSchemaToTree } from '@jsonschema-form/core'
import type { JSONSchema } from '@jsonschema-form/core'
import { renderToString } from './renderToString'
import {
  renderToDom,
  createDomRenderer,
  defaultDomAdapter,
  serializeDomToOracleHtml,
} from './domRenderer'

// Same schema set as conformance.test.tsx axis 1 — default rendering across
// widgets / containers (packages/react/src/conformance.test.tsx).
const defaultSchemas: Record<string, JSONSchema> = {
  'flat fields + select': {
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
  'select + multiselect + description': {
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

describe('renderToDom — DOM ≡ string oracle parity', () => {
  for (const [name, schema] of Object.entries(defaultSchemas)) {
    it(`matches renderToString for "${name}"`, () => {
      const form = jsonSchemaToTree(schema)
      const expected = renderToString(form)
      const actual = serializeDomToOracleHtml(renderToDom(form))
      expect(actual).toBe(expected)
    })
  }

  it('matches renderToString for a nameless nested group', () => {
    const nameless = jsonSchemaToTree({
      type: 'object',
      properties: {
        meta: {
          type: 'object',
          properties: { note: { type: 'string', title: 'Note' } },
        },
      },
    })
    expect(serializeDomToOracleHtml(renderToDom(nameless))).toBe(renderToString(nameless))
  })
})

describe('createDomRenderer — the floor (ADR 013)', () => {
  const form = jsonSchemaToTree(schema)

  it('returns a DocumentFragment of field elements', () => {
    const root = renderToDom(form)
    expect(root.nodeType).toBe(Node.DOCUMENT_FRAGMENT_NODE)
    expect(root.childNodes.length).toBeGreaterThan(0)
    const first = root.firstChild as HTMLElement
    expect(first.tagName).toBe('DIV')
    expect(first.className).toBe('jsf-field')
  })

  it('createDomRenderer(defaultDomAdapter) equals the batteries renderToDom', () => {
    const render = createDomRenderer(defaultDomAdapter)
    expect(serializeDomToOracleHtml(render(form))).toBe(
      serializeDomToOracleHtml(renderToDom(form))
    )
  })
})
