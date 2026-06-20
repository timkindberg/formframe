import {
  buildValidation,
  serializeNode,
  type JSONSchemaObject,
  type ValidationRules,
} from './utils'
import type {
  FieldNode,
  FieldPartsBase,
  HtmlInputAttrs,
  InputFieldNode,
  SelectFieldNode,
  SelectOption,
} from './nodeTypes'

// Re-export for type inference
export type { ValidationRules }

export function createFieldNode(
  path: string,
  schema: JSONSchemaObject,
  required: boolean
): FieldNode {
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

  function buildSelectOptions(): SelectOption[] {
    let options: SelectOption[] = []

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

  const descriptionPart = buildDescriptionPart()
  const commonParts: FieldPartsBase = descriptionPart
    ? {
        container: buildContainerPart(),
        label: buildLabelPart(),
        description: descriptionPart,
      }
    : {
        container: buildContainerPart(),
        label: buildLabelPart(),
      }

  const nodeBase = {
    nodeType: 'field' as const,
    path,
    schema,
    validation,

    // Computed properties
    isRoot: path === '',
    depth: path ? path.split('.').length : 0,

    isField: true as const,
    isGroup: false as const,
    isArray: false as const,
    isArrayItem: false as const,
  }

  if (isSelect) {
    const node: SelectFieldNode = {
      ...nodeBase,
      widget: 'select',
      parts: {
        ...commonParts,
        select: {
          attrs: {
            id: path,
            name: path,
            ...(required ? { required: true } : {}),
          },
          options: buildSelectOptions(),
        },
      },
      toJSON() {
        return serializeNode(this)
      },
    }
    return node
  }

  const node: InputFieldNode = {
    ...nodeBase,
    widget: 'input',
    parts: {
      ...commonParts,
      input: {
        attrs: {
          id: path,
          name: path,
          ...buildInputAttrs(schema, validation),
        },
      },
    },
    toJSON() {
      return serializeNode(this)
    },
  }
  return node
}

export type {
  FieldNode,
  FieldParts,
  InputFieldNode,
  SelectFieldNode,
} from './nodeTypes'

// Build HTML input attributes from schema and validation
export function buildInputAttrs(
  schema: JSONSchemaObject,
  validation: {
    required: boolean
    minLength?: number
    maxLength?: number
    minimum?: number
    maximum?: number
    pattern?: string
  }
): Omit<HtmlInputAttrs, 'id' | 'name'> {
  const attrs: Omit<HtmlInputAttrs, 'id' | 'name'> = { type: 'text' }

  // HTML input type
  if (schema.type === 'string') {
    if (schema.format === 'email') {
      attrs.type = 'email'
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
