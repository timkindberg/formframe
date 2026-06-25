import Ajv, { type ErrorObject, type Options as AjvOptions } from 'ajv'
import type {
  JSONSchema,
  Validator,
  ValidationIssue,
} from '@jsonschema-form/core'

export interface AjvValidatorOptions {
  /**
   * Extra AJV options, merged over the adapter defaults
   * (`allErrors: true`, `strict: false`). Use to pass custom keywords, formats,
   * or a stricter mode if your schemas warrant it.
   */
  ajv?: AjvOptions
}

/**
 * Build a {@link Validator} (ADR 019) backed by AJV. The schema is compiled once;
 * the returned function validates data and returns issues keyed by the same
 * dot-path as `node.path`, so a renderer can map each issue straight to its field.
 *
 * Defaults to `allErrors` (collect every problem, not just the first) and
 * `strict: false` (form schemas lean on annotations like `title`/`description`
 * and `oneOf`, which strict mode is fussy about).
 */
export function createAjvValidator(
  schema: JSONSchema,
  options: AjvValidatorOptions = {}
): Validator {
  const ajv = new Ajv({ allErrors: true, strict: false, ...options.ajv })
  const validate = ajv.compile(schema as object)

  return (data: unknown) => {
    const valid = validate(data) === true
    const issues = valid ? [] : (validate.errors ?? []).map(toIssue)
    return { valid, issues }
  }
}

/** Map one AJV error to a neutral issue, landing it on the offending field. */
function toIssue(error: ErrorObject): ValidationIssue {
  const base = pointerToPath(error.instancePath)

  // `required` (and `dependentRequired`) report the *parent* object's path; the
  // offending key lives in `params.missingProperty`. Append it so the issue lands
  // on the missing field itself rather than its container.
  const missing = (error.params as { missingProperty?: string }).missingProperty
  const path =
    (error.keyword === 'required' || error.keyword === 'dependentRequired') &&
    typeof missing === 'string'
      ? join(base, missing)
      : base

  return {
    path,
    message: error.message ?? 'is invalid',
    keyword: error.keyword,
  }
}

/** RFC 6901 JSON Pointer (`/contacts/0/email`) → tree dot-path (`contacts.0.email`). */
function pointerToPath(pointer: string): string {
  if (!pointer) return ''
  return pointer
    .slice(1)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .join('.')
}

function join(base: string, segment: string): string {
  return base ? `${base}.${segment}` : segment
}
