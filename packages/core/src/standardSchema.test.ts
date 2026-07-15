import { describe, it, expect } from 'vitest'
import {
  toStandardSchema,
  fromStandardSchema,
  toStandardSchemaAsync,
  fromStandardSchemaAsync,
  type StandardSchemaV1,
  type StandardSchemaV1Result,
} from './standardSchema'
import type { AsyncValidator, Validator } from './validation'

function runSync<O>(
  schema: StandardSchemaV1<unknown, O>,
  value: unknown
): StandardSchemaV1Result<O> {
  const result = schema['~standard'].validate(value)
  if (result instanceof Promise) throw new Error('unexpected async result')
  return result
}

describe('toStandardSchema (emit)', () => {
  it('advertises version 1 and a vendor (default + custom)', () => {
    const v: Validator = () => ({ valid: true, errors: [] })
    expect(toStandardSchema(v)['~standard'].version).toBe(1)
    expect(toStandardSchema(v)['~standard'].vendor).toBe('formframe')
    expect(toStandardSchema(v, 'acme')['~standard'].vendor).toBe('acme')
  })

  it('returns the coerced data as the success `value`', () => {
    const coercing: Validator<{ age: number }> = () => ({
      valid: true,
      errors: [],
      data: { age: 25 },
    })
    expect(runSync(toStandardSchema(coercing), { age: '25' })).toEqual({
      value: { age: 25 },
    })
  })

  it('falls back to the input as `value` when nothing is transformed', () => {
    const passthrough: Validator = () => ({ valid: true, errors: [] })
    expect(runSync(toStandardSchema(passthrough), { a: 1 })).toEqual({
      value: { a: 1 },
    })
  })

  it('maps dot-paths to segment arrays and drops keyword; root => no path', () => {
    const invalid: Validator = () => ({
      valid: false,
      errors: [
        { path: 'name', message: 'required', keyword: 'required' },
        {
          path: 'contacts.0.email',
          message: 'too short',
          keyword: 'minLength',
        },
        { path: '', message: 'root issue' },
      ],
    })
    const result = runSync(toStandardSchema(invalid), {})
    expect(result.issues).toEqual([
      { message: 'required', path: ['name'] },
      { message: 'too short', path: ['contacts', '0', 'email'] },
      { message: 'root issue', path: undefined },
    ])
  })
})

describe('fromStandardSchema (consume)', () => {
  const ageSchema: StandardSchemaV1<unknown, { age: number }> = {
    '~standard': {
      version: 1,
      vendor: 'fake',
      validate: (value) => {
        const v = value as { age?: unknown }
        if (typeof v.age === 'number' && v.age >= 18)
          return { value: { age: v.age } }
        return { issues: [{ message: 'must be >= 18', path: ['age'] }] }
      },
    },
  }

  it('returns valid + the parsed value as data on success', () => {
    expect(fromStandardSchema(ageSchema)({ age: 21 })).toEqual({
      valid: true,
      errors: [],
      data: { age: 21 },
    })
  })

  it('maps Standard issues back to dot-path errors', () => {
    expect(fromStandardSchema(ageSchema)({ age: 5 })).toEqual({
      valid: false,
      errors: [{ path: 'age', message: 'must be >= 18' }],
    })
  })

  it('collapses object-form path segments ({ key }) to a dot-path', () => {
    const schema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'fake',
        validate: () => ({
          issues: [
            {
              message: 'bad',
              path: [{ key: 'contacts' }, { key: 0 }, { key: 'email' }],
            },
          ],
        }),
      },
    }
    expect(fromStandardSchema(schema)({}).errors[0].path).toBe(
      'contacts.0.email'
    )
  })

  it('maps a path-less issue to the root path ""', () => {
    const schema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'fake',
        validate: () => ({ issues: [{ message: 'root' }] }),
      },
    }
    expect(fromStandardSchema(schema)({}).errors[0].path).toBe('')
  })

  it('throws on an async (Promise-returning) schema — the seam is sync', () => {
    const asyncSchema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'fake',
        validate: () => Promise.resolve({ value: {} }),
      },
    }
    expect(() => fromStandardSchema(asyncSchema)({})).toThrow(/synchronous/)
  })
})

describe('toStandardSchemaAsync (emit, async)', () => {
  it('returns a Promise of the coerced data as the success `value`', async () => {
    const coercing: AsyncValidator<{ age: number }> = async () => ({
      valid: true,
      errors: [],
      data: { age: 25 },
    })
    const result = toStandardSchemaAsync(coercing)['~standard'].validate({
      age: '25',
    })
    expect(result).toBeInstanceOf(Promise)
    expect(await result).toEqual({ value: { age: 25 } })
  })

  it('falls back to the input as `value` when nothing is transformed', async () => {
    const passthrough: AsyncValidator = async () => ({
      valid: true,
      errors: [],
    })
    expect(
      await toStandardSchemaAsync(passthrough)['~standard'].validate({ a: 1 })
    ).toEqual({ value: { a: 1 } })
  })

  it('maps dot-paths to segment arrays and drops keyword', async () => {
    const invalid: AsyncValidator = async () => ({
      valid: false,
      errors: [{ path: 'name', message: 'required', keyword: 'required' }],
    })
    expect(
      await toStandardSchemaAsync(invalid)['~standard'].validate({})
    ).toEqual({ issues: [{ message: 'required', path: ['name'] }] })
  })
})

describe('fromStandardSchemaAsync (consume, sync + async)', () => {
  const ageSchemaAsync: StandardSchemaV1<unknown, { age: number }> = {
    '~standard': {
      version: 1,
      vendor: 'fake',
      validate: async (value) => {
        const v = value as { age?: unknown }
        if (typeof v.age === 'number' && v.age >= 18)
          return { value: { age: v.age } }
        return { issues: [{ message: 'must be >= 18', path: ['age'] }] }
      },
    },
  }

  it('awaits an async schema and returns valid + parsed data', async () => {
    expect(await fromStandardSchemaAsync(ageSchemaAsync)({ age: 21 })).toEqual({
      valid: true,
      errors: [],
      data: { age: 21 },
    })
  })

  it('awaits an async schema and maps issues to dot-path errors', async () => {
    expect(await fromStandardSchemaAsync(ageSchemaAsync)({ age: 5 })).toEqual({
      valid: false,
      errors: [{ path: 'age', message: 'must be >= 18' }],
    })
  })

  it('consumes a sync schema uniformly (no throw on non-Promise result)', async () => {
    const syncSchema: StandardSchemaV1<unknown, { age: number }> = {
      '~standard': {
        version: 1,
        vendor: 'fake',
        validate: (value) => ({ value: value as { age: number } }),
      },
    }
    expect(await fromStandardSchemaAsync(syncSchema)({ age: 30 })).toEqual({
      valid: true,
      errors: [],
      data: { age: 30 },
    })
  })
})

describe('round trip', () => {
  it('preserves validity and paths through async emit -> async consume', async () => {
    const original: AsyncValidator = async (data) => {
      const v = data as { name?: unknown }
      if (typeof v.name === 'string' && v.name.length >= 2)
        return { valid: true, errors: [], data: v }
      return {
        valid: false,
        errors: [{ path: 'name', message: 'too short', keyword: 'minLength' }],
      }
    }
    const roundTripped = fromStandardSchemaAsync(
      toStandardSchemaAsync(original)
    )
    expect((await roundTripped({ name: 'Tim' })).valid).toBe(true)
    expect(await roundTripped({ name: 'T' })).toEqual({
      valid: false,
      errors: [{ path: 'name', message: 'too short' }],
    })
  })

  it('preserves validity and paths through emit -> consume (keyword is lost)', () => {
    const original: Validator = (data) => {
      const v = data as { name?: unknown }
      if (typeof v.name === 'string' && v.name.length >= 2) {
        return { valid: true, errors: [], data: v }
      }
      return {
        valid: false,
        errors: [{ path: 'name', message: 'too short', keyword: 'minLength' }],
      }
    }
    const roundTripped = fromStandardSchema(toStandardSchema(original))
    expect(roundTripped({ name: 'Tim' }).valid).toBe(true)
    // keyword does not survive the Standard Schema hop (no keyword vocabulary).
    expect(roundTripped({ name: 'T' })).toEqual({
      valid: false,
      errors: [{ path: 'name', message: 'too short' }],
    })
  })
})
