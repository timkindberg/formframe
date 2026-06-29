import { describe, it, expect } from 'vitest'
import { createAjvValidator } from '../src'
import {
  contractSchema,
  runValidatorContract,
} from '@jsonschema-form/validation-contract'

runValidatorContract({
  name: 'AJV',
  validate: createAjvValidator(contractSchema),
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

  it('coerces stringly-typed FormData values (number from a string) by default', () => {
    const validate = createAjvValidator({
      type: 'object',
      properties: { age: { type: 'number', minimum: 0 } },
    })
    // "25" is what a native number input yields in FormData — must pass, not
    // fail a `type: number` check.
    expect(validate({ age: '25' }).valid).toBe(true)
    // and the constraint still bites once coerced
    expect(validate({ age: '-1' }).valid).toBe(false)
  })

  it('enforces standard formats (email) by default via ajv-formats', () => {
    const validate = createAjvValidator({
      type: 'object',
      properties: { email: { type: 'string', format: 'email' } },
    })
    // AJV v8 ignores `format` unless ajv-formats is registered — this must fail.
    const result = validate({ email: 'notanemail' })
    expect(result.valid).toBe(false)
    expect(result.issues.find((i) => i.path === 'email')?.keyword).toBe('format')
    expect(validate({ email: 'a@b.com' }).valid).toBe(true)
  })

  it('leaves format unhandled when { formats: false }', () => {
    const validate = createAjvValidator(
      {
        type: 'object',
        properties: { email: { type: 'string', format: 'email' } },
      },
      { formats: false }
    )
    expect(validate({ email: 'notanemail' }).valid).toBe(true)
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
