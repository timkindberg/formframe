// RECIPE TESTS — copy with `ajvValidator.recipe.ts`. Pins AJV-specific
// behavior (coercion purity, formats, allErrors, path mapping) so a pasted
// JSON Schema stack stays covered.
import { describe, it, expect } from 'vitest'
import { createAjvValidator } from './ajvValidator.recipe'

describe('ajvValidator.recipe · createAjvValidator', () => {
  it('maps required / minLength / nested array paths', () => {
    const validate = createAjvValidator({
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 2 },
        contacts: {
          type: 'array',
          items: {
            type: 'object',
            required: ['email'],
            properties: { email: { type: 'string', format: 'email' } },
          },
        },
      },
    })
    const empty = validate({})
    expect(empty.valid).toBe(false)
    expect(empty.errors.some((e) => e.path === 'name')).toBe(true)

    const short = validate({ name: 'a' })
    expect(short.errors.find((e) => e.path === 'name')?.keyword).toBe(
      'minLength'
    )

    const nested = validate({
      name: 'Ada',
      contacts: [{ email: 'notanemail' }],
    })
    expect(nested.errors.map((e) => e.path)).toContain('contacts.0.email')
  })

  it('maps a pattern failure to keyword "pattern" at the field path', () => {
    const validate = createAjvValidator({
      type: 'object',
      properties: { code: { type: 'string', pattern: '^[A-Z]+$' } },
    })
    const result = validate({ code: 'abc' })
    expect(result.valid).toBe(false)
    expect(result.errors.find((e) => e.path === 'code')?.keyword).toBe(
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
    expect(result.errors.map((e) => e.path).sort()).toEqual(['a', 'b'])
  })

  it('coerces FormData strings and surfaces result.data without mutating input', () => {
    const validate = createAjvValidator({
      type: 'object',
      properties: { age: { type: 'number', minimum: 0 } },
    })
    const input = { age: '25' }
    const result = validate(input)
    expect(result.valid).toBe(true)
    expect(result.data).toEqual({ age: 25 })
    expect(input).toEqual({ age: '25' })
    expect(result.data).not.toBe(input)
    expect(validate({ age: '-1' }).valid).toBe(false)
  })

  it('skips clone when coerceTypes is off', () => {
    const validate = createAjvValidator(
      { type: 'object', properties: { age: { type: 'number', minimum: 0 } } },
      { ajv: { coerceTypes: false } }
    )
    const input = { age: 25 }
    const result = validate(input)
    expect(result.valid).toBe(true)
    expect(result.data).toBeUndefined()
    expect(input).toEqual({ age: 25 })
  })

  it('enforces email format by default; skippable with formats: false', () => {
    const withFormats = createAjvValidator({
      type: 'object',
      properties: { email: { type: 'string', format: 'email' } },
    })
    expect(withFormats({ email: 'notanemail' }).valid).toBe(false)
    expect(withFormats({ email: 'a@b.com' }).valid).toBe(true)

    const without = createAjvValidator(
      {
        type: 'object',
        properties: { email: { type: 'string', format: 'email' } },
      },
      { formats: false }
    )
    expect(without({ email: 'notanemail' }).valid).toBe(true)
  })
})
