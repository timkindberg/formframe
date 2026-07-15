// Paired type-level + runtime conformance for path-narrowed controls (ADR 047 §4,
// bd y3t + the schema-matrix half of vg1). The control TYPE at a path
// (`ControlAt<S,P>` → routed through `DefaultWidgetAt` (Stage A) →
// `WidgetToControlKind` (Stage B, Core)) must match the control the RUNTIME
// `present()` pipeline actually produces at that path. Each case below asserts
// BOTH: `expectTypeOf<ControlKindAt<S,P>>` AND the runtime
// `jsonSchemaToTree(S).getField(P).parts.control.kind`. Any divergence between
// the Stage A type mirror and the runtime default rule turns this suite red.

import { describe, expect, expectTypeOf, it } from 'vitest'
import type { FieldControl, WidgetName } from '@formframe/core'
import {
  defaultPresentation,
  layered,
  overrideWidgets,
  present,
} from '@formframe/core'
import { jsonSchemaToTree } from './jsonSchemaToTree'
import type {
  ControlAt,
  ControlKindAt,
  DefaultWidgetAt,
  FieldPaths,
  GroupPaths,
  ValueAt,
} from './infer'

const matrix = {
  type: 'object',
  properties: {
    // plain string → input
    name: { type: 'string', title: 'Name' },
    // number → input
    age: { type: 'number', title: 'Age' },
    // enum of 3 (≤5) → radio → choicegroup
    plan: {
      type: 'string',
      title: 'Plan',
      enum: ['free', 'pro', 'enterprise'],
    },
    // enum of 6 (>5) → select
    color: {
      type: 'string',
      title: 'Color',
      enum: ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow'],
    },
    address: {
      type: 'object',
      title: 'Address',
      properties: { street: { type: 'string', title: 'Street' } },
      required: ['street'],
    },
  },
  required: ['name'],
} as const

type S = typeof matrix

type KindOfControl<K extends FieldControl['kind']> = K

describe('ControlAt — Stage A type mirror ↔ runtime present() (ADR 047 §4)', () => {
  const tree = jsonSchemaToTree(matrix)

  const cases: {
    path: 'name' | 'age' | 'plan' | 'color' | 'address.street'
    kind: FieldControl['kind']
  }[] = [
    { path: 'name', kind: 'input' },
    { path: 'age', kind: 'input' },
    { path: 'plan', kind: 'choicegroup' },
    { path: 'color', kind: 'select' },
    { path: 'address.street', kind: 'input' },
  ]

  it('runtime control kinds match the default rule', () => {
    for (const { path, kind } of cases) {
      expect(tree.getField(path)?.parts.control.kind).toBe(kind)
    }
  })

  it('type-level ControlKindAt matches the runtime kinds (paired)', () => {
    expectTypeOf<ControlKindAt<S, 'name'>>().toEqualTypeOf<
      KindOfControl<'input'>
    >()
    expectTypeOf<ControlKindAt<S, 'age'>>().toEqualTypeOf<
      KindOfControl<'input'>
    >()
    // The fix the seam exists for: an enum of ≤5 is a radio → choicegroup, NOT a
    // select (the old spike hardcoded enum→select — ADR 047 §4).
    expectTypeOf<ControlKindAt<S, 'plan'>>().toEqualTypeOf<
      KindOfControl<'choicegroup'>
    >()
    expectTypeOf<ControlKindAt<S, 'color'>>().toEqualTypeOf<
      KindOfControl<'select'>
    >()
    expectTypeOf<ControlKindAt<S, 'address.street'>>().toEqualTypeOf<
      KindOfControl<'input'>
    >()
  })

  it('ControlAt pre-narrows the FieldControl union member', () => {
    expectTypeOf<ControlAt<S, 'plan'>>().toEqualTypeOf<
      Extract<FieldControl, { kind: 'choicegroup' }>
    >()
    expectTypeOf<ControlAt<S, 'color'>>().toEqualTypeOf<
      Extract<FieldControl, { kind: 'select' }>
    >()
    // A default-widget input path: `control.attrs` is the input attrs, no guard.
    expectTypeOf<ControlAt<S, 'name'>>().toEqualTypeOf<
      Extract<FieldControl, { kind: 'input' }>
    >()
  })

  it('DefaultWidgetAt mirrors the widget names', () => {
    expectTypeOf<DefaultWidgetAt<S, 'plan'>>().toEqualTypeOf<'radio'>()
    expectTypeOf<DefaultWidgetAt<S, 'color'>>().toEqualTypeOf<'select'>()
    expectTypeOf<DefaultWidgetAt<S, 'name'>>().toEqualTypeOf<'input'>()
  })
})

describe('path/kind/value narrowing (ADR 047 §4)', () => {
  it('FieldPaths accepts only leaf paths; GroupPaths only object paths', () => {
    expectTypeOf<'name'>().toExtend<FieldPaths<S>>()
    expectTypeOf<'plan'>().toExtend<FieldPaths<S>>()
    expectTypeOf<'address.street'>().toExtend<FieldPaths<S>>()
    // 'address' is a group, not a field.
    expectTypeOf<'address'>().not.toExtend<FieldPaths<S>>()
    expectTypeOf<'address'>().toExtend<GroupPaths<S>>()
  })

  it('ValueAt reads the schema value type at a path', () => {
    expectTypeOf<ValueAt<S, 'name'>>().toEqualTypeOf<string>()
    expectTypeOf<ValueAt<S, 'age'>>().toEqualTypeOf<number>()
    expectTypeOf<ValueAt<S, 'plan'>>().toEqualTypeOf<
      'free' | 'pro' | 'enterprise'
    >()
  })
})

describe('typed per-path Overrides seam (ADR 047 §4, bd 4bv)', () => {
  // ONE `const` map drives BOTH the runtime resolver and the control TYPE.
  const overrides = {
    name: 'textarea',
    // Re-narrow the >5 enum from a select to a radio (choicegroup).
    color: 'radio',
  } as const satisfies Record<string, WidgetName>

  it('runtime: overrideWidgets re-presents the mapped paths', () => {
    const tree = present(
      jsonSchemaToTree(matrix),
      layered(defaultPresentation, overrideWidgets(overrides))
    )
    // name: input → textarea; color: select → choicegroup; unmapped stays default.
    expect(tree.getField('name')?.parts.control.kind).toBe('textarea')
    expect(tree.getField('color')?.parts.control.kind).toBe('choicegroup')
    expect(tree.getField('age')?.parts.control.kind).toBe('input')
  })

  it('type: ControlKindAt re-narrows with the SAME map (paired)', () => {
    type O = typeof overrides
    expectTypeOf<ControlKindAt<S, 'name', O>>().toEqualTypeOf<
      KindOfControl<'textarea'>
    >()
    expectTypeOf<ControlKindAt<S, 'color', O>>().toEqualTypeOf<
      KindOfControl<'choicegroup'>
    >()
    // An unmapped path still falls to the default rule.
    expectTypeOf<ControlKindAt<S, 'age', O>>().toEqualTypeOf<
      KindOfControl<'input'>
    >()
    // And the pre-narrowed member follows: `name` is now a textarea control.
    expectTypeOf<ControlAt<S, 'name', O>>().toEqualTypeOf<
      Extract<FieldControl, { kind: 'textarea' }>
    >()
  })
})

// Compile-time guardrails: a wrong-kind path is rejected by the split unions.
// @ts-expect-error — 'address' is a group path, not a field path
const _rejectGroupAsField: FieldPaths<S> = 'address'
// @ts-expect-error — 'name' is a field path, not a group path
const _rejectFieldAsGroup: GroupPaths<S> = 'name'
void _rejectGroupAsField
void _rejectFieldAsGroup
