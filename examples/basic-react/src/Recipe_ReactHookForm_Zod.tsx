// RECIPE: React Hook Form as the form-state layer, over Zod — the twin of
// Recipe_ReactHookForm_JSONSchema with the front-end swapped.
//
// THREE files to copy, TWO of them shared verbatim with Recipe_ReactHookForm_JSONSchema:
//
//   fieldPresentation.recipe.tsx   shared blank/match helpers + ValidationSummary
//   rhfFieldControls.recipe.tsx    RHF control bindings
//   this file                      the Zod half
//
// Compared to the JSON Schema + AJV version, two things fall away entirely
// and two gotchas appear:
//
//   • NO cross-field wrapper: Zod does it natively.
//     `.refine(fn, { message, path })` on the object schema replaces Recipe_ReactHookForm_JSONSchema's
//     `withMatchRule` — `path` attaches the error to a concrete field, so it
//     renders like any other field error.
//   • NO `toStandardSchema` adapter and NO cast: a Zod schema already IS a
//     Standard Schema, so `standardSchemaResolver(schema)` wires directly and
//     the submitted-data type flows from `z.output` with zero annotations.
//   • GOTCHA — `.refine()` only runs once the base object parses. With other
//     required fields still empty, a password mismatch shows ONLY the
//     structural errors and no "Passwords must match." at all. It can look
//     like your cross-field rule isn't wired up when it's just queued behind
//     the rest of the object becoming valid. (AJV + `withMatchRule` in Recipe_ReactHookForm_JSONSchema
//     reports both at once.)
//   • GOTCHA — coercion is per-field in Zod. AJV coerces "18" → 18 globally
//     (an adapter default); Zod needs `.coerce` on each field bound to a
//     native input, or you get "expected number, received string" at runtime.
import { useState } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { z } from 'zod'
import { zodToTree, type FormShapeOf } from '@formframe/input-zod'
import {
  useFormTree,
} from '@formframe/renderer-react'
import { ValidationSummary } from './fieldPresentation.recipe'
import { rhfFieldDefaults, rhfErrorsToList } from './rhfFieldControls.recipe'

const schema = z
  .object({
    firstName: z
      .string()
      .min(2)
      .meta({ title: 'First name', description: 'At least 2 characters.' }),
    email: z.string().email().meta({ title: 'Email' }),
    // `.coerce` is required per-field (see header gotcha) — native inputs
    // hand the form library strings, and plain `z.number()` rejects them.
    age: z.coerce
      .number()
      .min(18)
      .meta({
        title: 'Age',
        description: 'Must be 18 or older (string coerced by the validator).',
      })
      .optional(),
    // Widget defaults are option-count driven: 6 options → a compact
    // <select>; `contactMethod`'s 2 options → an inline radio group. Both
    // overridable per field via `resolvePresentation`.
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
  // The cross-field rule, natively — `path` puts the error on a concrete
  // field. Remember the header gotcha: this runs only once the base object
  // parses.
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords must match.',
    path: ['confirmPassword'],
  })

type Data = z.output<typeof schema>

// Static schema → build once at module scope (use `useMemo` in the component
// instead if your schema arrives at runtime). No cast anywhere: the Zod
// schema satisfies RHF's resolver constraint on its own.
const tree = zodToTree(schema)
const resolver = standardSchemaResolver(schema)

export default function App() {
  // RHF's default mode: validate at first submit, revalidate on change after.
  const methods = useForm({ resolver })
  const { errors } = methods.formState
  const { SchemaFields } = useFormTree(tree, { defaults: rhfFieldDefaults })
  // Typed by the schema: `z.output` flows through the resolver into
  // `handleSubmit`, so `data.age` is `number`, `data.contactMethod` is
  // 'email' | 'phone' — no annotations needed.
  const [submitted, setSubmitted] = useState<Data | null>(null)

  return (
    <div>
      <h1>React Hook Form over Zod (recipe)</h1>
      <p>
        The Zod twin of example 12 — same shared controls, same RHF default
        display timing (quiet until Submit, then live) — but the
        password-confirmation rule is Zod&apos;s native{' '}
        <code>.refine(fn, {'{ path }'})</code> and the schema plugs straight
        into RHF&apos;s resolver (Zod already speaks Standard Schema — no
        adapter, no casts). Copy-paste recipe — three files, this one plus{' '}
        <code>rhfFieldControls.recipe.tsx</code> and{' '}
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
// • Twin-of-Recipe_ReactHookForm_JSONSchema pairing mirrors the App_16/App_17 convention (ADR 008's
//   second-implementation forcing function). Parity proven by
//   `packages/react/src/parity/` (#125).
// • Zod v4 `.refine()` keeps `def.type === 'object'` and `def.shape` intact
//   (only appends to `def.checks`), so `zodToTree`/`FormShapeOf` introspect a
//   refined schema exactly like an unrefined one — verified against Zod
//   internals; no special-casing in the front-end.
// • The `.coerce` vs AJV-adapter-default asymmetry is a real DX gap candidate
//   for its own issue — Core can't paper over it (ADR 019/033: Core doesn't
//   touch validation) and Zod has no global parse-time coercion lever the way
//   AJV's recipe helper does.
// • Async/remote option sets: not modelled by Core yet (ADR 029 §5, bd cm7);
//   Zod has no async enum either — a fetched option list means building the
//   array first, then constructing `z.enum(...)` from it.
// ──────────────────────────────────────────────────────────────────────────────
