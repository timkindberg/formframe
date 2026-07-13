// Live (validate-on-change) validation via the Validator seam (ADR 021).
//
// Wire `revalidate` to the consumer-owned `<form onInput>` (per keystroke) or
// `onChange` (blur for text fields); the hook reads native FormData, runs the
// side-loaded validator, and updates the same `errors` state — inputs stay
// uncontrolled.
import { useMemo, useState } from 'react'
import {
  useFormTree,
  ValidationProvider,
  ValidationSummary,
} from '@formframe/renderer-react'
import { createAjvValidator } from '@formframe/validation-ajv'
import { jsonSchemaToTree } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'

const schema = {
  type: 'object',
  required: ['username'],
  properties: {
    username: {
      type: 'string',
      title: 'Username',
      description:
        'At least 3 characters (validator reports; no native minLength attr).',
      minLength: 3,
    },
    handle: {
      type: 'string',
      title: 'Handle',
      description:
        'Max 20 characters — the browser constrains via native maxLength.',
      maxLength: 20,
    },
    zip: {
      type: 'string',
      title: 'Zip code',
      description: 'Exactly five digits.',
      pattern: '^[0-9]{5}$',
    },
  },
} as const satisfies JSONSchema
const tree = jsonSchemaToTree(schema)

function App() {
  const validator = useMemo(() => createAjvValidator(schema), [])
  const { SchemaFields, submit, revalidate, validation } = useFormTree(tree, {
    validator,
  })
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(
    null
  )

  return (
    <div>
      <h1>JSON Schema Form — Live Validation (ADR 021)</h1>
      <p>
        Attach <code>onInput={'{revalidate}'}</code> for per-keystroke feedback,
        or <code>onChange={'{revalidate}'}</code> to validate on blur (native{' '}
        <code>change</code> semantics for text fields). Each event reads native
        FormData, runs the side-loaded <code>Validator</code>, and updates
        per-field errors — no controlled inputs, no form-state adapter.
      </p>
      <p>
        <strong>When to wire which:</strong> <code>onInput</code> = validate
        while typing; <code>onChange</code> = validate when the field loses
        focus. Wire both if you want keystroke feedback <em>and</em> a final
        blur pass — the consumer chooses.
      </p>
      <p>
        <strong>Constrain vs report:</strong> where the schema maps to a native
        HTML attribute (<code>maxLength</code>, <code>min</code>/
        <code>max</code>, <code>step</code>, <code>pattern</code>), the browser
        live-constrains input. Semantic rules without a native twin (e.g.{' '}
        <code>minLength</code> on a plain text field) are live-reported by the
        validator only. Both layers can apply to different fields in the same
        form.
      </p>
      <p>
        Omit live handlers and behaviour stays submit-only (ADR 019). Async
        validation, debounce, and field-scoped triggers are deferred.
      </p>
      <p>
        <strong>Display policy:</strong> this demo passes{' '}
        <code>showErrorsWhen=&quot;always&quot;</code> so a live-reported error
        appears the instant it exists — the point here is the validate-on-change
        seam. The library default is <code>&quot;touched&quot;</code> (errors
        stay quiet until a field blurs); see <code>App_13</code> for that UX.
      </p>

      <form
        noValidate
        onSubmit={submit((data) => setSubmitted(data))}
        onInput={revalidate}
        onChange={revalidate}
      >
        <ValidationProvider {...validation} showErrorsWhen="always">
          <ValidationSummary />
          <SchemaFields />
        </ValidationProvider>
        <button type="submit">Submit</button>
      </form>

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
