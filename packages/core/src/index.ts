/**
 * @jsonschema-form/core
 *
 * Headless foundation for JSON Schema form generation.
 * Zero dependencies. No framework coupling.
 */

export const VERSION = '0.0.0'

// Export types
export type {
  JSONSchema,
  NodeType,
  AnyNode,
  ContainerNode,
  FieldNode,
  GroupNode,
  ArrayNode,
  ArrayItemNode,
  WalkHandlers,
  FieldParts,
  GroupParts,
  ArrayParts,
  ArrayItemParts,
} from './types'

// Export main parser
export { jsonSchemaToTree } from './parser/index'
