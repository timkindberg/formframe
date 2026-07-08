import type { JSONSchema, GroupNode } from '../types'
import { compileRoot, isObjectSchema } from './compile'
import { resolveLocalRefs } from './resolveRefs'
import { present, defaultPresentation } from '../present/present'

export function jsonSchemaToTree(schema: JSONSchema): GroupNode {
  if (!isObjectSchema(schema)) {
    throw new Error('Boolean schemas are not yet supported')
  }

  const resolvedSchema = resolveLocalRefs(schema)

  // The JSON Schema front-end transcribes the resolved schema into the neutral tree
  // (pure structure — it calls Core's neutral builders, ADR 033 §3), then the
  // shipped default presentation runs over it: scalar-choice array containers
  // collapse into one multiselect/checkboxes leaf (ADR 030 §3) and every leaf gets
  // its widget/parts. All *lowering* lives in present(), never the front-end.
  // `useSchemaForm` re-runs present() with a consumer resolver layered on top,
  // identity-preservingly.
  return present(compileRoot(resolvedSchema), defaultPresentation)
}
