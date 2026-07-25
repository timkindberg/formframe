// RECIPE: TanStack Form as the form-state layer (ADR 024), on the shipped
// `renderNodeRules`/`useRenderNodeRules` API (ADR 047/048). Ticket: #124
// (wayfinder epic #116; seam locked at #117). Same schema as App_12 (JSON
// Schema + AJV) on purpose — this is the THIRD implementation of the same
// capability matrix, after App_12 (RHF) and App_12B (RHF + Zod), so a reader
// can compare "how do you get X" across all three form libraries directly.
//
// TanStack's audit (#121) named the exact glue this file provides, and it's
// a different shape of glue than RHF's (#120) on several axes:
//
//  1. Errors → `ValidationError`-shaped issues, injected as a PROP (#117),
//     same principle as the RHF recipes — but the mechanism differs because
//     TanStack Form has no ambient `useFormContext()`/`FormProvider` of its
//     own the way RHF does. This file rolls a minimal Context (a few lines)
//     so control handlers can reach the form instance — the same job
//     `FormProvider` does for RHF, just not shipped by TanStack itself.
//  2. TanStack Form is CONTROLLED, not RHF's uncontrolled `register()`: every
//     control binds `field.state.value` / `field.handleChange` /
//     `field.handleBlur` explicitly. Confirmed by reading `FieldApi.js`
//     directly — `handleChange`/`handleBlur` are the only mutation surface;
//     there's no ref-based uncontrolled path.
//  3. Our whole-object AJV/Zod validator plugs in as ONE form-level
//     `onDynamic` validator (TanStack's escape hatch specifically for "drive
//     validation like another library would," per `ValidationLogic.js`'s own
//     doc comment) + `validationLogic: revalidateLogic()` — TanStack's own
//     built-in that reproduces RHF's mode/reValidateMode split: `mode`
//     governs validation BEFORE the first submit, `modeAfterSubmission`
//     governs it AFTER. `revalidateLogic({ mode: 'blur', modeAfterSubmission:
//     'change' })` below reproduces App_12's touched-gated 'onTouched' —
//     apples-to-apples, same schema, same display policy, different library.
//  4. Standard Schema validators here produce ISSUES ONLY — confirmed by
//     reading `standardSchemaValidator.js`: on success it returns nothing,
//     never the validator's transformed/coerced value. So `age`'s AJV
//     coercion ("18" → 18) never reaches `state.values` mid-typing; `onSubmit`
//     below re-runs the validator itself and uses `result.data` for the
//     "submitted" output — the same "re-validate to recover coercion" glue
//     the audit named, mirroring App_12's own coercion story but solved at a
//     different point in the lifecycle (submit, not per-keystroke).
//  5. No `role="alert"` on the error list, unlike the RHF recipes and Core's
//     own default markup. Deliberate, not an oversight: with
//     `modeAfterSubmission: 'change'`, every keystroke after a first submit
//     re-runs validation, so an assertive live region would re-announce on
//     every character typed while fixing a field — genuinely disruptive,
//     not just noisy. `aria-describedby` (still wired below) keeps the
//     association without the interruption.
//  6. Nested nested groups (`address.street`/`address.city`) use plain dot
//     paths — no divergence to call out; TanStack's `DeepKeys` accepts dot
//     paths for object nesting the same way RHF/FormFrame do. The `foo[0]`
//     vs `foo.0` array-path divergence the audit names is real (confirmed
//     reading `standardSchemaValidator.js`'s own path-building: it emits
//     `contacts[0].email`, not `contacts.0.email`) but isn't exercised here —
//     this schema has no array field, matching App_12/App_12B's own scoping.
//
// Cross-field rule: `withCrossFieldRule` is copied verbatim from App_12 —
// confirmed form-library-agnostic there (it only touches our own `Validator`
// type), and this is the proof: zero changes needed to reuse it here.
//
// Out of scope for this recipe (left to #125's shared parity fixtures)
// -----------------------------------------------------------------------------
//  - Async validation (`onDynamicAsync`) and its pending/stale-result rows.
//  - Pathless/whole-document issues — TanStack KEEPS them (unlike RHF, which
//    drops them), per the audit, but this schema's cross-field rule already
//    attaches to a concrete path, so there's nothing pathless to observe.
//  - Array fields — the `foo[0]` path-normalization glue above is real but
//    unexercised.
import { useState, createContext, useContext, type ReactNode } from 'react'
import { useForm, revalidateLogic } from '@tanstack/react-form'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { toStandardSchema, type Validator } from '@formframe/core'
import { jsonSchemaToTree, type FormShapeOf } from '@formframe/input-jsonschema'
import type { InferData, JSONSchema } from '@formframe/input-jsonschema'
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
import { createAjvValidator } from '@formframe/validation-ajv'

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

// --- Cross-field rule, copied verbatim from App_12 (form-library-agnostic) --
function withCrossFieldRule<T>(validator: Validator<T>): Validator<T> {
  return (data) => {
    const result = validator(data)
    const value = (result.data ?? data) as Partial<
      Record<'password' | 'confirmPassword', unknown>
    >
    if (
      typeof value.password === 'string' &&
      typeof value.confirmPassword === 'string' &&
      value.password !== value.confirmPassword
    ) {
      return {
        valid: false,
        errors: [
          ...result.errors,
          {
            path: 'confirmPassword',
            message: 'Passwords must match.',
            keyword: 'confirmPassword',
          },
        ],
        data: result.data,
      }
    }
    return result
  }
}

const tree = jsonSchemaToTree(schema)
const validator = withCrossFieldRule(createAjvValidator(schema))
// TanStack consumes a Standard Schema directly (`isStandardSchemaValidator`
// checks for `'~standard' in validator`) — no resolver adapter needed, same
// principle as App_12B's Zod path, just via our own bridge instead of a
// native one. Core emits `Input: unknown` (our neutral `Validator` accepts
// unknown data); TanStack's validator slot wants `Input: TFormData` — the
// same cast App_12's RHF resolver needs, for the same reason.
const standardSchema = toStandardSchema(validator) as StandardSchemaV1<
  Data,
  Data
>

// --- Form instance, reachable from control handlers (#117 seam) ------------
// TanStack Form ships no ambient FormProvider/useFormContext of its own — the
// `form` object from `useForm()` is meant to be threaded explicitly. This
// Context does the one job RHF's `<FormProvider>` does for free.
//
// Typed loosely (`any`) rather than precisely: `FormApi`'s real type carries
// 12 mutually-referential generic parameters (one per validator lifecycle
// slot), and pinning all of them correctly to match a single `useForm(...)`
// call site is disproportionate for a recipe — every value actually read off
// `form` below is immediately narrowed at its use site instead (`ControlProps<K>`
// on every handler, explicit casts on `field.state.value`/`.errors`).
/* eslint-disable @typescript-eslint/no-explicit-any -- see above */
const TanStackFormContext = createContext<any>(null)
function useTanStackForm(): any {
  const form = useContext(TanStackFormContext)
  if (!form) {
    throw new Error('useTanStackForm: no TanStackFormContext.Provider above')
  }
  return form
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// --- One handler per control archetype (ADR 047 §3 `r.control(kind, …)`) ---
// `field.state.meta.errors` are the raw Standard Schema issues for this path
// (TanStack's own path-keyed distribution of the one `onDynamic` validator's
// result) — read inside `form.Field`'s render prop, not a standalone hook,
// since there's no ambient per-path subscription outside it.

interface FieldShellParts {
  Label: PartComponent<LabelData>
  Description?: PartComponent<TextData>
}

function FieldShell({
  path,
  parts,
  errors,
  children,
}: {
  path: string
  parts: FieldShellParts
  errors: ReadonlyArray<{ message?: string }>
  children: ReactNode
}): ReactNode {
  return (
    <div className="jsf-field">
      <parts.Label />
      {parts.Description && <parts.Description />}
      {children}
      {errors.length > 0 && (
        // No role="alert" — see divergence #5 above.
        <ul id={fieldErrorId(path)} className="jsf-field-errors">
          {errors.map((e, i) => (
            <li key={i}>{e.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** `field.state.meta.errors` for our one form-level Standard Schema
 * validator are the raw issues `standardSchemaValidator.js` maps in
 * (`{message, path}`) — cast through `unknown` since TanStack's own type
 * threads the shape through the same 12-parameter generic soup noted above. */
function fieldErrors(errors: unknown): ReadonlyArray<{ message?: string }> {
  return errors as ReadonlyArray<{ message?: string }>
}

function InputControl({ path, parts }: ControlProps<'input'>): ReactNode {
  const form = useTanStackForm()
  return (
    <form.Field name={path as never}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- form is untyped (any) by design, see note above */}
      {(field: any) => {
        const errors = fieldErrors(field.state.meta.errors)
        const a11y =
          errors.length > 0
            ? {
                'aria-invalid': true as const,
                'aria-describedby': fieldErrorId(path),
              }
            : {}
        return (
          <FieldShell path={path} parts={parts} errors={errors}>
            <parts.Control
              render={(c) => (
                <input
                  {...c.attrs}
                  value={
                    (field.state.value as string | number | undefined) ?? ''
                  }
                  onChange={(e) =>
                    field.handleChange(
                      (c.attrs.type === 'number' && e.target.value === ''
                        ? undefined
                        : e.target.value) as never
                    )
                  }
                  onBlur={field.handleBlur}
                  {...a11y}
                />
              )}
            />
          </FieldShell>
        )
      }}
    </form.Field>
  )
}

function SelectControl({ path, parts }: ControlProps<'select'>): ReactNode {
  const form = useTanStackForm()
  return (
    <form.Field name={path as never}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- form is untyped (any) by design, see note above */}
      {(field: any) => {
        const errors = fieldErrors(field.state.meta.errors)
        const a11y =
          errors.length > 0
            ? {
                'aria-invalid': true as const,
                'aria-describedby': fieldErrorId(path),
              }
            : {}
        return (
          <FieldShell path={path} parts={parts} errors={errors}>
            <parts.Control
              render={(c) => (
                <select
                  {...c.attrs}
                  value={(field.state.value as string | undefined) ?? ''}
                  onChange={(e) =>
                    field.handleChange(
                      (e.target.value === ''
                        ? undefined
                        : e.target.value) as never
                    )
                  }
                  onBlur={field.handleBlur}
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
      }}
    </form.Field>
  )
}

function ChoiceGroupControl({
  path,
  parts,
}: ControlProps<'choicegroup'>): ReactNode {
  const form = useTanStackForm()
  return (
    <form.Field name={path as never}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- form is untyped (any) by design, see note above */}
      {(field: any) => {
        const errors = fieldErrors(field.state.meta.errors)
        const a11y =
          errors.length > 0
            ? {
                'aria-invalid': true as const,
                'aria-describedby': fieldErrorId(path),
              }
            : {}
        return (
          <FieldShell path={path} parts={parts} errors={errors}>
            <parts.Control
              render={(c) => (
                <div
                  role={c.role}
                  aria-labelledby={c.labelledBy}
                  onBlur={field.handleBlur}
                  {...a11y}
                >
                  {c.options.map((o) => (
                    <label key={o.attrs.id}>
                      <input
                        {...o.attrs}
                        checked={field.state.value === o.attrs.value}
                        onChange={() =>
                          field.handleChange(o.attrs.value as never)
                        }
                      />{' '}
                      {o.label}
                    </label>
                  ))}
                </div>
              )}
            />
          </FieldShell>
        )
      }}
    </form.Field>
  )
}

const tanStackRules = (r: TypedRuleRegistrar<Shape>): void => {
  r.control('input', InputControl)
  r.control('select', SelectControl)
  r.control('choicegroup', ChoiceGroupControl)
}

export default function App() {
  const [submitted, setSubmitted] = useState<Data | null>(null)
  const form = useForm({
    defaultValues: {} as Data,
    validators: { onDynamic: standardSchema },
    // Reproduces App_12's 'onTouched': validate on blur before the first
    // submit, then on every change afterward — TanStack's own built-in for
    // "drive validation like RHF's mode/reValidateMode split" (its doc
    // comment says exactly this).
    validationLogic: revalidateLogic({
      mode: 'blur',
      modeAfterSubmission: 'change',
    }),
    onSubmit: ({ value }) => {
      // Re-run the validator to recover coercion the Standard Schema
      // validator discarded (divergence #4 above) — `result.data` is the
      // coerced value; `value` (raw state) is the fallback if nothing
      // transformed.
      const result = validator(value)
      setSubmitted((result.data ?? value) as Data)
    },
  })
  const renderNode = useRenderNodeRules(tree, tanStackRules)

  return (
    <div>
      <h1>TanStack Form as the form-state layer (recipe, ADR 024)</h1>
      <p>
        The third implementation of example 12&apos;s capability matrix — same
        schema, same <code>renderNodeRules</code> control-kind dispatch, same
        errors-as-a-prop seam (#117) — over TanStack Form instead of RHF.
        TanStack owns state via CONTROLLED binds (<code>field.state.value</code>
        /<code>handleChange</code>/<code>handleBlur</code>), our AJV validator
        plugs in as one <code>onDynamic</code> Standard Schema, and{' '}
        <code>revalidateLogic(&#123; mode: &apos;blur&apos; &#125;)</code>{' '}
        reproduces example 12&apos;s touched-gated display. This is a copy-paste
        recipe, not a published adapter.
      </p>

      <TanStackFormContext.Provider value={form}>
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
      </TanStackFormContext.Provider>

      {submitted && (
        <>
          <p style={{ color: 'green' }}>Submitted valid data:</p>
          <pre>{JSON.stringify(submitted, null, 2)}</pre>
        </>
      )}
    </div>
  )
}
