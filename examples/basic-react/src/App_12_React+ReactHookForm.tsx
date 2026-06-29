// SPIKE / RECIPE: React Hook Form as the form-state layer (ADR 024).
//
// This is NOT a maintained package — it's a copy-pasteable recipe (ADR 024:
// adapters are patterns, not packages). It answers three questions the native
// path (ADR 023) left open, and the answers are the comments below.
//
// What this proves
// ----------------
//  1. Our `Validator` seam (ADR 019) survives unchanged as an RHF *resolver*.
//     `validatorResolver` is a ~12-line shim: call the validator, fan its flat
//     issue list out into RHF's nested error shape. AJV/Zod/Valibot all slot in
//     because they already implement `Validator`. RHF does NOT make our
//     validation layer redundant — it *consumes* it.
//  2. RHF owns form *state* (values, touched, submit) — it replaces the ADR-023
//     issue store, which is exactly the swappable form-state slot. Our Core tree
//     + `renderNode` seam (ADR 010/013) render the structure; `register()` is
//     injected onto each input through the seam with no engine change.
//  3. Touched-gated error UX ("show an error only after the field is touched")
//     comes from RHF's `mode: 'onTouched'` for *timing*, BUT because our
//     validator validates the whole document at once, the resolver returns every
//     issue on the first touch. So display must still be gated per-field on that
//     field's own touched state (see `RHFField`). This is the key finding for the
//     future native touched policy: with a whole-schema validator, "touched" is a
//     per-field *display* gate, independent of when validation runs.
//
// Friction found (informs the seam, not blocking)
// -----------------------------------------------
//  - We re-compose the field (label/description/input/error) by hand in `RHFField`
//    instead of reusing the default field root, because the default root renders
//    the ADR-023 store's errors, and here errors live in RHF. A first-class
//    "bring your own error source" hook would remove this hand-composition.
//  - Number coercion DID flow through (submitting yields `age: 30`, a number) —
//    but only because AJV's `coerceTypes` MUTATES the data object in place and the
//    resolver returns that same object. A non-mutating validator (Zod) would
//    submit the raw string. So portable, validator-driven coercion is a real
//    argument for the `Validator` contract returning the (possibly transformed)
//    data, not just issues — a future seam evolution, captured for later.
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
      (acc, k) =>
        acc == null ? acc : (acc as Record<string, unknown>)[k],
      obj
    )
}

function validatorResolver(validator: Validator): Resolver<FieldValues> {
  return (values) => {
    const result = validator(values)
    if (result.valid) return { values, errors: {} }
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
// `register` makes the input uncontrolled (ref-based, the perf-preserving path).
// `useFormState({ name })` scopes the subscription to THIS field, so only this
// field re-renders when its own error/touched flips (RHF's fine-grained proxy,
// the same goal as our ADR-023 store).
type Default = Parameters<RenderNode>[1]['Default']

function RHFField({
  node,
  Default,
}: {
  node: EField
  Default: Default
}): React.ReactNode {
  const { register } = useFormContext()
  const { errors, touchedFields } = useFormState({ name: node.path })
  // Narrow the discriminated field union to the input variant (lost across the
  // prop boundary); selects fall back to the default renderer above.
  if (node.widget !== 'input') return null
  const attrs = node.parts.input.attrs
  const error = getNested(errors, node.path) as { message?: string } | undefined
  const touched = Boolean(getNested(touchedFields, node.path))
  // Per-field touched gate (see header finding #3): the resolver returns every
  // issue at once, so we only surface THIS field's error once it's been touched.
  const show = touched && Boolean(error?.message)
  const errorId = `${attrs.id}-error`
  return (
    <div className="jsf-field">
      <Default of={node.parts.label} />
      <Default of={node.parts.description} />
      <input
        {...attrs}
        {...register(node.path)}
        aria-invalid={show ? true : undefined}
        aria-describedby={show ? errorId : undefined}
      />
      {show && (
        <p
          id={errorId}
          className="jsf-error"
          role="alert"
          style={{ color: 'crimson', margin: '2px 0 0' }}
        >
          {error?.message}
        </p>
      )}
    </div>
  )
}

export default function App() {
  const form = useMemo(() => jsonSchemaToTree(schema), [])
  const validator = useMemo(() => createAjvValidator(schema), [])
  const resolver = useMemo(() => validatorResolver(validator), [validator])
  const methods = useForm({ resolver, mode: 'onTouched' })
  const [submitted, setSubmitted] = useState<FieldValues | null>(null)

  return (
    <div>
      <h1>React Hook Form as the form-state layer (recipe, ADR 024)</h1>
      <p>
        RHF owns state + submit; our Core tree + <code>renderNode</code> render
        the structure; our <code>Validator</code> (AJV) is reused as RHF&apos;s{' '}
        <code>resolver</code>. Errors appear only after a field is{' '}
        <strong>touched</strong> (<code>mode: &quot;onTouched&quot;</code> for
        timing, plus a per-field gate because the validator returns all issues at
        once). This is a copy-paste recipe, not a published adapter.
      </p>

      <FormProvider {...methods}>
        <form
          noValidate
          onSubmit={methods.handleSubmit((data) => setSubmitted(data))}
        >
          <SchemaFields
            form={form}
            renderNode={(node, { Default }) => {
              if (node.isField && node.widget === 'input')
                return <RHFField node={node} Default={Default} />
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
