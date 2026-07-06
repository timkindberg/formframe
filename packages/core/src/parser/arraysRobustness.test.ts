import { describe, it, expect } from 'vitest'
import { jsonSchemaToTree } from './index'
import type { JSONSchema, ArrayNode } from '../types'
import { choicegroupCtl } from '../present/controlTestUtils'
import { submitWith } from './submitTestUtils'

describe('array robustness', () => {
  it('minItems: 0 renders no initial array items', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          minItems: 0,
          items: { type: 'string' },
        },
      },
    }

    const form = jsonSchemaToTree(schema)
    const itemsNode = form.children.find((c) => c.path === 'items')

    expect(itemsNode?.isArray).toBe(true)
    if (itemsNode?.isArray) {
      expect(itemsNode.children).toHaveLength(0)
    }
  })

  it('minItems >= 1 renders the expected number of initial items', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          minItems: 3,
          items: {
            type: 'object',
            properties: { value: { type: 'string' } },
          },
        },
      },
    }

    const form = jsonSchemaToTree(schema)
    const rowsNode = form.children.find((c) => c.path === 'rows') as
      | ArrayNode
      | undefined

    expect(rowsNode?.isArray).toBe(true)
    if (rowsNode?.isArray) {
      expect(rowsNode.children).toHaveLength(3)
      expect(rowsNode.children.map((c) => c.path)).toEqual([
        'rows.0',
        'rows.1',
        'rows.2',
      ])
      expect(rowsNode.validation.minItems).toBe(3)
    }
  })

  it('submit assembles nested dynamic arrays of primitives', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        matrix: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    }

    expect(
      submitWith(schema, [
        ['matrix.0.0', 'a'],
        ['matrix.0.1', 'b'],
        ['matrix.1.0', 'c'],
      ])
    ).toEqual({
      matrix: [['a', 'b'], ['c']],
    })
  })

  it('checkbox groups (array enum <=5) submit as arrays with multiple selections', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string', enum: ['urgent', 'later', 'done'] },
        },
      },
    }

    const form = jsonSchemaToTree(schema)
    const tags = form.getField('tags')

    expect(tags?.widget).toBe('checkboxes')
    expect(choicegroupCtl(tags).multiple).toBe(true)

    expect(
      submitWith(schema, [
        ['tags', 'urgent'],
        ['tags', 'done'],
      ])
    ).toEqual({
      tags: ['urgent', 'done'],
    })
  })

  it('checkbox groups submit a single selection as a one-element array', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string', enum: ['a', 'b', 'c'] },
        },
      },
    }

    expect(submitWith(schema, [['tags', 'b']])).toEqual({
      tags: ['b'],
    })
  })

  it('nested checkbox groups inside array items submit as arrays', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              tags: {
                type: 'array',
                items: { type: 'string', enum: ['urgent', 'later', 'done'] },
              },
            },
          },
        },
      },
    }

    expect(
      submitWith(schema, [
        ['todos.0.title', 'Ship feature'],
        ['todos.0.tags', 'urgent'],
        ['todos.0.tags', 'done'],
      ])
    ).toEqual({
      todos: [{ title: 'Ship feature', tags: ['urgent', 'done'] }],
    })
  })

  it('minItems: 0 arrays accept runtime-added items on submit', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        notes: {
          type: 'array',
          minItems: 0,
          items: { type: 'string' },
        },
      },
    }

    expect(
      submitWith(schema, [
        ['notes.0', 'first'],
        ['notes.1', 'second'],
      ])
    ).toEqual({
      notes: ['first', 'second'],
    })
  })
})
