// End-to-end FormShape conformance oracle (bd jsonschema-form-bh7.4).
//
// Each front-end returns `present(...) as unknown as TypedTree<FormShapeOf<S>,
// Origin>` — that cast is UNCHECKED. Nothing else asserts that the `FormShape` a
// front-end brands onto a REAL tree corresponds, path-for-path, to what React's
// binding (`FieldProps` / `TypedRuleRegistrar`) reads back out. If a front-end's
// `FormShapeOf` drifts from reality, everything still compiles and the binding
// silently lies. This is the root-of-trust for the whole typed binding (ADR 048).
//
// This test closes that gap. Unlike `useRenderNodeRules.test.tsx` (which drives
// off a HAND-WRITTEN synthetic `FormShape`) and `infer.control.test.ts` (which
// probes the raw `infer.ts` helpers), it starts from a real
// `jsonSchemaToTree(schema)` / `zodToTree(schema)`, extracts the branded shape
// with `ShapeOf<typeof tree>` — the exact type a consumer sees — and asserts, per
// path:
//   1. value        — FieldProps<Shape,P>['value'] matches the schema value type
//                      (`| undefined` per bd bh7.7).
//   2. widget→control — the Control part narrows to the archetype the RUNTIME
//                      `tree.getField(P).parts.control.kind` actually produces
//                      (paired, like infer.control.test.ts but through the
//                      React-facing surface, not the raw helpers).
//   3. description   — parts.Description present/absent/optional matching the
//                      front-end's DescriptionStateOf (`present`/`absent` for JSON
//                      Schema, `optional` for Zod).
//   4. path sets     — TypedRuleRegistrar<Shape>['field'|'group'|'array'] accept
//                      exactly the real field/group/array paths.
//
// Because everything flows from `ShapeOf<typeof jsonSchemaToTree(schema)>`, this
// breaks the moment a front-end's return brand stops matching reality: drop the
// cast and it degrades to the base `FormShape` (value collapses to `unknown`);
// brand the wrong control archetype and the runtime pairing goes red.
//
// It lives in packages/react because this is the ONLY package that legitimately
// depends on BOTH a front-end (devDep) and React's binding types — the direction
// the cast's root-of-trust actually flows (a front-end must not import React).

import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type { FieldControl, FormShape, ShapeOf } from '@formframe/core'
import { jsonSchemaToTree } from '@formframe/input-jsonschema'
import type {
  ArrayPaths as JsonArrayPaths,
  FieldPaths as JsonFieldPaths,
  GroupPaths as JsonGroupPaths,
} from '@formframe/input-jsonschema'
import { zodToTree } from '@formframe/input-zod'
import type {
  ArrayPaths as ZodArrayPaths,
  FieldPaths as ZodFieldPaths,
  GroupPaths as ZodGroupPaths,
} from '@formframe/input-zod'
import type {
  FieldProps,
  GroupProps,
  TypedRuleRegistrar,
} from './useRenderNodeRules'

// The control archetype a `FieldProps` Control part hands its render prop — the
// exact narrowing a customize handler sees off the branded tree (mirrors the
// extraction in useRenderNodeRules.test.tsx).
type ControlArg<
  TS extends FormShape,
  P extends keyof TS['fields'] & string,
> = Parameters<
  NonNullable<Parameters<FieldProps<TS, P>['parts']['Control']>[0]['render']>
>[0]

type Input = Extract<FieldControl, { kind: 'input' }>
type Choicegroup = Extract<FieldControl, { kind: 'choicegroup' }>
type Select = Extract<FieldControl, { kind: 'select' }>

// A matrix expressed identically in both front-ends: a plain string (input) WITH
// a description, a number (input) WITHOUT one, a small enum (radio→choicegroup), a
// large enum (select), a nested object (group), and a scalar array (array path).
// Both compile to equivalent trees, so the two halves below assert the SAME facts
// — the divergence is confined to descriptions (JSON Schema proves presence; Zod
// keeps them in a runtime registry → an always-optional slot).

// ── JSON Schema front-end ────────────────────────────────────────────────────

const jsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name', description: 'Your full name' },
    age: { type: 'number', title: 'Age' },
    plan: {
      type: 'string',
      title: 'Plan',
      enum: ['free', 'pro', 'enterprise'],
    },
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
    tags: { type: 'array', title: 'Tags', items: { type: 'string' } },
  },
  required: ['name'],
} as const

const jsonTree = jsonSchemaToTree(jsonSchema)
type JShape = ShapeOf<typeof jsonTree>

describe('FormShape oracle: jsonSchemaToTree brand ↔ FieldProps (bd bh7.4)', () => {
  it('value narrows off the BRANDED tree (| undefined until form-state lands, bh7.7)', () => {
    expectTypeOf<FieldProps<JShape, 'name'>['value']>().toEqualTypeOf<
      string | undefined
    >()
    expectTypeOf<FieldProps<JShape, 'age'>['value']>().toEqualTypeOf<
      number | undefined
    >()
    expectTypeOf<FieldProps<JShape, 'plan'>['value']>().toEqualTypeOf<
      'free' | 'pro' | 'enterprise' | undefined
    >()
    expectTypeOf<FieldProps<JShape, 'address.street'>['value']>().toEqualTypeOf<
      string | undefined
    >()
  })

  // The paired check: the Control archetype the branded shape narrows to MUST be
  // the one the runtime present() pipeline actually produces. Same `kind` literal
  // drives both the runtime loop and the type assertions (root-of-trust closure).
  const controlCases: {
    path: 'name' | 'age' | 'plan' | 'color' | 'address.street'
    kind: FieldControl['kind']
  }[] = [
    { path: 'name', kind: 'input' },
    { path: 'age', kind: 'input' },
    { path: 'plan', kind: 'choicegroup' },
    { path: 'color', kind: 'select' },
    { path: 'address.street', kind: 'input' },
  ]

  it('runtime control kinds match the branded widget→control narrowing', () => {
    for (const { path, kind } of controlCases) {
      expect(jsonTree.getField(path)?.parts.control.kind).toBe(kind)
    }
  })

  it('the Control part narrows to the runtime archetype (paired, via FieldProps)', () => {
    expectTypeOf<ControlArg<JShape, 'name'>>().toEqualTypeOf<Input>()
    expectTypeOf<ControlArg<JShape, 'age'>>().toEqualTypeOf<Input>()
    expectTypeOf<ControlArg<JShape, 'plan'>>().toEqualTypeOf<Choicegroup>()
    expectTypeOf<ControlArg<JShape, 'color'>>().toEqualTypeOf<Select>()
    expectTypeOf<ControlArg<JShape, 'address.street'>>().toEqualTypeOf<Input>()
  })

  it('Description presence tracks the schema literal (present iff declared)', () => {
    // `name` declares a description → required slot; `age` does not → omitted.
    expectTypeOf<FieldProps<JShape, 'name'>['parts']>().toHaveProperty(
      'Description'
    )
    expectTypeOf<FieldProps<JShape, 'age'>['parts']>().not.toHaveProperty(
      'Description'
    )
    // Present (not merely optional): `undefined` is NOT assignable to the slot.
    expectTypeOf<
      undefined extends FieldProps<JShape, 'name'>['parts']['Description']
        ? true
        : false
    >().toEqualTypeOf<false>()
  })

  it('the registrar accepts exactly the real field/group/array paths', () => {
    expectTypeOf<
      Parameters<TypedRuleRegistrar<JShape>['field']>[0]
    >().toEqualTypeOf<JsonFieldPaths<typeof jsonSchema>>()
    expectTypeOf<
      Parameters<TypedRuleRegistrar<JShape>['group']>[0]
    >().toEqualTypeOf<JsonGroupPaths<typeof jsonSchema>>()
    // Arrays aren't in the registrar yet (bd bh7.6), but the branded shape must
    // still carry exactly the real array paths for that binding to land on.
    expectTypeOf<keyof JShape['arrays'] & string>().toEqualTypeOf<
      JsonArrayPaths<typeof jsonSchema>
    >()
    // Sanity: 'address' is a group, not a field; 'tags' is an array, not a field.
    expectTypeOf<'address'>().not.toExtend<
      Parameters<TypedRuleRegistrar<JShape>['field']>[0]
    >()
    expectTypeOf<'tags'>().not.toExtend<
      Parameters<TypedRuleRegistrar<JShape>['field']>[0]
    >()
  })

  it('group props expose caption parts; a plain group omits Description', () => {
    expectTypeOf<GroupProps<JShape, 'address'>['parts']>().toHaveProperty(
      'Label'
    )
    expectTypeOf<GroupProps<JShape, 'address'>['parts']>().not.toHaveProperty(
      'Description'
    )
  })
})

// ── Zod front-end (same matrix; descriptions diverge to an optional slot) ──────

const zodSchema = z.object({
  name: z.string().describe('Your full name'),
  age: z.number(),
  plan: z.enum(['free', 'pro', 'enterprise']),
  color: z.enum(['red', 'green', 'blue', 'cyan', 'magenta', 'yellow']),
  address: z.object({ street: z.string() }),
  tags: z.array(z.string()),
})

const zodTree = zodToTree(zodSchema)
type ZShape = ShapeOf<typeof zodTree>

describe('FormShape oracle: zodToTree brand ↔ FieldProps (bd bh7.4)', () => {
  it('value narrows off the BRANDED tree (| undefined until form-state lands, bh7.7)', () => {
    expectTypeOf<FieldProps<ZShape, 'name'>['value']>().toEqualTypeOf<
      string | undefined
    >()
    expectTypeOf<FieldProps<ZShape, 'age'>['value']>().toEqualTypeOf<
      number | undefined
    >()
    expectTypeOf<FieldProps<ZShape, 'plan'>['value']>().toEqualTypeOf<
      'free' | 'pro' | 'enterprise' | undefined
    >()
    expectTypeOf<FieldProps<ZShape, 'address.street'>['value']>().toEqualTypeOf<
      string | undefined
    >()
  })

  const controlCases: {
    path: 'name' | 'age' | 'plan' | 'color' | 'address.street'
    kind: FieldControl['kind']
  }[] = [
    { path: 'name', kind: 'input' },
    { path: 'age', kind: 'input' },
    { path: 'plan', kind: 'choicegroup' },
    { path: 'color', kind: 'select' },
    { path: 'address.street', kind: 'input' },
  ]

  it('runtime control kinds match the branded widget→control narrowing', () => {
    for (const { path, kind } of controlCases) {
      expect(zodTree.getField(path)?.parts.control.kind).toBe(kind)
    }
  })

  it('the Control part narrows to the runtime archetype (paired, via FieldProps)', () => {
    expectTypeOf<ControlArg<ZShape, 'name'>>().toEqualTypeOf<Input>()
    expectTypeOf<ControlArg<ZShape, 'age'>>().toEqualTypeOf<Input>()
    expectTypeOf<ControlArg<ZShape, 'plan'>>().toEqualTypeOf<Choicegroup>()
    expectTypeOf<ControlArg<ZShape, 'color'>>().toEqualTypeOf<Select>()
    expectTypeOf<ControlArg<ZShape, 'address.street'>>().toEqualTypeOf<Input>()
  })

  it('Description is an always-present OPTIONAL slot (runtime-registry only)', () => {
    // Zod cannot prove presence, so every field carries a possibly-undefined
    // slot — even `age`, which JSON Schema omits. Guard before placing it.
    expectTypeOf<FieldProps<ZShape, 'name'>['parts']>().toHaveProperty(
      'Description'
    )
    expectTypeOf<FieldProps<ZShape, 'age'>['parts']>().toHaveProperty(
      'Description'
    )
    expectTypeOf<
      undefined extends FieldProps<ZShape, 'name'>['parts']['Description']
        ? true
        : false
    >().toEqualTypeOf<true>()
  })

  it('the registrar accepts exactly the real field/group/array paths', () => {
    expectTypeOf<
      Parameters<TypedRuleRegistrar<ZShape>['field']>[0]
    >().toEqualTypeOf<ZodFieldPaths<typeof zodSchema>>()
    expectTypeOf<
      Parameters<TypedRuleRegistrar<ZShape>['group']>[0]
    >().toEqualTypeOf<ZodGroupPaths<typeof zodSchema>>()
    expectTypeOf<keyof ZShape['arrays'] & string>().toEqualTypeOf<
      ZodArrayPaths<typeof zodSchema>
    >()
    expectTypeOf<'address'>().not.toExtend<
      Parameters<TypedRuleRegistrar<ZShape>['field']>[0]
    >()
    expectTypeOf<'tags'>().not.toExtend<
      Parameters<TypedRuleRegistrar<ZShape>['field']>[0]
    >()
  })

  it('group props expose caption parts; the group Description is optional', () => {
    expectTypeOf<GroupProps<ZShape, 'address'>['parts']>().toHaveProperty(
      'Label'
    )
    expectTypeOf<GroupProps<ZShape, 'address'>['parts']>().toHaveProperty(
      'Description'
    )
    expectTypeOf<
      undefined extends GroupProps<ZShape, 'address'>['parts']['Description']
        ? true
        : false
    >().toEqualTypeOf<true>()
  })
})
