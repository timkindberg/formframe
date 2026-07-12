import { describe, it, expect } from 'vitest'
import { jsonSchemaToTree } from './jsonSchemaToTree'
import type { JSONSchema } from './types'
import { inputCtl, choicegroupCtl } from './controlTestUtils'
import { submitWith } from './submitTestUtils'
import { assertField } from './nodeTestUtils'

describe('edge schema robustness', () => {
  it('empty enum falls back to input, not select', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        field: { type: 'string', enum: [] },
      },
    }

    const form = jsonSchemaToTree(schema)
    const field = form.getField('field')

    expect(field?.widget).toBe('input')
    expect(field?.parts.control.kind).toBe('input')
    expect(field?.facts.choices).toBeUndefined()
    expect(inputCtl(field).attrs.type).toBe('text')
  })

  it('oneOf with const and title produces labeled choices and radio widget', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        plan: {
          oneOf: [
            { const: 'free', title: 'Free tier' },
            { const: 'pro', title: 'Pro tier' },
            { const: 'team', title: 'Team tier' },
          ],
        },
      },
    }

    const form = jsonSchemaToTree(schema)
    const field = form.getField('plan')

    expect(field?.widget).toBe('radio')
    expect(field?.facts.choices).toEqual([
      { value: 'free', label: 'Free tier' },
      { value: 'pro', label: 'Pro tier' },
      { value: 'team', label: 'Team tier' },
    ])
    expect(choicegroupCtl(field).options).toEqual([
      {
        attrs: { id: 'plan-0', name: 'plan', type: 'radio', value: 'free' },
        label: 'Free tier',
      },
      {
        attrs: { id: 'plan-1', name: 'plan', type: 'radio', value: 'pro' },
        label: 'Pro tier',
      },
      {
        attrs: { id: 'plan-2', name: 'plan', type: 'radio', value: 'team' },
        label: 'Team tier',
      },
    ])
  })

  it('structural oneOf without const branches yields radio with zero options', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        value: {
          oneOf: [{ type: 'string' }, { type: 'number' }],
        },
      },
    }

    const form = jsonSchemaToTree(schema)
    const field = form.getField('value')

    expect(field?.widget).toBe('radio')
    expect(field?.facts.choices).toEqual([])
  })

  it('ignored combinator modifiers compile from resolved subschema only', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        mode: {
          anyOf: [{ type: 'string' }, { type: 'number' }],
        },
        label: {
          allOf: [{ type: 'string', minLength: 2 }, { maxLength: 10 }],
        },
      },
    }

    const form = jsonSchemaToTree(schema)
    const mode = form.getField('mode')
    const label = form.getField('label')

    expect(mode?.widget).toBe('input')
    expect(mode?.facts.primitive).toBe('string')
    expect(mode?.facts.choices).toBeUndefined()
    expect(inputCtl(mode).attrs.type).toBe('text')

    expect(label?.widget).toBe('input')
    expect(label?.facts.constraints.minLength).toBeUndefined()
    expect(label?.facts.constraints.maxLength).toBeUndefined()
  })

  it('array-valued type unions fall back to string input', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        amount: { type: ['number', 'null'] },
      },
    }

    const form = jsonSchemaToTree(schema)
    const field = form.getField('amount')

    expect(field?.widget).toBe('input')
    expect(field?.facts.primitive).toBe('string')
    expect(inputCtl(field).attrs.type).toBe('text')
  })

  it('object shapes without child properties compile as leaf fields', () => {
    const schema: JSONSchema = {
      type: 'object',
      additionalProperties: { type: 'string' },
      properties: {
        name: { type: 'string' },
        meta: { type: 'object', title: 'Meta' },
      },
    }

    const form = jsonSchemaToTree(schema)

    expect(form.children).toHaveLength(2)
    expect(form.getField('name')?.widget).toBe('input')

    const meta = form.children.find((c) => c.path === 'meta')
    assertField(meta)
    expect(meta.widget).toBe('input')
    expect(meta.facts.valueShape).toBe('scalar')
  })

  it('oneOf scalar choice submits the selected const value', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        plan: {
          oneOf: [
            { const: 'free', title: 'Free tier' },
            { const: 'pro', title: 'Pro tier' },
          ],
        },
      },
    }

    expect(submitWith(schema, [['plan', 'pro']])).toEqual({
      plan: 'pro',
    })
  })
})
