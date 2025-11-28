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
 * Unflattens dot-notation paths into nested objects
 * Example: { "address.street": "123 Main" } -> { address: { street: "123 Main" } }
 */
export function unflatten(
  flat: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [path, value] of Object.entries(flat)) {
    const keys = path.split('.')
    let current: Record<string, unknown> = result

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (!(key in current)) {
        current[key] = {}
      }
      current = current[key] as Record<string, unknown>
    }

    current[keys[keys.length - 1]] = value
  }

  return result
}
