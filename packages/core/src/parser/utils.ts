import type { JSONSchema } from 'json-schema-typed/draft-07'
import type { AnyNode, ContainerNode, WalkHandlers } from './nodeTypes'

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
  minItems?: number
  maxItems?: number
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

// Node interfaces (ContainerNode, FieldNode, …) live in ./nodeTypes.

// Helper to serialize nodes without circular references or functions
export function serializeNode(node: AnyNode): object {
  const children = 'children' in node ? node.children : undefined
  const itemSchema = 'itemSchema' in node ? node.itemSchema : undefined
  // Validation lives once on `facts.constraints` (ADR 033 §1); nodes without facts
  // (array items) contribute none.
  const constraints = 'facts' in node ? node.facts.constraints : undefined
  return {
    nodeType: node.nodeType,
    path: node.path,
    widget: node.widget,
    ...(constraints ? { constraints } : {}),
    parts: node.parts,
    ...(children
      ? { children: children.map((child) => serializeNode(child)) }
      : {}),
    ...(itemSchema !== undefined ? { itemSchema } : {}),
    // Omit schema to avoid circular refs
  }
}

// Walk implementation with handler inheritance. Takes the public, per-node-typed
// `WalkHandlers<R>` directly — the discriminated `child.nodeType` checks narrow
// each child to the exact node its handler expects, so no `as any` bridging is
// needed here or at the call sites (the node `walk()` methods just pass `this`).
export function walkNode<R>(
  node: ContainerNode,
  handlers?: WalkHandlers<R>,
  inheritedHandlers?: WalkHandlers<R>
): R[] {
  // Use inherited handlers if no new ones provided
  const effectiveHandlers = inheritedHandlers || handlers
  if (!effectiveHandlers) {
    throw new Error('walk() requires handlers on first call')
  }

  const results: R[] = []

  for (const child of node.children) {
    if (child.nodeType === 'field') {
      if (effectiveHandlers.field) {
        results.push(effectiveHandlers.field(child, effectiveHandlers))
      }
    } else if (child.nodeType === 'group') {
      if (effectiveHandlers.group) {
        results.push(effectiveHandlers.group(child, effectiveHandlers))
      } else {
        results.push(...walkNode(child, effectiveHandlers, effectiveHandlers))
      }
    } else if (child.nodeType === 'array') {
      if (effectiveHandlers.array) {
        results.push(effectiveHandlers.array(child, effectiveHandlers))
      } else {
        results.push(...walkNode(child, effectiveHandlers, effectiveHandlers))
      }
    } else if (child.nodeType === 'arrayItem') {
      if (effectiveHandlers.arrayItem) {
        results.push(effectiveHandlers.arrayItem(child, effectiveHandlers))
      } else {
        results.push(...walkNode(child, effectiveHandlers, effectiveHandlers))
      }
    }
  }

  return results
}
