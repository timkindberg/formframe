import { describe, it, expect } from 'vitest'
import { jsonSchemaToTree } from './index'
import type { JSONSchema } from '../types'
import {
  inputCtl,
  choicegroupCtl,
} from '../present/controlTestUtils'
import { submitWith } from './submitTestUtils'

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

  it('numeric enum values keep number type in facts.choices', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        rating: {
          type: 'number',
          enum: [1, 2, 3, 4, 5],
        },
      },
    }

    const form = jsonSchemaToTree(schema)
    const field = form.getField('rating')

    expect(field?.widget).toBe('radio')
    expect(field?.facts.choices).toEqual([
      { value: 1, label: '1' },
      { value: 2, label: '2' },
      { value: 3, label: '3' },
      { value: 4, label: '4' },
      { value: 5, label: '5' },
    ])
    expect(choicegroupCtl(field).options.map((o) => o.attrs.value)).toEqual([
      1, 2, 3, 4, 5,
    ])
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
