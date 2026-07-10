// Touched-gated error display (ADR 027) — React-Hook-Form-style "quiet until
// touched".
//
// The SAME live validator (ADR 021) runs on every keystroke; `showErrorsWhen`
// only decides *when each field reveals* the error it already has. Toggle the
// policy below to feel the difference:
//   • always  — report the moment the validator produces an error (opt-out)
//   • touched — stay quiet until the field blurs; submit reveals all (RHF-like;
//               the library default, ADR 027)
//   • submit  — nothing until a submit attempt
//
// `useFormTree` owns the touched/submitted state. You wire one `onBlur` at the
// form (focusout bubbles, so a single handler covers every field) and spread its
// complete validation capability into `ValidationProvider`.
import { useMemo, useState } from 'react'
import {
  useFormTree,
  ValidationProvider,
  type ShowErrorsWhen,
} from '@jsonschema-form/react'
import { createAjvValidator } from '@jsonschema-form/validation-ajv'
import { jsonSchemaToTree } from '@jsonschema-form/input-jsonschema'
import type { JSONSchema } from '@jsonschema-form/input-jsonschema'

const schema = {
  type: 'object',
  required: ['username', 'email'],
  properties: {
    username: {
      type: 'string',
      title: 'Username',
      description: 'At least 3 characters.',
      minLength: 3,
    },
    email: {
      type: 'string',
      title: 'Email',
      description: 'Must be a valid email address.',
      format: 'email',
    },
  },
} as const satisfies JSONSchema
const tree = jsonSchemaToTree(schema)

const policies: ShowErrorsWhen[] = ['always', 'touched', 'submit']

function App() {
  const validator = useMemo(() => createAjvValidator(schema), [])
  const { SchemaFields, submit, revalidate, handleBlur, validation } =
    useFormTree(tree, { validator })
  const [mode, setMode] = useState<ShowErrorsWhen>('touched')
  const [submittedData, setSubmittedData] = useState<Record<
    string,
    unknown
  > | null>(null)

  return (
    <div>
      <h1>JSON Schema Form — Touched-Gated Errors (ADR 027)</h1>
      <p>
        Live validation (ADR 021) runs on every keystroke regardless — this only
        changes <em>when a field shows</em> the error it already has.{' '}
        <code>showErrorsWhen</code> is orthogonal to <em>when you validate</em>:
        you can validate live and still keep errors quiet until blur.
      </p>

      <fieldset style={{ marginBottom: '1rem' }}>
        <legend>
          <code>showErrorsWhen</code>
        </legend>
        {policies.map((p) => (
          <label key={p} style={{ marginRight: '1.25rem' }}>
            <input
              type="radio"
              name="policy"
              checked={mode === p}
              onChange={() => setMode(p)}
            />{' '}
            {p}
          </label>
        ))}
      </fieldset>

      <form
        noValidate
        onSubmit={submit((data) => setSubmittedData(data))}
        onInput={revalidate}
        // Blur both marks the field touched AND revalidates, so tabbing through
        // an empty required field surfaces its error on blur (not only after the
        // first keystroke elsewhere). Display is still gated by `showErrorsWhen`.
        onBlur={(e) => {
          handleBlur(e)
          revalidate(e)
        }}
      >
        <ValidationProvider {...validation} showErrorsWhen={mode}>
          <SchemaFields />
        </ValidationProvider>
        <button type="submit">Submit</button>
      </form>

      <p style={{ color: '#666', fontSize: '0.85rem' }}>
        Try <code>touched</code>: type an invalid value — no error yet — then
        tab away to reveal it. Because blur also revalidates, tabbing through an
        empty required field surfaces its error on blur too. Untouched fields
        stay quiet until you submit.
      </p>

      {submittedData && (
        <>
          <p style={{ color: 'green' }}>Submitted valid data:</p>
          <pre>{JSON.stringify(submittedData, null, 2)}</pre>
        </>
      )}
    </div>
  )
}

export default App
