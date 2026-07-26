// RECIPE: TanStack Form as the form-state layer, over Zod — the twin of
// App_18 with the schema front-end swapped.
//
// THREE files to copy, TWO of them shared verbatim with App_18:
//
//   fieldPresentation.recipe.tsx       shared shell / errors / a11y
//   tanstackFieldControls.recipe.tsx   TanStack control bindings
//   this file                          the Zod half
//
// This file is the proof that the layering holds: swapping JSON Schema + AJV
// for Zod changes ONLY this file. The controls and presentation layers are
// byte-identical to App_18's — exactly as App_12/App_12B share the RHF
// controls.
//
// Compared to the JSON Schema version (App_18), two things fall away and two
// gotchas appear — the same trade Zod makes under RHF (App_12 vs App_12B):
//
//   • NO `withMatchRule`: Zod does cross-field natively via
//     `.refine(fn, { message, path })`, attaching the error to a concrete
//     field so it renders like any other field error.
//   • NO `toStandardSchema` bridge: a Zod schema already IS a Standard
//     Schema, so it goes straight into `validators`. One cast survives
//     though, and it's a genuine TanStack-vs-RHF difference: `z.coerce.number()`
//     types the schema's Standard-Schema INPUT as `unknown` (it accepts
//     anything and coerces), while TanStack requires the validator's input to
//     match the form's data type exactly. RHF's resolver is laxer and needs
//     no cast for the same schema (App_12B).
//   • GOTCHA — `.refine()` only runs once the base object parses. With other
//     required fields still empty, a password mismatch shows ONLY the
//     structural errors. It can look like the cross-field rule isn't wired up
//     when it's just queued behind the rest of the object becoming valid.
//   • GOTCHA — coercion is per-field in Zod (`z.coerce`), where AJV coerces
//     globally by adapter default.
//
// One thing that does NOT change from App_18: `onSubmit` still re-runs the
// validator to recover the coerced value, because TanStack's validators
// return issues only regardless of which schema library produced them.
import { useState } from 'react'
import { useForm, revalidateLogic } from '@tanstack/react-form'
import { z } from 'zod'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { zodToTree, type FormShapeOf } from '@formframe/input-zod'
import {
  SchemaFields,
  useRenderNodeRules,
  type TypedRuleRegistrar,
} from '@formframe/renderer-react'
import {
  TanStackFormProvider,
  InputControl,
  SelectControl,
  ChoiceGroupControl,
} from './tanstackFieldControls.recipe'

const schema = z
  .object({
    firstName: z
      .string()
      .min(2)
      .meta({ title: 'First name', description: 'At least 2 characters.' }),
    email: z.string().email().meta({ title: 'Email' }),
    // `.coerce` is required per-field (see header gotcha) — controls hand the
    // form library strings, and plain `z.number()` rejects them.
    age: z.coerce
      .number()
      .min(18)
      .meta({
        title: 'Age',
        description: 'Must be 18 or older (string coerced by the validator).',
      })
      .optional(),
    // Widget defaults are option-count driven: 6 options → a compact
    // <select>; `contactMethod`'s 2 options → an inline radio group.
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
  // The cross-field rule, natively — no `withMatchRule` needed.
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords must match.',
    path: ['confirmPassword'],
  })

type Shape = FormShapeOf<typeof schema>
type Data = z.output<typeof schema>

const tree = zodToTree(schema)

const tanStackRules = (r: TypedRuleRegistrar<Shape>): void => {
  r.control('input', InputControl)
  r.control('select', SelectControl)
  r.control('choicegroup', ChoiceGroupControl)
}

export default function App() {
  const [submitted, setSubmitted] = useState<Data | null>(null)
  const form = useForm({
    // Seed `{}` for every nested group — see App_18's header for why.
    defaultValues: { address: {} } as Data,
    // The Zod schema goes straight in — it already IS a Standard Schema. The
    // cast only reconciles `z.coerce`'s `unknown` input type with TanStack's
    // "input must equal form data" constraint; see the header.
    validators: {
      onDynamic: schema as unknown as StandardSchemaV1<Data, Data>,
    },
    validationLogic: revalidateLogic(),
    onSubmit: ({ value }) => {
      // Re-parse to recover Zod's coercion (`age`), which TanStack's
      // issues-only validator contract discards — same reason as App_18.
      const parsed = schema.safeParse(value)
      setSubmitted(parsed.success ? parsed.data : value)
    },
  })
  const renderNode = useRenderNodeRules(tree, tanStackRules)

  return (
    <div>
      <h1>TanStack Form over Zod (recipe)</h1>
      <p>
        The Zod twin of example 18 — and the proof the recipe layering holds:
        this file is the <em>only</em> thing that changed. The TanStack control
        bindings and the shared field presentation are byte-identical to example
        18&apos;s, exactly as examples 12 and 12B share the React Hook Form
        controls. The password rule is Zod&apos;s native{' '}
        <code>.refine(fn, {'{ path }'})</code>, and the schema plugs straight
        into <code>validators</code> with no adapter in between.
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
          <SchemaFields form={tree} renderNode={renderNode} />
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

// ─── MAINTAINER NOTES (temporary — not part of the recipe) ───────────────────
// Build-log for the #116 epic; safe to delete when copying this file.
// • Exists as the ADR 008 forcing function for `tanstackFieldControls.recipe`:
//   a second front-end proves that layer is genuinely front-end-agnostic
//   rather than accidentally shaped around JSON Schema. Mirrors the
//   App_16/App_17 and App_12/App_12B pairing convention.
// • Parity with 12/12B/18 asserted by `npm run smoke:recipes`.
// • Same Zod caveats as App_12B: v4 `.refine()` leaves `def.type`/`def.shape`
//   intact so `zodToTree`/`FormShapeOf` introspect it normally; the per-field
//   `.coerce` vs AJV's adapter-level default remains a real DX gap worth its
//   own issue.
// ──────────────────────────────────────────────────────────────────────────────
