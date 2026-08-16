import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  createContinuation,
  mergeAdapter,
  type FieldControlRenderers,
  type PartialAdapter,
  type RendererAdapter,
} from './engine'
import { createFieldNode } from '../parser/fieldNode'
import { createGroupNode } from '../parser/groupNode'
import type {
  ContainerFacts,
  FieldControl,
  LeafFacts,
} from '../parser/nodeTypes'

const empty = (): string => ''

const baseControl: FieldControlRenderers<string> = {
  input: () => 'base-input',
  select: () => 'base-select',
  textarea: () => 'base-textarea',
  choicegroup: () => 'base-choicegroup',
}

function stubAdapter(
  control: FieldControlRenderers<string>
): RendererAdapter<string> {
  return {
    field: {
      root: ({ node }) => node.parts.control.Default(),
      label: () => 'base-label',
      description: empty,
      control,
    },
    group: {
      root: ({ children }) => children,
      label: empty,
      description: empty,
    },
    array: {
      root: ({ children }) => children,
      label: empty,
      description: empty,
      addButton: empty,
    },
    arrayItem: {
      root: ({ children }) => children,
      removeButton: empty,
    },
    combine: ({ children }) => children.map((c) => c.node).join(''),
  }
}

const selectFacts: LeafFacts = {
  path: 'color',
  label: 'Color',
  required: false,
  valueShape: 'scalar',
  primitive: 'string',
  constraints: { required: false },
  attrs: { id: 'color', name: 'color' },
  origin: { source: 'test', schema: {} },
  choices: [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
    { value: 'c', label: 'C' },
    { value: 'd', label: 'D' },
    { value: 'e', label: 'E' },
    { value: 'f', label: 'F' },
  ],
}

const rootFacts: ContainerFacts = {
  path: '',
  label: '',
  required: false,
  valueShape: 'object',
  constraints: { required: false },
  attrs: { id: '', name: '' },
  origin: { source: 'test', schema: {} },
}

describe('mergeAdapter', () => {
  it('one-level-merges a partial control map and keeps other arms from base', () => {
    const input = (): string => 'over-input'
    const base = stubAdapter(baseControl)
    const merged = mergeAdapter(base, {
      field: { control: { input } },
    })
    expect(merged.field.control.input).toBe(input)
    expect(merged.field.control.select).toBe(baseControl.select)
    expect(merged.field.control.textarea).toBe(baseControl.textarea)
    expect(merged.field.control.choicegroup).toBe(baseControl.choicegroup)
    expect(merged.field.label).toBe(base.field.label)
    expect(merged.group.root).toBe(base.group.root)
  })

  it('last-wins functions on a kind slot and takes combine whole', () => {
    const overLabel = (): string => 'over-label'
    const overCombine: RendererAdapter<string>['combine'] = () => 'COMBINED'
    const base = stubAdapter(baseControl)
    const merged = mergeAdapter(base, {
      field: { label: overLabel },
      combine: overCombine,
    })
    expect(merged.field.label).toBe(overLabel)
    expect(merged.field.control).toBe(base.field.control)
    expect(merged.combine).toBe(overCombine)
  })

  it('types PartialAdapter control arms as independently optional', () => {
    const over: PartialAdapter<string> = {
      field: { control: { input: () => 'ok' } },
    }
    expectTypeOf(over.field).toMatchTypeOf<
      { control?: Partial<FieldControlRenderers<string>> } | undefined
    >()
    expect(
      over.field?.control?.input?.(
        {} as Extract<FieldControl, { kind: 'input' }>
      )
    ).toBe('ok')
  })
})

describe('createContinuation — control map coerce-at-lookup', () => {
  it('renders kind: select through control.select, not a leftover function', () => {
    const field = createFieldNode({ facts: selectFacts })
    expect(field.parts.control.kind).toBe('select')
    const tree = createGroupNode({
      facts: rootFacts,
      children: [field],
      parts: { container: { key: '' } },
    })
    const engine = createContinuation(
      stubAdapter({
        input: () => 'INPUT',
        select: () => 'SELECT',
        textarea: () => 'TEXTAREA',
        choicegroup: () => 'CHOICEGROUP',
      })
    )
    expect(engine.resolve(tree, (node) => node.Default())).toBe('SELECT')
  })

  it('missing control arm yields the empty combine, same as a missing part', () => {
    const field = createFieldNode({ facts: selectFacts })
    const tree = createGroupNode({
      facts: rootFacts,
      children: [field],
      parts: { container: { key: '' } },
    })
    const adapter = stubAdapter({
      input: () => 'INPUT',
      select: () => 'SELECT',
      textarea: () => 'TEXTAREA',
      choicegroup: () => 'CHOICEGROUP',
    })
    // Drop the select arm without putting a function on the slot.
    adapter.field.control = {
      input: adapter.field.control.input,
      textarea: adapter.field.control.textarea,
      choicegroup: adapter.field.control.choicegroup,
    } as FieldControlRenderers<string>
    const engine = createContinuation(adapter)
    expect(engine.resolve(tree, (node) => node.Default())).toBe('')
  })
})
