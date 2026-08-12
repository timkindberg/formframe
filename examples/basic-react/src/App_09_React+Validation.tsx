// Submit-time validation — recipe-owned (formerly ADR 019's library-runtime
// walk-through).
//
// Validation is a capability slot: Core names the `Validator` shape, an
// adapter (here @formframe/validation-ajv) implements it, and a small
// recipe hook — `useNativeValidator` (nativeValidation.recipe.tsx) — runs it
// on submit. `useFormTree` itself carries no validator slot (#126); this is
// a thin demo of the same native-form recipe `Recipe_NativeForm_JSONSchema`
// uses, trimmed to one schema and no cross-field rule.
import { useState } from 'react'
import { jsonSchemaToTree, type FormShapeOf } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'
import {
  useFormTree,
  useRenderNodeRules,
  type TypedRuleRegistrar,
} from '@formframe/renderer-react'
import { createAjvValidator } from '@formframe/validation-ajv'
import {
  NativeValidationProvider,
  useNativeValidator,
} from './nativeValidation.recipe'
import { InputControl } from './nativeFieldControls.recipe'

const schema = {
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
} as const satisfies JSONSchema
const tree = jsonSchemaToTree(schema)
const validator = createAjvValidator(schema)

type Shape = FormShapeOf<typeof schema>
const nativeRules = (r: TypedRuleRegistrar<Shape>): void => {
  r.control('input', InputControl)
}

function App() {
  const { form, SchemaFields } = useFormTree(tree)
  const { validation, submit } = useNativeValidator(form, validator)
  const renderNode = useRenderNodeRules(form, nativeRules)
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(
    null
  )

  const handleValid = (data: Record<string, unknown>) => setSubmitted(data)

  return (
    <div>
      <h1>JSON Schema Form — Submit-Time Validation (recipe-owned)</h1>
      <p>
        <code>useNativeValidator(form, validator)</code> — a small recipe hook
        over the native <code>&lt;form&gt;</code> + FormData layer — runs the
        validator at submit. Invalid data shows an error under each field and
        blocks the handler; valid data clears the errors and submits. The
        validator is a plain <code>Validator</code> from{' '}
        <code>validation-ajv</code> — swap it for Zod/Valibot without touching
        the form. <code>useFormTree</code> itself carries no validator slot
        (#126) — validation production is entirely recipe-owned.
      </p>
      <p>
        The <code>&lt;form&gt;</code> uses <code>noValidate</code> so the JS
        validator owns the UX (the schema also renders native{' '}
        <code>required</code>/<code>pattern</code> attrs, ADR 012).
      </p>
      <p>
        Errors inject through{' '}
        <code>&lt;Default of={'{field}'} errors=&#123;…&#125; /&gt;</code> — the
        same seam every recipe in this app uses; fields automatically receive{' '}
        <code>aria-invalid</code> and <code>aria-describedby</code> when they
        have errors.
      </p>

      <form noValidate onSubmit={submit(handleValid)}>
        <NativeValidationProvider {...validation}>
          <SchemaFields renderNode={renderNode} />
        </NativeValidationProvider>
        <button type="submit">Submit</button>
      </form>

      {validation.errors.length > 0 && (
        <p style={{ color: 'crimson' }}>
          {validation.errors.length} error(s) — see the fields above.
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
