// Paired type-level + runtime conformance for the shared widget→control-kind
// table (ADR 047 §4, bd vg1). The whole point of `WIDGET_CONTROL_KIND` is that
// the runtime archetype `deriveControl(f, w).kind` and the type-level
// `WidgetToControlKind<w>` read the SAME const, so they cannot drift. These tests
// pin BOTH sides over the full `WidgetName` matrix and fail the gate on any gap:
//   • the `satisfies Record<WidgetName, ControlKind>` on the const is the
//     compile-time exhaustiveness check (a new widget with no mapping won't
//     build);
//   • the runtime loop below proves every table entry equals the kind
//     `deriveControl` actually emits;
//   • the `expectTypeOf` block proves the type mirrors the same const.

import { describe, expect, expectTypeOf, it } from 'vitest'
import type { ControlKind, FieldFacts, WidgetName } from '../parser/nodeTypes'
import { WIDGET_CONTROL_KIND, deriveControl } from './present'
import type { WidgetToControlKind } from './present'

/** Minimal neutral facts carrying `choices` so the choice widgets build. */
function facts(): FieldFacts {
  return {
    path: 'x',
    label: 'X',
    required: false,
    valueShape: 'scalar',
    primitive: 'string',
    constraints: { required: false },
    attrs: { id: 'x', name: 'x' },
    origin: { source: 'test', schema: undefined },
    choices: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  }
}

const ALL_WIDGETS: WidgetName[] = [
  'input',
  'select',
  'multiselect',
  'textarea',
  'radio',
  'checkboxes',
]

describe('WIDGET_CONTROL_KIND (shared Stage B table)', () => {
  it('maps every WidgetName (runtime exhaustiveness)', () => {
    // The `satisfies` clause enforces this at compile time; this asserts the
    // literal set of keys matches the WidgetName union at runtime too, so a
    // widget added to the union without a table entry is caught in the gate.
    expect(Object.keys(WIDGET_CONTROL_KIND).sort()).toEqual(
      [...ALL_WIDGETS].sort()
    )
  })

  it('runtime deriveControl().kind equals the table for every widget', () => {
    for (const widget of ALL_WIDGETS) {
      const control = deriveControl(facts(), widget)
      expect(control).toBeDefined()
      expect(control?.kind).toBe(WIDGET_CONTROL_KIND[widget])
    }
  })

  it('table values are all valid ControlKinds', () => {
    const kinds: ControlKind[] = ['input', 'select', 'textarea', 'choicegroup']
    for (const widget of ALL_WIDGETS) {
      expect(kinds).toContain(WIDGET_CONTROL_KIND[widget])
    }
  })

  it('type-level WidgetToControlKind mirrors the runtime table', () => {
    expectTypeOf<WidgetToControlKind<'input'>>().toEqualTypeOf<'input'>()
    expectTypeOf<WidgetToControlKind<'select'>>().toEqualTypeOf<'select'>()
    expectTypeOf<WidgetToControlKind<'multiselect'>>().toEqualTypeOf<'select'>()
    expectTypeOf<WidgetToControlKind<'textarea'>>().toEqualTypeOf<'textarea'>()
    expectTypeOf<WidgetToControlKind<'radio'>>().toEqualTypeOf<'choicegroup'>()
    expectTypeOf<
      WidgetToControlKind<'checkboxes'>
    >().toEqualTypeOf<'choicegroup'>()
    // The union over all widgets is exactly the ControlKind set the table covers.
    expectTypeOf<WidgetToControlKind<WidgetName>>().toEqualTypeOf<ControlKind>()
  })
})
