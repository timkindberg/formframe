// Side-loaded, submit-time validation (ADR 019).
//
// Validation is a capability slot: Core names the `Validator` shape, an adapter
// (here @jsonschema-form/validation-ajv) implements it, and `useSchemaForm`
// runs it. Pass `{ validator }`, submit through `submit(onValid)`, and the
// returned `SchemaFields` surfaces each issue under its own field — no schema
// annotations, no IR change, and the validator stays swappable (AJV → Zod).
import { useMemo, useState } from 'react'
import {
  useSchemaForm,
  ValidationProvider,
  ValidationSummary,
} from '@jsonschema-form/react'
import { createAjvValidator } from '@jsonschema-form/validation-ajv'
import type { JSONSchema } from '@jsonschema-form/input-jsonschema'

const schema: JSONSchema = {
  type: 'object',
  required: ['username'],
  properties: {
    username: {
      type: 'string',
      title: 'Username',
      description: 'At least 3 characters.',
      minLength: 3,
    },
    zip: {
      type: 'string',
      title: 'Zip code',
      description: 'Exactly five digits.',
      pattern: '^[0-9]{5}$',
    },
    age: {
      type: 'number',
      title: 'Age',
      description: 'A number ≥ 18 (the string from the input is coerced).',
      minimum: 18,
    },
  },
}

function App() {
  // Compile the schema once; the validator is the side-loaded slot.
  const validator = useMemo(() => createAjvValidator(schema), [])
  // `submitAttempted` is the hook's submit flag; the default display policy is
  // `'touched'` (ADR 027), so a submit attempt is what reveals these errors.
  const {
    SchemaFields,
    submit,
    errors,
    submitted: submitAttempted,
  } = useSchemaForm(schema, { validator })
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(
    null
  )

  const handleValid = (data: Record<string, unknown>) => setSubmitted(data)

  return (
    <div>
      <h1>JSON Schema Form — Side-loaded Validation (ADR 019)</h1>
      <p>
        <code>useSchemaForm(schema, {'{ validator }'})</code> runs the validator
        at submit. Invalid data shows an issue under each field and blocks the
        handler; valid data clears the issues and submits. The validator is a
        plain <code>Validator</code> from <code>validation-ajv</code> — swap it
        for Zod/Valibot without touching the form.
      </p>
      <p>
        The <code>&lt;form&gt;</code> uses <code>noValidate</code> so the JS
        validator owns the UX (the schema also renders native{' '}
        <code>required</code>/<code>pattern</code> attrs, ADR 012).
      </p>
      <p>
        <code>&lt;ValidationSummary /&gt;</code> lists all errors with anchor
        links to each field; fields automatically receive{' '}
        <code>aria-invalid</code> and <code>aria-describedby</code> when they
        have issues.
      </p>

      <form noValidate onSubmit={submit(handleValid)}>
        <ValidationProvider issues={errors} submitted={submitAttempted}>
          <ValidationSummary />
          <SchemaFields />
        </ValidationProvider>
        <button type="submit">Submit</button>
      </form>

      {errors.length > 0 && (
        <p style={{ color: 'crimson' }}>
          {errors.length} issue(s) — see the fields above.
        </p>
      )}
      {submitted && (
        <>
          <p style={{ color: 'green' }}>Submitted valid data:</p>
          <pre>{JSON.stringify(submitted, null, 2)}</pre>
        </>
      )}
    </div>
  )
}

export default App
