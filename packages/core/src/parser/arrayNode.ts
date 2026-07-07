import { buildFieldFacts, createFieldNode } from './fieldNode'
import { createGroupNode } from './groupNode'
import { presentDefaultLeaf } from '../present/present'
import {
  buildValidation,
  type JSONSchemaObject,
  serializeNode,
  walkNode,
} from './utils'
import type {
  AnyNode,
  ArrayNode,
  ArrayParts,
  ArrayItemNode,
  ArrayItemParts,
  ContainerFacts,
  FieldNode,
  ItemDescriptor,
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

  // Container facts (ADR 030 §1): a subtree array submits an array value and has
  // an open-ended element source (an `item` descriptor, NOT `choices`), so the
  // default rule leaves it add/remove; a resolver may collapse it into one
  // array-valued widget and supply the option source via `args` (ADR 030 §4/§5).
  const constraints = buildValidation(schema, required)
  if (typeof schema.minItems === 'number')
    constraints.minItems = schema.minItems
  if (typeof schema.maxItems === 'number')
    constraints.maxItems = schema.maxItems
  const facts: ContainerFacts = {
    path,
    label: schema.title || path || 'root',
    required,
    valueShape: 'array',
    constraints,
    attrs: { id: path, name: path },
    origin: { source: 'jsonschema', schema },
    item: buildItemDescriptor(itemSchemaObject),
  }
  if (schema.description) facts.description = schema.description

  const arrayNode: ArrayNode = {
    nodeType: 'array',
    path,
    schema,
    widget: 'array',
    facts,
    itemSchema: itemSchemaObject,
    children,

    // Computed properties
    isRoot: path === '',
    depth: path ? path.split('.').length : 0,

    // Parts API
    parts,

    // Factory method for creating items dynamically
    getItem(index: number) {
      return createArrayItemNode(path, index, itemSchemaObject, required)
    },

    // `targetPath` is relative to this array; its leading segment is an item
    // index (ADR 032), e.g. '0.name' or '2'. Resolve to the instantiated item at
    // that index and delegate the remainder. Reads `this.children` (not the
    // closure) so a present()-rebuilt node (ADR 029) queries its own children.
    getField(targetPath: string): FieldNode | undefined {
      if (targetPath === '') return undefined // the array itself is not a field
      const dot = targetPath.indexOf('.')
      const indexSeg = dot === -1 ? targetPath : targetPath.slice(0, dot)
      const rest = dot === -1 ? '' : targetPath.slice(dot + 1)

      const index = Number(indexSeg)
      if (!Number.isInteger(index) || index < 0) return undefined

      const itemPath = `${this.path}.${index}`
      for (const child of this.children) {
        if (child.nodeType === 'arrayItem' && child.path === itemPath) {
          return child.getField(rest)
        }
      }
      return undefined
    },

    getAllFields(): FieldNode[] {
      const fields: FieldNode[] = []
      for (const child of this.children) {
        if (child.nodeType === 'arrayItem') {
          fields.push(...child.getAllFields())
        }
      }
      return fields
    },

    walk<R>(handlers?: WalkHandlers<R>): R[] {
      return walkNode(this, handlers)
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

    // Computed properties
    isRoot: false,
    depth: itemPath.split('.').length,

    // Parts API
    parts,

    // `targetPath` is relative to this item (ADR 032). For a primitive-array
    // item the item *is* the leaf, so the empty remainder selects it; for an
    // object/array item, delegate the remainder to the wrapped child.
    getField(targetPath: string): FieldNode | undefined {
      const c = this.children[0]
      if (c.nodeType === 'field') {
        return targetPath === '' ? c : undefined
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
      return walkNode(this, handlers)
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
 * The neutral {@link ItemDescriptor} for one array element (ADR 030 §1) — thin by
 * design. Object items expose their member `keys` so a resolver can name
 * value/label identity without reading `origin.schema`.
 */
function buildItemDescriptor(itemSchema: JSONSchemaObject): ItemDescriptor {
  if (itemSchema.type === 'object' && itemSchema.properties) {
    return { valueShape: 'object', keys: Object.keys(itemSchema.properties) }
  }
  if (itemSchema.type === 'array') {
    return { valueShape: 'array' }
  }
  return { valueShape: 'scalar' }
}

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
 * Creates a FieldNode with widget 'multiselect' for primitive arrays.
 *
 * The array→multiselect *collapse* is a structural (facts) decision the parser
 * owns; the resulting leaf's widget + parts come solely from the present stage's
 * Core catalog (ADR 029 / bd 9pb), so a `valueShape: 'array'` leaf with `choices`
 * derives its `<select multiple>` parts via `deriveSelectParts`.
 */
function createMultiselectFieldNode(
  path: string,
  schema: JSONSchemaObject,
  required: boolean
): FieldNode {
  const itemsSchema = schema.items as JSONSchemaObject

  // Build options (neutral choices) from enum or oneOf
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

  // Array-length constraints live as `minItems`/`maxItems` on the single
  // `facts.constraints` home (ADR 033 §1) — not smuggled into `minLength`.
  const constraints = buildValidation(schema, required)
  if (typeof schema.minItems === 'number')
    constraints.minItems = schema.minItems
  if (typeof schema.maxItems === 'number')
    constraints.maxItems = schema.maxItems

  const facts = buildFieldFacts({
    path,
    schema,
    required,
    valueShape: 'array',
    constraints,
    choices: options,
  })

  // A `valueShape: 'array'` leaf with `choices` resolves to `multiselect` via the
  // shipped default rule, which derives its `<select multiple>` control parts — so
  // the widget/parts come from the same source as every other leaf (no cast).
  const wp = presentDefaultLeaf(facts)
  const node: FieldNode = {
    nodeType: 'field',
    path,
    schema,
    widget: wp.widget,
    facts,
    isRoot: path === '',
    depth: path ? path.split('.').length : 0,
    parts: wp.parts,

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
