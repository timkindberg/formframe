import type { FieldNode, GroupNode } from '../types'

// JSONSchema can be a boolean in draft-07, but we only work with object schemas
export type JSONSchemaObject = Exclude<import('../types').JSONSchema, boolean>

// Build validation object from schema
export function buildValidation(schema: JSONSchemaObject, required: boolean) {
  const validation: FieldNode['validation'] = {
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

// Helper to serialize nodes without circular references or functions
export function serializeNode(node: FieldNode | GroupNode): object {
  return {
    nodeType: node.nodeType,
    path: node.path,
    widget: node.widget,
    validation: node.validation,
    parts: node.parts,
    ...(node.nodeType === 'group' && {
      children: node.children.map((child) => serializeNode(child)),
    }),
    // Omit schema to avoid circular refs
  }
}

// Walk implementation with handler inheritance
export function walkNode<R>(
  node: GroupNode,
  handlers?: import('../types').WalkHandlers<R>,
  inheritedHandlers?: import('../types').WalkHandlers<R>
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
        // Group handler provided - use it with handlers for inheritance
        const result = effectiveHandlers.group(child, effectiveHandlers)
        results.push(result)
      } else {
        // No group handler - transparently walk children
        // Pass handlers down for inheritance
        results.push(...walkNode(child, effectiveHandlers, effectiveHandlers))
      }
    }
  }

  return results
}
