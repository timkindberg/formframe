import { describe, it, expect } from 'vitest'
import { jsonSchemaToTree } from './jsonSchemaToTree'
import type { JSONSchema } from './types'
import { assertArrayNode, assertGroupNode } from './nodeTestUtils'
import { submitWith } from './submitTestUtils'

function buildDeepObjectSchema(levels: number): {
  schema: JSONSchema
  leafPath: string
} {
  let node: JSONSchema = { type: 'string' }
  const pathParts: string[] = []

  for (let depth = levels; depth >= 1; depth--) {
    const key = `level${depth}`
    pathParts.unshift(key)
    node = {
      type: 'object',
      properties: { [key]: node },
    }
  }

  return { schema: node, leafPath: pathParts.join('.') }
}

function nestSubmittedValue(
  path: string,
  value: string
): Record<string, unknown> {
  return path
    .split('.')
    .reduceRight<unknown>((acc, key) => ({ [key]: acc }), value) as Record<
    string,
    unknown
  >
}

describe('deep nesting robustness', () => {
  const { schema: deepSchema, leafPath: deepLeafPath } =
    buildDeepObjectSchema(6)

  const nestedArraySchema: JSONSchema = {
    type: 'object',
    properties: {
      org: {
        type: 'object',
        properties: {
          department: {
            type: 'object',
            properties: {
              members: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    role: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }

  it('resolves deeply nested fields via getField relative paths', () => {
    const form = jsonSchemaToTree(deepSchema)
    const leaf = form.getField(deepLeafPath)

    expect(leaf?.nodeType).toBe('field')
    expect(leaf?.path).toBe(deepLeafPath)
    expect(leaf?.widget).toBe('input')
  })

  it('counts all leaf fields in deep nesting via getAllFields', () => {
    const form = jsonSchemaToTree(deepSchema)

    expect(form.getAllFields()).toHaveLength(1)
    expect(form.getAllFields()[0].path).toBe(deepLeafPath)
  })

  it('resolves array-of-objects fields nested inside groups', () => {
    const form = jsonSchemaToTree(nestedArraySchema)
    const org = form.children.find((c) => c.path === 'org')
    assertGroupNode(org)

    const department = org.children.find((c) => c.path === 'org.department')
    assertGroupNode(department)

    const membersNode = department.children.find(
      (c) => c.path === 'org.department.members'
    )
    assertArrayNode(membersNode)

    const item = membersNode.getItem(0)
    const itemGroup = item.children[0]
    assertGroupNode(itemGroup)

    const nameField = itemGroup.getField('name')
    const roleField = itemGroup.getField('role')

    expect(nameField?.path).toBe('org.department.members.0.name')
    expect(roleField?.path).toBe('org.department.members.0.role')
    expect(nameField?.widget).toBe('input')

    const walkedPaths: string[] = []
    form.walk({ field: (node) => walkedPaths.push(node.path) })
    expect(walkedPaths.sort()).toEqual([
      'org.department.members.0.name',
      'org.department.members.0.role',
    ])

    // ADR 032: root getField now resolves through the array index, and
    // getAllFields includes the array-item leaves (≡ walk({ field })).
    expect(form.getField('org.department.members.0.name')?.path).toBe(
      'org.department.members.0.name'
    )
    expect(form.getField('org.department.members.0.role')?.path).toBe(
      'org.department.members.0.role'
    )
    expect(
      form
        .getAllFields()
        .map((f) => f.path)
        .sort()
    ).toEqual([
      'org.department.members.0.name',
      'org.department.members.0.role',
    ])
  })

  it('submit round-trip preserves deep nesting shape', () => {
    expect(submitWith(deepSchema, [[deepLeafPath, 'deep-value']])).toEqual(
      nestSubmittedValue(deepLeafPath, 'deep-value')
    )
  })

  it('submit round-trip preserves array-of-objects inside nested groups', () => {
    expect(
      submitWith(nestedArraySchema, [
        ['org.department.members.0.name', 'Ada'],
        ['org.department.members.0.role', 'Engineer'],
      ])
    ).toEqual({
      org: {
        department: {
          members: [{ name: 'Ada', role: 'Engineer' }],
        },
      },
    })
  })
})

describe('query surface traverses arrays (ADR 032)', () => {
  const teamSchema: JSONSchema = {
    type: 'object',
    properties: {
      members: {
        type: 'array',
        minItems: 2,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: {
              type: 'object',
              properties: { city: { type: 'string' } },
            },
          },
        },
      },
      // Dynamic primitive array (no enum/oneOf) — items are scalar field leaves.
      tags: {
        type: 'array',
        minItems: 1,
        items: { type: 'string' },
      },
    },
  }

  // Nested arrays of objects, to exercise index-by-index chaining.
  const matrixSchema: JSONSchema = {
    type: 'object',
    properties: {
      teams: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            members: {
              type: 'array',
              minItems: 2,
              items: {
                type: 'object',
                properties: { name: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  }

  it('resolves an array-item leaf by numeric index from the root', () => {
    const form = jsonSchemaToTree(teamSchema)
    expect(form.getField('members.0.name')?.path).toBe('members.0.name')
    expect(form.getField('members.1.name')?.path).toBe('members.1.name')
  })

  it('resolves through a group nested inside an array item', () => {
    const form = jsonSchemaToTree(teamSchema)
    expect(form.getField('members.0.address.city')?.path).toBe(
      'members.0.address.city'
    )
  })

  it('resolves a primitive dynamic-array element by index', () => {
    const form = jsonSchemaToTree(teamSchema)
    const tag0 = form.getField('tags.0')
    expect(tag0?.path).toBe('tags.0')
    expect(tag0?.nodeType).toBe('field')
  })

  it('chains numeric indices through nested arrays', () => {
    const form = jsonSchemaToTree(matrixSchema)
    expect(form.getField('teams.0.members.1.name')?.path).toBe(
      'teams.0.members.1.name'
    )
  })

  it('returns undefined for an out-of-range index (item not instantiated)', () => {
    const form = jsonSchemaToTree(teamSchema)
    expect(form.getField('members.5.name')).toBeUndefined()
  })

  it('returns undefined for a non-numeric segment where an index is expected', () => {
    const form = jsonSchemaToTree(teamSchema)
    expect(form.getField('members.x.name')).toBeUndefined()
  })

  it('returns undefined for the array container path itself (not a leaf)', () => {
    const form = jsonSchemaToTree(teamSchema)
    expect(form.getField('members')).toBeUndefined()
  })

  it('getAllFields includes every array-item leaf (≡ walk)', () => {
    const form = jsonSchemaToTree(teamSchema)

    const viaGetAll = form
      .getAllFields()
      .map((f) => f.path)
      .sort()
    const viaWalk: string[] = []
    form.walk({ field: (n) => viaWalk.push(n.path) })

    expect(viaGetAll).toEqual([
      'members.0.address.city',
      'members.0.name',
      'members.1.address.city',
      'members.1.name',
      'tags.0',
    ])
    expect(viaGetAll).toEqual(viaWalk.sort())
  })
})
