// RECIPE: TanStack Form as the form-state layer, over JSON Schema + AJV.
//
// ONE file to copy — TanStack's binding model is different enough from RHF's
// that nothing from `rhfFieldControls.recipe.tsx` carries over. Same schema as
// App_12/App_12B on purpose, so you can compare "how do I get X" across form
// libraries side by side.
//
// The shape of it:
//
//   schema ─→ jsonSchemaToTree(schema) ──→ <SchemaFields> renders the fields
//   schema ─→ createAjvValidator(schema) → toStandardSchema → one form-level
//             `onDynamic` validator (TanStack consumes Standard Schemas
//             directly — no resolver adapter)
//
// What's different from the RHF recipes — each of these is a real TanStack
// behavior you'll hit adapting this, not a style choice:
//
//   • CONTROLLED binds. TanStack has no uncontrolled `register()` — every
//     control wires `field.state.value` / `handleChange` / `handleBlur`.
//   • No ambient provider. TanStack doesn't ship a FormProvider/useFormContext;
//     the small Context below does that one job.
//   • Validators return issues only — never the coerced/transformed value. So
//     AJV's "18" → 18 coercion can't reach form state mid-typing; `onSubmit`
//     re-runs the validator once more and reads `result.data`. (Yes, that
//     validates twice on submit — it's the price of coercion recovery.)
//   • Display timing is `validationLogic: revalidateLogic()` — TanStack's
//     recommended default, no arguments: quiet until the first submit
//     attempt, then revalidate on change. (Same observable behavior as RHF's
//     default mode, which `revalidateLogic` explicitly exists to emulate —
//     which is why the recipes stay comparable without either hand-rolling a
//     display policy.) Want blur-gated reveal instead?
//     `revalidateLogic({ mode: 'blur' })`.
//   • Seed `defaultValues` with `{}` for EVERY nested group. TanStack's
//     values are exactly your defaults: with `address` missing entirely, a
//     required failure lands on the group itself (which no field control
//     renders); with `address: {}`, it lands on `address.street`, a real
//     field with an error slot.
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

/**
 * Add a "these two fields must match" rule on top of any FormFrame
 * `Validator` — identical to App_12's copy, and that's the point: it never
 * touches the form library, so it moves between recipes unchanged. The error
 * attaches to `field` (a concrete path), so it renders like any other field
 * error.
 */
function withMatchRule<T>(
  validator: Validator<T>,
  field: string,
  mustMatch: string,
  message: string
): Validator<T> {
  return (data) => {
    const result = validator(data)
    const values = (result.data ?? data) as Record<string, unknown>
    const a = values?.[field]
    const b = values?.[mustMatch]
    if (a !== undefined && b !== undefined && a !== b) {
      return {
        valid: false,
        errors: [...result.errors, { path: field, message, keyword: 'match' }],
        data: result.data,
      }
    }
    return result
  }
}

const tree = jsonSchemaToTree(schema)
const validator = withMatchRule(
  createAjvValidator(schema),
  'confirmPassword',
  'password',
  'Passwords must match.'
)
// TanStack consumes any Standard Schema as a validator, so FormFrame's
// bridge plugs straight in. One deliberate cast, same as App_12's resolver:
// FormFrame's `Validator` accepts `unknown` input by design, and TanStack's
// validator slot wants the form's data type on the input side.
const standardSchema = toStandardSchema(validator) as StandardSchemaV1<
  Data,
  Data
>

// --- The slice of TanStack's API this recipe uses ----------------------------
// TanStack's full `FormApi`/`FieldApi` types carry ~12 interlocking generic
// parameters that can't be pinned from a runtime path string — FormFrame
// hands each control handler `path: string`, while TanStack's `Field` wants a
// compile-time key literal. TanStack's own escape hatch for this is
// `AnyFieldApi` (literally `any`); declaring the narrow structural slice we
// actually consume is the typed version of the same move: zero `any`, zero
// casts at call sites, one documented cast at the Provider boundary.

/** One displayed validation issue (Standard Schema guarantees `message`). */
interface FieldIssue {
  message: string
}

interface RecipeFieldApi {
  state: {
    value: unknown
    /** `errors` is already timed by `validationLogic` — whatever is in here
     * is what should be displayed. */
    meta: { errors: ReadonlyArray<FieldIssue> }
  }
  handleChange: (value: unknown) => void
  handleBlur: () => void
}

interface RecipeFormApi {
  Field: (props: {
    name: string
    children: (field: RecipeFieldApi) => ReactNode
  }) => ReactNode
}

const TanStackFormContext = createContext<RecipeFormApi | null>(null)
function useTanStackForm(): RecipeFormApi {
  const form = useContext(TanStackFormContext)
  if (!form) {
    throw new Error('useTanStackForm: no TanStackFormContext.Provider above')
  }
  return form
}

// --- Field plumbing shared by every control handler --------------------------

/**
 * Mounts the TanStack field for `path` and hands back `(field, errors)`.
 * `errors` is simply what TanStack currently holds — `validationLogic`
 * already decides when errors exist, so there's no display gate here. (If you
 * want timing `revalidateLogic` can't express, this is the one place to add
 * it: `field.state.meta` also carries `isBlurred` and `isDefaultValue`, and
 * "has a submit been attempted" is `form.Subscribe`'s
 * `state.submissionAttempts` — read it reactively, never off a bare
 * `form.state`, or it goes stale.)
 */
function Field({
  path,
  children,
}: {
  path: string
  children: (
    field: RecipeFieldApi,
    errors: ReadonlyArray<FieldIssue>
  ) => ReactNode
}): ReactNode {
  const form = useTanStackForm()
  return (
    <form.Field name={path}>
      {(field) => children(field, field.state.meta.errors)}
    </form.Field>
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
  errors: ReadonlyArray<FieldIssue>
  children: ReactNode
}): ReactNode {
  return (
    <div className="jsf-field">
      <parts.Label />
      {parts.Description && <parts.Description />}
      {children}
      {errors.length > 0 && (
        // Deliberately NO role="alert" — errors revalidate on every keystroke
        // after a submit, and an assertive live region would re-announce on
        // every character. `aria-describedby` (below) keeps the association.
        <ul id={fieldErrorId(path)} className="jsf-field-errors">
          {errors.map((e, i) => (
            <li key={i}>{e.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function a11yAttrs(path: string, errors: ReadonlyArray<FieldIssue>) {
  return errors.length > 0
    ? {
        'aria-invalid': true as const,
        'aria-describedby': fieldErrorId(path),
      }
    : {}
}

// --- One handler per control archetype ---------------------------------------
// Registered via `r.control('input' | 'select' | 'choicegroup', …)` below.
// Every control applies the same "empty means absent" normalization as the
// RHF recipes: "" becomes undefined, so an untouched field submits as missing
// instead of failing format/minLength against an empty string.

function InputControl({ path, parts }: ControlProps<'input'>): ReactNode {
  return (
    <Field path={path}>
      {(field, errors) => (
        <FieldShell path={path} parts={parts} errors={errors}>
          <parts.Control
            render={(c) => (
              <input
                {...c.attrs}
                value={String(field.state.value ?? '')}
                onChange={(e) =>
                  field.handleChange(
                    e.target.value === '' ? undefined : e.target.value
                  )
                }
                onBlur={field.handleBlur}
                {...a11yAttrs(path, errors)}
              />
            )}
          />
        </FieldShell>
      )}
    </Field>
  )
}

function SelectControl({ path, parts }: ControlProps<'select'>): ReactNode {
  return (
    <Field path={path}>
      {(field, errors) => (
        <FieldShell path={path} parts={parts} errors={errors}>
          <parts.Control
            render={(c) => (
              <select
                {...c.attrs}
                value={String(field.state.value ?? '')}
                onChange={(e) =>
                  field.handleChange(
                    e.target.value === '' ? undefined : e.target.value
                  )
                }
                onBlur={field.handleBlur}
                {...a11yAttrs(path, errors)}
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
      )}
    </Field>
  )
}

function ChoiceGroupControl({
  path,
  parts,
}: ControlProps<'choicegroup'>): ReactNode {
  return (
    <Field path={path}>
      {(field, errors) => (
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
      )}
    </Field>
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
    // TanStack wants full TFormData up front; a form genuinely starts empty,
    // so the cast is the pragmatic move. Seed `{}` for EVERY nested group —
    // see the header for why.
    defaultValues: { address: {} } as Data,
    validators: { onDynamic: standardSchema },
    // TanStack's own recommended default timing (no arguments): quiet until
    // the first submit attempt, then revalidate on change. This is the same
    // observable behavior as RHF's default mode — `revalidateLogic` exists
    // precisely to emulate it — which is why the recipes stay comparable
    // without either of them hand-rolling a display policy.
    validationLogic: revalidateLogic(),
    onSubmit: ({ value }) => {
      // Second validator run, deliberately: TanStack validators return
      // issues only, so this is where AJV's coercion ("18" → 18) is
      // recovered via `result.data`.
      const result = validator(value)
      setSubmitted(result.data ?? value)
    },
  })
  const renderNode = useRenderNodeRules(tree, tanStackRules)

  return (
    <div>
      <h1>TanStack Form as the form-state layer (recipe)</h1>
      <p>
        The TanStack twin of examples 12/12B: TanStack Form owns the form state
        through controlled binds; FormFrame renders the fields from the same
        JSON Schema; the same AJV validator plugs in as one form-level Standard
        Schema validator. Same display policy — type into a field and leave it
        to reveal its error, submit reveals everything, fixes clear as you type.
        Copy-paste recipe — one file.
      </p>

      {/* The one type boundary: `form`'s 12-generic TanStack type collapses
          to the structural slice the handlers consume (RecipeFormApi). */}
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

// ─── MAINTAINER NOTES (temporary — not part of the recipe) ───────────────────
// Build-log for the #116 epic; safe to delete when copying this file.
// • Ticket #124; seam locked at #117; glue list from the TanStack audit
//   (#121). Third implementation of the #116 capability matrix; parity with
//   App_12/App_12B proven by `scripts/recipe-parity-smoke.mjs`.
// • Claims verified against @tanstack/form-core SOURCE (not docs):
//   controlled-only (FieldApi.js), issues-only Standard Schema validators
//   (standardSchemaValidator.js — success returns nothing, transformed value
//   discarded), revalidateLogic's RHF-mode emulation (ValidationLogic.js's
//   own doc comment), isBlurred/isDefaultValue semantics (fieldMetaDerived).
// • Display policy is each library's own default (see the `Field` doc for
//   where a custom gate would go). An earlier iteration imposed a shared
//   dirtied+blurred gate across all three recipes; that required a
//   `form.Subscribe` submitted-flag plus `isBlurred`/`isDefaultValue` reads
//   here, and a touched/dirty/isSubmitted gate in the RHF half — all deleted
//   once we found RHF's and TanStack's defaults already agree observably.
//   Keep that history in mind before re-adding a gate: the `Subscribe`
//   reactivity trap (a bare `form.state` read goes stale, leaving a
//   pre-submit-blurred field's error unrevealed at submit) was a real bug
//   the parity smoke caught, and it only existed because of the gate.
// • The nested-defaults seeding was also a parity-smoke find: without
//   `address: {}`, the required failure landed on the group node (invisible)
//   instead of `address.street`, diverging from RHF's materialized nested
//   values.
// • Array paths: standardSchemaValidator.js emits `contacts[0].email` (not
//   FormFrame's `contacts.0.email`) — normalization glue is real but
//   unexercised here (no array field, matching App_12/12B's scoping).
// • Out of scope, owned by #125: async (`onDynamicAsync`) + pending/stale
//   rows, pathless/whole-document issues (TanStack keeps them; RHF drops
//   them), array fields.
// ──────────────────────────────────────────────────────────────────────────────
