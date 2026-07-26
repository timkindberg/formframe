// RECIPE: TanStack Form as the form-state layer, over JSON Schema + AJV.
//
// ONE file to copy — TanStack's binding model is different enough from RHF's
// that nothing from `rhfFieldControls.recipe.tsx` carries over. Same schema
// and same display policy as App_12/App_12B on purpose, so you can compare
// "how do I get X" across form libraries side by side.
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
//   • Display policy = `revalidateLogic` (when errors are COMPUTED: every
//     change, always at submit) + the explicit gate in `displayedErrors`
//     (when they SHOW: dirtied + blurred, or after a submit attempt). The
//     dirty check uses `isDefaultValue` — comparative, so reverting a field
//     to its default re-hides its error — not TanStack's sticky `isDirty`.
//   • Seed `defaultValues` with `{}` for EVERY nested group. TanStack's
//     values are exactly your defaults: with `address` missing entirely, a
//     required failure lands on the group itself (which no field control
//     renders); with `address: {}`, it lands on `address.street`, a real
//     field with an error slot.
//   • Reactivity trap: read submit state through `form.Subscribe`, never a
//     bare `form.state` read in render. TanStack skips re-rendering fields
//     whose own slice didn't change, so a bare read can go stale — a field
//     blurred before submit would silently never reveal its error.
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
    meta: {
      errors: ReadonlyArray<FieldIssue>
      /** Sticky: set on first blur, never unset. */
      isBlurred: boolean
      /** Comparative: current value equals the field's default. The analogue
       * of RHF's `dirtyFields` (which un-dirties on revert) — unlike
       * TanStack's own `isDirty`, which is sticky. */
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
  /** Reactive form-state subscription — see the header's reactivity trap. */
  Subscribe: (props: {
    selector: (state: { submissionAttempts: number }) => boolean
    children: (value: boolean) => ReactNode
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

/** The display gate: reveal once dirtied (non-default) AND blurred, or after
 * a submit attempt — the same policy as the RHF recipes. Errors handed out
 * are pre-gated: present means show, and `aria-invalid` tracks exactly that. */
function displayedErrors(
  submitted: boolean,
  field: RecipeFieldApi
): ReadonlyArray<FieldIssue> {
  const show =
    submitted ||
    (field.state.meta.isBlurred && !field.state.meta.isDefaultValue)
  return show ? field.state.meta.errors : []
}

/**
 * Mounts the TanStack field for `path` and hands back `(field, errors)` with
 * the display gate already applied. Combines the reactive submitted-flag
 * subscription (`form.Subscribe` — the boolean flips once, re-rendering each
 * field exactly once at first submit) with the field mount, so control
 * handlers stay flat.
 */
function GatedField({
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
    <form.Subscribe selector={(s) => s.submissionAttempts > 0}>
      {(submitted) => (
        <form.Field name={path}>
          {(field) => children(field, displayedErrors(submitted, field))}
        </form.Field>
      )}
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
    <GatedField path={path}>
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
    </GatedField>
  )
}

function SelectControl({ path, parts }: ControlProps<'select'>): ReactNode {
  return (
    <GatedField path={path}>
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
    </GatedField>
  )
}

function ChoiceGroupControl({
  path,
  parts,
}: ControlProps<'choicegroup'>): ReactNode {
  return (
    <GatedField path={path}>
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
    </GatedField>
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
    // When errors are COMPUTED: every change, always at submit, and live
    // after submit. When they SHOW is `displayedErrors`' gate — same
    // compute-vs-show split as the RHF recipes' `mode` vs gate.
    validationLogic: revalidateLogic({
      mode: 'change',
      modeAfterSubmission: 'change',
    }),
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
// • The Subscribe reactivity trap and the nested-defaults seeding were both
//   found by the parity smoke, not by reading docs: a bare `form.state`
//   read left a pre-submit-blurred field's error unrevealed at submit; and
//   without `address: {}`, the required failure landed on the group node
//   (invisible) instead of `address.street`, diverging from RHF's
//   materialized nested values.
// • Array paths: standardSchemaValidator.js emits `contacts[0].email` (not
//   FormFrame's `contacts.0.email`) — normalization glue is real but
//   unexercised here (no array field, matching App_12/12B's scoping).
// • Out of scope, owned by #125: async (`onDynamicAsync`) + pending/stale
//   rows, pathless/whole-document issues (TanStack keeps them; RHF drops
//   them), array fields.
// ──────────────────────────────────────────────────────────────────────────────
