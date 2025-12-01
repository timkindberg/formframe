// Core type definitions for JSON Schema Form
// Types are derived from factory function return types (implementation-first approach)

import type { JSONSchema } from 'json-schema-typed/draft-07'

export type { JSONSchema }

// Base types from utils
export type { BaseNode, ContainerNode } from './parser/utils'

// Re-export node types from their implementation files
export type { FieldNode, FieldParts } from './parser/fieldNode'
export type { GroupNode, GroupParts, WalkHandlers } from './parser/groupNode'
export type {
  ArrayNode,
  ArrayParts,
  ArrayItemNode,
  ArrayItemParts,
} from './parser/arrayNode'

// Discriminated union of all node types
export type NodeType = 'group' | 'field' | 'array' | 'arrayItem'
