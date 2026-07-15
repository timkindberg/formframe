// The generic typed binding (ADR 048): `FieldProps`/`GroupProps` narrow off a
// resolved `FormShape` alone — NO front-end import here. This is the proof that
// React binds off the tree's brand generically (so `react-jsonschema` /
// `react-zod` never need to exist): a hand-written `FormShape` drives the same
// path/value/parts narrowing a real `jsonSchemaToTree`/`zodToTree` brand would.

import { describe, expectTypeOf, it } from 'vitest'
import type { FieldControl, FormShape } from '@formframe/core'
import type {
  ArrayProps,
  ControlProps,
  FieldProps,
  GroupProps,
  TypedRuleRegistrar,
} from './useRenderNodeRules'

// A synthetic resolved surface — the shape a front-end would brand onto a tree.
type TS = {
  fields: {
    name: { value: string; widget: 'input'; description: 'present' }
    plan: { value: 'free' | 'pro'; widget: 'radio'; description: 'absent' }
    bio: { value: string; widget: 'textarea'; description: 'optional' }
  }
  groups: { address: { description: 'absent' } }
  arrays: { tags: { description: 'optional' } }
}

// The synthetic surface is a valid `FormShape` (subtype of the neutral contract).
const _isFormShape: TS extends FormShape ? true : never = true
void _isFormShape

type Input = Extract<FieldControl, { kind: 'input' }>
type Choicegroup = Extract<FieldControl, { kind: 'choicegroup' }>
type Textarea = Extract<FieldControl, { kind: 'textarea' }>

describe('useRenderNodeRules binds off a FormShape generically (ADR 048)', () => {
  it('value narrows off the shape (but is | undefined until form-state lands, bd bh7.7)', () => {
    // The schema type is preserved AND `| undefined` is added, so a handler must
    // guard rather than trust a value the uncontrolled runtime does not yet pass.
    expectTypeOf<FieldProps<TS, 'name'>['value']>().toEqualTypeOf<
      string | undefined
    >()
    expectTypeOf<FieldProps<TS, 'plan'>['value']>().toEqualTypeOf<
      'free' | 'pro' | undefined
    >()
  })

  it('the Control part is pre-narrowed by the widget (via Core Stage B)', () => {
    // input widget → input control; radio → choicegroup; textarea → textarea.
    expectTypeOf<
      Parameters<
        NonNullable<
          Parameters<FieldProps<TS, 'name'>['parts']['Control']>[0]['render']
        >
      >[0]
    >().toEqualTypeOf<Input>()
    expectTypeOf<
      Parameters<
        NonNullable<
          Parameters<FieldProps<TS, 'plan'>['parts']['Control']>[0]['render']
        >
      >[0]
    >().toEqualTypeOf<Choicegroup>()
    expectTypeOf<
      Parameters<
        NonNullable<
          Parameters<FieldProps<TS, 'bio'>['parts']['Control']>[0]['render']
        >
      >[0]
    >().toEqualTypeOf<Textarea>()
  })

  it('the Description slot follows the description state', () => {
    // present → required slot; absent → omitted; optional → possibly-undefined.
    expectTypeOf<FieldProps<TS, 'name'>['parts']>().toHaveProperty(
      'Description'
    )
    expectTypeOf<FieldProps<TS, 'plan'>['parts']>().not.toHaveProperty(
      'Description'
    )
    expectTypeOf<FieldProps<TS, 'bio'>['parts']>().toHaveProperty('Description')
    expectTypeOf<
      undefined extends FieldProps<TS, 'bio'>['parts']['Description']
        ? true
        : false
    >().toEqualTypeOf<true>()
  })

  it('the registrar accepts only real field/group/array paths', () => {
    expectTypeOf<
      Parameters<TypedRuleRegistrar<TS>['field']>[0]
    >().toEqualTypeOf<'name' | 'plan' | 'bio'>()
    expectTypeOf<
      Parameters<TypedRuleRegistrar<TS>['group']>[0]
    >().toEqualTypeOf<'address'>()
    expectTypeOf<
      Parameters<TypedRuleRegistrar<TS>['array']>[0]
    >().toEqualTypeOf<'tags'>()
  })

  it('group / array props expose caption parts + children', () => {
    expectTypeOf<GroupProps<TS, 'address'>['parts']>().toHaveProperty('Label')
    expectTypeOf<ArrayProps<TS, 'tags'>['parts']>().toHaveProperty('Label')
    expectTypeOf<ArrayProps<TS, 'tags'>>().toHaveProperty('children')
  })

  it('control(kind) narrows the Control part by archetype (path/value stay wide)', () => {
    // A control selector spans many paths, so `Control` is narrowed to the kind
    // while `path`/`value` stay wide (bd bh7.6).
    expectTypeOf<
      Parameters<
        NonNullable<
          Parameters<
            ControlProps<'choicegroup'>['parts']['Control']
          >[0]['render']
        >
      >[0]
    >().toEqualTypeOf<Choicegroup>()
    expectTypeOf<ControlProps<'input'>['value']>().toEqualTypeOf<unknown>()
    expectTypeOf<ControlProps<'input'>['path']>().toEqualTypeOf<string>()
  })

  it('the cross-node selectors are present (no typing cliff, bd bh7.6)', () => {
    // control / allFields / allGroups / allArrays / where / default all exist on
    // the typed registrar (inherited un-narrowed from the neutral floor) — reaching
    // for them does not fall off the typed surface.
    expectTypeOf<TypedRuleRegistrar<TS>>().toHaveProperty('control')
    expectTypeOf<TypedRuleRegistrar<TS>>().toHaveProperty('allFields')
    expectTypeOf<TypedRuleRegistrar<TS>>().toHaveProperty('allGroups')
    expectTypeOf<TypedRuleRegistrar<TS>>().toHaveProperty('allArrays')
    expectTypeOf<TypedRuleRegistrar<TS>>().toHaveProperty('where')
    expectTypeOf<TypedRuleRegistrar<TS>>().toHaveProperty('default')
  })
})
