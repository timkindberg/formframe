import { describe, it, expect } from 'vitest'
import { createArrayNode } from './arrayNode'
import type { ContainerFacts } from './nodeTypes'

const baseFacts: ContainerFacts = {
  path: 'tags',
  label: 'tags',
  required: false,
  valueShape: 'array',
  constraints: { required: false },
  attrs: { id: 'tags', name: 'tags' },
  origin: { source: 'test', schema: {} },
}

describe('createArrayNode', () => {
  it('throws when ContainerFacts sets both choices and item (ADR 030 §3)', () => {
    expect(() =>
      createArrayNode({
        facts: {
          ...baseFacts,
          choices: [{ value: 'a', label: 'A' }],
          item: { valueShape: 'scalar' },
        },
        parts: {
          container: { key: 'tags' },
          itemsContainer: { key: 'tags-items' },
          addButton: { attrs: { type: 'button' }, label: 'Add' },
        },
        seed: [],
        itemFactory: () => {
          throw new Error('unused')
        },
      })
    ).toThrow(/choices OR item, not both/)
  })
})
