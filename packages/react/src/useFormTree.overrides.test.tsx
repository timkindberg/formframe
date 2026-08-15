// bd bh7.8 — the `overrideWidgets` desync fix, end-to-end.
//
// Before this fix, `useInterceptRules(tree, …)` typed off the PRE-override tree
// while `<Fields>` rendered `useFormTree`'s re-presented `form`, so a mapped path
// could narrow to `choicegroup` in the handler while the DOM rendered `<textarea>`.
// The fix threads the SAME `overrideWidgets(map)` `const` through both halves: the
// runtime resolver re-presents the leaf, and the returned `form` carries a
// `FormShape` brand re-narrowed by that map. Type your binding off `form` and the
// control type is provably what renders.
//
// This test pins both halves off ONE map: the runtime `present()` control kinds and
// the type-level `TreeShapeOf<typeof form>` narrowing must agree, path-for-path.

import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  defaultPresentation,
  layered,
  overrideWidgets,
  present,
} from '@formframe/core'
import type {
  FieldControl,
  FormShape,
  TreeShapeOf,
  WidgetOverrideMap,
} from '@formframe/core'
import { jsonSchemaToTree } from '@formframe/input-jsonschema'
import { useFormTree } from './useFormTree'
import type { FieldProps } from './useInterceptRules'

const matrix = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' }, // input by default
    age: { type: 'number', title: 'Age' }, // input, unmapped
    color: {
      type: 'string',
      title: 'Color',
      enum: ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow'], // select by default
    },
  },
  required: ['name'],
} as const

// ONE map drives BOTH the runtime resolver and the compile-time brand.
const OVERRIDES = {
  name: 'textarea', // input → textarea
  color: 'radio', // select → choicegroup
} as const satisfies WidgetOverrideMap

// The control archetype a `FieldProps` Control part hands its render prop.
type ControlArg<
  TS extends FormShape,
  P extends keyof TS['fields'] & string,
> = Parameters<
  NonNullable<Parameters<FieldProps<TS, P>['parts']['Control']>[0]['render']>
>[0]

type Input = Extract<FieldControl, { kind: 'input' }>
type Textarea = Extract<FieldControl, { kind: 'textarea' }>
type Choicegroup = Extract<FieldControl, { kind: 'choicegroup' }>

describe('useFormTree threads overrideWidgets into the form brand (bd bh7.8)', () => {
  it('runtime: the re-presented tree renders the overridden controls', () => {
    const form = present(
      jsonSchemaToTree(matrix),
      layered(defaultPresentation, overrideWidgets(OVERRIDES))
    )
    expect(form.getField('name')?.parts.control.kind).toBe('textarea')
    expect(form.getField('color')?.parts.control.kind).toBe('choicegroup')
    expect(form.getField('age')?.parts.control.kind).toBe('input')
  })

  // Type-only probe (never invoked): a properly-named hook so rules-of-hooks is
  // satisfied. Mirrors exactly what a consumer writes — type off `form`, not the
  // pre-override input tree — and asserts the control narrows to the OVERRIDDEN
  // archetype, the same kind the runtime block above renders.
  function useOverrideTypeProbe() {
    const tree = jsonSchemaToTree(matrix)
    const { form: _form } = useFormTree(tree, {
      resolvePresentation: overrideWidgets(OVERRIDES),
    })
    type FShape = TreeShapeOf<typeof _form>

    // Mapped paths re-narrow to the override; unmapped stays the default rule.
    expectTypeOf<ControlArg<FShape, 'name'>>().toEqualTypeOf<Textarea>()
    expectTypeOf<ControlArg<FShape, 'color'>>().toEqualTypeOf<Choicegroup>()
    expectTypeOf<ControlArg<FShape, 'age'>>().toEqualTypeOf<Input>()
  }
  void useOverrideTypeProbe

  it('without overrides, form keeps the default-presentation brand', () => {
    // Type-only: an omitted resolver leaves the shape untouched (identity), so
    // typing off `form` equals typing off the input tree.
    function useNoOverrideTypeProbe() {
      const tree = jsonSchemaToTree(matrix)
      const { form: _form } = useFormTree(tree)
      type FShape = TreeShapeOf<typeof _form>
      expectTypeOf<ControlArg<FShape, 'name'>>().toEqualTypeOf<Input>()
      expectTypeOf<ControlArg<FShape, 'color'>>().toEqualTypeOf<
        Extract<FieldControl, { kind: 'select' }>
      >()
    }
    void useNoOverrideTypeProbe
    expect(true).toBe(true)
  })
})
