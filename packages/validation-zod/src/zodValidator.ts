import type { ZodType, ZodError } from 'zod'
import type { Validator, ValidationIssue } from '@jsonschema-form/core'

/**
 * Build a {@link Validator} (ADR 019) backed by Zod. The schema is fixed at
 * construction time; the returned function validates data synchronously via
 * `safeParse` and returns issues keyed by dot-path (matching `node.path`).
 */
export function createZodValidator(schema: ZodType): Validator {
  return (data: unknown) => {
    const result = schema.safeParse(data)
    if (result.success) {
      return { valid: true, issues: [] }
    }
    return {
      valid: false,
      issues: result.error.issues.map(toIssue),
    }
  }
}

/** Map one Zod issue to a neutral issue, landing it on the offending field. */
function toIssue(issue: ZodError['issues'][number]): ValidationIssue {
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
