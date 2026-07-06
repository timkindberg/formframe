// Executable spec for ADR 030 (bd fcj) — container facts + subtree collapse.
//
// ADR 030 is *proposed*, not implemented (it crosses the Core facts boundary), so
// this file does two things and keeps the gate green:
//   1. CHARACTERIZES today's behavior — facts are leaf-only, and `present()` cannot
//      collapse a container subtree because it never offers containers to the
//      resolver. These assertions pin the gap the ADR closes.
//   2. Records the TARGET contract as `it.todo` entries (no body → nothing to run or
//      typecheck) so the intended behavior is legible next to the current behavior.
//
// When ADR 030 is accepted, each `it.todo` becomes a real test and the
// characterization assertions below flip (or move) accordingly.

import { describe, it, expect } from 'vitest'
import { jsonSchemaToTree } from '../parser/index'
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
          type: { type: 'string' },
        },
      },
    },
  },
} as const

// A leaf enum-array — already one control today (a checkbox group at this size,
// bd cm7; the ADR 030 point is only that a *leaf* array is one control, contrasted
// with the object-array *subtree* below — the exact widget is incidental).
const enumArraySchema = {
  type: 'object',
  properties: {
    tags: { type: 'array', title: 'Tags', items: { enum: ['a', 'b', 'c'] } },
  },
} as const

// A leaf oneOf-array — the same multiselect shape, but each option carries a
// DISTINCT value (const) and label (title). This is the App_01 pattern the ADR
// calls out: a finite `choices` set that already supplies value+label identity,
// so it needs NO args.valueKey/labelKey (contrast §4's open-ended object source).
// (A *deep* oneOf — object variants with no `const` — is the separate aml bug,
// out of scope here.)
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

describe('container facts / subtree collapse — CURRENT behavior (ADR 030 gap)', () => {
  it('a subtree object-array is an ArrayNode with NO facts (facts are leaf-only)', () => {
    const tree = jsonSchemaToTree(objectArraySchema)
    const criteria = tree.children.find((c) => c.path === 'allowed_criteria')
    expect(criteria?.nodeType).toBe('array')
    // ADR 030 §1: containers gain a NodeFacts projection; today they have none.
    expect('facts' in (criteria as object)).toBe(false)
  })

  it('a leaf enum-array already carries facts with valueShape:"array" + choices', () => {
    const tree = jsonSchemaToTree(enumArraySchema)
    const tags = tree.getField('tags')
    expect(tags?.widget).toBe('checkboxes')
    expect(tags?.facts.valueShape).toBe('array')
    expect(tags?.facts.choices?.map((o) => o.value)).toEqual(['a', 'b', 'c'])
  })

  it('a leaf oneOf-array carries the SAME facts shape, but choices carry value+label', () => {
    // Same multiselect / valueShape:"array" as the enum case — the ADR's point is
    // that a finite oneOf ALREADY supplies both the submitted value (const) and the
    // display label (title), so identity is known WITHOUT args.valueKey/labelKey.
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

  it('a resolver CANNOT collapse a container today — present() never offers it the container', () => {
    // A resolver asking to collapse the object-array into one multiselect...
    const collapse: PresentationResolver = (f) =>
      f.path === 'allowed_criteria' ? { widget: 'multiselect' } : undefined
    const tree = present(
      jsonSchemaToTree(objectArraySchema),
      layered(defaultPresentation, collapse)
    )
    const criteria = tree.children.find((c) => c.path === 'allowed_criteria')
    // ...is a no-op: the ArrayNode is untouched (still a container, not collapsed).
    expect(criteria?.nodeType).toBe('array')
    expect(criteria?.isArray).toBe(true)
  })

  it('generalizing facts to containers must stay a default no-op (subtree array has no choices)', () => {
    // The default rule keys multiselect off valueShape==='array' && choices; a
    // subtree array has an item descriptor, not choices, so it must STAY add/remove
    // once containers carry facts (ADR 030 §3). Today it is already an ArrayNode.
    const tree = present(
      jsonSchemaToTree(objectArraySchema),
      defaultPresentation
    )
    const criteria = tree.children.find((c) => c.path === 'allowed_criteria')
    expect(criteria?.nodeType).toBe('array')
  })
})

describe('container facts / subtree collapse — TARGET contract (ADR 030)', () => {
  // §1 — the neutral waist spans the whole tree.
  it.todo(
    'present() offers container nodes (NodeFacts) to the resolver, not just leaves — §1'
  )
  // §5 — collapse mechanics.
  it.todo(
    'a resolver returning a widget for an object-array container collapses it to one leaf-like node, pruning the subtree — §5'
  )
  // §6 — submit assembly consistency via the existing array hook.
  it.todo(
    'a collapsed object-array keeps valueShape:"array" so submit assembles Array<...> via the existing forceArrayFields hook — §6'
  )
  // §4 — source + identity live in args, not facts.
  it.todo(
    'args carries { optionsSource, valueKey, labelKey } for the async object-array multiselect (not choices) — §4'
  )
  // §2 — resolves ADR 029's deferred member.
  it.todo(
    'an object subtree (GroupNode) collapses with valueShape:"object", resolving ADR 029 deferred member — §2'
  )
  // §7 — rendering is gated elsewhere.
  it.todo(
    'rendering the collapsed control is gated on the ADR 029 §5 field.control slot + async options (bd cm7) — §7'
  )
})
