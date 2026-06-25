import type { JSONSchema, GroupNode } from '../types'
import { createGroupNode, isObjectSchema } from './groupNode'
import { resolveLocalRefs } from './resolveRefs'

export function jsonSchemaToTree(schema: JSONSchema): GroupNode {
  if (!isObjectSchema(schema)) {
    throw new Error('Boolean schemas are not yet supported')
  }

  const resolvedSchema = resolveLocalRefs(schema)

  // Root is just a GroupNode with empty path
  return createGroupNode('', resolvedSchema, false)
}
