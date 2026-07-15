import type { ZodType, ZodError, ZodSafeParseResult, TypeOf } from 'zod'
import type {
  AsyncValidator,
  Validator,
  ValidationError,
  ValidationResult,
} from '@formframe/core'

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
  return (data: unknown) => toValidationResult(schema.safeParse(data))
}

/**
 * Build an {@link AsyncValidator} (ADR 041/045) backed by Zod's
 * `safeParseAsync`. This is the direct async factory — **required** for schemas
 * with async refinements/transforms, where sync `safeParse` throws. It runs a
 * single `safeParseAsync` pass (no sync-then-async double execution) and, like
 * {@link createZodValidator}, preserves Zod's issue `code` as `keyword` — which
 * the generic `fromStandardSchemaAsync` hop would drop.
 */
export function createZodAsyncValidator<T extends ZodType>(
  schema: T
): AsyncValidator<TypeOf<T>> {
  return async (data: unknown) =>
    toValidationResult(await schema.safeParseAsync(data))
}

/** Map a Zod `safeParse(Async)` result to a neutral {@link ValidationResult}. */
function toValidationResult<T extends ZodType>(
  result: ZodSafeParseResult<TypeOf<T>>
): ValidationResult<TypeOf<T>> {
  if (result.success) {
    return { valid: true, errors: [], data: result.data }
  }
  return { valid: false, errors: result.error.issues.map(toError) }
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
