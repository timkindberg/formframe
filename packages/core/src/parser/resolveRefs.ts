import { decodeJsonPointerSegment } from '../jsonPointer'
import type { JSONSchemaObject } from './utils'

/**
 * Resolve same-document JSON Pointer `$ref`s before tree compilation.
 *
 * Supported: `#`, `#/…` fragments into the root schema (`$defs`, legacy
 * `definitions`, `properties`, etc.). External / URL refs throw.
 *
 * `$ref` siblings: resolved target is shallow-merged with sibling keywords
 * (siblings win). This matches JSON Schema 2020-12 applicator behavior and
 * is more useful than draft-07's "ignore siblings" rule for form compilation.
 *
 * Cycles: if a `$ref` chain revisits the same pointer we throw — recursive
 * schemas cannot become a finite form tree, so failing fast is clearer than
 * silently truncating or looping.
 */
export function resolveLocalRefs(schema: JSONSchemaObject): JSONSchemaObject {
  return resolveSchema(schema, schema, [])
}

function resolveSchema(
  schema: JSONSchemaObject,
  root: JSONSchemaObject,
  refStack: string[]
): JSONSchemaObject {
  if (typeof schema.$ref === 'string') {
    const ref = schema.$ref

    if (!ref.startsWith('#')) {
      throw new Error(`External $ref is not supported: ${ref}`)
    }

    if (refStack.includes(ref)) {
      throw new Error(
        `Circular $ref detected: ${[...refStack, ref].join(' -> ')}`
      )
    }

    const { $ref: _ref, ...siblings } = schema
    const target = resolveJsonPointer(root, ref)
    const resolvedTarget = resolveSchema(target, root, [...refStack, ref])
    const merged =
      Object.keys(siblings).length > 0
        ? ({ ...resolvedTarget, ...siblings } as JSONSchemaObject)
        : resolvedTarget

    return resolveSchemaWithoutRef(merged, root, refStack)
  }

  return resolveSchemaWithoutRef(schema, root, refStack)
}

function resolveSchemaWithoutRef(
  schema: JSONSchemaObject,
  root: JSONSchemaObject,
  refStack: string[]
): JSONSchemaObject {
  let changed = false
  const result: JSONSchemaObject = { ...schema }

  if (schema.properties) {
    const properties: NonNullable<JSONSchemaObject['properties']> = {}
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (typeof propSchema === 'object' && propSchema !== null) {
        const resolvedProp = resolveSchema(propSchema, root, refStack)
        properties[key] = resolvedProp
        if (resolvedProp !== propSchema) {
          changed = true
        }
      } else {
        properties[key] = propSchema
      }
    }
    if (changed) {
      result.properties = properties
    }
  }

  const items = schema.items
  if (
    items &&
    typeof items === 'object' &&
    !Array.isArray(items) &&
    items !== null
  ) {
    const resolvedItems = resolveSchema(
      items as JSONSchemaObject,
      root,
      refStack
    )
    if (resolvedItems !== items) {
      result.items = resolvedItems
      changed = true
    }
  }

  return changed ? result : schema
}

function resolveJsonPointer(
  root: JSONSchemaObject,
  pointer: string
): JSONSchemaObject {
  if (pointer === '#') {
    return root
  }

  if (!pointer.startsWith('#/')) {
    throw new Error(`Invalid local JSON Pointer $ref: ${pointer}`)
  }

  const segments = pointer.slice(2).split('/').map(decodeJsonPointerSegment)

  let current: unknown = root
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) {
      throw new Error(`$ref target not found: ${pointer}`)
    }
    current = (current as Record<string, unknown>)[segment]
    if (current === undefined) {
      throw new Error(`$ref target not found: ${pointer}`)
    }
  }

  if (typeof current !== 'object' || current === null) {
    throw new Error(`$ref target must be an object schema: ${pointer}`)
  }

  return current as JSONSchemaObject
}
