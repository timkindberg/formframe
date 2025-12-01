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
  BaseNode,
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
export { parseSchema } from './parser/index'
