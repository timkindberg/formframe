import { describe, it, expect } from 'vitest'
import type {
  JSONSchema,
  Validator,
  ValidationIssue,
} from '@jsonschema-form/core'

/**
 * A validator under test. Every adapter (AJV, Zod) plus the throwaway fake
 * supplies a ready-built {@link Validator} and runs through the same suite.
 * Schema-driven adapters compile their own schema before calling in.
 */
export interface ValidatorContractTarget {
  name: string
  validate: Validator
}

// One schema exercising the behaviours every validator must agree on: a
// top-level `required` + `minLength`, and the same two a level down inside array
// items — so the dot+index path convention (`contacts.0.email`) is tested too.
export const contractSchema: JSONSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 2 },
    contacts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', minLength: 3 } },
      },
    },
  },
}

/**
 * The seam contract (ADR 019). Asserts only the validator-agnostic surface —
 * `valid`, each issue's `path`, and a non-empty `message`. Paths are the
 * cross-implementation guarantee (they must match `node.path`); `keyword` is
 * intentionally not pinned to JSON Schema vocabulary — Zod emits `invalid_type`/
 * `too_small` where AJV emits `required`/`minLength`, and Core only says
 * keyword is *typically* a schema keyword (ADR 019).
 */
export function runValidatorContract(target: ValidatorContractTarget): void {
  describe(`Validator contract — ${target.name}`, () => {
    const validate = target.validate
    const at = (issues: ValidationIssue[], path: string) =>
      issues.filter((issue) => issue.path === path)

    it('reports valid data with no issues', () => {
      const result = validate({ name: 'Tim', contacts: [{ email: 'a@b' }] })
      expect(result.valid).toBe(true)
      expect(result.issues).toEqual([])
    })

    it("flags a missing required field on the field's own path", () => {
      const result = validate({ contacts: [] })
      expect(result.valid).toBe(false)
      const nameIssues = at(result.issues, 'name')
      expect(nameIssues).toHaveLength(1)
      expect(nameIssues[0].keyword).toBeTruthy()
    })

    it('flags a too-short string at the field path', () => {
      const result = validate({ name: 'T' })
      expect(result.valid).toBe(false)
      expect(at(result.issues, 'name').length).toBeGreaterThan(0)
    })

    it('keys a nested array-item required error by dot+index path', () => {
      const result = validate({ name: 'Tim', contacts: [{}] })
      expect(result.valid).toBe(false)
      const issues = at(result.issues, 'contacts.0.email')
      expect(issues).toHaveLength(1)
      expect(issues[0].keyword).toBeTruthy()
    })

    it('keys a nested array-item constraint error by dot+index path', () => {
      const result = validate({ name: 'Tim', contacts: [{ email: 'a' }] })
      expect(result.valid).toBe(false)
      expect(at(result.issues, 'contacts.0.email').length).toBeGreaterThan(0)
    })

    it('gives every issue a non-empty, human-readable message', () => {
      const result = validate({})
      expect(result.issues.length).toBeGreaterThan(0)
      for (const issue of result.issues) {
        expect(typeof issue.message).toBe('string')
        expect(issue.message.length).toBeGreaterThan(0)
      }
    })
  })
}
