// RECIPE: React Hook Form as the form-state layer, over JSON Schema + AJV.
//
// Files to copy — this one plus the layers beneath it:
//
//   fieldPresentation.recipe.tsx   shared blank/match helpers + ValidationSummary
//   rhfFieldControls.recipe.tsx    RHF control bindings
//   ajvValidator.recipe.ts         AJV → FormFrame Validator helper
//   this file                      the JSON Schema + AJV half
//
// Only this file (+ ajvValidator) knows about JSON Schema or AJV. It's a
// copy-paste recipe, not a package — once copied, it's yours.
//
// The shape of it:
//
//   schema ─→ jsonSchemaToTree(schema) ──→ <SchemaFields> renders the fields
//   schema ─→ createAjvValidator(schema) → toStandardSchema → RHF's resolver
//
// RHF owns form STATE (values, touched, submit); FormFrame renders the field
// STRUCTURE from the schema; one AJV validator serves both. Worth knowing
// before you adapt it:
//
//   • FormFrame's `Validator` is handed to RHF as a Standard Schema —
//     `standardSchemaResolver` maps its issues into RHF's nested error shape
//     with no bespoke glue. RHF doesn't replace the validator; it consumes it.
//   • Display timing is RHF's own default (no `mode` option): quiet until
//     the first submit attempt, then every error reveals and clears live as
//     the user fixes it. Prefer blur-gated reveal? `mode: 'onTouched'` is a
//     one-line change; the shared controls render whatever RHF holds.
//   • Cross-field rules: plain JSON Schema has no "field A must equal field B"
//     keyword (AJV's `$data` extension gets close, but is off by default and
//     produces a generic message). `withMatchRule` (from the shared
//     presentation layer) composes the rule onto any FormFrame `Validator`,
//     attaching the error to a concrete field path so it renders like any
//     other field error.
//   • Nested fields (`address.street`) just work: AJV reports the nested path,
//     the resolver nests it into RHF's error tree, and the shared controls
//     read it back out with RHF's own `get`.
//
// Gotchas this recipe already absorbs for you:
//   • AJV v8 silently ignores `format: 'email'` without `ajv-formats` —
//     `createAjvValidator` registers it by default.
//   • A validator must never mutate the form library's live values (AJV's
//     `coerceTypes` mutates in place). FormFrame's `Validator` contract is
//     pure — the AJV adapter clones internally and returns coerced data as
//     `result.data` — so no defensive copying here.
import { useState } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import type { FieldValues } from 'react-hook-form'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { toStandardSchema } from '@formframe/core'
import { jsonSchemaToTree } from '@formframe/input-jsonschema'
import type { InferData, JSONSchema } from '@formframe/input-jsonschema'
import {
  useFormTree,
} from '@formframe/renderer-react'
import { createAjvValidator } from './ajvValidator.recipe'
import { ValidationSummary, withMatchRule } from './fieldPresentation.recipe'
import {
  rhfFieldDefaults,
  rhfErrorsToList,
} from './rhfFieldControls.recipe'

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
    // `contactMethod`'s 2 options → an inline radio group. Both defaults are
    // overridable per field via `resolvePresentation`.
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

type Data = InferData<typeof schema>

// The schema is a static module-level literal, so the tree and resolver are
// built once at module scope — no `useMemo` needed. (If your schema arrives
// at runtime, build these in the component with `useMemo` instead.)
const tree = jsonSchemaToTree(schema)
const validator = withMatchRule(
  createAjvValidator(schema),
  'confirmPassword',
  'password',
  'Passwords must match.'
)
const resolver = standardSchemaResolver(
  // One deliberate cast: FormFrame's `Validator` accepts `unknown` input by
  // design, and `unknown` doesn't satisfy RHF's `Input extends FieldValues`
  // constraint. Only the INPUT side is asserted — the OUTPUT stays `Data`
  // (the schema-inferred type), so `handleSubmit` hands you typed data below.
  toStandardSchema(validator) as StandardSchemaV1<FieldValues, Data>
)

export default function App() {
  // RHF's default mode: validate at first submit, revalidate on change after.
  const methods = useForm({ resolver })
  const { errors } = methods.formState
  const { SchemaFields } = useFormTree(tree, { defaults: rhfFieldDefaults })
  // Typed by the schema: `data.age` is `number`, `data.contactMethod` is
  // 'email' | 'phone' — inference flows from the schema literal through
  // `InferData` and the resolver's output type into `handleSubmit`.
  const [submitted, setSubmitted] = useState<Data | null>(null)

  return (
    <div>
      <h1>React Hook Form as the form-state layer (recipe)</h1>
      <p>
        React Hook Form owns the form state and submit; FormFrame renders the
        fields from the JSON Schema; one AJV validator serves both, wired into
        RHF as a Standard Schema. RHF&apos;s default display timing: quiet until
        you press Submit, then errors reveal and clear live as you fix them.
        Mismatch the passwords to see a cross-field rule attach to{' '}
        <code>confirmPassword</code>. Copy-paste recipe — three files, this one
        plus <code>rhfFieldControls.recipe.tsx</code> and{' '}
        <code>fieldPresentation.recipe.tsx</code>.
      </p>

      <FormProvider {...methods}>
        <form
          noValidate
          onSubmit={methods.handleSubmit((data) => setSubmitted(data))}
        >
          <ValidationSummary errors={rhfErrorsToList(errors)} form={tree} />
          <SchemaFields />
          <button type="submit" style={{ marginTop: 12 }}>
            Submit
          </button>
        </form>
      </FormProvider>

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
// • Ticket #123; seam locked at #117; glue list from the RHF audit (#120).
//   Display-policy unification + parity proof: `packages/react/src/parity/` (#125).
// • ADR trail: 050 (recipes produce, library renders) / 024 (recipes not
//   packages) / 025 (validator purity — the coerceTypes corruption story) /
//   026 (toStandardSchema) / 047-048 (renderNodeRules + typed registrar).
// • Async option sets for `plan`-style enums: not modelled by Core yet
//   (ADR 029 §5, bd cm7) — a fetched option list is a consumer resolver's
//   job today (pin `{ widget: 'select' }` so a count change can't re-pick
//   the archetype).
// • Out of scope, owned by #125's parity fixtures: async validation +
//   pending/stale rows, array fields (`useFieldArray` glue), run-failure vs
//   invalid distinction.
// ──────────────────────────────────────────────────────────────────────────────
