// Paired type-level + runtime conformance for the Zod inference layer (ADR 041 §4,
// bd jsonschema-form-bh7.1) — the Zod sister of input-jsonschema's
// infer.control.test.ts. The control TYPE at a path (`ControlAt<S,P>` → Stage A
// `DefaultWidgetAt` → Stage B `WidgetToControlKind`, Core) must match the control
// the RUNTIME `zodToTree`/`present()` pipeline produces at that path. Each case
// asserts BOTH. The two proven Zod divergences are locked here too: enum arity IS
// recoverable (radio ≤5 vs select >5); a `.describe()` field still exposes NO
// static `Description` part (descriptions are runtime-registry only).

import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type { FieldControl, WidgetName } from '@formframe/core'
import {
  defaultPresentation,
  layered,
  overrideWidgets,
  present,
} from '@formframe/core'
import { zodToTree } from './zodToTree'
import type {
  ControlAt,
  ControlKindAt,
  DefaultWidgetAt,
  FieldPartsFor,
  FieldPaths,
  GroupPaths,
  ValueAt,
} from './infer'

const matrix = z.object({
  // plain string → input
  name: z.string(),
  // number → input
  age: z.number(),
  // enum of 3 (≤5) → radio → choicegroup
  plan: z.enum(['free', 'pro', 'enterprise']),
  // enum of 6 (>5) → select
  color: z.enum(['red', 'green', 'blue', 'cyan', 'magenta', 'yellow']),
  // optional wrapper widens the value with `undefined`
  nick: z.string().optional(),
  // a description set via `.describe()` — invisible to the static type
  bio: z.string().describe('About you'),
  address: z.object({ street: z.string() }),
})

type S = typeof matrix

type KindOfControl<K extends FieldControl['kind']> = K

describe('ControlAt — Stage A type mirror ↔ runtime present() (Zod, ADR 041 §4)', () => {
  const tree = zodToTree(matrix)

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
    // Enum of ≤5 is a radio → choicegroup (arity IS recoverable in Zod).
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
    expectTypeOf<ControlAt<S, 'name'>>().toEqualTypeOf<
      Extract<FieldControl, { kind: 'input' }>
    >()
  })

  it('DefaultWidgetAt mirrors the widget names (enum arity recoverable)', () => {
    expectTypeOf<DefaultWidgetAt<S, 'plan'>>().toEqualTypeOf<'radio'>()
    expectTypeOf<DefaultWidgetAt<S, 'color'>>().toEqualTypeOf<'select'>()
    expectTypeOf<DefaultWidgetAt<S, 'name'>>().toEqualTypeOf<'input'>()
  })
})

describe('path/kind/value narrowing (Zod, ADR 041 §4)', () => {
  it('FieldPaths accepts only leaf paths; GroupPaths only object paths', () => {
    expectTypeOf<'name'>().toExtend<FieldPaths<S>>()
    expectTypeOf<'plan'>().toExtend<FieldPaths<S>>()
    expectTypeOf<'address.street'>().toExtend<FieldPaths<S>>()
    // 'address' is a group, not a field.
    expectTypeOf<'address'>().not.toExtend<FieldPaths<S>>()
    expectTypeOf<'address'>().toExtend<GroupPaths<S>>()
  })

  it('ValueAt reads the value type at a path (z.infer, wrappers widen)', () => {
    expectTypeOf<ValueAt<S, 'name'>>().toEqualTypeOf<string>()
    expectTypeOf<ValueAt<S, 'age'>>().toEqualTypeOf<number>()
    expectTypeOf<ValueAt<S, 'plan'>>().toEqualTypeOf<
      'free' | 'pro' | 'enterprise'
    >()
    // `.optional()` widens with `undefined`.
    expectTypeOf<ValueAt<S, 'nick'>>().toEqualTypeOf<string | undefined>()
  })
})

describe('Zod divergence: descriptions are runtime-only → optional slot (bd jsonschema-form-bh7)', () => {
  it('every field exposes Description as an OPTIONAL (possibly-undefined) slot', () => {
    // Proven by probe: `.describe()`/`.meta()` yield a type identical to a plain
    // schema, so Zod cannot prove presence. Unlike JSON Schema (present iff
    // declared), the slot is always PRESENT but OPTIONAL — guard it, it may
    // render nothing.
    expectTypeOf<FieldPartsFor<S, 'bio'>>().toHaveProperty('Description')
    expectTypeOf<FieldPartsFor<S, 'name'>>().toHaveProperty('Description')
    // Optional: `undefined` is assignable to the slot's value type.
    expectTypeOf<
      undefined extends FieldPartsFor<S, 'bio'>['Description'] ? true : false
    >().toEqualTypeOf<true>()
    // The always-present parts still hold.
    expectTypeOf<FieldPartsFor<S, 'bio'>>().toHaveProperty('Label')
    expectTypeOf<FieldPartsFor<S, 'bio'>>().toHaveProperty('Control')
    expectTypeOf<FieldPartsFor<S, 'bio'>>().toHaveProperty('Errors')
  })
})

describe('typed per-path Overrides seam (Zod, ADR 041 §4)', () => {
  // ONE `const` map drives BOTH the runtime resolver and the control TYPE.
  const overrides = {
    name: 'textarea',
    color: 'radio',
  } as const satisfies Record<string, WidgetName>

  it('runtime: overrideWidgets re-presents the mapped paths', () => {
    const tree = present(
      zodToTree(matrix),
      layered(defaultPresentation, overrideWidgets(overrides))
    )
    expect(tree.getField('name')?.parts.control.kind).toBe('textarea')
    expect(tree.getField('color')?.parts.control.kind).toBe('choicegroup')
    expect(tree.getField('age')?.parts.control.kind).toBe('input')
  })

  it('type: ControlKindAt re-narrows with the override map', () => {
    type O = typeof overrides
    expectTypeOf<ControlKindAt<S, 'name', O>>().toEqualTypeOf<
      KindOfControl<'textarea'>
    >()
    expectTypeOf<ControlKindAt<S, 'color', O>>().toEqualTypeOf<
      KindOfControl<'choicegroup'>
    >()
    expectTypeOf<ControlKindAt<S, 'age', O>>().toEqualTypeOf<
      KindOfControl<'input'>
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
