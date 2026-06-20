import { createFieldNode } from './fieldNode'
import { createGroupNode } from './groupNode'
import { type JSONSchemaObject, serializeNode, walkNode } from './utils'
import type {
  AnyNode,
  ArrayNode,
  ArrayParts,
  ArrayItemNode,
  ArrayItemParts,
  FieldNode,
  SelectFieldNode,
  WalkHandlers,
} from './nodeTypes'

/**
 * Creates an ArrayNode for array-type schemas
 * Handles both primitive arrays (multiselect) and complex arrays (add/remove items)
 */
export function createArrayNode(
  path: string,
  schema: JSONSchemaObject,
  required: boolean
): ArrayNode | FieldNode {
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
  const children: AnyNode[] = []
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

  const arrayNode: ArrayNode = {
    nodeType: 'array',
    path,
    schema,
    widget: 'array',
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
          const found = child.getField(targetPath)
          if (found) return found
        }
      }
      return undefined
    },

    getAllFields(): FieldNode[] {
      const fields: FieldNode[] = []
      for (const child of children) {
        if (child.nodeType === 'arrayItem') {
          fields.push(...child.getAllFields())
        }
      }
      return fields
    },

    walk<R>(handlers?: WalkHandlers<R>): R[] {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return walkNode(arrayNode, handlers as any)
    },

    isField: false,
    isGroup: false,
    isArray: true,
    isArrayItem: false,

    toJSON() {
      return serializeNode(this)
    },
  }

  return arrayNode
}

export type { ArrayNode, ArrayParts }

/**
 * Creates an ArrayItemNode that wraps a single array item
 */
export function createArrayItemNode(
  arrayPath: string,
  index: number,
  itemSchema: JSONSchemaObject,
  required: boolean
): ArrayItemNode {
  const itemPath = `${arrayPath}.${index}`

  // Create the child node based on item schema type
  let child: AnyNode

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

  const itemNode: ArrayItemNode = {
    nodeType: 'arrayItem',
    path: itemPath,
    schema: itemSchema,
    widget: 'arrayItem',
    children: [child],
    validation: {
      required,
    },

    // Computed properties
    isRoot: false,
    depth: itemPath.split('.').length,

    // Parts API
    parts,

    getField(targetPath: string): FieldNode | undefined {
      const c = this.children[0]
      if (c.nodeType === 'field') {
        return c.path === targetPath ? c : undefined
      } else if (c.nodeType === 'group' || c.nodeType === 'array') {
        return c.getField(targetPath)
      }
      return undefined
    },

    getAllFields(): FieldNode[] {
      const c = this.children[0]
      if (c.nodeType === 'field') {
        return [c]
      } else if (c.nodeType === 'group' || c.nodeType === 'array') {
        return c.getAllFields()
      }
      return []
    },

    walk<R>(handlers?: WalkHandlers<R>): R[] {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return walkNode(itemNode, handlers as any)
    },

    isField: false,
    isGroup: false,
    isArray: false,
    isArrayItem: true,

    toJSON() {
      return serializeNode(this)
    },
  }

  return itemNode
}

export type { ArrayItemNode, ArrayItemParts }

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
): SelectFieldNode {
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

  const node: SelectFieldNode = {
    nodeType: 'field',
    path,
    schema,
    widget: 'multiselect',
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

    isField: true,
    isGroup: false,
    isArray: false,
    isArrayItem: false,

    toJSON() {
      return serializeNode(this)
    },
  }
  return node
}
