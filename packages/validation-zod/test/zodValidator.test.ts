import { z } from 'zod'
import { createZodValidator } from '../src'
import { runValidatorContract } from '@jsonschema-form/validation-contract'

/** Zod schema mirroring {@link contractSchema}'s intent (see validation-contract). */
const contractZodSchema = z.object({
  name: z.string().min(2),
  contacts: z
    .array(
      z.object({
        email: z.string().min(3),
      })
    )
    .optional(),
})

runValidatorContract({
  name: 'Zod',
  validate: createZodValidator(contractZodSchema),
})

describe('createZodValidator — Zod specifics', () => {
  it('maps a regex failure to a keyword at the field path', () => {
    const validate = createZodValidator(
      z.object({ code: z.string().regex(/^[A-Z]+$/) })
    )
    const result = validate({ code: 'abc' })
    expect(result.valid).toBe(false)
    expect(result.issues.find((i) => i.path === 'code')?.keyword).toBeDefined()
  })

  it('maps Zod issue codes through as keywords', () => {
    const minLength = createZodValidator(z.object({ name: z.string().min(2) }))
    expect(
      minLength({ name: 'T' }).issues.find((i) => i.path === 'name')?.keyword
    ).toBe('too_small')

    const wrongType = createZodValidator(z.object({ name: z.string() }))
    expect(
      wrongType({ name: 1 }).issues.find((i) => i.path === 'name')?.keyword
    ).toBe('invalid_type')
  })

  it('collects all errors, not just the first', () => {
    const validate = createZodValidator(
      z.object({
        a: z.string(),
        b: z.string(),
      })
    )
    const result = validate({ a: 1, b: 2 })
    expect(result.issues.length).toBeGreaterThanOrEqual(2)
  })

  it('carries Zod-authored messages through unchanged', () => {
    const validate = createZodValidator(z.object({ name: z.string().min(2) }))
    const issue = validate({ name: 'T' }).issues.find((i) => i.path === 'name')
    expect(issue?.message.length).toBeGreaterThan(0)
  })

  it('returns the parsed output as result.data, including coercion (ADR 025)', () => {
    const validate = createZodValidator(
      z.object({ name: z.string(), age: z.coerce.number() })
    )
    const input = { name: 'Tim', age: '25' }
    const result = validate(input)
    expect(result.valid).toBe(true)
    // z.coerce.number() turns "25" into 25 in the parsed output...
    expect(result.data).toEqual({ name: 'Tim', age: 25 })
    // ...and Zod never mutates the caller's object.
    expect(input).toEqual({ name: 'Tim', age: '25' })
    expect(result.data).not.toBe(input)
  })
})
