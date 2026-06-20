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
  InputFieldNode,
  SelectFieldNode,
  GroupNode,
  ArrayNode,
  ArrayItemNode,
  WalkHandlers,
  FieldParts,
  InputFieldParts,
  SelectFieldParts,
  FieldPartsBase,
  HtmlInputAttrs,
  HtmlSelectAttrs,
  HtmlInputType,
  SelectOption,
  GroupParts,
  ArrayParts,
  ArrayItemParts,
} from './types'

// Export main parser
export { jsonSchemaToTree } from './parser/index'
