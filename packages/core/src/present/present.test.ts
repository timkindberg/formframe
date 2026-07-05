import { describe, it, expect } from 'vitest'
import { jsonSchemaToTree } from '../parser/index'
import {
  present,
  defaultPresentation,
  layered,
  type PresentationResolver,
} from './present'
import { inputCtl, selectCtl, textareaCtl } from './controlTestUtils'

const schema = {
  type: 'object',
  properties: {
    // scalar enum — default → select
    color: { type: 'string', enum: ['red', 'green', 'blue'] },
    // plain string — default → input
    name: { type: 'string' },
  },
} as const

describe('present (ADR 029)', () => {
  it('default rule keeps scalar-enum as select and plain string as input', () => {
    const tree = present(jsonSchemaToTree(schema), defaultPresentation)
    expect(tree.getField('color')?.widget).toBe('select')
    expect(tree.getField('name')?.widget).toBe('input')
  })

  it('a consumer resolver overrides scalar-enum → multiselect (multiple + options preserved)', () => {
    const toMultiselect: PresentationResolver = (f) =>
      f.path === 'color' ? { widget: 'multiselect' } : undefined
    const tree = present(
      jsonSchemaToTree(schema),
      layered(defaultPresentation, toMultiselect)
    )
    const color = tree.getField('color')
    expect(color?.widget).toBe('multiselect')
    const control = selectCtl(color)
    expect(control.attrs.multiple).toBe(true)
    expect(control.options.map((o) => o.value)).toEqual(['red', 'green', 'blue'])
  })

  it('preserves node identity for unchanged fields (structural sharing)', () => {
    const before = jsonSchemaToTree(schema)
    const toMultiselect: PresentationResolver = (f) =>
      f.path === 'color' ? { widget: 'multiselect' } : undefined
    const after = present(before, layered(defaultPresentation, toMultiselect))
    // `name` was not overridden → same reference; `color` changed → new reference.
    expect(after.getField('name')).toBe(before.getField('name'))
    expect(after.getField('color')).not.toBe(before.getField('color'))
  })

  it.each([
    ['date', 'date'],
    ['date-time', 'datetime-local'],
    ['time', 'time'],
    ['url', 'url'],
    ['uri', 'url'],
    ['color', 'color'],
    ['tel', 'tel'],
    ['email', 'email'],
  ] as const)(
    'format %s → input attrs.type %s',
    (format, expectedType) => {
      const tree = jsonSchemaToTree({
        type: 'object',
        properties: { field: { type: 'string', format } },
      })
      const field = tree.getField('field')
      expect(field?.widget).toBe('input')
      expect(inputCtl(field).attrs.type).toBe(expectedType)
    }
  )

  it('a resolver opt-in maps a string field to the textarea archetype (ADR 029 §5, v60)', () => {
    // textarea has no default rule — it is resolver-opt-in — proving a new widget
    // is a `control.kind` arm + a deriver, with no engine/node change.
    const bioSchema = {
      type: 'object',
      properties: {
        bio: { type: 'string', minLength: 10, maxLength: 500 },
      },
      required: ['bio'],
    } as const
    const toTextarea: PresentationResolver = (f) =>
      f.path === 'bio' ? { widget: 'textarea' } : undefined
    const tree = present(
      jsonSchemaToTree(bioSchema),
      layered(defaultPresentation, toTextarea)
    )
    const bio = tree.getField('bio')
    expect(bio?.widget).toBe('textarea')
    // `textareaCtl` returns the textarea-typed control — `.attrs` is HtmlTextareaAttrs.
    expect(textareaCtl(bio).attrs).toEqual({
      id: 'bio',
      name: 'bio',
      required: true,
      minLength: 10,
      maxLength: 500,
    })
  })

  it('submit walk (this-based) sees the overridden multiselect on the presented tree', () => {
    // The array-wrapping in submit() keys off `widget === 'multiselect'` found by
    // `this.walk`; a presented (spread) tree must expose the override to it — this
    // is what the this-based walk refactor guarantees. (Full FormData submit is
    // exercised by the React integration test.)
    const toMultiselect: PresentationResolver = (f) =>
      f.path === 'color' ? { widget: 'multiselect' } : undefined
    const tree = present(
      jsonSchemaToTree(schema),
      layered(defaultPresentation, toMultiselect)
    )
    const multiselectPaths: string[] = []
    tree.walk<void>({
      field(node) {
        if (node.widget === 'multiselect') multiselectPaths.push(node.path)
      },
    })
    expect(multiselectPaths).toContain('color')
  })
})
