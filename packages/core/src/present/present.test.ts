import { describe, it, expect } from 'vitest'
import { jsonSchemaToTree } from '../parser/index'
import {
  present,
  defaultPresentation,
  OPTION_COUNT_THRESHOLD,
  layered,
  type PresentationResolver,
} from './present'
import {
  inputCtl,
  selectCtl,
  textareaCtl,
  choicegroupCtl,
} from './controlTestUtils'

const schema = {
  type: 'object',
  properties: {
    // scalar enum, 3 options (≤ threshold) — default → radio (bd cm7)
    color: { type: 'string', enum: ['red', 'green', 'blue'] },
    // plain string — default → input
    name: { type: 'string' },
  },
} as const

describe('present (ADR 029)', () => {
  it('default rule maps a small scalar-enum to radio and a plain string to input', () => {
    const tree = present(jsonSchemaToTree(schema), defaultPresentation)
    expect(tree.getField('color')?.widget).toBe('radio')
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
    expect(control.options.map((o) => o.value)).toEqual([
      'red',
      'green',
      'blue',
    ])
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

// bd 672 — format → native `<input type>` mapping. JSON Schema uses `date-time`
// (hyphen); we do not accept a `datetime` alias. month/week have no standard
// JSON Schema format keyword, so they stay out of scope here.
describe('present — format-driven input types (bd 672)', () => {
  it.each([
    ['date', 'date'],
    ['date-time', 'datetime-local'],
    ['time', 'time'],
    ['email', 'email'],
    ['url', 'url'],
    ['uri', 'url'],
    ['color', 'color'],
    ['tel', 'tel'],
  ] as const)('format %s → input attrs.type %s', (format, expectedType) => {
    const tree = jsonSchemaToTree({
      type: 'object',
      properties: { field: { type: 'string', format } },
    })
    const field = tree.getField('field')
    expect(field?.widget).toBe('input')
    expect(inputCtl(field).attrs.type).toBe(expectedType)
  })

  it('an unknown format falls back to text', () => {
    const tree = jsonSchemaToTree({
      type: 'object',
      properties: { field: { type: 'string', format: 'uuid' } },
    })
    const field = tree.getField('field')
    expect(field?.widget).toBe('input')
    expect(inputCtl(field).attrs.type).toBe('text')
  })
})

// bd cm7 — the option-count heuristic. The four choice widgets share the same
// facts and submitted-value contract; only the rendered control differs, split at
// `OPTION_COUNT_THRESHOLD`. These pin the boundary and the derived group markup.
describe('present — option-count heuristic (bd cm7)', () => {
  const N = OPTION_COUNT_THRESHOLD
  const optionsOf = (count: number) =>
    Array.from({ length: count }, (_, i) => `o${i}`)
  const scalarEnum = (count: number) =>
    jsonSchemaToTree({
      type: 'object',
      properties: { pick: { type: 'string', enum: optionsOf(count) } },
    }).getField('pick')
  const arrayEnum = (count: number) =>
    jsonSchemaToTree({
      type: 'object',
      properties: {
        pick: {
          type: 'array',
          items: { type: 'string', enum: optionsOf(count) },
        },
      },
    }).getField('pick')

  it(`a scalar enum defaults to radio at ${N} options and select at ${N + 1}`, () => {
    expect(scalarEnum(N)?.widget).toBe('radio')
    expect(scalarEnum(N + 1)?.widget).toBe('select')
  })

  it(`an array enum defaults to checkboxes at ${N} options and multiselect at ${N + 1}`, () => {
    expect(arrayEnum(N)?.widget).toBe('checkboxes')
    expect(arrayEnum(N + 1)?.widget).toBe('multiselect')
  })

  it('a radio derives one <input type=radio> per option, sharing the field name', () => {
    const tree = jsonSchemaToTree({
      type: 'object',
      properties: { pick: { type: 'string', enum: ['a', 'b'] } },
      required: ['pick'],
    })
    const control = choicegroupCtl(tree.getField('pick'))
    expect(control.multiple).toBe(false)
    expect(control.role).toBe('radiogroup')
    expect(control.labelledBy).toBe('pick-label')
    expect(control.options).toEqual([
      {
        attrs: {
          id: 'pick-0',
          name: 'pick',
          type: 'radio',
          value: 'a',
          required: true,
        },
        label: 'a',
      },
      {
        attrs: {
          id: 'pick-1',
          name: 'pick',
          type: 'radio',
          value: 'b',
          required: true,
        },
        label: 'b',
      },
    ])
    // The caption is a labelling target (`id`) named by the group's
    // `aria-labelledby` (bd l8j) — no dangling `for`, no first-option-select
    // side effect. Its id equals the control's `labelledBy`.
    expect(tree.getField('pick')?.parts.label.attrs).toEqual({
      id: 'pick-label',
    })
  })

  it('a checkbox group derives <input type=checkbox> per option and does NOT set required', () => {
    // "at least one" is not natively expressible on a checkbox group, so `required`
    // is left to the side-loaded validator (ADR 019) — unlike the radio group.
    const tree = jsonSchemaToTree({
      type: 'object',
      properties: {
        pick: { type: 'array', items: { type: 'string', enum: ['a', 'b'] } },
      },
      required: ['pick'],
    })
    const control = choicegroupCtl(tree.getField('pick'))
    expect(control.multiple).toBe(true)
    // A checkbox group is ARIA `group` (there is no `checkboxgroup` role).
    expect(control.role).toBe('group')
    expect(control.labelledBy).toBe('pick-label')
    expect(control.options).toEqual([
      {
        attrs: { id: 'pick-0', name: 'pick', type: 'checkbox', value: 'a' },
        label: 'a',
      },
      {
        attrs: { id: 'pick-1', name: 'pick', type: 'checkbox', value: 'b' },
        label: 'b',
      },
    ])
    expect(tree.getField('pick')?.parts.label.attrs).toEqual({
      id: 'pick-label',
    })
  })

  it('the heuristic is overridable — a resolver forces select on a small enum', () => {
    const toSelect: PresentationResolver = (f) =>
      f.path === 'pick' ? { widget: 'select' } : undefined
    const tree = present(
      jsonSchemaToTree({
        type: 'object',
        properties: { pick: { type: 'string', enum: ['a', 'b'] } },
      }),
      layered(defaultPresentation, toSelect)
    )
    const pick = tree.getField('pick')
    expect(pick?.widget).toBe('select')
    expect(selectCtl(pick).options.map((o) => o.value)).toEqual(['a', 'b'])
  })
})
