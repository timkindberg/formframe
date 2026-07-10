/**
 * @jsonschema-form/validation-ajv
 *
 * AJV-backed implementation of the Core validation slot (ADR 019). Side-loaded:
 * pass `createAjvValidator(schema)` wherever a `Validator` is accepted.
 */

export { createAjvValidator } from './ajvValidator'
export type { AjvValidatorOptions } from './ajvValidator'

// Re-export the neutral contract for convenience, so consumers can type against
// the slot without a separate import from Core.
export type {
  Validator,
  ValidationError,
  ValidationResult,
} from '@jsonschema-form/core'
