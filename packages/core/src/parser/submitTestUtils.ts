// Test-only helper (excluded from the build — see tsconfig `exclude`).
//
// Runs form.submit() against a mocked FormData backed by [key, value] pairs
// (a multimap, so duplicate keys survive — matching real FormData).

import { jsonSchemaToTree } from './index'
import type { JSONSchema } from '../types'

export function submitWith(
  schema: JSONSchema,
  pairs: Array<[string, string]>
): Record<string, unknown> {
  const form = jsonSchemaToTree(schema)
  let submitted: Record<string, unknown> = {}
  const handleSubmit = form.submit((data) => {
    submitted = data
  })
  const originalFormData = globalThis.FormData
  globalThis.FormData = class MockFormData {
    entries() {
      return pairs.values()
    }
  } as unknown as typeof FormData
  handleSubmit({
    preventDefault() {},
    currentTarget: {} as EventTarget,
  })
  globalThis.FormData = originalFormData
  return submitted
}
