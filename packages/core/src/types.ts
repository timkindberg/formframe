// Core type definitions for JSON Schema Form.
// The node interfaces live in ./parser/nodeTypes; this file is the public surface.

import type { JSONSchema } from 'json-schema-typed/draft-07'

export type { JSONSchema }

export type {
  NodeType,
  AnyNode,
  ContainerNode,
  FieldNode,
  FieldParts,
  GroupNode,
  GroupParts,
  ArrayNode,
  ArrayParts,
  ArrayItemNode,
  ArrayItemParts,
  WalkHandlers,
} from './parser/nodeTypes'
