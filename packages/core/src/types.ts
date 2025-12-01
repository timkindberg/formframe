// Core type definitions for JSON Schema Form
import type { JSONSchema } from 'json-schema-typed/draft-07'

export type { JSONSchema }

export type NodeType = 'group' | 'field' | 'array' | 'arrayItem'

export interface BaseNode {
  nodeType: NodeType
  path: string // dot notation: 'user.address.street'
  schema: JSONSchema // the raw schema chunk

  // Computed properties (set at parse time)
  isRoot: boolean // true if path === ''
  depth: number // nesting level (path.split('.').length)

  // Type guards (all nodes have these)
  isField(): this is FieldNode
  isGroup(): this is GroupNode
  isArray(): this is ArrayNode
  isArrayItem(): this is ArrayItemNode

  // Serialization (all nodes have this)
  toJSON(): object
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
  widget: string // 'input', 'textarea', 'select', 'multiselect', etc

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
}

export interface ArrayParts {
  container: {
    key: string
  }
  label?: {
    text: string
  }
  description?: {
    text: string
  }
  itemsContainer: {
    key: string
  }
  addButton: {
    attrs: {
      type: 'button'
    }
    label: string
  }
}

export interface ArrayItemParts {
  container: {
    key: string
  }
  removeButton: {
    attrs: {
      type: 'button'
    }
    label: string
  }
}

export interface WalkHandlers<R> {
  field?: (node: FieldNode, handlers: WalkHandlers<R>) => R
  group?: (node: GroupNode, handlers: WalkHandlers<R>) => R
  array?: (node: ArrayNode, handlers: WalkHandlers<R>) => R
  arrayItem?: (node: ArrayItemNode, handlers: WalkHandlers<R>) => R
}

// ContainerNode - for nodes that have children
export interface ContainerNode extends BaseNode {
  children: Array<FieldNode | GroupNode | ArrayNode | ArrayItemNode>

  // Query methods - search descendants
  getField(path: string): FieldNode | undefined
  getAllFields(): FieldNode[]

  // Walking/traversal
  walk<R>(handlers?: WalkHandlers<R>): R[]
}

export interface ArrayNode extends ContainerNode {
  nodeType: 'array'
  widget: 'array'
  itemSchema: JSONSchema
  children: ArrayItemNode[]

  // Validation rules
  validation: {
    required: boolean
    minItems?: number
    maxItems?: number
  }

  // Parts API
  parts: ArrayParts

  // Factory method - generates an ArrayItemNode for a given index
  getItem(index: number): ArrayItemNode
}

export interface ArrayItemNode extends ContainerNode {
  nodeType: 'arrayItem'
  widget: 'arrayItem'
  children: [FieldNode | GroupNode | ArrayNode]

  // Validation
  validation: {
    required: boolean
  }

  // Parts API
  parts: ArrayItemParts
}

export interface GroupNode extends ContainerNode {
  nodeType: 'group'
  widget: 'fieldset' // or keep flexible?
  children: Array<FieldNode | GroupNode | ArrayNode>

  // Validation rules
  validation: {
    required: boolean
  }

  // Parts API - framework-agnostic render data
  parts: GroupParts

  // Form submission (root nodes only)
  submit(
    onSubmit: (data: Record<string, unknown>) => void
  ): (e: { preventDefault(): void; currentTarget: EventTarget | null }) => void
}
