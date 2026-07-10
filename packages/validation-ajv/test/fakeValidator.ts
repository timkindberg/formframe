import type { Validator, ValidationError } from '@jsonschema-form/core'

// A throwaway, hand-rolled validator (ADR 008 / ADR 019): a tiny schema-walking
// checker for `required` + `minLength`. Its only job is to prove the Core
// `Validator` contract isn't secretly AJV-shaped — if this and the real AJV
// adapter pass the *same* contract suite, the seam is validator-agnostic.
//
// It is deliberately incomplete (handles exactly what the contract exercises) and
// loosely typed, because it walks an arbitrary JSON Schema. Not shipped.

interface WalkableSchema {
  type?: string
  required?: string[]
  properties?: Record<string, WalkableSchema>
  items?: WalkableSchema
  minLength?: number
}

export function createFakeValidator(schema: unknown): Validator {
  const root = schema as WalkableSchema
  return (data: unknown) => {
    const errors: ValidationError[] = []
    check(root, data, '', errors)
    return { valid: errors.length === 0, errors }
  }
}

function check(
  schema: WalkableSchema,
  value: unknown,
  base: string,
  errors: ValidationError[]
): void {
  if (schema.type === 'object') {
    const obj = (value ?? {}) as Record<string, unknown>
    for (const key of schema.required ?? []) {
      if (!(key in obj)) {
        errors.push({
          path: join(base, key),
          message: `must have required property '${key}'`,
          keyword: 'required',
        })
      }
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      check(sub, obj[key], join(base, key), errors)
    }
    return
  }

  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, index) =>
      check(schema.items as WalkableSchema, item, `${base}.${index}`, errors)
    )
    return
  }

  if (
    schema.type === 'string' &&
    typeof value === 'string' &&
    typeof schema.minLength === 'number' &&
    value.length < schema.minLength
  ) {
    errors.push({
      path: base,
      message: `must NOT have fewer than ${schema.minLength} characters`,
      keyword: 'minLength',
    })
  }
}

function join(base: string, segment: string): string {
  return base ? `${base}.${segment}` : segment
}
