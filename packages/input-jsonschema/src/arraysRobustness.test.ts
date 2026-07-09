import { describe, it, expect } from 'vitest'
import {
  OPTION_COUNT_THRESHOLD,
  present,
  defaultPresentation,
  type AnyNode,
} from '@jsonschema-form/core'
import { jsonSchemaToTree } from './jsonSchemaToTree'
import type { JSONSchema } from './types'
import { choicegroupCtl } from './controlTestUtils'
import { assertArrayNode, assertField } from './nodeTestUtils'
import { submitWith } from './submitTestUtils'

/** Structural snapshot for comparing nodes without function identity. */
function nodeStructure(node: AnyNode): object {
  const base = {
    nodeType: node.nodeType,
    path: node.path,
    widget: node.widget,
  }
  if ('facts' in node) {
    return { ...base, facts: node.facts }
  }
  if ('children' in node) {
    return { ...base, children: node.children.map(nodeStructure) }
  }
  return base
}

describe('array robustness', () => {
  it.each([0, 1, 2, 3, 5, 8])(
    'minItems: %i renders %i initial array items with correct paths',
    (n) => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            minItems: n,
            items: { type: 'string' },
          },
        },
      }

      const form = jsonSchemaToTree(schema)
      const rowsNode = form.children.find((c) => c.path === 'rows')
      assertArrayNode(rowsNode)

      expect(rowsNode.children).toHaveLength(n)
      expect(rowsNode.children.map((c) => c.path)).toEqual(
        Array.from({ length: n }, (_, i) => `rows.${i}`)
      )
      if (n > 0) {
        expect(rowsNode.facts.constraints.minItems).toBe(n)
      }
    }
  )

  it('after present(), getItem(i) matches children[i] for seeded minItems indices', () => {
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

    const tree = present(jsonSchemaToTree(schema), defaultPresentation)
    const rowsNode = tree.children.find((c) => c.path === 'rows')
    assertArrayNode(rowsNode)

    for (let i = 0; i < rowsNode.children.length; i++) {
      expect(nodeStructure(rowsNode.getItem(i))).toEqual(
        nodeStructure(rowsNode.children[i])
      )
    }
  })

  it('minItems on object-item arrays pins facts.constraints.minItems', () => {
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
    const rowsNode = form.children.find((c) => c.path === 'rows')
    assertArrayNode(rowsNode)

    expect(rowsNode.facts.constraints.minItems).toBe(3)
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

  it(`checkbox groups (array enum <=${OPTION_COUNT_THRESHOLD}) submit as arrays with multiple selections`, () => {
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
    assertField(tags)

    expect(tags.widget).toBe('checkboxes')
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
