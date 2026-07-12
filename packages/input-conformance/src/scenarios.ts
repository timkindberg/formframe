// The input-conformance oracle (ADR 039).
//
// Every @jsonschema-form/input-* front-end (JSON Schema, Zod, …) is a STRUCTURAL
// transcriber into the same neutral Core tree, so for equivalent input schemas
// they must all produce the same tree. This file is that reference — the "oracle"
// (mirroring the render-side vanilla string oracle in packages/react's
// conformance test): a fixed list of scenarios, each a schema-language-NEUTRAL
// description of the tree present(default) is expected to yield.
//
// It knows NOTHING about any input-* package (no imports from them, one-way
// dependency — only Core types). Each front-end colocates a tiny conformance test
// that expresses these same scenarios in ITS OWN schema language and asserts its
// compiled tree matches these specs (see runner.ts). Adding a scenario here forces
// every front-end to cover it (the per-package `Record<ScenarioId, …>` is
// exhaustive), which is exactly what keeps the front-ends behaving identically.
//
// The oracle asserts BEHAVIOR (widget, primitive, valueShape, requiredness,
// constraints, choices and their derived control values, array item descriptor,
// nesting) — not field label text, which is authored differently per language
// (`title` vs `.meta({ title })`) and is covered by each package's own tests.

import type {
  ItemDescriptor,
  SelectOption,
  ValidationRules,
  ValueShape,
  WidgetName,
} from '@jsonschema-form/core'

/** Every scenario the oracle defines. A front-end must supply an equivalent input
 * schema for each (its per-package map is typed `Record<ScenarioId, Schema>`, so
 * TypeScript fails the build if any is missing). */
export type ScenarioId =
  | 'scalar-string'
  | 'string-constraints'
  | 'email-format'
  | 'number-bounds'
  | 'integer'
  | 'boolean'
  | 'required-vs-optional'
  | 'small-enum-radio'
  | 'small-numeric-choice-radio'
  | 'large-enum-select'
  | 'array-of-scalars'
  | 'array-length-bounds'
  | 'small-enum-array-checkboxes'
  | 'large-enum-array-multiselect'
  | 'array-of-objects'
  | 'nested-object'

/** Expected facts for a leaf field. `constraints` is a SUBSET match (only the keys
 * listed are asserted); `choices` is compared exactly (value + label). */
export interface FieldSpec {
  node: 'field'
  widget: WidgetName
  primitive: 'string' | 'number' | 'integer' | 'boolean'
  valueShape: ValueShape
  required: boolean
  format?: string
  choices?: SelectOption[]
  constraints?: Partial<ValidationRules>
}

/** Expected facts for an object group and (recursively) its children by key. */
export interface GroupSpec {
  node: 'group'
  required: boolean
  children: Record<string, NodeSpec>
}

/** Expected facts for an open-ended (add/remove) array container. A scalar-choice
 * array is NOT this — present() collapses it to a {@link FieldSpec} leaf. */
export interface ArraySpec {
  node: 'array'
  required: boolean
  item?: ItemDescriptor
  constraints?: Partial<ValidationRules>
}

export type NodeSpec = FieldSpec | GroupSpec | ArraySpec

export interface ConformanceScenario {
  id: ScenarioId
  description: string
  /** The expected top-level property nodes of the root group, keyed by property. */
  expect: Record<string, NodeSpec>
}

const enum3: SelectOption[] = [
  { value: 'red', label: 'red' },
  { value: 'green', label: 'green' },
  { value: 'blue', label: 'blue' },
]

const numericChoices: SelectOption[] = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
]

const enum6: SelectOption[] = [
  { value: 'a', label: 'a' },
  { value: 'b', label: 'b' },
  { value: 'c', label: 'c' },
  { value: 'd', label: 'd' },
  { value: 'e', label: 'e' },
  { value: 'f', label: 'f' },
]

export const conformanceScenarios: ConformanceScenario[] = [
  {
    id: 'scalar-string',
    description: 'a plain string property is a scalar input',
    expect: {
      name: {
        node: 'field',
        widget: 'input',
        primitive: 'string',
        valueShape: 'scalar',
        required: false,
      },
    },
  },
  {
    id: 'string-constraints',
    description: 'min/max length land in facts.constraints',
    expect: {
      handle: {
        node: 'field',
        widget: 'input',
        primitive: 'string',
        valueShape: 'scalar',
        required: false,
        constraints: { minLength: 3, maxLength: 20 },
      },
    },
  },
  {
    id: 'email-format',
    description: 'an email string carries the neutral email format',
    expect: {
      email: {
        node: 'field',
        widget: 'input',
        primitive: 'string',
        valueShape: 'scalar',
        required: false,
        format: 'email',
      },
    },
  },
  {
    id: 'number-bounds',
    description: 'a number with min/max is a numeric input with numeric bounds',
    expect: {
      age: {
        node: 'field',
        widget: 'input',
        primitive: 'number',
        valueShape: 'scalar',
        required: false,
        constraints: { minimum: 0, maximum: 120 },
      },
    },
  },
  {
    id: 'integer',
    description: 'an integer is its own primitive (distinct from number)',
    expect: {
      count: {
        node: 'field',
        widget: 'input',
        primitive: 'integer',
        valueShape: 'scalar',
        required: false,
      },
    },
  },
  {
    id: 'boolean',
    description: 'a boolean is the boolean primitive (a checkbox input)',
    expect: {
      agree: {
        node: 'field',
        widget: 'input',
        primitive: 'boolean',
        valueShape: 'scalar',
        required: false,
      },
    },
  },
  {
    id: 'required-vs-optional',
    description: 'required tracks the schema; optionality flips it off',
    expect: {
      first: {
        node: 'field',
        widget: 'input',
        primitive: 'string',
        valueShape: 'scalar',
        required: true,
        constraints: { required: true },
      },
      middle: {
        node: 'field',
        widget: 'input',
        primitive: 'string',
        valueShape: 'scalar',
        required: false,
        constraints: { required: false },
      },
    },
  },
  {
    id: 'small-enum-radio',
    description: 'a small scalar enum defaults to a radio group',
    expect: {
      color: {
        node: 'field',
        widget: 'radio',
        primitive: 'string',
        valueShape: 'scalar',
        required: false,
        choices: enum3,
      },
    },
  },
  {
    id: 'small-numeric-choice-radio',
    description: 'a small numeric choice set preserves numeric option values',
    expect: {
      rating: {
        node: 'field',
        widget: 'radio',
        primitive: 'number',
        valueShape: 'scalar',
        required: false,
        choices: numericChoices,
      },
    },
  },
  {
    id: 'large-enum-select',
    description: 'a large scalar enum (> threshold) falls back to a select',
    expect: {
      size: {
        node: 'field',
        widget: 'select',
        primitive: 'string',
        valueShape: 'scalar',
        required: false,
        choices: enum6,
      },
    },
  },
  {
    id: 'array-of-scalars',
    description:
      'an open-ended scalar array stays add/remove with a scalar item',
    expect: {
      tags: {
        node: 'array',
        required: false,
        item: { valueShape: 'scalar' },
      },
    },
  },
  {
    id: 'array-length-bounds',
    description: 'minItems/maxItems land in the array container constraints',
    expect: {
      tags: {
        node: 'array',
        required: false,
        item: { valueShape: 'scalar' },
        constraints: { minItems: 2, maxItems: 4 },
      },
    },
  },
  {
    id: 'small-enum-array-checkboxes',
    description: 'a small scalar-choice array collapses to one checkbox group',
    expect: {
      roles: {
        node: 'field',
        widget: 'checkboxes',
        primitive: 'string',
        valueShape: 'array',
        required: false,
        choices: [
          { value: 'admin', label: 'admin' },
          { value: 'user', label: 'user' },
        ],
      },
    },
  },
  {
    id: 'large-enum-array-multiselect',
    description: 'a large scalar-choice array collapses to one multiselect',
    expect: {
      picks: {
        node: 'field',
        widget: 'multiselect',
        primitive: 'string',
        valueShape: 'array',
        required: false,
        choices: enum6,
      },
    },
  },
  {
    id: 'array-of-objects',
    description: 'an object array stays add/remove and exposes its item keys',
    expect: {
      contacts: {
        node: 'array',
        required: false,
        item: { valueShape: 'object', keys: ['name', 'email'] },
      },
    },
  },
  {
    id: 'nested-object',
    description: 'nested objects nest as groups down to their leaves',
    expect: {
      user: {
        node: 'group',
        required: false,
        children: {
          age: {
            node: 'field',
            widget: 'input',
            primitive: 'number',
            valueShape: 'scalar',
            required: false,
          },
          address: {
            node: 'group',
            required: false,
            children: {
              zip: {
                node: 'field',
                widget: 'input',
                primitive: 'string',
                valueShape: 'scalar',
                required: false,
              },
            },
          },
        },
      },
    },
  },
]
