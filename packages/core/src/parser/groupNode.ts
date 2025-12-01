import type { JSONSchema } from 'json-schema-typed/draft-07'
import { ArrayItemNode, ArrayNode, createArrayNode } from './arrayNode'
import { createFieldNode, type FieldNode } from './fieldNode'
import { transformCheckboxes, unflatten } from './groupNode.submitUtils'
import {
  type JSONSchemaObject,
  type BaseNode,
  type ContainerNode,
  serializeNode,
  walkNode,
} from './utils'

// Type guard for object schemas
export function isObjectSchema(schema: JSONSchema): schema is JSONSchemaObject {
  return typeof schema === 'object' && schema !== null
}

export function createGroupNode(
  path: string,
  schema: JSONSchemaObject,
  required: boolean
) {
  const children: BaseNode[] = []
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

  const parts = {
    container: {
      key: path,
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

  return {
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
          return child as FieldNode
        } else if (child.nodeType === 'group') {
          // Check if target is within this child group
          if (
            fullPath.startsWith(child.path + '.') ||
            fullPath === child.path
          ) {
            const relativePath = fullPath.substring(child.path.length + 1)
            const found = (child as ContainerNode).getField(relativePath)
            if (found) return found as FieldNode
          }
        }
      }
      return undefined
    },

    getAllFields(): FieldNode[] {
      const fields: FieldNode[] = []

      for (const child of children) {
        if (child.nodeType === 'field') {
          fields.push(child as FieldNode)
        } else if (child.nodeType === 'group') {
          fields.push(
            ...((child as ContainerNode).getAllFields() as FieldNode[])
          )
        }
      }

      return fields
    },

    walk<R>(handlers?: WalkHandlers<R>): R[] {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return walkNode(this, handlers as any)
    },

    isField: false as const,
    isGroup: true as const,
    isArray: false as const,
    isArrayItem: false as const,

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

      return (e: {
        preventDefault(): void
        currentTarget: EventTarget | null
      }) => {
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
              ;(flat[key] as unknown[]).push(value)
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
  } satisfies ContainerNode
}

// Derived types from factory function
export type GroupNode = ReturnType<typeof createGroupNode>
export type GroupParts = GroupNode['parts']

// WalkHandlers uses derived node types
export interface WalkHandlers<R> {
  field?: (node: FieldNode, handlers: WalkHandlers<R>) => R
  group?: (node: GroupNode, handlers: WalkHandlers<R>) => R
  array?: (node: ArrayNode, handlers: WalkHandlers<R>) => R
  arrayItem?: (node: ArrayItemNode, handlers: WalkHandlers<R>) => R
}
