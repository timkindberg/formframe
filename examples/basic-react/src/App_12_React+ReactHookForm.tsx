// RECIPE: React Hook Form as the form-state layer (ADR 024), on the shipped
// `renderNodeRules`/`useRenderNodeRules` API (ADR 047/048). Ticket: #123
// (wayfinder epic #116 — "demote validation to a non-goal"; seam locked at #117).
//
// This is NOT a maintained package — it's a copy-pasteable recipe. It answers
// the questions the native path (ADR 023) leaves open, and RHF's audit (#120)
// named the exact glue this file provides:
//
//  1. Our `Validator` seam (ADR 019) survives unchanged — handed to RHF as a
//     Standard Schema via `toStandardSchema` (ADR 026). `@hookform/resolvers`'s
//     `standardSchemaResolver` calls `schema['~standard'].validate()` and maps
//     Standard Schema's `issues` into RHF's nested error shape (no bespoke
//     resolver shim). AJV/Zod/Valibot all slot in because they already implement
//     `Validator`. RHF does NOT make our validation layer redundant — it
//     *consumes* it.
//  2. RHF owns form *state* (values, touched, submit) — it replaces the ADR-023
//     error store, which is exactly the swappable form-state slot. Our Core tree
//     + `renderNodeRules` (ADR 047) render the structure; `parts.Control`'s
//     `render` prop wires any control (input AND select) through `register()`,
//     no engine change.
//  3. Touched-gated error UX is FREE (glue #4) and we must NOT hand-roll it. RHF
//     field-scopes resolver errors itself, so `mode: 'onTouched'` alone gives
//     "show only after touched" — the RHF equivalent of ADR 027's `'touched'`
//     display policy. `mode: 'onSubmit'` (RHF's default) matches `'submit'`;
//     there is no exact RHF equivalent of `'always'` (nothing validates before
//     the first event), which the audit flagged as a real capability delta, not
//     a recipe bug.
//  4. Errors are injected as a PROP, not read from our internal `ValidationStore`
//     (the locked #117 seam: "the library renders, recipes produce"). Each
//     control handler below reads its own error from RHF's `useFormState({name})`
//     and threads it straight into the markup — no `ValidationProvider`, no
//     `useFieldErrors`. `fieldErrorId`/`fieldControlId` (from `@formframe/
//     renderer-react`) are reused so the a11y wiring matches the library's own
//     convention even though the error source is entirely RHF's.
//  5. Cross-field rules attach to a CONCRETE path, never root/pathless (the #118
//     fixture-design decision): `confirmPassword`'s "must match password" error
//     is produced with `path: 'confirmPassword'`, so it renders through the
//     exact same per-field mechanism as a structural AJV error — no whole-
//     document wrapper or summary needed for this recipe.
//  6. Nested groups (`address.street`/`address.city`) prove nested error paths:
//     RHF's nested `errors.address.street` shape is walked by RHF's own `get`
//     utility (the same one `@hookform/error-message`'s `ErrorMessage` uses
//     internally) — no special-casing, no extra dependency.
//
// Upgrade from the pre-renderNodeRules version of this file: the old `RHFField`
// hand-rolled a `switch (ctl.kind)` for every control kind inline. Registering
// one handler PER ARCHETYPE via `r.control('input', …)` / `r.control('select', …)`
// (ADR 047 §3 — control-kind selectors) replaces that switch with ordinary
// selector dispatch, typed against the schema's resolved `FormShape` (ADR 048).
//
// Bugs this shook out (still true, unchanged by the above)
// -----------------------------------------------------------------------------
//  - `format` (e.g. `email`) was silently ignored: AJV v8 needs `ajv-formats`,
//    which `createAjvValidator` now registers by default.
//  - A mutating validator must NEVER touch the form library's state. AJV's
//    `coerceTypes` mutates in place; handing it RHF's live values corrupted RHF's
//    change tracking, so a fixed field's error never cleared. This drove ADR 025:
//    the `Validator` contract is now pure (the AJV adapter clones internally and
//    returns coerced data as `result.data`), so this recipe needs no clone —
//    `withCrossFieldRule` below composes on top of that same purity invariant.
//
// Out of scope for this recipe (left to #125's shared parity fixtures)
// -----------------------------------------------------------------------------
//  - Async validation (e.g. a username-availability check) and its pending/
//    stale-result rows.
//  - Array fields (`contacts[]`) — RHF's `useFieldArray` is the relevant glue,
//    not exercised here.
//  - A run-failure-vs-invalid wrapper (only needed to prove a thrown/rejected
//    validator is distinct from an invalid verdict).
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
import { toStandardSchema, type Validator } from '@formframe/core'
import { jsonSchemaToTree, type FormShapeOf } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'
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
    // 6 options clears the shipped OPTION_COUNT_THRESHOLD (5), so this defaults
    // to a 'select' widget — 'contactMethod' below stays under it and defaults
    // to 'choicegroup' (radio), exercising both archetypes.
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

// --- Cross-field rule, composed on top of AJV without touching Core ----------
// Attaches its error to `confirmPassword` (a concrete field path), per the #118
// fixture-design decision — so it needs no root/pathless wrapper downstream.
// Purity (ADR 025) holds: reads `result.data`/`data`, mutates neither.
//
// FORM-LIBRARY-AGNOSTIC, not schema-agnostic: this only touches our own
// `Validator`/`ValidationResult` types (no RHF import), so it would compose
// unchanged into the native or TanStack recipes — but it hardcodes the
// `password`/`confirmPassword` field names, so it's specific to this schema,
// not a generic "add a cross-field rule" combinator.
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

// --- Errors as a PROP, sourced from RHF, never our internal store (#117) -----
//
// `useFormState({ name })`'s `name` only scopes WHEN this re-renders (RHF's
// subscription optimization) — the returned `errors` is always the FULL
// nested `FieldErrors` tree, so a nested-path lookup is still required. `get`
// is RHF's own exported utility (the same one `@hookform/error-message`'s
// `ErrorMessage` component uses internally) — reused here instead of hand-
// rolling a dot-path walk, and it means the `@hookform/error-message` package
// itself buys nothing this recipe doesn't already have via `react-hook-form`.

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
// `parts.Control`'s `render` prop hands back the raw, kind-narrowed
// `FieldControl` — the consumer wires `register()` and owns a11y (spreading
// `c.attrs` and adding our own), exactly like the top-level `Default of={node}
// parts={{…}}` override does for a single field, but generically for every
// field of this archetype.
//
// The label/description/error shell is IDENTICAL across every archetype —
// only what fills `<parts.Control render={…}/>` differs — so it's factored
// into one wrapper instead of repeated per handler.

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
              // A blank "-- select --" placeholder submits "" for an untouched
              // optional field, which fails an `enum` check ("" isn't a member).
              // Map it to `undefined` — mirrors the empty-number normalization
              // above — so "nothing chosen" round-trips as absent, not invalid.
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
  const tree = useMemo(() => jsonSchemaToTree(schema), [])
  const validator = useMemo(
    () => withCrossFieldRule(createAjvValidator(schema)),
    []
  )
  const resolver = useMemo(
    () =>
      standardSchemaResolver(
        // Core emits input: unknown; RHF's resolver expects FieldValues at the boundary.
        toStandardSchema(validator) as StandardSchemaV1<
          FieldValues,
          FieldValues
        >
      ),
    [validator]
  )
  // 'onTouched' == ADR 027's 'touched' display policy (glue #4) — RHF gates
  // display itself; we never hand-gate on `touchedFields`.
  const methods = useForm({ resolver, mode: 'onTouched' })
  const renderNode = useRenderNodeRules(tree, rhfRules)
  const [submitted, setSubmitted] = useState<FieldValues | null>(null)

  return (
    <div>
      <h1>React Hook Form as the form-state layer (recipe, ADR 024)</h1>
      <p>
        RHF owns state + submit; our Core tree + <code>renderNodeRules</code>{' '}
        (ADR 047/048) render the structure via typed control-kind selectors; our{' '}
        <code>Validator</code> (AJV, plus a hand-composed cross-field rule) is
        adapted to a Standard Schema via <code>toStandardSchema</code> (ADR 026)
        and wired into RHF through <code>standardSchemaResolver</code>. Errors
        are injected as a prop straight from RHF&apos;s{' '}
        <code>useFormState</code> — never our internal validation store (the
        #117 seam: the library renders, this recipe produces). Touch a field and
        blur to see touched-gated display; mismatch the passwords to see the
        cross-field rule attach to <code>confirmPassword</code>. This is a
        copy-paste recipe, not a published adapter.
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
