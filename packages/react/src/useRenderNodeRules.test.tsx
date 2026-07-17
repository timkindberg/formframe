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
    // Asserted at the CALL SITE (not via `Parameters<>` introspection): each
    // `<Axis>PathArg` (bd q8v) lives in the CHECKED position of a generic method,
    // not the constraint, so the erased method type is not a plain union — the
    // call site is where the narrowing (and the cross-kind hint) actually shows up.
    // A function BODY type-checks whether or not it runs, so this builder is
    // declared and never invoked — purely a type-level probe (browser-mode
    // vitest actually executes the test body; a real registrar call would throw).
    const probe = (r: TypedRuleRegistrar<TS>): void => {
      r.field('name', () => null)
      r.field('plan', () => null)
      r.field('bio', () => null)
      r.group('address', () => null)
      r.array('tags', () => null)

      // A genuine typo falls through to the plain path union — same message as before.
      // @ts-expect-error 'nope' is not a field path
      r.field('nope', () => null)

      // Cross-kind: each names the RIGHT selector in the error, not just "not a
      // field/group/array path" (bd q8v — the DX gap Pocock's review flagged).
      // @ts-expect-error 'address' is a GROUP path — hints "use r.group()"
      r.field('address', () => null)
      // @ts-expect-error 'tags' is an ARRAY path — hints "use r.array()"
      r.field('tags', () => null)
      // @ts-expect-error 'name' is a FIELD path — hints "use r.field()"
      r.group('name', () => null)
      // @ts-expect-error 'tags' is an ARRAY path — hints "use r.array()"
      r.group('tags', () => null)
      // @ts-expect-error 'name' is a FIELD path — hints "use r.field()"
      r.array('name', () => null)
      // @ts-expect-error 'address' is a GROUP path — hints "use r.group()"
      r.array('address', () => null)
    }
    void probe
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
