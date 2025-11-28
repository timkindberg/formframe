// Core type definitions for JSON Schema Form
import type { JSONSchema } from 'json-schema-typed/draft-07'

export type { JSONSchema }

export type NodeType = 'group' | 'field'

export interface BaseNode {
  nodeType: NodeType
  path: string // dot notation: 'user.address.street'
  schema: JSONSchema // the raw schema chunk

  // Computed properties (set at parse time)
  isRoot: boolean // true if path === ''
  depth: number // nesting level (path.split('.').length)
}

// Parts API - framework-agnostic render structure descriptors
export interface FieldParts {
  container: {
    key: string
  }
  label: {
    text: string
    attrs: {
      for: string
    }
    showRequired: boolean
  }
  description?: {
    text: string
  }
  input?: {
    attrs: {
      id: string
      name: string
      type?: string
      required?: boolean
      min?: number
      max?: number
      minLength?: number
      maxLength?: number
      pattern?: string
      placeholder?: string
      disabled?: boolean
      readOnly?: boolean
    }
  }
  select?: {
    attrs: {
      id: string
      name: string
      required?: boolean
      disabled?: boolean
      multiple?: boolean
    }
    options: Array<{ value: string | number; label: string }>
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
  widget: string // 'input', 'textarea', 'select', etc

  // Validation rules (all in one place)
  validation: {
    required: boolean
    minLength?: number
    maxLength?: number
    minimum?: number
    maximum?: number
    pattern?: string
  }

  // Parts API - framework-agnostic render data
  parts: FieldParts

  // Type guards
  isField(): this is FieldNode
  isGroup(): this is GroupNode
}

export interface WalkHandlers<R> {
  field?: (node: FieldNode, handlers: WalkHandlers<R>) => R
  group?: (node: GroupNode, handlers: WalkHandlers<R>) => R
}

export interface GroupNode extends BaseNode {
  nodeType: 'group'
  widget: 'fieldset' // or keep flexible?
  children: Array<FieldNode | GroupNode>

  // Validation rules
  validation: {
    required: boolean
  }

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

  // Form submission (root nodes only)
  submit(
    onSubmit: (data: Record<string, unknown>) => void
  ): (e: Event) => void
}
