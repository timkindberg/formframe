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

// Framework-neutral HTML attribute contracts, owned by Core (the IR) — they
// model native, schema-derived attributes every renderer/UI-kit needs. NOT
// React/DOM types (importing those would break Core's stubborn boundary).
// Adapters spread `{...attrs}` and add presentation on top. See ADR 012.
export type HtmlInputType = 'text' | 'email' | 'number' | 'checkbox'

export interface HtmlInputAttrs {
  id: string
  name: string
  type: HtmlInputType
  required?: boolean
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: string
}

export interface HtmlSelectAttrs {
  id: string
  name: string
  required?: boolean
  multiple?: boolean
}

// A field's parts are widget-discriminated (ADR 012): narrow on `widget` to
// reach `input` (input widget) or `select` (select/multiselect widget).
export interface FieldPartsBase {
  container: { key: string }
  label: { text: string; attrs: { for: string }; showRequired: boolean }
  description?: { text: string }
}

export interface InputFieldParts extends FieldPartsBase {
  input: { attrs: HtmlInputAttrs }
}

export interface SelectFieldParts extends FieldPartsBase {
  select: { attrs: HtmlSelectAttrs; options: SelectOption[] }
}

export type FieldParts = InputFieldParts | SelectFieldParts

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

interface FieldNodeBase extends NodeBase {
  nodeType: 'field'
  isField: true
  isGroup: false
  isArray: false
  isArrayItem: false
}

export interface InputFieldNode extends FieldNodeBase {
  widget: 'input'
  parts: InputFieldParts
}

export interface SelectFieldNode extends FieldNodeBase {
  widget: 'select' | 'multiselect'
  parts: SelectFieldParts
}

// A field leaf — widget-discriminated. Narrow on `widget` (ADR 012).
export type FieldNode = InputFieldNode | SelectFieldNode

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
