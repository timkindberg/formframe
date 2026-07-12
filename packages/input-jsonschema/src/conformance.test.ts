// input-jsonschema's half of the shared input-conformance oracle (ADR 038).
//
// The oracle (@jsonschema-form/input-conformance) defines schema-language-NEUTRAL
// expected trees; here we express each scenario in JSON Schema and assert
// jsonSchemaToTree produces the oracle's tree. The exhaustive
// `Record<ScenarioId, JSONSchema>` makes TypeScript fail the build if a scenario
// is left uncovered, so this front-end can't silently drift from the Zod
// front-end (which runs the SAME oracle in its own colocated test — neither
// package references the other).
//
// Requiredness is the one place the idioms differ: a JSON Schema property is
// optional by default, so a scenario the oracle marks `required: true` is authored
// here by listing the key in `required` — the equivalent MEANING per language.

import {
  runInputConformance,
  type ScenarioId,
} from '@jsonschema-form/input-conformance'
import { jsonSchemaToTree } from './jsonSchemaToTree'
import type { JSONSchema } from './types'

const schemas: Record<ScenarioId, JSONSchema> = {
  'scalar-string': {
    type: 'object',
    properties: { name: { type: 'string' } },
  },
  'string-constraints': {
    type: 'object',
    properties: { handle: { type: 'string', minLength: 3, maxLength: 20 } },
  },
  'email-format': {
    type: 'object',
    properties: { email: { type: 'string', format: 'email' } },
  },
  'number-bounds': {
    type: 'object',
    properties: { age: { type: 'number', minimum: 0, maximum: 120 } },
  },
  integer: {
    type: 'object',
    properties: { count: { type: 'integer' } },
  },
  boolean: {
    type: 'object',
    properties: { agree: { type: 'boolean' } },
  },
  'required-vs-optional': {
    type: 'object',
    properties: {
      first: { type: 'string' },
      middle: { type: 'string' },
    },
    required: ['first'],
  },
  'small-enum-radio': {
    type: 'object',
    properties: { color: { type: 'string', enum: ['red', 'green', 'blue'] } },
  },
  'small-numeric-choice-radio': {
    type: 'object',
    properties: {
      rating: { type: 'number', enum: [1, 2, 3, 4, 5] },
    },
  },
  'large-enum-select': {
    type: 'object',
    properties: {
      size: { type: 'string', enum: ['a', 'b', 'c', 'd', 'e', 'f'] },
    },
  },
  'array-of-scalars': {
    type: 'object',
    properties: { tags: { type: 'array', items: { type: 'string' } } },
  },
  'array-length-bounds': {
    type: 'object',
    properties: {
      tags: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 4,
      },
    },
  },
  'small-enum-array-checkboxes': {
    type: 'object',
    properties: {
      roles: { type: 'array', items: { enum: ['admin', 'user'] } },
    },
  },
  'large-enum-array-multiselect': {
    type: 'object',
    properties: {
      picks: { type: 'array', items: { enum: ['a', 'b', 'c', 'd', 'e', 'f'] } },
    },
  },
  'array-of-objects': {
    type: 'object',
    properties: {
      contacts: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, email: { type: 'string' } },
        },
      },
    },
  },
  'nested-object': {
    type: 'object',
    properties: {
      user: {
        type: 'object',
        properties: {
          age: { type: 'number' },
          address: {
            type: 'object',
            properties: { zip: { type: 'string' } },
          },
        },
      },
    },
  },
}

runInputConformance('input-jsonschema', (id) => jsonSchemaToTree(schemas[id]))
