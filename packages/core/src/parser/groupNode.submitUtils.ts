/**
 * Omits FormData entries whose native value is the empty string, treating an
 * unfilled field as absent. Preserves empty strings at numeric array indices
 * (e.g. hobbies.0) where empty vs absent differ (ADR 018 sparse arrays).
 */
export function omitEmptyFormValues(
  flat: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(flat)) {
    if (value === '') {
      const lastSegment = key.split('.').pop() ?? key
      if (/^\d+$/.test(lastSegment)) {
        result[key] = value
      }
      continue
    }
    result[key] = value
  }

  return result
}

/**
 * Normalizes numeric path segments to '*' so a single array-field signature
 * matches every array-item instance: `contacts.0.skills` and
 * `contacts.1.skills` both normalize to `contacts.*.skills`. This lets one
 * signature (derived from the compiled tree's item shape) cover items added at
 * runtime, whose indices the compiled tree never enumerates.
 */
export function normalizeArrayFieldPath(path: string): string {
  return path
    .split('.')
    .map((segment) => (/^\d+$/.test(segment) ? '*' : segment))
    .join('.')
}

/**
 * Wraps single values of known array-valued fields (e.g. multiselect) in a
 * 1-element array so a field with one selection submits as `['x']`, not `'x'`.
 * Keys are matched by their normalized signature so array-item instances match
 * regardless of index. Fields absent from `flat` stay absent — zero selections
 * are omitted upstream so `required` still fails on them (ADR: 3yh). Values
 * that are already arrays (multiple selections) pass through untouched.
 */
export function forceArrayFields(
  flat: Record<string, unknown>,
  arrayFieldSignatures: Set<string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(flat)) {
    if (
      !Array.isArray(value) &&
      arrayFieldSignatures.has(normalizeArrayFieldPath(key))
    ) {
      result[key] = [value]
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * Transforms checkbox "on" values to boolean true
 */
export function transformCheckboxes(
  flat: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(flat)) {
    // If value is "on", it's a checked checkbox -> true
    result[key] = value === 'on' ? true : value
  }

  return result
}

/**
 * Unflattens dot-notation paths into nested objects and arrays
 * Examples:
 * - { "address.street": "123 Main" } -> { address: { street: "123 Main" } }
 * - { "hobbies.0": "reading", "hobbies.2": "coding" } -> { hobbies: [, "reading", , "coding"] } (sparse)
 */
export function unflatten(
  flat: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [path, value] of Object.entries(flat)) {
    const keys = path.split('.')
    let current: Record<string, unknown> | unknown[] = result

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      const nextKey = keys[i + 1]
      const isNextArray = /^\d+$/.test(nextKey)

      if (Array.isArray(current)) {
        const index = parseInt(key, 10)
        if (!(index in current)) {
          current[index] = isNextArray ? [] : {}
        }
        current = current[index] as Record<string, unknown> | unknown[]
      } else {
        if (!(key in current)) {
          current[key] = isNextArray ? [] : {}
        }
        current = current[key] as Record<string, unknown> | unknown[]
      }
    }

    const lastKey = keys[keys.length - 1]
    if (Array.isArray(current)) {
      const index = parseInt(lastKey, 10)
      current[index] = value
    } else {
      current[lastKey] = value
    }
  }

  return result
}
