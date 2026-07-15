import { describe, it, expect } from 'vitest'
import type {
  AsyncValidator,
  Validator,
  ValidationError,
  ValidationResult,
} from '@formframe/core'
import type { JSONSchema } from '@formframe/input-jsonschema'

/**
 * A validator under test. Every adapter (AJV, Zod) plus the throwaway fake
 * supplies a ready-built {@link Validator} **or** {@link AsyncValidator} and runs
 * through the same suite. Schema-driven adapters compile their own schema before
 * calling in.
 *
 * The suite awaits every call (ADR 045/046 async mode), so a sync `Validator`
 * and an `AsyncValidator` run the *same* per-call invariants — purity, no
 * aliasing, verdict, transformed value — with the only difference being timing.
 */
export interface ValidatorContractTarget {
  name: string
  validate: Validator | AsyncValidator
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
 * The seam contract (ADR 019 / ADR 020). Asserts only the validator-agnostic
 * surface — `valid`, each error's `path`, and a non-empty `message`. Paths are
 * the cross-implementation guarantee (they must match `node.path`); `keyword`
 * is intentionally not pinned to JSON Schema vocabulary — Zod emits
 * `invalid_type`/`too_small` where AJV emits `required`/`minLength`, and Core
 * only says keyword is *typically* a schema keyword (ADR 019).
 */
export function runValidatorContract(target: ValidatorContractTarget): void {
  describe(`Validator contract — ${target.name}`, () => {
    // Normalize sync/async: always await, so both seams run identical assertions.
    const validate = (data: unknown): Promise<ValidationResult> =>
      Promise.resolve(target.validate(data))
    const at = (errors: ValidationError[], path: string) =>
      errors.filter((error) => error.path === path)

    it('reports valid data with no errors', async () => {
      const result = await validate({
        name: 'Tim',
        contacts: [{ email: 'a@b' }],
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it("flags a missing required field on the field's own path", async () => {
      const result = await validate({ contacts: [] })
      expect(result.valid).toBe(false)
      const nameErrors = at(result.errors, 'name')
      expect(nameErrors).toHaveLength(1)
      expect(nameErrors[0].keyword).toBeTruthy()
    })

    it('flags a too-short string at the field path', async () => {
      const result = await validate({ name: 'T' })
      expect(result.valid).toBe(false)
      expect(at(result.errors, 'name').length).toBeGreaterThan(0)
    })

    it('keys a nested array-item required error by dot+index path', async () => {
      const result = await validate({ name: 'Tim', contacts: [{}] })
      expect(result.valid).toBe(false)
      const errors = at(result.errors, 'contacts.0.email')
      expect(errors).toHaveLength(1)
      expect(errors[0].keyword).toBeTruthy()
    })

    it('keys a nested array-item constraint error by dot+index path', async () => {
      const result = await validate({ name: 'Tim', contacts: [{ email: 'a' }] })
      expect(result.valid).toBe(false)
      expect(at(result.errors, 'contacts.0.email').length).toBeGreaterThan(0)
    })

    it('gives every error a non-empty, human-readable message', async () => {
      const result = await validate({})
      expect(result.errors.length).toBeGreaterThan(0)
      for (const error of result.errors) {
        expect(typeof error.message).toBe('string')
        expect(error.message.length).toBeGreaterThan(0)
      }
    })

    // ADR 025 — the two universal `data` invariants. (Coercion *content* is
    // adapter-specific — AJV coerces by default, Zod does not — so that is
    // asserted in each adapter's own suite, not here.)

    it('does not mutate its input (purity)', async () => {
      const input = { name: 'Tim', contacts: [{ email: 'a@b' }] }
      const snapshot = structuredClone(input)
      await validate(input)
      expect(input).toEqual(snapshot)
    })

    it('never returns `data` aliased to the input', async () => {
      // Input that needs no coercion, so a coercing and a non-coercing validator
      // agree: when `data` is present it is a *fresh* value equal to the input.
      const input = { name: 'Tim', contacts: [{ email: 'a@b' }] }
      const result = await validate(input)
      if (result.data !== undefined) {
        expect(result.data).not.toBe(input)
        expect(result.data).toEqual(input)
      }
    })
  })
}
