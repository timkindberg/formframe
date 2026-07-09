// The Zod front-end (ADR 034). Like the JSON Schema front-end (ADR 033), it is a
// pure STRUCTURAL transcriber: it introspects a Zod schema (via ./zodInternals),
// produces neutral facts / parts / children, and calls Core's neutral builders. It
// NEVER decides a widget or collapses a subtree — all lowering lives in present()
// (ADR 030 §3). Core imports nothing from here; the dependency points one way.

import {
  createFieldNode,
  createGroupNode,
  createArrayNode,
  createArrayItemNode,
} from '@jsonschema-form/core'
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
  ValidationRules,
} from '@jsonschema-form/core'
import type { ZodType } from 'zod'
import {
  defOf,
  readArrayLength,
  readChoices,
  readMeta,
  readScalar,
  typeOf,
  unwrap,
} from './zodInternals'

// The Zod front-end pins the generic `origin` type (ADR 033 §4) to `ZodType`, so a
// consumer resolver reading `facts.origin.schema` off a Zod-built tree gets the
// declared (still-wrapped) property schema, not `unknown`.

/** Compile one (possibly wrapped) schema into the neutral node its structure calls
 * for — the same dispatch a group applies to each property and an array to its
 * element. `outer` is the declared schema (kept as `origin.schema`); `required`
 * is decided by the caller from the wrapper chain. */
function compileNode(
  path: string,
  outer: ZodType,
  required: boolean
): AnyNode<ZodType> {
  const inner = unwrap(outer).schema
  const type = typeOf(inner)
  if (type === 'array') return compileArray(path, outer, inner, required)
  if (type === 'object') return compileGroup(path, outer, inner, required)
  return compileField(path, outer, inner, required)
}

function compileField(
  path: string,
  outer: ZodType,
  inner: ZodType,
  required: boolean
): FieldNode<ZodType> {
  const scalar = readScalar(inner)
  const meta = readMeta(outer, inner)
  const choices = readChoices(inner)

  const constraints: ValidationRules = { required }
  if (scalar.minLength !== undefined) constraints.minLength = scalar.minLength
  if (scalar.maxLength !== undefined) constraints.maxLength = scalar.maxLength
  if (scalar.pattern !== undefined) constraints.pattern = scalar.pattern
  if (scalar.minimum !== undefined) constraints.minimum = scalar.minimum
  if (scalar.maximum !== undefined) constraints.maximum = scalar.maximum

  // A choice set of all-numeric values is a numeric field (enums are string, but a
  // union of numeric literals is not); otherwise keep the scalar's primitive.
  const primitive =
    choices && choices.every((c) => typeof c.value === 'number')
      ? 'number'
      : scalar.primitive

  const facts: LeafFacts<ZodType> = {
    path,
    label: meta.title || path || 'root',
    required,
    primitive,
    valueShape: 'scalar',
    constraints,
    attrs: { id: path, name: path },
    origin: { source: 'zod', schema: outer },
  }
  if (meta.description) facts.description = meta.description
  if (scalar.format) facts.format = scalar.format
  if (choices) facts.choices = choices
  return createFieldNode({ facts })
}

function compileGroup(
  path: string,
  outer: ZodType,
  inner: ZodType,
  required: boolean
): GroupNode<ZodType> {
  const shape = defOf(inner).shape ?? {}
  const children: AnyNode<ZodType>[] = []
  for (const [key, propSchema] of Object.entries(shape)) {
    const childPath = path ? `${path}.${key}` : key
    const childRequired = !unwrap(propSchema).optional
    children.push(compileNode(childPath, propSchema, childRequired))
  }

  const meta = readMeta(outer, inner)
  const parts: GroupParts = {
    container: { key: path },
    ...(meta.title && { label: { text: meta.title } }),
    ...(meta.description && { description: { text: meta.description } }),
  }

  // An object subtree submits an object value; no `choices`/`item`, so the default
  // rule never collapses it — a resolver may (ADR 030 §2/§5).
  const facts: ContainerFacts<ZodType> = {
    path,
    label: meta.title || path || 'root',
    required,
    valueShape: 'object',
    constraints: { required },
    attrs: { id: path, name: path },
    origin: { source: 'zod', schema: outer },
  }
  if (meta.description) facts.description = meta.description

  return createGroupNode({ facts, children, parts })
}

function buildItemDescriptor(elementInner: ZodType): ItemDescriptor {
  const def = defOf(elementInner)
  if (def.type === 'object' && def.shape) {
    return { valueShape: 'object', keys: Object.keys(def.shape) }
  }
  if (def.type === 'array') return { valueShape: 'array' }
  return { valueShape: 'scalar' }
}

function compileArray(
  path: string,
  outer: ZodType,
  inner: ZodType,
  required: boolean
): ArrayNode<ZodType> {
  const element = defOf(inner).element
  if (!element) {
    throw new Error(`Zod array at ${path} has no element schema`)
  }
  const elementInner = unwrap(element).schema

  // The front-end's item compiler: builds one raw (un-presented) item on demand.
  // Core wraps it in present() for getItem and folds the whole tree once for the
  // seed items, so nested scalar-choice arrays collapse consistently (ADR 030 §3).
  const itemFactory = (index: number): ArrayItemNode<ZodType> =>
    createArrayItemNode({
      child: compileNode(`${path}.${index}`, element, required),
    })

  const { minItems, maxItems } = readArrayLength(inner)
  const seedCount = minItems ?? 0
  const seed: ArrayItemNode<ZodType>[] = []
  for (let i = 0; i < seedCount; i++) seed.push(itemFactory(i))

  const meta = readMeta(outer, inner)
  const parts: ArrayParts = {
    container: { key: path },
    itemsContainer: { key: `${path}-items` },
    addButton: {
      attrs: { type: 'button' },
      label: meta.title ? `Add ${meta.title}` : 'Add Item',
    },
    ...(meta.title && { label: { text: meta.title } }),
    ...(meta.description && { description: { text: meta.description } }),
  }

  const constraints: ValidationRules = { required }
  if (minItems !== undefined) constraints.minItems = minItems
  if (maxItems !== undefined) constraints.maxItems = maxItems

  // A finite scalar-choice element set self-identifies as `choices` (present()
  // collapses it to one multiselect/checkboxes); an open-ended element source
  // carries an `item` descriptor and stays add/remove. Choices XOR item (ADR 030 §3).
  const choices: SelectOption[] | undefined = readChoices(elementInner)
  const facts: ContainerFacts<ZodType> = {
    path,
    label: meta.title || path || 'root',
    required,
    valueShape: 'array',
    constraints,
    attrs: { id: path, name: path },
    origin: { source: 'zod', schema: outer },
    ...(choices ? { choices } : { item: buildItemDescriptor(elementInner) }),
  }
  if (meta.description) facts.description = meta.description

  return createArrayNode({ facts, parts, seed, itemFactory })
}

/** Compile a root Zod object schema into the neutral tree (a GroupNode). `S` is
 * pinned to `ZodType` — the Zod front-end's origin type. */
export function compileRoot(schema: ZodType): GroupNode<ZodType> {
  const inner = unwrap(schema).schema
  if (typeOf(inner) !== 'object') {
    throw new Error(
      `zodToTree expects a Zod object schema at the root, got "${typeOf(inner)}"`
    )
  }
  return compileGroup('', schema, inner, false)
}
