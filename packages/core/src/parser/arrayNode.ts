import { createFieldNode, type FieldNode } from './fieldNode'
import { createGroupNode, type WalkHandlers } from './groupNode'
import {
  type JSONSchemaObject,
  type ContainerNode,
  type BaseNode,
  serializeNode,
  walkNode,
} from './utils'

/**
 * Creates an ArrayNode for array-type schemas
 * Handles both primitive arrays (multiselect) and complex arrays (add/remove items)
 */
export function createArrayNode(
  path: string,
  schema: JSONSchemaObject,
  required: boolean
) {
  const itemsSchema = schema.items

  // items must be a single schema object (not an array or boolean)
  if (!itemsSchema) {
    throw new Error(`Array schema at ${path} must have 'items' property`)
  }

  if (Array.isArray(itemsSchema)) {
    throw new Error(
      `Array schema at ${path} has tuple-style 'items' (array), which is not yet supported. Use a single schema object.`
    )
  }

  if (typeof itemsSchema === 'boolean') {
    throw new Error(
      `Array schema at ${path} has boolean 'items', which is not supported`
    )
  }

  // Now we know items is a JSONSchemaObject
  const itemSchemaObject = itemsSchema as JSONSchemaObject

  // Check if this is a primitive array (should be multiselect FieldNode)
  const isPrimitive = isPrimitiveArraySchema(itemSchemaObject)
  if (isPrimitive) {
    // Return a FieldNode with widget: 'multiselect'
    return createMultiselectFieldNode(path, schema, required)
  }

  // Complex array - create ArrayNode with ArrayItemNode children
  const minItems = typeof schema.minItems === 'number' ? schema.minItems : 0

  // Create initial children based on minItems
  const children: BaseNode[] = []
  for (let i = 0; i < minItems; i++) {
    children.push(createArrayItemNode(path, i, itemSchemaObject, required))
  }

  const parts = {
    container: {
      key: path,
    },
    itemsContainer: {
      key: `${path}-items`,
    },
    addButton: {
      attrs: {
        type: 'button' as const,
      },
      label: schema.title ? `Add ${schema.title}` : 'Add Item',
    },
    ...(schema.title && {
      label: {
        text: schema.title,
      },
    }),
    ...(schema.description && {
      description: {
        text: schema.description,
      },
    }),
  }

  const arrayNode = {
    nodeType: 'array' as const,
    path,
    schema,
    widget: 'array' as const,
    itemSchema: itemSchemaObject,
    children,
    validation: {
      required,
      minItems: schema.minItems,
      maxItems: schema.maxItems,
    },

    // Computed properties
    isRoot: path === '',
    depth: path ? path.split('.').length : 0,

    // Parts API
    parts,

    // Factory method for creating items dynamically
    getItem(index: number) {
      return createArrayItemNode(path, index, itemSchemaObject, required)
    },

    getField(targetPath: string): FieldNode | undefined {
      // Search through children
      for (const child of children) {
        if (child.nodeType === 'arrayItem') {
          const found = (child as ContainerNode).getField(targetPath)
          if (found) return found as FieldNode
        }
      }
      return undefined
    },

    getAllFields(): FieldNode[] {
      const fields: FieldNode[] = []

      for (const child of children) {
        fields.push(...((child as ContainerNode).getAllFields() as FieldNode[]))
      }

      return fields
    },

    walk<R>(handlers?: WalkHandlers<R>): R[] {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return walkNode(arrayNode, handlers as any)
    },

    isField: false as const,
    isGroup: false as const,
    isArray: true as const,
    isArrayItem: false as const,

    toJSON() {
      return serializeNode(this)
    },
  } satisfies ContainerNode

  return arrayNode
}

// Extract the array-specific return type (excluding the FieldNode case for multiselect)
export type ArrayNode = Extract<
  ReturnType<typeof createArrayNode>,
  { nodeType: 'array' }
>
export type ArrayParts = ArrayNode['parts']

/**
 * Creates an ArrayItemNode that wraps a single array item
 */
export function createArrayItemNode(
  arrayPath: string,
  index: number,
  itemSchema: JSONSchemaObject,
  required: boolean
) {
  const itemPath = `${arrayPath}.${index}`

  // Create the child node based on item schema type
  let child: BaseNode

  if (itemSchema.type === 'object' && itemSchema.properties) {
    child = createGroupNode(itemPath, itemSchema, required)
  } else if (itemSchema.type === 'array') {
    const childArray = createArrayNode(itemPath, itemSchema, required)
    if (childArray.nodeType !== 'array') {
      throw new Error('Nested primitive arrays not yet supported')
    }
    child = childArray
  } else {
    child = createFieldNode(itemPath, itemSchema, required)
  }

  const parts = {
    container: {
      key: itemPath,
    },
    removeButton: {
      attrs: {
        type: 'button' as const,
      },
      label: 'Remove',
    },
  }

  return {
    nodeType: 'arrayItem' as const,
    path: itemPath,
    schema: itemSchema,
    widget: 'arrayItem' as const,
    children: [child],
    validation: {
      required,
    },

    // Computed properties
    isRoot: false as const,
    depth: itemPath.split('.').length,

    // Parts API
    parts,

    getField(targetPath: string): FieldNode | undefined {
      const child = this.children[0]
      if (child.nodeType === 'field') {
        return child.path === targetPath ? (child as FieldNode) : undefined
      } else if (child.nodeType === 'group' || child.nodeType === 'array') {
        return (child as ContainerNode).getField(targetPath) as
          | FieldNode
          | undefined
      }
      return undefined
    },

    getAllFields(): FieldNode[] {
      const child = this.children[0]
      if (child.nodeType === 'field') {
        return [child as FieldNode]
      } else if (child.nodeType === 'group' || child.nodeType === 'array') {
        return (child as ContainerNode).getAllFields() as FieldNode[]
      }
      return []
    },

    walk<R>(handlers?: WalkHandlers<R>): R[] {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return walkNode(this, handlers as any)
    },

    isField: false as const,
    isGroup: false as const,
    isArray: false as const,
    isArrayItem: true as const,

    toJSON() {
      return serializeNode(this)
    },
  } satisfies ContainerNode
}

export type ArrayItemNode = ReturnType<typeof createArrayItemNode>
export type ArrayItemParts = ArrayItemNode['parts']

/**
 * Check if an array schema should render as multiselect (has enum or oneOf)
 * Arrays of plain primitives without enum/oneOf will use dynamic add/remove pattern
 */
function isPrimitiveArraySchema(itemsSchema: JSONSchemaObject): boolean {
  // Only treat as multiselect if there are predefined options
  if (itemsSchema.enum || itemsSchema.oneOf) {
    return true
  }
  return false
}

/**
 * Creates a FieldNode with widget 'multiselect' for primitive arrays
 */
function createMultiselectFieldNode(
  path: string,
  schema: JSONSchemaObject,
  required: boolean
) {
  const itemsSchema = schema.items as JSONSchemaObject

  // Build options from enum or oneOf
  let options: Array<{ value: string | number; label: string }> = []

  if (itemsSchema.enum) {
    options = (itemsSchema.enum as Array<string | number>).map((value) => ({
      value,
      label: String(value),
    }))
  } else if (itemsSchema.oneOf) {
    options = (
      itemsSchema.oneOf as Array<{ const: string | number; title?: string }>
    )
      .filter((item) => item && typeof item === 'object' && 'const' in item)
      .map((item) => ({
        value: item.const,
        label: item.title || String(item.const),
      }))
  }

  // Construct FieldNode directly - return same shape as createFieldNode
  const parts = {
    container: { key: path },
    label: {
      text: schema.title || path,
      attrs: { for: path },
      showRequired: required,
    },
    description: schema.description ? { text: schema.description } : undefined,
    select: {
      attrs: {
        id: path,
        name: path,
        multiple: true as const,
        ...(required ? { required: true as const } : {}),
      },
      options,
    },
  }

  return {
    nodeType: 'field' as const,
    path,
    schema,
    widget: 'multiselect' as const,
    validation: {
      required,
      minLength:
        typeof schema.minItems === 'number' ? schema.minItems : undefined,
      maxLength:
        typeof schema.maxItems === 'number' ? schema.maxItems : undefined,
    },
    isRoot: path === '',
    depth: path ? path.split('.').length : 0,
    parts,

    isField: true as const,
    isGroup: false as const,
    isArray: false as const,
    isArrayItem: false as const,

    toJSON() {
      return serializeNode(this)
    },
  } satisfies BaseNode
}
