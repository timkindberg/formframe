import { describe, it, expect } from 'vitest'
import { jsonSchemaToTree } from './jsonSchemaToTree'
import type { JSONSchema } from './types'
import { inputCtl } from './controlTestUtils'

describe('error handling robustness', () => {
  it('throws for boolean root schemas', () => {
    expect(() => jsonSchemaToTree(true)).toThrow(
      'Boolean schemas are not yet supported'
    )
    expect(() => jsonSchemaToTree(false)).toThrow(
      'Boolean schemas are not yet supported'
    )
  })

  it('skips boolean property schemas inside objects', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        anything: true as unknown as JSONSchema,
      },
    }

    const form = jsonSchemaToTree(schema)

    expect(form.children).toHaveLength(1)
    expect(form.getField('name')?.widget).toBe('input')
    expect(form.getField('anything')).toBeUndefined()
  })

  it('unknown format falls back to input with type=text', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        token: { type: 'string', format: 'not-a-real-format' },
      },
    }

    const form = jsonSchemaToTree(schema)
    const idField = form.getField('id')
    const tokenField = form.getField('token')

    expect(idField?.widget).toBe('input')
    expect(inputCtl(idField).attrs.type).toBe('text')
    expect(tokenField?.widget).toBe('input')
    expect(inputCtl(tokenField).attrs.type).toBe('text')
  })
})
