/**
 * @formframe/validation-zod
 *
 * Zod-backed implementation of the Core validation slot (ADR 019). Side-loaded:
 * pass `createZodValidator(schema)` wherever a `Validator` is accepted.
 */

export { createZodValidator, createZodAsyncValidator } from './zodValidator'

// Re-export the neutral contract for convenience, so consumers can type against
// the slot without a separate import from Core.
export type {
  Validator,
  AsyncValidator,
  ValidationError,
  ValidationResult,
} from '@formframe/core'
