
/**
 * @jsonschema-form/core
 * 
 * Headless foundation for JSON Schema form generation.
 * Zero dependencies. No framework coupling.
 */

export const VERSION = '0.0.0';

// Export types
export type {
  JSONSchema,
  NodeType,
  BaseNode,
  FieldNode,
  GroupNode,
  WalkHandlers,
  FieldParts,
  GroupParts,
} from './types';

// Export main parser
export { parseSchema } from './parser';
