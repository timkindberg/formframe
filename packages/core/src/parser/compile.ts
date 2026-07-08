// The JSON Schema front-end (ADR 033). It is a pure STRUCTURAL transcriber: it
// reads JSON Schema keywords, produces neutral facts / parts / children, and calls
// Core's neutral builders. It NEVER decides a widget or collapses a subtree — all
// lowering lives in present() (ADR 030 §3). This is the only module in the parser
// that reads `schema.*`; the builders (fieldNode/groupNode/arrayNode) are neutral
// assemblers. In a later step this file moves wholesale into
// `@jsonschema-form/input-jsonschema`, leaving Core with zero JSON Schema imports.

import type { JSONSchema } from 'json-schema-typed/draft-07'
import { createFieldNode } from './fieldNode'
import { createGroupNode } from './groupNode'
import { createArrayNode, createArrayItemNode } from './arrayNode'
import type { JSONSchemaObject, ValidationRules } from './utils'
import type {
  AnyNode,
  ArrayItemNode,
  ArrayNode,
  ArrayParts,
  ContainerFacts,
  FieldNode,
  GroupNode,
  GroupParts,
  ItemDescriptor,
  LeafFacts,
  SelectOption,
} from './nodeTypes'

/** Type guard: a draft-07 schema may be a boolean; we only compile object schemas. */
export function isObjectSchema(schema: JSONSchema): schema is JSONSchemaObject {
  return typeof schema === 'object' && schema !== null
}

/**
 * Map the finite native constraints a form cares about into the neutral
 * {@link ValidationRules} bag (ADR 033 §1). Array-length constraints
 * (`minItems`/`maxItems`) are added by the caller for array schemas.
 */
export function buildValidation(
  schema: JSONSchemaObject,
  required: boolean
): ValidationRules {
  const validation: ValidationRules = { required }
  if (schema.minLength !== undefined) validation.minLength = schema.minLength
  if (schema.maxLength !== undefined) validation.maxLength = schema.maxLength
  if (schema.pattern !== undefined) validation.pattern = schema.pattern
  if (schema.minimum !== undefined) validation.minimum = schema.minimum
  if (schema.maximum !== undefined) validation.maximum = schema.maximum
  return validation
}

function toPrimitive(
  type: JSONSchemaObject['type']
): 'string' | 'number' | 'integer' | 'boolean' {
  if (type === 'number' || type === 'integer' || type === 'boolean') return type
  return 'string'
}

/** The finite option set of a scalar field (enum, or oneOf with `const`), or
 * `undefined` when the field is not a choice field. */
function buildScalarChoices(
  schema: JSONSchemaObject
): SelectOption[] | undefined {
  const hasEnum = Array.isArray(schema.enum) && schema.enum.length > 0
  const hasOneOf = Array.isArray(schema.oneOf) && schema.oneOf.length > 0
  if (!hasEnum && !hasOneOf) return undefined
  if (hasEnum) {
    return (schema.enum as Array<string | number>).map((value) => ({
      value,
      label: String(value),
    }))
  }
  return (schema.oneOf as Array<{ const: string | number; title?: string }>)
    .filter((item) => item && typeof item === 'object' && 'const' in item)
    .map((item) => ({
      value: item.const,
      label: item.title || String(item.const),
    }))
}

/** The finite option set of a scalar-choice ARRAY (enum/oneOf items), or
 * `undefined` for an open-ended element source (choices XOR item — ADR 030 §3). An
 * empty `[]` (a structural `oneOf` with no `const`, bd aml) is still a choice set. */
function buildArrayChoices(
  itemsSchema: JSONSchemaObject
): SelectOption[] | undefined {
  if (itemsSchema.enum) {
    return (itemsSchema.enum as Array<string | number>).map((value) => ({
      value,
      label: String(value),
    }))
  }
  if (itemsSchema.oneOf) {
    return (
      itemsSchema.oneOf as Array<{ const: string | number; title?: string }>
    )
      .filter((item) => item && typeof item === 'object' && 'const' in item)
      .map((item) => ({
        value: item.const,
        label: item.title || String(item.const),
      }))
  }
  return undefined
}

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

// The JSON Schema front-end pins the generic `origin` type (ADR 033 §4) to
// `JSONSchemaObject`, so a consumer resolver reading `facts.origin.schema` off a
// JSON-Schema-built tree gets a properly typed subschema, not `unknown`.
type JS = JSONSchemaObject

/** Compile one subschema into the neutral node its structure calls for (the same
 * dispatch a group applies to each property and an array to its item). */
function compileNode(
  path: string,
  schema: JSONSchemaObject,
  required: boolean
): AnyNode<JS> {
  if (schema.type === 'array') return compileArray(path, schema, required)
  if (schema.type === 'object' && schema.properties) {
    return compileGroup(path, schema, required)
  }
  return compileField(path, schema, required)
}

function compileField(
  path: string,
  schema: JSONSchemaObject,
  required: boolean
): FieldNode<JS> {
  const facts: LeafFacts<JS> = {
    path,
    label: schema.title || path || 'root',
    required,
    primitive: toPrimitive(schema.type),
    valueShape: 'scalar',
    constraints: buildValidation(schema, required),
    attrs: { id: path, name: path },
    origin: { source: 'jsonschema', schema },
  }
  if (schema.description) facts.description = schema.description
  if (typeof schema.format === 'string') facts.format = schema.format
  const choices = buildScalarChoices(schema)
  if (choices) facts.choices = choices
  return createFieldNode({ facts })
}

function compileGroup(
  path: string,
  schema: JSONSchemaObject,
  required: boolean
): GroupNode<JS> {
  const requiredFields = schema.required || []
  const children: AnyNode<JS>[] = []
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (!isObjectSchema(propSchema)) continue // Skip boolean schemas
      const childPath = path ? `${path}.${key}` : key
      children.push(
        compileNode(childPath, propSchema, requiredFields.includes(key))
      )
    }
  }

  const parts: GroupParts = {
    container: { key: path },
    ...(schema.title && { label: { text: schema.title } }),
    ...(schema.description && { description: { text: schema.description } }),
  }

  // An object subtree submits an object value; no `choices`/`item`, so the default
  // rule never collapses it — a resolver may (ADR 030 §2/§5).
  const facts: ContainerFacts<JS> = {
    path,
    label: schema.title || path || 'root',
    required,
    valueShape: 'object',
    constraints: buildValidation(schema, required),
    attrs: { id: path, name: path },
    origin: { source: 'jsonschema', schema },
  }
  if (schema.description) facts.description = schema.description

  return createGroupNode({ facts, children, parts })
}

function compileArray(
  path: string,
  schema: JSONSchemaObject,
  required: boolean
): ArrayNode<JS> {
  const itemsSchema = schema.items
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
  const itemSchemaObject = itemsSchema as JSONSchemaObject

  // The front-end's item compiler: builds one raw (un-presented) item on demand.
  // Core wraps it in present() for getItem and folds the whole tree once for the
  // seed items, so nested scalar-choice arrays collapse consistently (ADR 030 §3).
  const itemFactory = (index: number): ArrayItemNode<JS> =>
    createArrayItemNode({
      child: compileNode(`${path}.${index}`, itemSchemaObject, required),
    })

  const minItems = typeof schema.minItems === 'number' ? schema.minItems : 0
  const seed: ArrayItemNode<JS>[] = []
  for (let i = 0; i < minItems; i++) seed.push(itemFactory(i))

  const parts: ArrayParts = {
    container: { key: path },
    itemsContainer: { key: `${path}-items` },
    addButton: {
      attrs: { type: 'button' },
      label: schema.title ? `Add ${schema.title}` : 'Add Item',
    },
    ...(schema.title && { label: { text: schema.title } }),
    ...(schema.description && { description: { text: schema.description } }),
  }

  const constraints = buildValidation(schema, required)
  if (typeof schema.minItems === 'number')
    constraints.minItems = schema.minItems
  if (typeof schema.maxItems === 'number')
    constraints.maxItems = schema.maxItems

  // A finite scalar-choice set self-identifies as `choices` (present() collapses it
  // to one multiselect); an open-ended source carries an `item` descriptor and
  // stays add/remove. Choices XOR item (ADR 030 §3).
  const choices = buildArrayChoices(itemSchemaObject)
  const facts: ContainerFacts<JS> = {
    path,
    label: schema.title || path || 'root',
    required,
    valueShape: 'array',
    constraints,
    attrs: { id: path, name: path },
    origin: { source: 'jsonschema', schema },
    ...(choices
      ? { choices }
      : { item: buildItemDescriptor(itemSchemaObject) }),
  }
  if (schema.description) facts.description = schema.description

  return createArrayNode({ facts, parts, seed, itemFactory })
}

/** Compile a resolved root object schema into the neutral tree (a GroupNode).
 * `S` is pinned to `JSONSchemaObject` — the JSON Schema front-end's origin type. */
export function compileRoot(schema: JSONSchemaObject): GroupNode<JS> {
  return compileGroup('', schema, false)
}
