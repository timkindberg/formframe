import {
  buildValidation,
  serializeNode,
  type JSONSchemaObject,
  type ValidationRules,
} from './utils'
import { presentDefaultLeaf } from '../present/present'
import type {
  FieldFacts,
  FieldNode,
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

  // Neutral facts only (ADR 029): the parser reads front-end-specific keywords
  // (enum/oneOf → neutral `choices`) but does NOT decide a widget or build parts.
  const hasEnum = Array.isArray(schema.enum) && schema.enum.length > 0
  const hasOneOf = Array.isArray(schema.oneOf) && schema.oneOf.length > 0
  const isSelect = hasEnum || hasOneOf

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

  const facts = buildFieldFacts({
    path,
    schema,
    required,
    valueShape: 'scalar',
    constraints: validation,
    choices: isSelect ? buildSelectOptions() : undefined,
  })

  const nodeBase = {
    nodeType: 'field' as const,
    path,
    schema,
    validation,
    facts,

    // Computed properties
    isRoot: path === '',
    depth: path ? path.split('.').length : 0,

    isField: true as const,
    isGroup: false as const,
    isArray: false as const,
    isArrayItem: false as const,
  }

  // Widget + control parts come solely from the present stage's default rule and
  // Core widget catalog (bd 9pb closed the dual period). `useSchemaForm` re-runs
  // `present()` with any consumer resolver on top; a direct `jsonSchemaToTree`
  // consumer still gets a fully-formed, default-presented tree.
  const wp = presentDefaultLeaf(facts)
  if (wp.widget === 'input') {
    const node: InputFieldNode = {
      ...nodeBase,
      widget: 'input',
      parts: wp.parts,
      toJSON() {
        return serializeNode(this)
      },
    }
    return node
  }
  const node: SelectFieldNode = {
    ...nodeBase,
    widget: wp.widget,
    parts: wp.parts,
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

/** Inputs for {@link buildFieldFacts}. `constraints` is passed in (not recomputed)
 * so the parser's already-built `ValidationRules` is reused; `choices` is supplied
 * by the caller (select/multiselect); `valueShape` distinguishes a scalar leaf
 * from an array-valued leaf (multiselect). */
export interface BuildFieldFactsInput {
  path: string
  schema: JSONSchemaObject
  required: boolean
  valueShape: 'scalar' | 'array'
  constraints: ValidationRules
  choices?: SelectOption[]
}

/**
 * Build the neutral {@link FieldFacts} for a leaf (ADR 029). Front-end-specific
 * knowledge (reading `schema.*`) is confined here in the JSON Schema parser;
 * `present()` and its derivers consume only the neutral facts.
 */
export function buildFieldFacts({
  path,
  schema,
  required,
  valueShape,
  constraints,
  choices,
}: BuildFieldFactsInput): FieldFacts {
  const facts: FieldFacts = {
    path,
    label: schema.title || path || 'root',
    required,
    primitive: toPrimitive(schema.type),
    valueShape,
    constraints,
    attrs: { id: path, name: path },
    origin: { source: 'jsonschema', schema },
  }
  if (schema.description) facts.description = schema.description
  if (typeof schema.format === 'string') facts.format = schema.format
  if (choices) facts.choices = choices
  return facts
}

function toPrimitive(
  type: JSONSchemaObject['type']
): 'string' | 'number' | 'integer' | 'boolean' {
  if (type === 'number' || type === 'integer' || type === 'boolean') return type
  return 'string'
}
