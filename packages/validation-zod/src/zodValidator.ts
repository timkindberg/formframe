import type { ZodType, ZodError, TypeOf } from 'zod'
import type { Validator, ValidationError } from '@jsonschema-form/core'

/**
 * Build a {@link Validator} (ADR 019) backed by Zod. The schema is fixed at
 * construction time; the returned function validates data synchronously via
 * `safeParse` and returns errors keyed by dot-path (matching `node.path`).
 *
 * Zod already satisfies the ADR 025 contract for free: `safeParse` never mutates
 * its input (purity), and on success it produces a fresh parsed value — returned
 * here as `result.data`, typed as the schema's output (`TypeOf<T>`).
 */
export function createZodValidator<T extends ZodType>(
  schema: T
): Validator<TypeOf<T>> {
  return (data: unknown) => {
    const result = schema.safeParse(data)
    if (result.success) {
      return { valid: true, errors: [], data: result.data }
    }
    return {
      valid: false,
      errors: result.error.issues.map(toError),
    }
  }
}

/** Map one upstream Zod issue to a neutral validation error. */
function toError(issue: ZodError['issues'][number]): ValidationError {
  return {
    path: zodPathToDotPath(issue.path),
    message: issue.message,
    keyword: issue.code,
  }
}

/** Zod path segments (`['contacts', 0, 'email']`) → tree dot-path (`contacts.0.email`). */
function zodPathToDotPath(path: ReadonlyArray<PropertyKey>): string {
  return path.map(String).join('.')
}
