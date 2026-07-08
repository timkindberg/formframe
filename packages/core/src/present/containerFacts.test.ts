// Executable spec for ADR 030 (bd fcj) — container facts + subtree collapse.
//
// The tree-level contract: neutral facts are projected onto CONTAINER nodes
// (ArrayNode/GroupNode), and `present()` offers a container to the resolver and
// COLLAPSES its subtree into one leaf-like node when the resolver returns a widget.
// The default rule collapses ONLY a self-identifying scalar-choice array (finite
// enum/oneOf items → one multiselect/checkboxes leaf, ADR 030 §3); an open-ended
// object array stays add/remove and a group stays decomposed unless a consumer
// resolver opts it in. Rendering the collapsed object-array control + its async
// source (ADR 030 §4/§7) needs the async-options slot, tracked separately (the
// `it.todo` below).

import { describe, it, expect } from 'vitest'
import { jsonSchemaToTree } from '../parser/index'
import { compileRoot } from '../parser/compile'
import {
  assertArrayNode,
  assertField,
  assertGroupNode,
} from '../parser/nodeTestUtils'
import type { JSONSchema } from '../types'
import {
  present,
  defaultPresentation,
  layered,
  type PresentationResolver,
} from './present'

// The canonical VNDLY object-array multiselect case (ADR 030 Context).
const objectArraySchema = {
  type: 'object',
  properties: {
    allowed_criteria: {
      type: 'array',
      title: 'Allowed criteria',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          label: { type: 'string' },
        },
      },
    },
  },
} as const

// Same object-array but with seed items, so collapse has a subtree to prune.
const objectArrayWithItems = {
  type: 'object',
  properties: {
    members: {
      type: 'array',
      title: 'Members',
      minItems: 2,
      items: {
        type: 'object',
        properties: { name: { type: 'string' } },
      },
    },
  },
} as const

// An object subtree (ADR 030 §2 — resolves ADR 029's deferred valueShape:'object').
const objectSubtreeSchema = {
  type: 'object',
  properties: {
    address: {
      type: 'object',
      title: 'Address',
      properties: { street: { type: 'string' }, city: { type: 'string' } },
    },
  },
} as const

// A scalar-choice (enum) array — a finite, self-identifying in-schema option set.
// It resolves to a single choice control (a checkbox group at this size): a
// FieldNode with LeafFacts + `choices`, contrasted with the open-ended object-array
// *container* above (which carries an `item` descriptor, not `choices`).
const enumArraySchema = {
  type: 'object',
  properties: {
    tags: { type: 'array', title: 'Tags', items: { enum: ['a', 'b', 'c'] } },
  },
} as const

// A leaf oneOf-array — same multiselect shape, each option a DISTINCT value
// (const) + label (title): a finite `choices` set that self-identifies, so no
// args.valueKey/labelKey (ADR 030 §4, contrast the open-ended object source).
const oneOfArraySchema = {
  type: 'object',
  properties: {
    permissions: {
      type: 'array',
      title: 'Permissions',
      items: {
        oneOf: [
          { const: 'read', title: 'Can read' },
          { const: 'write', title: 'Can write' },
          { const: 'admin', title: 'Administrator' },
        ],
      },
    },
  },
} as const

/** Present a schema with a resolver, then run submit against a mocked FormData
 * (a [key, value] multimap, so duplicate keys survive like real FormData). Proves
 * a *collapsed* container's `valueShape` still drives submit assembly (§6). */
function submitPresented(
  schema: JSONSchema,
  resolve: PresentationResolver,
  pairs: Array<[string, string]>
): Record<string, unknown> {
  const form = present(jsonSchemaToTree(schema), resolve)
  let submitted: Record<string, unknown> = {}
  const handleSubmit = form.submit((data) => {
    submitted = data
  })
  const originalFormData = globalThis.FormData
  try {
    globalThis.FormData = class MockFormData {
      entries() {
        return pairs.values()
      }
    } as unknown as typeof FormData
    handleSubmit({ preventDefault() {}, currentTarget: {} as EventTarget })
  } finally {
    globalThis.FormData = originalFormData
  }
  return submitted
}

describe('container facts (ADR 030 §1)', () => {
  it('a subtree object-array carries ContainerFacts (valueShape:"array" + item descriptor, no choices)', () => {
    const tree = jsonSchemaToTree(objectArraySchema)
    const criteria = tree.children.find((c) => c.path === 'allowed_criteria')
    assertArrayNode(criteria)
    // ADR 030 §1: containers carry a NodeFacts projection.
    expect(criteria.facts.valueShape).toBe('array')
    // Open-ended element source → an `item` descriptor, NOT finite `choices`.
    expect(criteria.facts.choices).toBeUndefined()
    expect(criteria.facts.item).toEqual({
      valueShape: 'object',
      keys: ['name', 'label'],
    })
  })

  it('a GroupNode carries ContainerFacts with valueShape:"object"', () => {
    const tree = jsonSchemaToTree(objectSubtreeSchema)
    const address = tree.children.find((c) => c.path === 'address')
    assertGroupNode(address)
    expect(address.facts.valueShape).toBe('object')
    expect(address.facts.choices).toBeUndefined()
    expect(address.facts.item).toBeUndefined()
  })

  it('a scalar-choice (enum) array resolves to a leaf: LeafFacts with valueShape:"array" + choices', () => {
    const tree = jsonSchemaToTree(enumArraySchema)
    const tags = tree.getField('tags')
    expect(tags?.widget).toBe('checkboxes')
    expect(tags?.facts.valueShape).toBe('array')
    expect(tags?.facts.choices?.map((o) => o.value)).toEqual(['a', 'b', 'c'])
  })

  it('a leaf oneOf-array carries choices with value+label (self-identifying, no args)', () => {
    const tree = jsonSchemaToTree(oneOfArraySchema)
    const permissions = tree.getField('permissions')
    expect(permissions?.widget).toBe('checkboxes')
    expect(permissions?.facts.valueShape).toBe('array')
    expect(permissions?.facts.choices).toEqual([
      { value: 'read', label: 'Can read' },
      { value: 'write', label: 'Can write' },
      { value: 'admin', label: 'Administrator' },
    ])
  })
})

describe('present() collapse (ADR 030 §5)', () => {
  it('offers a container node (its facts) to the resolver, not just leaves (§1)', () => {
    const seen: Array<{ path: string; valueShape: string }> = []
    const spy: PresentationResolver = (f) => {
      seen.push({ path: f.path, valueShape: f.valueShape })
      return undefined
    }
    present(jsonSchemaToTree(objectArraySchema), spy)
    // The array container was offered (the root group is never offered).
    expect(seen).toContainEqual({
      path: 'allowed_criteria',
      valueShape: 'array',
    })
  })

  it('collapses an object-array to one leaf-like node, pruning the subtree (§5)', () => {
    const before = jsonSchemaToTree(objectArrayWithItems)
    const members = before.children.find((c) => c.path === 'members')
    // Precondition: minItems:2 gives the ArrayNode a subtree to prune.
    assertArrayNode(members)
    expect(members.children.length).toBe(2)

    const collapse: PresentationResolver = (f) =>
      f.path === 'members' ? { widget: 'multiselect' } : undefined
    const tree = present(before, layered(defaultPresentation, collapse))
    const collapsed = tree.children.find((c) => c.path === 'members')
    assertField(collapsed) // container → leaf
    expect('children' in collapsed).toBe(false) // subtree pruned
    expect(collapsed.widget).toBe('multiselect')
    expect(collapsed.facts.valueShape).toBe('array') // preserved (§2/§6)
  })

  it('a collapsed object-array keeps valueShape:"array" so submit assembles Array<...> via the existing hook (§6)', () => {
    const collapse: PresentationResolver = (f) =>
      f.path === 'members' ? { widget: 'multiselect' } : undefined
    // A single selection must still submit as a 1-element array.
    const submitted = submitPresented(
      objectArrayWithItems,
      layered(defaultPresentation, collapse),
      [['members', 'x']]
    )
    expect(submitted).toEqual({ members: ['x'] })
  })

  it('args carries { optionsSource, valueKey, labelKey } — source/identity stay OUT of facts (§4)', () => {
    const optionsSource = async () => []
    const collapse: PresentationResolver = (f) =>
      f.path === 'members'
        ? {
            widget: 'multiselect',
            args: { optionsSource, valueKey: 'name', labelKey: 'label' },
          }
        : undefined
    const tree = present(
      jsonSchemaToTree(objectArrayWithItems),
      layered(defaultPresentation, collapse)
    )
    const members = tree.children.find((c) => c.path === 'members')
    assertField(members)
    // Core carries `args` through verbatim and never interprets its keys:
    // `optionsSource`/`valueKey`/`labelKey` are a convention shared between a
    // resolver and the render layer, not a Core-enforced shape (ADR 030 §4).
    expect(members.args).toEqual({
      optionsSource,
      valueKey: 'name',
      labelKey: 'label',
    })
    // The neutral facts carry NO runtime source / value identity.
    expect(members.facts.choices).toBeUndefined()
    expect('optionsSource' in members.facts).toBe(false)
    expect('valueKey' in members.facts).toBe(false)
  })

  it('an object subtree (GroupNode) collapses with valueShape:"object", resolving ADR 029 deferred member (§2)', () => {
    const collapse: PresentationResolver = (f) =>
      f.path === 'address' ? { widget: 'select' } : undefined
    const tree = present(
      jsonSchemaToTree(objectSubtreeSchema),
      layered(defaultPresentation, collapse)
    )
    const address = tree.children.find((c) => c.path === 'address')
    assertField(address)
    expect(address.facts.valueShape).toBe('object')
    expect('children' in address).toBe(false)
  })

  it('an unknown widget for a container is a no-op — the subtree is NOT erased', () => {
    const collapse: PresentationResolver = (f) =>
      f.path === 'allowed_criteria' ? { widget: 'totally-custom' } : undefined
    const tree = present(
      jsonSchemaToTree(objectArraySchema),
      layered(defaultPresentation, collapse)
    )
    const criteria = tree.children.find((c) => c.path === 'allowed_criteria')
    // Widget outside the catalog → collapse declines, container stays intact.
    expect(criteria?.nodeType).toBe('array')
  })
})

describe('default present() leaves containers decomposed (ADR 030 §3)', () => {
  it('an object-array stays an add/remove ArrayNode under the default', () => {
    const tree = present(
      jsonSchemaToTree(objectArraySchema),
      defaultPresentation
    )
    const criteria = tree.children.find((c) => c.path === 'allowed_criteria')
    expect(criteria?.nodeType).toBe('array')
  })

  it('a GroupNode stays decomposed under the default', () => {
    const tree = present(
      jsonSchemaToTree(objectSubtreeSchema),
      defaultPresentation
    )
    const address = tree.children.find((c) => c.path === 'address')
    expect(address?.nodeType).toBe('group')
  })

  it('is identity-preserving: an untouched container returns the SAME reference', () => {
    const before = jsonSchemaToTree(objectArrayWithItems)
    const after = present(before, defaultPresentation)
    // Default collapses nothing → structural sharing keeps the subtree by ref.
    expect(after.children.find((c) => c.path === 'members')).toBe(
      before.children.find((c) => c.path === 'members')
    )
  })
})

describe('scalar-choice-array collapse lives in present() (ADR 030 §3 / ADR 033 §2)', () => {
  it('the front-end emits an un-collapsed ArrayNode with choices; present() folds it to a leaf', () => {
    // The front-end (compileRoot, pre-present) is a pure STRUCTURAL transcriber:
    // a scalar-choice array is an ArrayNode carrying `choices`, NOT a collapsed
    // leaf. The collapse is present()'s job, so the lowering decision lives in one
    // place and every front-end inherits it (ADR 033 §2).
    const raw = compileRoot(enumArraySchema)
    const rawTags = raw.children.find((c) => c.path === 'tags')
    assertArrayNode(rawTags)
    expect(rawTags.facts.choices?.map((o) => o.value)).toEqual(['a', 'b', 'c'])
    expect(rawTags.facts.item).toBeUndefined() // choices XOR item

    // present()'s default rule collapses that container into one choice leaf.
    const tags = present(raw, defaultPresentation).getField('tags')
    assertField(tags)
    expect(tags.widget).toBe('checkboxes')
    expect(tags.facts.valueShape).toBe('array')
    expect(tags.facts.choices?.map((o) => o.value)).toEqual(['a', 'b', 'c'])
  })
})

describe('container facts / subtree collapse — deferred (ADR 030)', () => {
  // §7 — rendering the collapsed control needs the async-options slot (bd cm7/v60).
  it.todo(
    'renders the collapsed object-array multiselect via the field.control slot + async options — §7'
  )
})
