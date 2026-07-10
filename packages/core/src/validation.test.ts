import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  groupErrorsByPath,
  type ValidationError,
  type ValidationResult,
  type Validator,
} from './index'

describe('validation errors contract (ADR 037)', () => {
  it('exposes errors through the public validator seam', () => {
    const errors: ValidationError[] = [
      { path: 'name', message: 'Name is required', keyword: 'required' },
    ]
    const validator: Validator = () => ({ valid: false, errors })
    const result: ValidationResult = validator({})

    expect(result.errors).toBe(errors)
    expect(groupErrorsByPath(result.errors).get('name')).toEqual(errors)
    expectTypeOf(result.errors).toEqualTypeOf<ValidationError[]>()
  })
})
