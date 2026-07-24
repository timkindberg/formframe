// RECIPE: React Hook Form as the form-state layer (ADR 024), over the ZOD
// front-end — the twin of App_12, mirroring the App_16/App_17 pairing
// convention: identical field-for-field except the front-end import + schema
// DSL, plus TWO real divergences worth calling out (not incidental — they
// answer questions raised reviewing App_12):
//
//  1. NO `withCrossFieldRule` wrapper. App_12's AJV/JSON-Schema path needs a
//     hand-composed `Validator -> Validator` wrapper because plain JSON Schema
//     has no cross-field-equality keyword (AJV's `$data` reference gets close,
//     but isn't enabled by default here and yields a generic message). Zod has
//     this natively: `.refine(fn, { message, path })` on the object schema.
//     Verified this composes cleanly with the front-end's introspection: Zod
//     v4's `.refine()` does NOT wrap the schema in a different class (unlike
//     Zod v3's `ZodEffects`) — `def.type` stays `'object'` and `def.shape` is
//     untouched, `.refine()` only appends to `def.checks` — so `zodToTree`
//     (which reads `def.shape` directly) and `FormShapeOf` see a refined
//     object exactly like an unrefined one. No special-casing needed anywhere.
//  2. NO `toStandardSchema`/`createZodValidator` round-trip. A Zod schema
//     already implements `~standard` natively (confirmed: `schema['~standard']
//     .vendor === 'zod'`), so `standardSchemaResolver(schema)` wires directly
//     — our `Validator` seam (ADR 019) isn't bypassed on principle, it's just
//     not the shortest path when the front-end's own schema library already
//     speaks Standard Schema. (Contrast App_15's native `useFormTree` path,
//     which goes the OTHER direction — `fromStandardSchema(schema)` — because
//     `useFormTree` wants our `Validator` shape, not RHF's resolver shape.)
//
// A THIRD divergence surfaced while verifying this in-browser, worth knowing
// rather than fixing: AJV's `allErrors: true` (App_12) collects the cross-
// field issue independently of any other failing field. Zod's `.refine()`
// does NOT run until the base object shape is otherwise valid — confirmed via
// a direct `safeParse` repro: with `contactMethod` still unselected and
// `address.street` still empty, mismatched passwords produce ONLY those two
// structural issues, no "Passwords must match." at all; fill every other
// required field first and the refine issue appears. A partially-filled form
// with a Zod cross-field rule can look like the rule isn't wired up when it's
// actually just gated behind the rest of the object being valid first.
//
// Everything else is identical in spirit to App_12 — same read there for the
// full story (touched-gated display via `mode`, errors injected as a prop via
// RHF's own `get` rather than our internal store, one `r.control(kind, …)`
// handler per archetype, the `FieldShell` dedup, nested error paths, the
// empty-optional-select normalization).
import { useMemo, useState, type ReactNode } from 'react'
import {
  useForm,
  FormProvider,
  useFormContext,
  useFormState,
  get,
} from 'react-hook-form'
import type { FieldValues } from 'react-hook-form'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { z } from 'zod'
import { zodToTree, type FormShapeOf } from '@formframe/input-zod'
import {
  SchemaFields,
  useRenderNodeRules,
  fieldErrorId,
  type ControlProps,
  type TypedRuleRegistrar,
  type PartComponent,
  type LabelData,
  type TextData,
} from '@formframe/renderer-react'

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
    // 6 options clears the shipped OPTION_COUNT_THRESHOLD (5), so this
    // defaults to a 'select' widget — 'contactMethod' below stays under it
    // and defaults to 'choicegroup' (radio). Same present() heuristic as
    // App_12 — Core's, not per-front-end.
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
  // The cross-field rule, natively — replaces App_12's `withCrossFieldRule`
  // entirely. `path` attaches the issue to a concrete field (#118's
  // fixture-design decision), so it needs no root/pathless wrapper downstream,
  // exactly like the AJV-composed version.
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords must match.',
    path: ['confirmPassword'],
  })

type Shape = FormShapeOf<typeof schema>

// --- Errors as a PROP, sourced from RHF, never our internal store (#117) -----
// See App_12: `name` only scopes WHEN this re-renders, not what `errors`
// contains, so the nested-path lookup via RHF's own `get` is still needed.

function useRHFFieldError(path: string): { message?: string } | undefined {
  const { errors } = useFormState({ name: path })
  return get(errors, path) as { message?: string } | undefined
}

function useA11yAttrs(path: string): {
  'aria-invalid'?: true
  'aria-describedby'?: string
} {
  const error = useRHFFieldError(path)
  return error?.message
    ? { 'aria-invalid': true, 'aria-describedby': fieldErrorId(path) }
    : {}
}

function FieldErrors({ path }: { path: string }): ReactNode {
  const error = useRHFFieldError(path)
  if (!error?.message) return null
  return (
    <ul id={fieldErrorId(path)} className="jsf-field-errors" role="alert">
      <li>{error.message}</li>
    </ul>
  )
}

// --- One handler per control archetype (ADR 047 §3 `r.control(kind, …)`) -----

interface FieldShellParts {
  Label: PartComponent<LabelData>
  Description?: PartComponent<TextData>
}

function FieldShell({
  path,
  parts,
  children,
}: {
  path: string
  parts: FieldShellParts
  children: ReactNode
}): ReactNode {
  return (
    <div className="jsf-field">
      <parts.Label />
      {parts.Description && <parts.Description />}
      {children}
      <FieldErrors path={path} />
    </div>
  )
}

function InputControl({ path, parts }: ControlProps<'input'>): ReactNode {
  const { register } = useFormContext()
  const a11y = useA11yAttrs(path)
  return (
    <FieldShell path={path} parts={parts}>
      <parts.Control
        render={(c) => (
          <input
            {...c.attrs}
            {...register(
              path,
              c.attrs.type === 'number'
                ? { setValueAs: (v) => (v === '' ? undefined : v) }
                : undefined
            )}
            {...a11y}
          />
        )}
      />
    </FieldShell>
  )
}

function SelectControl({ path, parts }: ControlProps<'select'>): ReactNode {
  const { register } = useFormContext()
  const a11y = useA11yAttrs(path)
  return (
    <FieldShell path={path} parts={parts}>
      <parts.Control
        render={(c) => (
          <select
            {...c.attrs}
            {...register(
              path,
              c.attrs.multiple
                ? undefined
                : { setValueAs: (v) => (v === '' ? undefined : v) }
            )}
            {...a11y}
          >
            {!c.attrs.multiple && <option value="">-- select --</option>}
            {c.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      />
    </FieldShell>
  )
}

function ChoiceGroupControl({
  path,
  parts,
}: ControlProps<'choicegroup'>): ReactNode {
  const { register } = useFormContext()
  const a11y = useA11yAttrs(path)
  return (
    <FieldShell path={path} parts={parts}>
      <parts.Control
        render={(c) => (
          <div role={c.role} aria-labelledby={c.labelledBy} {...a11y}>
            {c.options.map((o) => (
              <label key={o.attrs.id}>
                <input {...o.attrs} {...register(path)} /> {o.label}
              </label>
            ))}
          </div>
        )}
      />
    </FieldShell>
  )
}

const rhfRules = (r: TypedRuleRegistrar<Shape>): void => {
  r.control('input', InputControl)
  r.control('select', SelectControl)
  r.control('choicegroup', ChoiceGroupControl)
}

export default function App() {
  const tree = useMemo(() => zodToTree(schema), [])
  // Zod IS a Standard Schema natively — no `toStandardSchema`/
  // `createZodValidator` round-trip through our own seam (contrast App_12's
  // AJV path, where that round-trip is the only way in).
  const resolver = useMemo(
    () =>
      standardSchemaResolver(
        schema as unknown as StandardSchemaV1<FieldValues, FieldValues>
      ),
    []
  )
  // 'onTouched' == ADR 027's 'touched' display policy — same as App_12.
  const methods = useForm({ resolver, mode: 'onTouched' })
  const renderNode = useRenderNodeRules(tree, rhfRules)
  const [submitted, setSubmitted] = useState<FieldValues | null>(null)

  return (
    <div>
      <h1>React Hook Form over Zod (recipe, ADR 024 / ADR 008)</h1>
      <p>
        The Zod twin of example 12: same <code>renderNodeRules</code> control-
        kind dispatch, same errors-as-a-prop seam (#117), same touched-gated{' '}
        <code>mode</code> — but the schema is a <code>z.object(…)</code> and two
        things fall away entirely. The password-confirmation rule is Zod&apos;s
        native <code>.refine(fn, {'{ path }'})</code> — no hand- composed
        cross-field wrapper, unlike plain JSON Schema. And the resolver wires
        the schema straight in — Zod already speaks Standard Schema, so
        there&apos;s no <code>toStandardSchema</code> round-trip through our{' '}
        <code>Validator</code> seam. This is a copy-paste recipe, not a
        published adapter.
      </p>

      <FormProvider {...methods}>
        <form
          noValidate
          onSubmit={methods.handleSubmit((data) => setSubmitted(data))}
        >
          <SchemaFields form={tree} renderNode={renderNode} />
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
