import { describe, it, expect } from 'vitest'
import { jsonSchemaToTree } from './jsonSchemaToTree'
import type { JSONSchema } from './types'

function largeObjectSchema(count: number): JSONSchema {
  const properties: Record<string, JSONSchema> = {}
  for (let i = 0; i < count; i++) {
    properties[`prop_${String(i).padStart(3, '0')}`] = {
      type: 'string',
      title: `Property ${i}`,
    }
  }
  return { type: 'object', properties }
}

describe('large schema robustness', () => {
  it('parses 120-property schemas without error', () => {
    const schema = largeObjectSchema(120)
    const form = jsonSchemaToTree(schema)

    expect(form.nodeType).toBe('group')
    expect(form.children).toHaveLength(120)
    expect(form.getAllFields()).toHaveLength(120)
  })

  it('getField resolves first, middle, and last properties', () => {
    const schema = largeObjectSchema(120)
    const form = jsonSchemaToTree(schema)

    expect(form.getField('prop_000')?.path).toBe('prop_000')
    expect(form.getField('prop_059')?.path).toBe('prop_059')
    expect(form.getField('prop_119')?.path).toBe('prop_119')
    expect(form.getField('prop_missing')).toBeUndefined()
  })

  it('walk visits every leaf field in a large schema', () => {
    const schema = largeObjectSchema(105)
    const form = jsonSchemaToTree(schema)
    const visited: string[] = []

    form.walk({
      field(node) {
        visited.push(node.path)
      },
    })

    expect(visited).toHaveLength(105)
    expect(new Set(visited).size).toBe(105)
  })
})
