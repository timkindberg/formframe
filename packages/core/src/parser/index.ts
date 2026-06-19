import type { JSONSchema, GroupNode } from '../types'
import { createGroupNode, isObjectSchema } from './groupNode'

export function jsonSchemaToTree(schema: JSONSchema): GroupNode {
  if (!isObjectSchema(schema)) {
    throw new Error('Boolean schemas are not yet supported')
  }

  // Root is just a GroupNode with empty path
  return createGroupNode('', schema, false)
}
