import type { JSONSchema } from 'json-schema-typed/draft-07'

// JSONSchema can be a boolean in draft-07, but we only work with object schemas
export type JSONSchemaObject = Exclude<JSONSchema, boolean>

// Validation object shape (exported for type inference)
export interface ValidationRules {
  required: boolean
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  pattern?: string
  [key: string]: unknown
}

// Build validation object from schema
export function buildValidation(schema: JSONSchemaObject, required: boolean) {
  const validation: ValidationRules = {
    required,
  }

  // String constraints
  if (schema.minLength !== undefined) {
    validation.minLength = schema.minLength
  }
  if (schema.maxLength !== undefined) {
    validation.maxLength = schema.maxLength
  }
  if (schema.pattern !== undefined) {
    validation.pattern = schema.pattern
  }

  // Number constraints
  if (schema.minimum !== undefined) {
    validation.minimum = schema.minimum
  }
  if (schema.maximum !== undefined) {
    validation.maximum = schema.maximum
  }

  return validation
}

// Base interface that all nodes must satisfy
export interface BaseNode {
  nodeType: 'field' | 'group' | 'array' | 'arrayItem'
  path: string
  schema: JSONSchemaObject
  widget:
    | 'fieldset'
    | 'input'
    | 'select'
    | 'multiselect'
    | 'array'
    | 'arrayItem'
  validation: { required: boolean; [key: string]: unknown }
  isRoot: boolean
  depth: number
  parts: { container: { key: string } }
  isField: boolean
  isGroup: boolean
  isArray: boolean
  isArrayItem: boolean
  toJSON(): object
}

// Container nodes have children and traversal methods
export interface ContainerNode extends BaseNode {
  children: BaseNode[]
  getField(path: string): BaseNode | undefined
  getAllFields(): BaseNode[]
  walk<R>(handlers?: unknown): R[]
  [key: string]: unknown
}

// Helper to serialize nodes without circular references or functions
export function serializeNode(node: BaseNode): object {
  const containerNode = node as ContainerNode
  const arrayNode = node as BaseNode & { itemSchema?: unknown }
  return {
    nodeType: node.nodeType,
    path: node.path,
    widget: node.widget,
    validation: node.validation,
    parts: node.parts,
    ...(containerNode.children && {
      children: containerNode.children.map((child) => serializeNode(child)),
    }),
    ...(arrayNode.itemSchema !== undefined
      ? { itemSchema: arrayNode.itemSchema }
      : {}),
    // Omit schema to avoid circular refs
  }
}

// Walk handlers shape - uses unknown for maximum compatibility
// Specific node types enforce their own WalkHandlers interface
interface WalkHandlersShape<R> {
  field?: (node: unknown, handlers: unknown) => R
  group?: (node: unknown, handlers: unknown) => R
  array?: (node: unknown, handlers: unknown) => R
  arrayItem?: (node: unknown, handlers: unknown) => R
}

// Walk implementation with handler inheritance
export function walkNode<R>(
  node: ContainerNode,
  handlers?: WalkHandlersShape<R>,
  inheritedHandlers?: WalkHandlersShape<R>
): R[] {
  // Use inherited handlers if no new ones provided
  const effectiveHandlers = inheritedHandlers || handlers
  if (!effectiveHandlers) {
    throw new Error('walk() requires handlers on first call')
  }

  const results: R[] = []

  for (const child of node.children) {
    if (child.nodeType === 'field' && effectiveHandlers.field) {
      const result = effectiveHandlers.field(child, effectiveHandlers)
      results.push(result)
    } else if (child.nodeType === 'group') {
      if (effectiveHandlers.group) {
        const result = effectiveHandlers.group(child, effectiveHandlers)
        results.push(result)
      } else {
        results.push(
          ...walkNode(
            child as ContainerNode,
            effectiveHandlers,
            effectiveHandlers
          )
        )
      }
    } else if (child.nodeType === 'array') {
      if (effectiveHandlers.array) {
        const result = effectiveHandlers.array(child, effectiveHandlers)
        results.push(result)
      } else {
        results.push(
          ...walkNode(
            child as ContainerNode,
            effectiveHandlers,
            effectiveHandlers
          )
        )
      }
    } else if (child.nodeType === 'arrayItem') {
      if (effectiveHandlers.arrayItem) {
        const result = effectiveHandlers.arrayItem(child, effectiveHandlers)
        results.push(result)
      } else {
        results.push(
          ...walkNode(
            child as ContainerNode,
            effectiveHandlers,
            effectiveHandlers
          )
        )
      }
    }
  }

  return results
}
