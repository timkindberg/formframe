// Core type definitions for JSON Schema Form
import type { JSONSchema } from 'json-schema-typed/draft-07'

export type { JSONSchema }

export type NodeType = 'group' | 'field'

export interface BaseNode {
  nodeType: NodeType
  path: string  // dot notation: 'user.address.street'
  schema: JSONSchema  // the raw schema chunk
  label?: string
  description?: string
  
  // Computed properties (set at parse time)
  isRoot: boolean           // true if path === ''
  depth: number             // nesting level (path.split('.').length)
  displayLabel: string      // label || path (always has value)
  key: string               // last segment of path ('address.street' -> 'street')
  parentPath: string        // parent path ('address.street' -> 'address')
}

// Parts API - framework-agnostic render structure descriptors
export interface FieldParts {
  container: {
    key: string
  }
  label: {
    text: string
    for: string
    showRequired: boolean
  }
  description?: {
    text: string
  }
  input: {
    id: string
    name: string
    attrs: Record<string, any>
  }
  error?: {
    text: string
  }
}

export interface GroupParts {
  container: {
    key: string
  }
  label?: {
    text: string
  }
  description?: {
    text: string
  }
}

export interface FieldNode extends BaseNode {
  nodeType: 'field'
  widget: string  // 'input', 'textarea', 'select', etc
  required: boolean
  attrs: Record<string, any>  // HTML attrs: { type: 'email', min: 0, ... }
  
  // Parts API - framework-agnostic render data
  parts: FieldParts
  
  // Type guards
  isField(): this is FieldNode
  isGroup(): this is GroupNode
}

export interface WalkHandlers<R> {
  field?: (node: FieldNode) => R
  group?: (node: GroupNode) => R
}

export interface GroupNode extends BaseNode {
  nodeType: 'group'
  widget: 'fieldset'  // or keep flexible?
  required: boolean
  children: Array<FieldNode | GroupNode>
  
  // Parts API - framework-agnostic render data
  parts: GroupParts
  
  // Query methods - search descendants only
  getField(path: string): FieldNode | undefined
  getAllFields(): FieldNode[]
  
  // Walking/traversal
  walk<R>(handlers?: WalkHandlers<R>): R[]
  
  // Type guards
  isField(): this is FieldNode
  isGroup(): this is GroupNode
  
  // Serialization
  toJSON(): object
}

