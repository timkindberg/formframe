// Type-level tests pinning the REAL-WORLD shape of `S` for the JSON Schema
// front-end (bd wo8, ADR 033 §4). Enforced by the gate's tsc pass; no runtime
// assertions. This is the concrete answer to "what type does a nested leaf's
// origin.schema have?": the front-end pins `S = JSONSchemaObject` UNIFORMLY on
// every node — root and deep leaf alike — never a per-node subschema.

import { describe, it, expectTypeOf } from 'vitest'
import type {
  FormShape,
  GroupNode,
  FieldNode,
  TreeShapeOf,
} from '@formframe/core'
import { jsonSchemaToTree } from './jsonSchemaToTree'
import type { JSONSchema, JSONSchemaObject } from './types'

const schema: JSONSchema = {
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
}

describe('jsonSchemaToTree pins S = JSONSchemaObject', () => {
  it('returns a GroupNode<JSONSchemaObject> root, branded with a FormShape (ADR 048)', () => {
    const tree = jsonSchemaToTree(schema)
    // Still a GroupNode<JSONSchemaObject> structurally — origin threading (wo8)
    // is preserved through the `TypedTree` brand's Origin parameter …
    expectTypeOf(tree).toExtend<GroupNode<JSONSchemaObject>>()
    // … and additionally carries a resolved FormShape React binds off (ADR 048).
    expectTypeOf<TreeShapeOf<typeof tree>>().toExtend<FormShape>()
  })

  it('a deep leaf carries JSONSchemaObject — uniform, NOT a narrowed subschema', () => {
    const tree = jsonSchemaToTree(schema)
    const leaf = tree.getField('user.address.zip')
    expectTypeOf(leaf).toEqualTypeOf<FieldNode<JSONSchemaObject> | undefined>()
    // The payoff of wo8: origin.schema is the front-end's schema type, not
    // `unknown`. It is the GENERAL JSONSchemaObject (uniform across depth), not
    // `{ type: 'string' }` — per-leaf narrowing is a separate path-indexed
    // accessor feature, not something walk/getField provides.
    expectTypeOf<
      NonNullable<typeof leaf>['facts']['origin']['schema']
    >().toEqualTypeOf<JSONSchemaObject>()
  })

  it('walk handlers see JSONSchemaObject on origin.schema, not unknown', () => {
    const tree = jsonSchemaToTree(schema)
    tree.walk<void>({
      field: (node) => {
        expectTypeOf(node.facts.origin.schema).toEqualTypeOf<JSONSchemaObject>()
      },
    })
  })
})
