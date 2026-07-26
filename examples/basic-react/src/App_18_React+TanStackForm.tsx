// RECIPE: TanStack Form as the form-state layer (ADR 024), on the shipped
// `renderNodeRules`/`useRenderNodeRules` API (ADR 047/048). Ticket: #124
// (wayfinder epic #116; seam locked at #117). Same schema as App_12 (JSON
// Schema + AJV) on purpose — this is the THIRD implementation of the same
// capability matrix, after App_12 (RHF) and App_12B (RHF + Zod), all on the
// SAME observable display policy (reveal a field's error on dirtied +
// blurred, reveal everything at submit, revalidate changed fields live after
// submit), so `scripts/recipe-parity-smoke.mjs` can drive all three through
// one identical interaction script and assert identical behavior.
//
// TanStack's audit (#121) named the exact glue this file provides, and it's
// a different shape of glue than RHF's (#120) on several axes:
//
//  1. Errors → issues injected as a PROP (#117), same principle as the RHF
//     recipes — but the mechanism differs because TanStack Form ships no
//     ambient `useFormContext()`/`FormProvider` the way RHF does. This file
//     rolls a minimal Context so control handlers can reach the form
//     instance — the job RHF's `FormProvider` does for free.
//  2. TanStack Form is CONTROLLED, not RHF's uncontrolled `register()`: every
//     control binds `field.state.value` / `field.handleChange` /
//     `field.handleBlur` explicitly. Confirmed by reading `FieldApi.js`
//     directly — `handleChange`/`handleBlur` are the only mutation surface;
//     there's no ref-based uncontrolled path.
//  3. Our whole-object AJV validator plugs in as ONE form-level `onDynamic`
//     validator (TanStack's escape hatch specifically for "drive validation
//     like another library would," per `ValidationLogic.js`'s own doc
//     comment) + `validationLogic: revalidateLogic({ mode: 'change',
//     modeAfterSubmission: 'change' })`. `mode: 'change'` computes on every
//     change (matching RHF-`onTouched`'s live recomputation once a field is
//     in play); WHAT SHOWS is the same explicit dirty+blur/submit gate the
//     RHF recipes apply in `rhfFieldControls.recipe.tsx` — here read off
//     `meta.isBlurred && !meta.isDefaultValue`. `isDefaultValue` (not
//     TanStack's sticky `isDirty`) is deliberate: it's COMPARATIVE, exactly
//     like RHF's `dirtyFields`, so a field reverted to its default re-hides
//     in both — identical edge behavior, not just similar happy paths.
//  4. Standard Schema validators here produce ISSUES ONLY — confirmed by
//     reading `standardSchemaValidator.js`: on success it returns nothing,
//     never the validator's transformed/coerced value. So `age`'s AJV
//     coercion ("18" → 18) never reaches `state.values` mid-typing; `onSubmit`
//     below re-runs the validator itself and uses `result.data` for the
//     "submitted" output — the same "re-validate to recover coercion" glue
//     the audit named, mirroring App_12's coercion story but solved at a
//     different point in the lifecycle (submit, not per-keystroke).
//  5. Nested groups (`address.street`/`address.city`) use plain dot paths —
//     no divergence; TanStack's `DeepKeys` accepts dot paths for object
//     nesting the same way RHF/FormFrame do. The `foo[0]` vs `foo.0`
//     array-path divergence the audit names is real (confirmed in
//     `standardSchemaValidator.js`'s own path-building: it emits
//     `contacts[0].email`) but isn't exercised here — this schema has no
//     array field, matching App_12/App_12B's own scoping.
//
// (No `role="alert"` on the error list — same as the RHF recipes and the
// #117 locked seam: with post-submit change-revalidation, an assertive live
// region would re-announce on every keystroke while the user fixes a field;
// `aria-describedby` keeps the association without the interruption.)
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
// same load-bearing cast App_12's RHF resolver needs, for the same reason.
const standardSchema = toStandardSchema(validator) as StandardSchemaV1<
  Data,
  Data
>

// --- The slice of TanStack's API this recipe consumes ----------------------
// TanStack's precise `FormApi`/`FieldApi` types carry ~12 mutually-
// referential generic parameters (one per validator lifecycle slot) that
// cannot be usefully pinned from a RUNTIME path string — our handlers
// receive `path: string` from the neutral `ControlProps<K>` seam, and
// TanStack's `Field` wants a compile-time `DeepKeys<Data>` literal.
// TanStack's own escape hatch for this situation is `AnyFieldApi` (i.e.
// `any`). We do one better: declare the narrow STRUCTURAL slice of the API
// the recipe actually uses — every property below verified against
// `@tanstack/form-core`'s source — and cast ONCE at the Provider boundary.
// Strictly more typed than `any`, with zero casts at any call site.

interface RecipeFieldApi {
  state: {
    value: unknown
    meta: {
      errors: ReadonlyArray<{ message?: string }>
      /** Sticky: set on first blur, never unset (FieldApi.js `handleBlur`). */
      isBlurred: boolean
      /** COMPARATIVE: current value === the field's default — the analogue
       * of RHF's `dirtyFields` (which un-dirties on revert), unlike
       * TanStack's own sticky `isDirty`. */
      isDefaultValue: boolean
    }
  }
  handleChange: (value: unknown) => void
  handleBlur: () => void
}

interface RecipeFormApi {
  Field: (props: {
    name: string
    children: (field: RecipeFieldApi) => ReactNode
  }) => ReactNode
  /** Reactive form-state subscription. The submitted half of the display
   * gate MUST come through here, not a plain `form.state` read: TanStack
   * aggressively bails out of re-renders when a field's own slice is
   * referentially unchanged, so a field whose error was already computed
   * pre-submit may not re-render at submit at all — a non-reactive
   * `submissionAttempts` read then stays stale and the gate never opens.
   * (Not hypothetical: the parity smoke caught exactly this — blur a field
   * pre-submit and its error silently failed to reveal at submit.) */
  Subscribe: (props: {
    selector: (state: { submissionAttempts: number }) => boolean
    children: (value: boolean) => ReactNode
  }) => ReactNode
}

// TanStack Form ships no ambient FormProvider/useFormContext of its own — the
// `form` object from `useForm()` is meant to be threaded explicitly. This
// Context does the one job RHF's `<FormProvider>` does for free.
const TanStackFormContext = createContext<RecipeFormApi | null>(null)
function useTanStackForm(): RecipeFormApi {
  const form = useContext(TanStackFormContext)
  if (!form) {
    throw new Error('useTanStackForm: no TanStackFormContext.Provider above')
  }
  return form
}

// --- One handler per control archetype (ADR 047 §3 `r.control(kind, …)`) ---

/** The unified display gate (same policy as `rhfFieldControls.recipe.tsx`):
 * reveal only once dirtied (non-default) AND blurred, or after a submit
 * attempt. Pre-gated per #117 — present == show — so `aria-invalid` tracks
 * exactly what's displayed. `submitted` must arrive via the reactive
 * `form.Subscribe` (see {@link RecipeFormApi.Subscribe} for why). */
function displayedErrors(
  submitted: boolean,
  field: RecipeFieldApi
): ReadonlyArray<{ message?: string }> {
  const show =
    submitted ||
    (field.state.meta.isBlurred && !field.state.meta.isDefaultValue)
  return show ? field.state.meta.errors : []
}

/** One reactive subscription to "has a submit been attempted", shared by all
 * three control handlers — the TanStack equivalent of RHF's `isSubmitted`. */
function WithSubmitted({
  children,
}: {
  children: (submitted: boolean) => ReactNode
}): ReactNode {
  const form = useTanStackForm()
  return (
    <form.Subscribe selector={(s) => s.submissionAttempts > 0}>
      {children}
    </form.Subscribe>
  )
}

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
        // No role="alert" — see the header note; matches the RHF recipes.
        <ul id={fieldErrorId(path)} className="jsf-field-errors">
          {errors.map((e, i) => (
            <li key={i}>{e.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function a11yAttrs(path: string, errors: ReadonlyArray<unknown>) {
  return errors.length > 0
    ? {
        'aria-invalid': true as const,
        'aria-describedby': fieldErrorId(path),
      }
    : {}
}

function InputControl({ path, parts }: ControlProps<'input'>): ReactNode {
  const form = useTanStackForm()
  return (
    <WithSubmitted>
      {(submitted) => (
        <form.Field name={path}>
          {(field) => {
            const errors = displayedErrors(submitted, field)
            return (
              <FieldShell path={path} parts={parts} errors={errors}>
                <parts.Control
                  render={(c) => (
                    <input
                      {...c.attrs}
                      value={String(field.state.value ?? '')}
                      onChange={(e) =>
                        field.handleChange(
                          // "Empty means absent" — same normalization as the
                          // RHF recipes' setValueAs, applied to every control.
                          e.target.value === '' ? undefined : e.target.value
                        )
                      }
                      onBlur={field.handleBlur}
                      {...a11yAttrs(path, errors)}
                    />
                  )}
                />
              </FieldShell>
            )
          }}
        </form.Field>
      )}
    </WithSubmitted>
  )
}

function SelectControl({ path, parts }: ControlProps<'select'>): ReactNode {
  const form = useTanStackForm()
  return (
    <WithSubmitted>
      {(submitted) => (
        <form.Field name={path}>
          {(field) => {
            const errors = displayedErrors(submitted, field)
            return (
              <FieldShell path={path} parts={parts} errors={errors}>
                <parts.Control
                  render={(c) => (
                    <select
                      {...c.attrs}
                      value={String(field.state.value ?? '')}
                      onChange={(e) =>
                        field.handleChange(
                          // "Empty means absent": the "-- select --"
                          // placeholder round-trips as absent, not "" (which
                          // would fail the `enum` check).
                          e.target.value === '' ? undefined : e.target.value
                        )
                      }
                      onBlur={field.handleBlur}
                      {...a11yAttrs(path, errors)}
                    >
                      {!c.attrs.multiple && (
                        <option value="">-- select --</option>
                      )}
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
      )}
    </WithSubmitted>
  )
}

function ChoiceGroupControl({
  path,
  parts,
}: ControlProps<'choicegroup'>): ReactNode {
  const form = useTanStackForm()
  return (
    <WithSubmitted>
      {(submitted) => (
        <form.Field name={path}>
          {(field) => {
            const errors = displayedErrors(submitted, field)
            return (
              <FieldShell path={path} parts={parts} errors={errors}>
                <parts.Control
                  render={(c) => (
                    <div
                      role={c.role}
                      aria-labelledby={c.labelledBy}
                      onBlur={field.handleBlur}
                      {...a11yAttrs(path, errors)}
                    >
                      {c.options.map((o) => (
                        <label key={o.attrs.id}>
                          <input
                            {...o.attrs}
                            checked={field.state.value === o.attrs.value}
                            onChange={() => field.handleChange(o.attrs.value)}
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
      )}
    </WithSubmitted>
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
    // TanStack wants a full TFormData up front; a form genuinely starts
    // empty, so this cast is the pragmatic recipe move (their own docs
    // initialize complete defaultValues instead — fine when you have them).
    // The nested group object IS seeded: RHF materializes `address` from its
    // registered leaf names, so a missing street fails `required` at
    // `address.street` (a field with a control to render the error under).
    // TanStack's values are exactly these defaults — without the seed,
    // `address` itself would be the missing property and the error would
    // land on the group, which no control renders. Found by the parity
    // smoke, which asserts all three recipes reveal the SAME error set.
    defaultValues: { address: {} } as Data,
    validators: { onDynamic: standardSchema },
    // 'change' = when TanStack COMPUTES (every change + always at submit);
    // what SHOWS is the dirty+blur/submit gate in `displayedErrors` — the
    // same split as the RHF recipes' mode-vs-gate. `modeAfterSubmission:
    // 'change'` keeps post-submit revalidation live, matching RHF's
    // reValidateMode default.
    validationLogic: revalidateLogic({
      mode: 'change',
      modeAfterSubmission: 'change',
    }),
    onSubmit: ({ value }) => {
      // Re-run the validator to recover coercion the Standard Schema
      // validator discarded (header note #4) — `result.data` is the coerced
      // value; `value` (raw state) is the fallback if nothing transformed.
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
        errors-as-a-prop seam (#117), same display policy (reveal on dirtied +
        blurred, all at submit, live after) — over TanStack Form instead of RHF.
        TanStack owns state via CONTROLLED binds (<code>field.state.value</code>
        /<code>handleChange</code>/<code>handleBlur</code>), and our AJV
        validator plugs in as one <code>onDynamic</code> Standard Schema. This
        is a copy-paste recipe, not a published adapter.
      </p>

      {/* The ONE type boundary in this recipe: `form`'s precise 12-generic
          type collapses to the narrow structural slice the handlers consume
          (RecipeFormApi — every property verified against form-core source).
          TanStack's own escape hatch here is `AnyFieldApi`; this is the
          typed version of the same move. */}
      <TanStackFormContext.Provider value={form as unknown as RecipeFormApi}>
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
