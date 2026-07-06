import { describe, it, expect } from 'vitest'
import { jsonSchemaToTree } from './index'
import type { ArrayItemNode, ArrayNode, GroupNode, JSONSchema } from '../types'
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
  return path.split('.').reduceRight<unknown>(
    (acc, key) => ({ [key]: acc }),
    value
  ) as Record<string, unknown>
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
    const org = form.children.find((c) => c.path === 'org') as GroupNode
    const department = org.children.find(
      (c) => c.path === 'org.department'
    ) as GroupNode
    const membersNode = department.children.find(
      (c) => c.path === 'org.department.members'
    ) as ArrayNode

    expect(membersNode?.isArray).toBe(true)
    if (!membersNode?.isArray) return

    const item = membersNode.children[0] as ArrayItemNode
    const itemGroup = item.children[0] as GroupNode
    expect(itemGroup.isGroup).toBe(true)

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

    expect(form.getField('org.department.members.0.name')).toBeUndefined()
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
