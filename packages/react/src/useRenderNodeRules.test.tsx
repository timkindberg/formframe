// The generic typed binding (ADR 042): `FieldProps`/`GroupProps` narrow off a
// resolved `FormShape` alone — NO front-end import here. This is the proof that
// React binds off the tree's brand generically (so `react-jsonschema` /
// `react-zod` never need to exist): a hand-written `FormShape` drives the same
// path/value/parts narrowing a real `jsonSchemaToTree`/`zodToTree` brand would.

import { describe, expectTypeOf, it } from 'vitest'
import type { DescriptionState, FieldControl, FormShape } from '@formframe/core'
import type {
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
  arrays: Record<string, { description: DescriptionState }>
}

// The synthetic surface is a valid `FormShape` (subtype of the neutral contract).
const _isFormShape: TS extends FormShape ? true : never = true
void _isFormShape

type Input = Extract<FieldControl, { kind: 'input' }>
type Choicegroup = Extract<FieldControl, { kind: 'choicegroup' }>
type Textarea = Extract<FieldControl, { kind: 'textarea' }>

describe('useRenderNodeRules binds off a FormShape generically (ADR 042)', () => {
  it('value narrows off the shape', () => {
    expectTypeOf<FieldProps<TS, 'name'>['value']>().toEqualTypeOf<string>()
    expectTypeOf<FieldProps<TS, 'plan'>['value']>().toEqualTypeOf<
      'free' | 'pro'
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

  it('the registrar accepts only real field/group paths', () => {
    expectTypeOf<
      Parameters<TypedRuleRegistrar<TS>['field']>[0]
    >().toEqualTypeOf<'name' | 'plan' | 'bio'>()
    expectTypeOf<
      Parameters<TypedRuleRegistrar<TS>['group']>[0]
    >().toEqualTypeOf<'address'>()
  })

  it('group props expose caption parts', () => {
    expectTypeOf<GroupProps<TS, 'address'>['parts']>().toHaveProperty('Label')
  })
})
