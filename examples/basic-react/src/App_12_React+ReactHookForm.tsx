// SPIKE / RECIPE: React Hook Form as the form-state layer (ADR 024).
//
// This is NOT a maintained package — it's a copy-pasteable recipe (ADR 024:
// adapters are patterns, not packages). It answers three questions the native
// path (ADR 023) left open, and the answers are the comments below.
//
// What this proves
// ----------------
//  1. Our `Validator` seam (ADR 019) survives unchanged as an RHF *resolver*.
//     `validatorResolver` is a small shim: clone, call the validator, fan its
//     flat issue list out into RHF's nested error shape. AJV/Zod/Valibot all slot
//     in because they already implement `Validator`. RHF does NOT make our
//     validation layer redundant — it *consumes* it.
//  2. RHF owns form *state* (values, touched, submit) — it replaces the ADR-023
//     issue store, which is exactly the swappable form-state slot. Our Core tree
//     + `renderNode` seam (ADR 010/013) render the structure; one `register()`
//     call wires any control (input AND select) through the seam, no engine change.
//  3. Touched-gated error UX is FREE and we must NOT hand-roll it. RHF
//     field-scopes resolver errors itself: on a single field's event it runs the
//     whole-form resolver but only commits the *triggering* field's error
//     (verified — touching one field shows only its error; submit shows all). So
//     `mode: 'onTouched'` alone gives "show only after touched". An earlier
//     version of this file gated display on `touched` by hand; that was both
//     redundant AND wrong — under the default `onSubmit` mode it swallowed every
//     submit-time error. KEY INPUT for the native touched policy: mirror RHF —
//     commit only the validated field's issues to the store, don't add a display
//     gate on top.
//
// Bugs this shook out (now fixed)
// -------------------------------
//  - `format` (e.g. `email`) was silently ignored: AJV v8 needs `ajv-formats`,
//    which `createAjvValidator` now registers by default.
//  - A mutating validator must NEVER touch the form library's state. AJV's
//    `coerceTypes` mutates in place; handing it RHF's live values corrupted RHF's
//    change tracking, so a fixed field's error never cleared. The resolver now
//    validates a clone (which also drops `undefined`, so an empty optional number
//    reads as absent, not "must be a number").
//
// Friction found (informs the seam, not blocking)
// -----------------------------------------------
//  - We re-compose the field (label/description/control/error) by hand in
//    `RHFField` instead of reusing the default field root, because the default
//    root renders the ADR-023 store's errors, and here errors live in RHF. A
//    first-class "bring your own error source" hook would remove this.
import { useMemo, useState } from 'react'
import {
  useForm,
  FormProvider,
  useFormContext,
  useFormState,
} from 'react-hook-form'
import type { Resolver, FieldValues, FieldErrors } from 'react-hook-form'
import { jsonSchemaToTree } from '@jsonschema-form/core'
import type { JSONSchema, Validator } from '@jsonschema-form/core'
import { SchemaFields } from '@jsonschema-form/react'
import type { EField, RenderNode } from '@jsonschema-form/react'
import { createAjvValidator } from '@jsonschema-form/validation-ajv'

const schema: JSONSchema = {
  type: 'object',
  required: ['firstName', 'email'],
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
  },
}

// --- The whole adapter: our Validator -> an RHF resolver ---------------------
// Flat issues (path + message) fan out into RHF's nested error object. Empty
// path (root issue) is skipped — it has no field to attach to.
function setNested(
  target: Record<string, unknown>,
  path: string,
  leaf: unknown
): void {
  const keys = path.split('.')
  let obj = target
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    if (typeof obj[k] !== 'object' || obj[k] === null) obj[k] = {}
    obj = obj[k] as Record<string, unknown>
  }
  obj[keys[keys.length - 1]] = leaf
}

function getNested(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, k) => (acc == null ? acc : (acc as Record<string, unknown>)[k]),
      obj
    )
}

function validatorResolver(validator: Validator): Resolver<FieldValues> {
  return (values) => {
    // Clone before validating. AJV's `coerceTypes` MUTATES the object in place;
    // handing it RHF's live value object corrupts RHF's change tracking (an error
    // wouldn't clear after you fixed the field). The JSON round-trip also drops
    // `undefined` keys, so an empty optional field reads as "absent", not "must be
    // a number". This is the real seam finding: a mutating validator must never
    // touch the form library's own state.
    const data = JSON.parse(JSON.stringify(values)) as FieldValues
    const result = validator(data)
    if (result.valid) return { values: data, errors: {} }
    const errors: Record<string, unknown> = {}
    for (const issue of result.issues) {
      if (issue.path === '') continue
      setNested(errors, issue.path, {
        type: issue.keyword ?? 'validation',
        message: issue.message,
      })
    }
    return { values: {}, errors: errors as FieldErrors<FieldValues> }
  }
}

// --- A field, wired to RHF through our renderNode seam -----------------------
// `register` makes the control uncontrolled (ref-based, the perf-preserving
// path) and works for inputs AND selects. `useFormState({ name })` scopes the
// subscription to THIS field, so only this field re-renders when its own error
// flips (RHF's fine-grained proxy, the same goal as our ADR-023 store).
//
// Display is NOT hand-gated on "touched" — RHF's `mode` owns *when* errors
// appear; we just render whatever is in `formState.errors`. (Earlier this gated
// on touched, which silently swallowed submit-time errors under the default
// `onSubmit` mode — the wrong layer to make that decision.)
type Default = Parameters<RenderNode>[1]['Default']

function RHFField({
  node,
  Default,
}: {
  node: EField
  Default: Default
}): React.ReactNode {
  const { register } = useFormContext()
  const { errors } = useFormState({ name: node.path })
  const error = getNested(errors, node.path) as { message?: string } | undefined
  const msg = error?.message
  const errorId = `${node.path}-error`
  const a11y = msg
    ? { 'aria-invalid': true as const, 'aria-describedby': errorId }
    : {}

  // One `register` call serves any field control. Number widgets map "" ->
  // undefined so an empty optional number is absent (valid), not a type error;
  // the validator still owns coercion of non-empty values.
  const control =
    node.widget === 'input' ? (
      <input
        {...node.parts.input.attrs}
        {...register(
          node.path,
          node.parts.input.attrs.type === 'number'
            ? { setValueAs: (v) => (v === '' ? undefined : v) }
            : undefined
        )}
        {...a11y}
      />
    ) : (
      <select {...node.parts.select.attrs} {...register(node.path)} {...a11y}>
        <option value="">-- select --</option>
        {node.parts.select.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )

  return (
    <div className="jsf-field">
      <Default of={node.parts.label} />
      <Default of={node.parts.description} />
      {control}
      {msg && (
        <p
          id={errorId}
          className="jsf-error"
          role="alert"
          style={{ color: 'crimson', margin: '2px 0 0' }}
        >
          {msg}
        </p>
      )}
    </div>
  )
}

export default function App() {
  const form = useMemo(() => jsonSchemaToTree(schema), [])
  const validator = useMemo(() => createAjvValidator(schema), [])
  const resolver = useMemo(() => validatorResolver(validator), [validator])
  const methods = useForm({ resolver })
  const [submitted, setSubmitted] = useState<FieldValues | null>(null)

  return (
    <div>
      <h1>React Hook Form as the form-state layer (recipe, ADR 024)</h1>
      <p>
        RHF owns state + submit; our Core tree + <code>renderNode</code> render
        the structure; our <code>Validator</code> (AJV) is reused as RHF&apos;s{' '}
        <code>resolver</code>. Errors show on submit and re-validate on change
        (default RHF mode); switching to <code>mode: &quot;onTouched&quot;</code>{' '}
        gives touched-gated display with no extra code, because RHF field-scopes
        resolver errors itself. This is a copy-paste recipe, not a published
        adapter.
      </p>

      <FormProvider {...methods}>
        <form
          noValidate
          onSubmit={methods.handleSubmit((data) => setSubmitted(data))}
        >
          <SchemaFields
            form={form}
            renderNode={(node, { Default }) => {
              if (node.isField) return <RHFField node={node} Default={Default} />
              return <Default of={node} />
            }}
          />
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
