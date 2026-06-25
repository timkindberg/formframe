import { describe, it, expect } from 'vitest'
import { createAjvValidator } from '../src'
import { runValidatorContract } from './contract'

runValidatorContract({
  name: 'AJV',
  create: (schema) => createAjvValidator(schema),
})

describe('createAjvValidator — AJV specifics', () => {
  it('maps a pattern failure to keyword "pattern" at the field path', () => {
    const validate = createAjvValidator({
      type: 'object',
      properties: { code: { type: 'string', pattern: '^[A-Z]+$' } },
    })
    const result = validate({ code: 'abc' })
    expect(result.valid).toBe(false)
    expect(result.issues.find((i) => i.path === 'code')?.keyword).toBe(
      'pattern'
    )
  })

  it('collects all errors (allErrors), not just the first', () => {
    const validate = createAjvValidator({
      type: 'object',
      required: ['a', 'b'],
      properties: { a: { type: 'string' }, b: { type: 'string' } },
    })
    const result = validate({})
    expect(result.issues.map((i) => i.path).sort()).toEqual(['a', 'b'])
  })

  it('un-escapes JSON Pointer segments (~1 → /) in paths', () => {
    const validate = createAjvValidator({
      type: 'object',
      properties: { 'a/b': { type: 'string', minLength: 2 } },
    })
    const result = validate({ 'a/b': 'x' })
    expect(result.issues.map((i) => i.path)).toContain('a/b')
  })

  it('carries AJV-authored messages through unchanged', () => {
    const validate = createAjvValidator({
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' } },
    })
    const issue = validate({}).issues.find((i) => i.path === 'name')
    expect(issue?.message).toMatch(/required property/i)
  })
})
