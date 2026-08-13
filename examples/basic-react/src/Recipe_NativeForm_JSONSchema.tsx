// RECIPE: native `<form>` + FormData as the form-state layer, over JSON Schema
// + AJV — the third peer of Recipe_ReactHookForm_JSONSchema /
// Recipe_TanStackForm_JSONSchema.
//
// FOUR files to copy for the Zod half (shared stack) — JSON Schema recipes
// also copy `ajvValidator.recipe.ts`:
//
//   fieldPresentation.recipe.tsx     shared blank/match helpers
//   nativeValidation.recipe.tsx      stores + NativeValidationProvider + hook
//   nativeFieldControls.recipe.tsx   inject bindings (this stack's "controls")
//   this file                        the JSON Schema + AJV half
//   (+ ajvValidator.recipe.ts)       AJV → FormFrame Validator helper
//
// Only this file knows about JSON Schema or AJV. Swap it for
// Recipe_NativeForm_Zod and you get the same form over Zod with the other
// three files untouched.
//
// The shape of it:
//
//   schema ─→ jsonSchemaToTree(schema) ──→ <SchemaFields> renders the fields
//   schema ─→ createAjvValidator(schema) → useNativeValidator(form, validator)
//             owns submit / revalidate / errors / submitted
//   errors ─→ NativeValidationProvider ─→ controls inject via
//             `<Default of={field} errors={…} />`
//
// Worth knowing before you adapt it:
//
//   • No form library. Native FormData on submit; inputs stay uncontrolled.
//     `useFormTree` binds presentation + FormData submit; `useNativeValidator`
//     produces errors and the controls inject them — FormFrame only renders.
//   • Display timing defaults to `'submit'` in NativeValidationProvider
//     (quiet until first submit, then reveal + clear live via `onInput={revalidate}`).
//     Same observable behavior as RHF's default mode and TanStack's
//     `revalidateLogic()`. Prefer blur-gated reveal? Pass
//     `showErrorsWhen="touched"` and wire `onBlur={handleBlur}`.
//   • Cross-field rules: plain JSON Schema has no match keyword —
//     `withMatchRule` (shared presentation layer) attaches the error to a
//     concrete field path.
import { useState } from 'react'
import { jsonSchemaToTree, type FormShapeOf } from '@formframe/input-jsonschema'
import type { InferData, JSONSchema } from '@formframe/input-jsonschema'
import {
  useFormTree,
  useRenderNodeRules,
  type TypedRuleRegistrar,
} from '@formframe/renderer-react'
import { createAjvValidator } from './ajvValidator.recipe'
import { withMatchRule, withMissingGroups } from './fieldPresentation.recipe'
import {
  NativeValidationProvider,
  useNativeValidator,
} from './nativeValidation.recipe'
import {
  InputControl,
  SelectControl,
  ChoiceGroupControl,
} from './nativeFieldControls.recipe'

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

const nativeRules = (r: TypedRuleRegistrar<Shape>): void => {
  r.control('input', InputControl)
  r.control('select', SelectControl)
  r.control('choicegroup', ChoiceGroupControl)
}

const tree = jsonSchemaToTree(schema)
// Native FormData drops empty nested groups — seed `address: {}` so the
// required failure lands on `address.street` (visible), matching RHF/TanStack.
const validator = withMatchRule(
  withMissingGroups(createAjvValidator(schema), ['address']),
  'confirmPassword',
  'password',
  'Passwords must match.'
)

export default function App() {
  const { form, SchemaFields } = useFormTree(tree)
  const { validation, submit, revalidate } = useNativeValidator(form, validator)
  const renderNode = useRenderNodeRules(form, nativeRules)
  const [submitted, setSubmitted] = useState<Data | null>(null)

  return (
    <div>
      <h1>Native form as the form-state layer (recipe)</h1>
      <p>
        Native <code>&lt;form&gt;</code> + FormData owns submit; FormFrame
        renders the fields from the JSON Schema; one AJV validator runs at
        submit and (after the first attempt) live via <code>onInput</code>.
        Errors inject through{' '}
        <code>&lt;Default of={'{field}'} errors=&#123;…&#125; /&gt;</code> — the
        same seam the RHF and TanStack recipes fill. Default display timing:
        quiet until you press Submit, then errors reveal and clear live as you
        fix them. Copy-paste recipe — four files, this one plus{' '}
        <code>nativeFieldControls.recipe.tsx</code>,{' '}
        <code>nativeValidation.recipe.tsx</code>, and{' '}
        <code>fieldPresentation.recipe.tsx</code>.
      </p>

      <form
        noValidate
        onSubmit={submit((data) => setSubmitted(data as Data))}
        onInput={revalidate}
      >
        <NativeValidationProvider {...validation}>
          <SchemaFields renderNode={renderNode} />
        </NativeValidationProvider>
        <button type="submit" style={{ marginTop: 12 }}>
          Submit
        </button>
      </form>

      {submitted && (
        <>
          <p style={{ color: 'green' }}>Submitted valid data:</p>
          <pre>{JSON.stringify(submitted, null, 2)}</pre>
        </>
      )}
    </div>
  )
}

// ─── MAINTAINER NOTES (not part of the recipe) ───────────────────────────────
// • Peer of the RHF / TanStack recipes (ADR 024). Inject seam: ADR 050.
// • Native FormData drops empty nested groups; `withMissingGroups(['address'])`
//   is the peer of TanStack's `defaultValues: { address: {} }` so required
//   failures land on `address.street`.
// • Async / pending / stale coverage lives in `packages/react/src/parity/`,
//   not this demo. No ValidationSummary here — parity asserts per-field DOM
//   + onSubmit.
// ──────────────────────────────────────────────────────────────────────────────
