import type {
  FieldNode,
  GroupNode,
  ArrayNode,
  GroupParts,
  WalkHandlers,
  JSONSchema,
} from '../types'
import { serializeNode, walkNode, type JSONSchemaObject } from './utils'
import { createFieldNode } from './fieldNode'
import { createArrayNode } from './arrayNode'
import { transformCheckboxes, unflatten } from './groupNode.submitUtils'

// Type guard for object schemas
export function isObjectSchema(schema: JSONSchema): schema is JSONSchemaObject {
  return typeof schema === 'object' && schema !== null
}

export function createGroupNode(
  path: string,
  schema: JSONSchemaObject,
  required: boolean
): GroupNode {
  const children: Array<FieldNode | GroupNode | ArrayNode> = []
  const requiredFields = schema.required || []

  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (!isObjectSchema(propSchema)) continue // Skip boolean schemas

      const childPath = path ? `${path}.${key}` : key // Handle root path
      const isRequired = requiredFields.includes(key)

      if (propSchema.type === 'array') {
        // Array type - creates ArrayNode or multiselect FieldNode
        children.push(createArrayNode(childPath, propSchema, isRequired))
      } else if (propSchema.type === 'object' && propSchema.properties) {
        // Nested object - creates GroupNode
        children.push(createGroupNode(childPath, propSchema, isRequired))
      } else {
        // Primitive field - creates FieldNode
        children.push(createFieldNode(childPath, propSchema, isRequired))
      }
    }
  }

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
    isRoot: path === '',
    depth: path ? path.split('.').length : 0,

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

    isArray(): this is ArrayNode {
      return false
    },

    isArrayItem(): this is import('../types').ArrayItemNode {
      return false
    },

    toJSON() {
      return serializeNode(this)
    },

    submit(onSubmit: (data: Record<string, unknown>) => void) {
      // Only allow submit on root nodes
      if (!this.isRoot) {
        throw new Error(
          'submit() can only be called on root GroupNode. Use form.submit() where form is the root node.'
        )
      }

      return (e: { preventDefault(): void; currentTarget: EventTarget | null }) => {
        e.preventDefault()

        const target = e.currentTarget as HTMLFormElement
        if (!target) return

        const formData = new FormData(target)

        // Collect all values, handling multiselect (multiple entries with same name)
        const flat: Record<string, unknown> = {}
        for (const [key, value] of formData.entries()) {
          if (key in flat) {
            // Multiple values for same key - collect as array (e.g., multiselect)
            if (Array.isArray(flat[key])) {
              (flat[key] as unknown[]).push(value)
            } else {
              flat[key] = [flat[key], value]
            }
          } else {
            flat[key] = value
          }
        }

        // Transform: checkbox "on" -> true
        const transformed = transformCheckboxes(flat)

        // Unflatten: "address.street" -> { address: { street: ... } }
        const nested = unflatten(transformed)

        onSubmit(nested)
      }
    },
  }

  return groupNode
}
