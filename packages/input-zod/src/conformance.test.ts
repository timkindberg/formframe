// input-zod's half of the shared input-conformance oracle (ADR 038).
//
// The oracle (@jsonschema-form/input-conformance) defines schema-language-NEUTRAL
// expected trees; here we express each scenario in Zod and assert zodToTree
// produces the oracle's tree. The exhaustive `Record<ScenarioId, ZodType>` makes
// TypeScript fail the build if a scenario is left uncovered, so this front-end
// can't silently drift from the JSON Schema front-end (which runs the SAME oracle
// in its own colocated test — neither package references the other).
//
// Requiredness is the one place the idioms differ: a Zod property is required by
// default, so scenarios the oracle marks `required: false` are authored here with
// `.optional()` — the equivalent MEANING, not the equivalent syntax.

import { z } from 'zod'
import {
  runInputConformance,
  type ScenarioId,
} from '@jsonschema-form/input-conformance'
import { zodToTree } from './zodToTree'

const schemas: Record<ScenarioId, z.ZodType> = {
  'scalar-string': z.object({ name: z.string().optional() }),
  'string-constraints': z.object({
    handle: z.string().min(3).max(20).optional(),
  }),
  'email-format': z.object({ email: z.string().email().optional() }),
  'number-bounds': z.object({ age: z.number().min(0).max(120).optional() }),
  integer: z.object({ count: z.int().optional() }),
  boolean: z.object({ agree: z.boolean().optional() }),
  'required-vs-optional': z.object({
    first: z.string(),
    middle: z.string().optional(),
  }),
  'small-enum-radio': z.object({
    color: z.enum(['red', 'green', 'blue']).optional(),
  }),
  'small-numeric-choice-radio': z.object({
    rating: z
      .union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
      ])
      .optional(),
  }),
  'large-enum-select': z.object({
    size: z.enum(['a', 'b', 'c', 'd', 'e', 'f']).optional(),
  }),
  'array-of-scalars': z.object({ tags: z.array(z.string()).optional() }),
  'array-length-bounds': z.object({
    tags: z.array(z.string()).min(2).max(4).optional(),
  }),
  'small-enum-array-checkboxes': z.object({
    roles: z.array(z.enum(['admin', 'user'])).optional(),
  }),
  'large-enum-array-multiselect': z.object({
    picks: z.array(z.enum(['a', 'b', 'c', 'd', 'e', 'f'])).optional(),
  }),
  'array-of-objects': z.object({
    contacts: z
      .array(z.object({ name: z.string(), email: z.string() }))
      .optional(),
  }),
  'nested-object': z.object({
    user: z
      .object({
        age: z.number().optional(),
        address: z.object({ zip: z.string().optional() }).optional(),
      })
      .optional(),
  }),
}

runInputConformance('input-zod', (id) => zodToTree(schemas[id]))
