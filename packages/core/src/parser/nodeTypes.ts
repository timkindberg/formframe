// Explicit node interfaces forming a recursive, discriminated union.
//
// Every node carries `nodeType` plus boolean-literal discriminants
// (`isField`/`isGroup`/`isArray`/`isArrayItem`), so a value typed as
// `AnyNode` narrows on either: `if (node.isArray) { node.getItem(0) }`.
//
// Interfaces (not ReturnType-derived aliases) are required here because
// container `children` reference `AnyNode`, which references the containers —
// a recursion that type aliases cannot express but interfaces can.

import type { JSONSchemaObject, ValidationRules } from './utils'

export type NodeType = 'field' | 'group' | 'array' | 'arrayItem'

export interface SelectOption {
  value: string | number
  label: string
}

// A field's parts are uniform whether it renders as input, select, or
// multiselect — `input?`/`select?` are optional and chosen by `widget`.
export interface FieldParts {
  container: { key: string }
  label: { text: string; attrs: { for: string }; showRequired: boolean }
  description?: { text: string }
  input?: { attrs: Record<string, string | number | boolean> }
  select?: {
    attrs: {
      id: string
      name: string
      multiple?: boolean
      required?: boolean
    }
    options: SelectOption[]
  }
}

export interface GroupParts {
  container: { key: string }
  label?: { text: string }
  description?: { text: string }
}

export interface ArrayParts {
  container: { key: string }
  itemsContainer: { key: string }
  addButton: { attrs: { type: 'button' }; label: string }
  label?: { text: string }
  description?: { text: string }
}

export interface ArrayItemParts {
  container: { key: string }
  removeButton: { attrs: { type: 'button' }; label: string }
}

// Fields shared by every node.
interface NodeBase {
  path: string
  schema: JSONSchemaObject
  isRoot: boolean
  depth: number
  validation: ValidationRules
  toJSON(): object
}

// Traversal/query surface shared by container nodes.
interface ContainerMethods {
  children: AnyNode[]
  getField(path: string): FieldNode | undefined
  getAllFields(): FieldNode[]
  walk<R>(handlers?: WalkHandlers<R>): R[]
}

export interface FieldNode extends NodeBase {
  nodeType: 'field'
  widget: 'input' | 'select' | 'multiselect'
  parts: FieldParts
  isField: true
  isGroup: false
  isArray: false
  isArrayItem: false
}

export interface GroupNode extends NodeBase, ContainerMethods {
  nodeType: 'group'
  widget: 'fieldset'
  parts: GroupParts
  isField: false
  isGroup: true
  isArray: false
  isArrayItem: false
  submit(
    onSubmit: (data: Record<string, unknown>) => void
  ): (e: { preventDefault(): void; currentTarget: EventTarget | null }) => void
}

export interface ArrayNode extends NodeBase, ContainerMethods {
  nodeType: 'array'
  widget: 'array'
  parts: ArrayParts
  itemSchema: JSONSchemaObject
  isField: false
  isGroup: false
  isArray: true
  isArrayItem: false
  getItem(index: number): ArrayItemNode
}

export interface ArrayItemNode extends NodeBase, ContainerMethods {
  nodeType: 'arrayItem'
  widget: 'arrayItem'
  parts: ArrayItemParts
  isField: false
  isGroup: false
  isArray: false
  isArrayItem: true
}

// Every concrete node.
export type AnyNode = FieldNode | GroupNode | ArrayNode | ArrayItemNode

// Container nodes (those with children) — used by walk plumbing.
export type ContainerNode = GroupNode | ArrayNode | ArrayItemNode

export interface WalkHandlers<R> {
  field?: (node: FieldNode, handlers: WalkHandlers<R>) => R
  group?: (node: GroupNode, handlers: WalkHandlers<R>) => R
  array?: (node: ArrayNode, handlers: WalkHandlers<R>) => R
  arrayItem?: (node: ArrayItemNode, handlers: WalkHandlers<R>) => R
}
