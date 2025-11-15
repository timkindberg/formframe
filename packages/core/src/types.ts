// Core type definitions for JSON Schema Form
import type { JSONSchema } from 'json-schema-typed/draft-07'

export type { JSONSchema }

export type NodeType = 'root' | 'group' | 'field'

export interface BaseNode {
  nodeType: NodeType
  path: string  // dot notation: 'user.address.street'
  schema: JSONSchema  // the raw schema chunk
  title?: string
  description?: string
}

export interface FieldNode extends BaseNode {
  nodeType: 'field'
  widget: string  // 'input', 'textarea', 'select', etc
  required: boolean
  attrs: Record<string, any>  // HTML attrs: { type: 'email', min: 0, ... }
}

export interface GroupNode extends BaseNode {
  nodeType: 'group'
  widget: 'fieldset'  // or keep flexible?
  required: boolean
  children: Array<FieldNode | GroupNode>
  
  // Methods
  getChild(name: string): FieldNode | GroupNode | undefined
  getChildren(): Array<FieldNode | GroupNode>
}

export interface RootNode {
  nodeType: 'root'
  children: Array<FieldNode | GroupNode>
  
  // Query methods
  getField(path: string): FieldNode | undefined
  getAllFields(): FieldNode[]
  
  // Maybe
  toJSON(): object
}

