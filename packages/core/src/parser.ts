import type {
  JSONSchema,
  FieldNode,
  GroupNode,
  WalkHandlers,
  FieldParts,
  GroupParts,
} from './types'

// JSONSchema can be a boolean in draft-07, but we only work with object schemas
type JSONSchemaObject = Exclude<JSONSchema, boolean>

// Type guard for object schemas
function isObjectSchema(schema: JSONSchema): schema is JSONSchemaObject {
  return typeof schema === 'object' && schema !== null
}

// Helper to compute base node properties
function computeBaseProps(path: string) {
  const isRoot = path === ''
  const segments = path ? path.split('.') : []
  const depth = isRoot ? 0 : segments.length
  const parentPath = segments.slice(0, -1).join('.')

  return { isRoot, depth, parentPath }
}

export function parseSchema(schema: JSONSchema): GroupNode {
  if (!isObjectSchema(schema)) {
    throw new Error('Boolean schemas are not yet supported')
  }

  // Root is just a GroupNode with empty path
  return createGroupNode('', schema, false)
}

function createFieldNode(
  path: string,
  schema: JSONSchemaObject,
  required: boolean
): FieldNode {
  const baseProps = computeBaseProps(path)
  const validation = buildValidation(schema, required)

  // Check for enum or oneOf pattern
  // Add select part for enum or oneOf fields
  const hasEnum = Array.isArray(schema.enum) && schema.enum.length > 0
  const hasOneOf = Array.isArray(schema.oneOf) && schema.oneOf.length > 0
  const isSelect = hasEnum || hasOneOf

  function buildContainerPart() {
    return {
      key: path,
    }
  }
  
  function buildLabelPart() {
    return {
      text: schema.title || path || 'root',
      attrs: {
        for: path,
      },
      showRequired: required,
    }
  }

  function buildDescriptionPart() {
    if (!schema.description) return undefined
    return {
      text: schema.description,
    }
  }

  function buildInputPart() {
    if (isSelect) return undefined
    return {
      input: {
        attrs: {
          id: path,
          name: path,
          ...buildInputAttrs(schema, validation),
        },
      },
    }
  }
  
  function buildSelectPart() {
    if (!isSelect) return undefined

    function buildSelectOptions() {
      let options: Array<{ value: string | number; label: string }> = []
  
      if (hasEnum) {
        // Simple enum: values are labels
        const enumValues = schema.enum as Array<string | number>
        options = enumValues.map((value) => ({
          value,
          label: String(value),
        }))
      } else if (hasOneOf) {
        // oneOf with const + title pattern
        options = (
          schema.oneOf as Array<{
            const: string | number
            title?: string
          }>
        )
          .filter((item) => item && typeof item === 'object' && 'const' in item)
          .map((item) => ({
            value: item.const,
            label: item.title || String(item.const),
          }))
      }
      return options
    }

    return {
      select: {
        attrs: {
          id: path,
          name: path,
          ...(required ? { required: true } : {}),
        },
        options: buildSelectOptions()
      },
    }
  }
  const parts: FieldParts = {
    container: buildContainerPart(),
    label: buildLabelPart(),
    description: buildDescriptionPart(),
    ...buildInputPart(),
    ...buildSelectPart(),
  }

  return {
    nodeType: 'field',
    path,
    schema,
    widget: isSelect ? 'select' : 'input',
    validation,

    // Computed properties
    ...baseProps,

    // Parts API
    parts,

    isField(): this is FieldNode {
      return true
    },

    isGroup(): this is GroupNode {
      return false
    },
  }
}

function createGroupNode(
  path: string,
  schema: JSONSchemaObject,
  required: boolean
): GroupNode {
  const children: Array<FieldNode | GroupNode> = []
  const requiredFields = schema.required || []

  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (!isObjectSchema(propSchema)) continue // Skip boolean schemas

      const childPath = path ? `${path}.${key}` : key // Handle root path
      const isRequired = requiredFields.includes(key)

      if (propSchema.type === 'object' && propSchema.properties) {
        children.push(createGroupNode(childPath, propSchema, isRequired))
      } else {
        children.push(createFieldNode(childPath, propSchema, isRequired))
      }
    }
  }

  const baseProps = computeBaseProps(path)

  const parts: GroupParts = {
    container: {
      key: path,
    },
  }

  // Add label part if present
  if (schema.title) {
    parts.label = {
      text: schema.title,
    }
  }

  // Add description part if present
  if (schema.description) {
    parts.description = {
      text: schema.description,
    }
  }

  const groupNode: GroupNode = {
    nodeType: 'group',
    path,
    schema,
    widget: 'fieldset',
    children,
    validation: {
      required,
    },

    // Computed properties
    ...baseProps,

    // Parts API
    parts,

    getField(targetPath: string): FieldNode | undefined {
      // Search descendants relative to this group
      // If this group has path 'address', searching for 'street' finds 'address.street'
      const fullPath = path ? `${path}.${targetPath}` : targetPath

      for (const child of children) {
        if (child.nodeType === 'field' && child.path === fullPath) {
          return child
        } else if (child.nodeType === 'group') {
          // Check if target is within this child group
          if (
            fullPath.startsWith(child.path + '.') ||
            fullPath === child.path
          ) {
            const relativePath = fullPath.substring(child.path.length + 1)
            const found = child.getField(relativePath)
            if (found) return found
          }
        }
      }
      return undefined
    },

    getAllFields(): FieldNode[] {
      const fields: FieldNode[] = []

      for (const child of children) {
        if (child.nodeType === 'field') {
          fields.push(child)
        } else if (child.nodeType === 'group') {
          fields.push(...child.getAllFields())
        }
      }

      return fields
    },

    walk<R>(handlers?: WalkHandlers<R>): R[] {
      return walkNode(groupNode, handlers)
    },

    isField(): this is FieldNode {
      return false
    },

    isGroup(): this is GroupNode {
      return true
    },

    toJSON() {
      return serializeNode(this)
    },
  }

  return groupNode
}

// Helper to serialize nodes without circular references or functions
function serializeNode(node: FieldNode | GroupNode): object {
  if (node.nodeType === 'field') {
    return {
      nodeType: node.nodeType,
      path: node.path,
      widget: node.widget,
      validation: node.validation,
      parts: node.parts,
      // Omit schema to avoid circular refs
    }
  } else {
    return {
      nodeType: node.nodeType,
      path: node.path,
      widget: node.widget,
      validation: node.validation,
      parts: node.parts,
      children: node.children.map((child) => serializeNode(child)),
      // Omit schema and methods to avoid circular refs
    }
  }
}

// Build validation object from schema
function buildValidation(schema: JSONSchemaObject, required: boolean) {
  const validation: {
    required: boolean
    minLength?: number
    maxLength?: number
    minimum?: number
    maximum?: number
    pattern?: string
  } = {
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

// Build HTML input attributes from schema and validation
function buildInputAttrs(
  schema: JSONSchemaObject,
  validation: {
    required: boolean
    minLength?: number
    maxLength?: number
    minimum?: number
    maximum?: number
    pattern?: string
  }
): Record<string, string | number | boolean> {
  const attrs: Record<string, string | number | boolean> = {}

  // HTML input type
  if (schema.type === 'string') {
    if (schema.format === 'email') {
      attrs.type = 'email'
    } else {
      attrs.type = 'text'
    }
  } else if (schema.type === 'number' || schema.type === 'integer') {
    attrs.type = 'number'
  } else if (schema.type === 'boolean') {
    attrs.type = 'checkbox'
  }

  // Add validation attributes
  if (validation.required) {
    attrs.required = true
  }
  if (validation.minLength !== undefined) {
    attrs.minLength = validation.minLength
  }
  if (validation.maxLength !== undefined) {
    attrs.maxLength = validation.maxLength
  }
  if (validation.minimum !== undefined) {
    attrs.min = validation.minimum
  }
  if (validation.maximum !== undefined) {
    attrs.max = validation.maximum
  }
  if (validation.pattern !== undefined) {
    attrs.pattern = validation.pattern
  }

  return attrs
}

// Walk implementation with handler inheritance
function walkNode<R>(
  node: GroupNode,
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
    if (child.nodeType === 'field' && effectiveHandlers.field) {
      const result = effectiveHandlers.field(child)
      results.push(result)
    } else if (child.nodeType === 'group') {
      if (effectiveHandlers.group) {
        // Group handler provided - use it
        const result = effectiveHandlers.group(child)
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
