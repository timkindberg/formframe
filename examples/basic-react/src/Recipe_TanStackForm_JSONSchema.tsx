// RECIPE: TanStack Form as the form-state layer, over JSON Schema + AJV.
//
// Files to copy — this one plus the layers beneath it:
//
//   fieldPresentation.recipe.tsx       shared blank/match helpers + ValidationSummary
//   tanstackFieldControls.recipe.tsx   TanStack control bindings
//   ajvValidator.recipe.ts             AJV → FormFrame Validator helper
//   this file                          the JSON Schema + AJV half
//
// Only this file (+ ajvValidator) knows about JSON Schema or AJV. Swap it for
// Recipe_TanStackForm_Zod and you get the same form over Zod with the shared
// layers untouched — the same way the RHF twins share their controls.
//
// The shape of it:
//
//   schema ─→ jsonSchemaToTree(schema) ──→ <SchemaFields> renders the fields
//   schema ─→ createAjvValidator(schema) → toStandardSchema → one form-level
//             `onDynamic` validator (TanStack consumes Standard Schemas
//             directly — no resolver adapter)
//
// TanStack specifics worth knowing before you adapt this:
//
//   • Validators return issues only — never the coerced/transformed value. So
//     AJV's "18" → 18 coercion can't reach form state mid-typing; `onSubmit`
//     re-runs the validator once more and reads `result.data`. (Yes, that
//     validates twice on submit — the price of coercion recovery.)
//   • Display timing is `validationLogic: revalidateLogic()` — TanStack's
//     recommended default, no arguments: quiet until the first submit
//     attempt, then revalidate on change. Same observable behavior as RHF's
//     default mode, which `revalidateLogic` explicitly exists to emulate.
//     Want blur-gated reveal? `revalidateLogic({ mode: 'blur' })`.
//   • Seed `defaultValues` with `{}` for EVERY nested group. TanStack's
//     values are exactly your defaults: with `address` missing entirely, a
//     required failure lands on the group itself (which no field control
//     renders); with `address: {}` it lands on `address.street`, a real field
//     with an error slot.
import { useState } from 'react'
import { useForm, revalidateLogic, useStore } from '@tanstack/react-form'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { toStandardSchema } from '@formframe/core'
import { jsonSchemaToTree, type FormShapeOf } from '@formframe/input-jsonschema'
import type { InferData, JSONSchema } from '@formframe/input-jsonschema'
import {
  SchemaFields,
  useRenderNodeRules,
  type TypedRuleRegistrar,
} from '@formframe/renderer-react'
import { createAjvValidator } from './ajvValidator.recipe'
import { ValidationSummary, withMatchRule } from './fieldPresentation.recipe'
import {
  TanStackFormProvider,
  InputControl,
  SelectControl,
  ChoiceGroupControl,
  tanstackFieldMetaToErrors,
} from './tanstackFieldControls.recipe'

const schema = {
  type: 'object',
  required: [
    'firstName',
    'email',
    'contactMethod',
    'password',
    'confirmPassword',
    'address',
  ],
  properties: {
    firstName: {
      type: 'string',
      title: 'First name',
      description: 'At least 2 characters.',
      minLength: 2,
    },
    email: { type: 'string', format: 'email', title: 'Email' },
    age: {
      type: 'number',
      title: 'Age',
      description: 'Must be 18 or older (string coerced by the validator).',
      minimum: 18,
    },
    // Widget defaults are option-count driven: 6 options → a compact <select>;
    // `contactMethod`'s 2 options → an inline radio group.
    plan: {
      type: 'string',
      title: 'Plan',
      enum: ['free', 'starter', 'pro', 'team', 'business', 'enterprise'],
    },
    contactMethod: {
      type: 'string',
      title: 'Preferred contact method',
      enum: ['email', 'phone'],
    },
    password: { type: 'string', title: 'Password', minLength: 8 },
    confirmPassword: { type: 'string', title: 'Confirm password' },
    address: {
      type: 'object',
      title: 'Address',
      properties: {
        street: { type: 'string', title: 'Street' },
        city: { type: 'string', title: 'City' },
      },
      required: ['street'],
    },
  },
} as const satisfies JSONSchema

type Shape = FormShapeOf<typeof schema>
type Data = InferData<typeof schema>

const tree = jsonSchemaToTree(schema)
// Plain JSON Schema has no "field A must equal field B" keyword, so the rule
// is composed onto the validator (shared helper — Zod does this natively with
// `.refine`, see Recipe_TanStackForm_Zod).
const validator = withMatchRule(
  createAjvValidator(schema),
  'confirmPassword',
  'password',
  'Passwords must match.'
)
// TanStack consumes any Standard Schema as a validator, so FormFrame's bridge
// plugs straight in. One deliberate cast: FormFrame's `Validator` accepts
// `unknown` input by design, and TanStack's validator slot wants the form's
// data type on the input side.
const standardSchema = toStandardSchema(validator) as StandardSchemaV1<
  Data,
  Data
>

const tanStackRules = (r: TypedRuleRegistrar<Shape>): void => {
  r.control('input', InputControl)
  r.control('select', SelectControl)
  r.control('choicegroup', ChoiceGroupControl)
}

export default function App() {
  const [submitted, setSubmitted] = useState<Data | null>(null)
  const form = useForm({
    // TanStack wants full TFormData up front; a form genuinely starts empty,
    // so the cast is the pragmatic move. Seed `{}` for every nested group —
    // see the header for why.
    defaultValues: { address: {} } as Data,
    validators: { onDynamic: standardSchema },
    validationLogic: revalidateLogic(),
    onSubmit: ({ value }) => {
      // Second validator run, deliberately: TanStack validators return issues
      // only, so this is where AJV's coercion ("18" → 18) is recovered.
      const result = validator(value)
      setSubmitted(result.data ?? value)
    },
  })
  const intercept = useRenderNodeRules(tree, tanStackRules)
  const fieldMeta = useStore(form.store, (s) => s.fieldMeta)

  return (
    <div>
      <h1>TanStack Form as the form-state layer (recipe)</h1>
      <p>
        The TanStack twin of examples 12/12B: TanStack Form owns the form state
        through controlled binds; FormFrame renders the fields from the same
        JSON Schema; the same AJV validator plugs in as one form-level Standard
        Schema validator. TanStack&apos;s default display timing (quiet until
        Submit, then live) matches RHF&apos;s, so examples 12, 12B, 18 and 18B
        all behave the same out of the box. Copy-paste recipe — three files,
        this one plus <code>tanstackFieldControls.recipe.tsx</code> and{' '}
        <code>fieldPresentation.recipe.tsx</code>.
      </p>

      <TanStackFormProvider form={form}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <ValidationSummary
            errors={tanstackFieldMetaToErrors(fieldMeta)}
            form={tree}
          />
          <SchemaFields form={tree} intercept={intercept} />
          <button type="submit" style={{ marginTop: 12 }}>
            Submit
          </button>
        </form>
      </TanStackFormProvider>

      {submitted && (
        <>
          <p style={{ color: 'green' }}>Submitted valid data:</p>
          <pre>{JSON.stringify(submitted, null, 2)}</pre>
        </>
      )}
    </div>
  )
}

// ─── MAINTAINER NOTES (not part of the recipe) ───────────────────
// Safe to delete when copying this file.
// • Ticket #124; seam locked at #117; glue list from the TanStack audit
//   (#121). Parity with Recipe_ReactHookForm_JSONSchema / Zod + TanStack siblings proven by
//   `packages/react/src/parity/` (#125).
// • The nested-defaults seeding was a parity-smoke find: without
//   `address: {}`, the required failure landed on the group node (invisible)
//   instead of `address.street`, diverging from RHF's materialized nested
//   values.
// • Array paths: standardSchemaValidator.js emits `contacts[0].email` (not
//   FormFrame's `contacts.0.email`) — normalization glue is real but
//   unexercised here (no array field, matching the other recipes' scoping).
// • Out of scope, owned by #125: async (`onDynamicAsync`) + pending/stale
//   rows, pathless/whole-document issues (TanStack keeps them; RHF drops
//   them), array fields.
// ──────────────────────────────────────────────────────────────────────────────
