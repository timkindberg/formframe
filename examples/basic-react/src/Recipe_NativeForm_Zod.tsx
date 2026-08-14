// RECIPE: native `<form>` + FormData as the form-state layer, over Zod — the
// twin of Recipe_NativeForm_JSONSchema with the front-end swapped.
//
// FOUR files to copy, THREE of them shared verbatim with the JSON Schema half:
//
//   fieldPresentation.recipe.tsx     shared blank/match helpers + ValidationSummary
//   nativeValidation.recipe.tsx      stores + NativeValidationProvider + hook
//   nativeFieldControls.recipe.tsx   defaults bindings (`nativeFieldDefaults`)
//   this file                        the Zod half
//
// Compared to the JSON Schema + AJV version:
//
//   • NO cross-field wrapper: Zod does it natively with `.refine(fn, { path })`.
//   • NO AJV adapter: `fromStandardSchema(schema)` turns the Zod schema into a
//     FormFrame `Validator` (Zod already speaks Standard Schema).
//   • GOTCHA — `.refine()` only runs once the base object parses (same as the
//     RHF/TanStack Zod twins).
//   • GOTCHA — coercion is per-field (`.coerce`); AJV coerces globally by
//     adapter default.
import { useState } from 'react'
import { z } from 'zod'
import { fromStandardSchema } from '@formframe/core'
import { zodToTree, type FormShapeOf } from '@formframe/input-zod'
import {
  useFormTree,
} from '@formframe/renderer-react'
import {
  ValidationSummary,
  withMissingGroups,
} from './fieldPresentation.recipe'
import {
  NativeValidationProvider,
  useNativeValidator,
} from './nativeValidation.recipe'
import { nativeFieldDefaults } from './nativeFieldControls.recipe'

const schema = z
  .object({
    firstName: z
      .string()
      .min(2)
      .meta({ title: 'First name', description: 'At least 2 characters.' }),
    email: z.string().email().meta({ title: 'Email' }),
    age: z.coerce
      .number()
      .min(18)
      .meta({
        title: 'Age',
        description: 'Must be 18 or older (string coerced by the validator).',
      })
      .optional(),
    plan: z
      .enum(['free', 'starter', 'pro', 'team', 'business', 'enterprise'])
      .meta({ title: 'Plan' })
      .optional(),
    contactMethod: z
      .enum(['email', 'phone'])
      .meta({ title: 'Preferred contact method' }),
    password: z.string().min(8).meta({ title: 'Password' }),
    confirmPassword: z.string().meta({ title: 'Confirm password' }),
    address: z
      .object({
        street: z.string().meta({ title: 'Street' }),
        city: z.string().meta({ title: 'City' }).optional(),
      })
      .meta({ title: 'Address' }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords must match.',
    path: ['confirmPassword'],
  })

type Data = z.output<typeof schema>

const tree = zodToTree(schema)
// Same nested-empty glue as the JSON Schema twin — see withMissingGroups.
const validator = withMissingGroups(fromStandardSchema(schema), ['address'])

export default function App() {
  const { form, SchemaFields } = useFormTree(tree, {
    defaults: nativeFieldDefaults,
  })
  const { validation, submit, revalidate } = useNativeValidator(form, validator)
  const [submitted, setSubmitted] = useState<Data | null>(null)

  return (
    <div>
      <h1>Native form over Zod (recipe)</h1>
      <p>
        The Zod twin of the native JSON Schema recipe — same shared controls,
        same submit-then-live display timing — but the password-confirmation
        rule is Zod&apos;s native <code>.refine(fn, {'{ path }'})</code> and the
        schema adapts via <code>fromStandardSchema</code>. Copy-paste recipe —
        four files, this one plus <code>nativeFieldControls.recipe.tsx</code>,{' '}
        <code>nativeValidation.recipe.tsx</code>, and{' '}
        <code>fieldPresentation.recipe.tsx</code>.
      </p>

      <form
        noValidate
        onSubmit={submit((data) => setSubmitted(data as Data))}
        onInput={revalidate}
      >
        <ValidationSummary
          errors={validation.submitted ? validation.errors : []}
          form={form}
        />
        <NativeValidationProvider {...validation}>
          <SchemaFields />
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
// • Twin of Recipe_NativeForm_JSONSchema (ADR 008 second front-end).
// • Same Zod refine / coerce gotchas as the RHF and TanStack Zod twins.
// ──────────────────────────────────────────────────────────────────────────────
