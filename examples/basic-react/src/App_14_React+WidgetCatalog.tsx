import { useState } from 'react'
import { useFormTree } from '@jsonschema-form/react'
import { jsonSchemaToTree } from '@jsonschema-form/input-jsonschema'
import type { JSONSchema } from '@jsonschema-form/input-jsonschema'

// Every field below is a plain `type: 'string'` (or number/boolean/enum) — the
// native control is chosen by the `present()` stage from neutral facts (bd 4j1):
// `format` drives the input `type`, so `format: 'date'` → <input type="date">,
// `format: 'color'` → a color swatch, etc. No widget is named in the schema.
const schema: JSONSchema = {
  type: 'object',
  properties: {
    fullName: {
      type: 'string',
      title: 'Full name',
      description: 'Plain string → text input',
    },
    email: {
      type: 'string',
      format: 'email',
      title: 'Email',
      description: "format: 'email'",
    },
    website: {
      type: 'string',
      format: 'url',
      title: 'Website',
      description: "format: 'url'",
    },
    phone: {
      type: 'string',
      format: 'tel',
      title: 'Phone',
      description: "format: 'tel'",
    },
    birthday: {
      type: 'string',
      format: 'date',
      title: 'Birthday',
      description: "format: 'date'",
    },
    appointment: {
      type: 'string',
      format: 'date-time',
      title: 'Appointment',
      description: "format: 'date-time' → datetime-local",
    },
    reminderTime: {
      type: 'string',
      format: 'time',
      title: 'Reminder time',
      description: "format: 'time'",
    },
    favoriteColor: {
      type: 'string',
      format: 'color',
      title: 'Favorite color',
      description: "format: 'color'",
    },
    age: {
      type: 'integer',
      title: 'Age',
      minimum: 0,
      maximum: 120,
      description: 'integer → number input',
    },
    rating: {
      type: 'number',
      title: 'Rating',
      minimum: 0,
      maximum: 10,
      description: 'number input',
    },
    plan: {
      type: 'string',
      title: 'Plan',
      enum: ['free', 'pro', 'enterprise'],
      description: 'enum → select',
    },
    tags: {
      type: 'array',
      title: 'Tags',
      items: { enum: ['react', 'vue', 'svelte', 'solid'] },
      description: 'array of enum → multiselect (value === label)',
    },
    permissions: {
      type: 'array',
      title: 'Permissions',
      items: {
        oneOf: [
          { const: 'r', title: 'Read' },
          { const: 'w', title: 'Write' },
          { const: 'x', title: 'Execute' },
        ],
      },
      description: 'array of oneOf → multiselect (const value, title label)',
    },
    subscribe: {
      type: 'boolean',
      title: 'Subscribe to newsletter',
      description: 'boolean → checkbox',
    },
  },
  required: ['fullName', 'email'],
}
const tree = jsonSchemaToTree(schema)

function App() {
  const { form, SchemaFields } = useFormTree(tree)
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(
    null
  )

  return (
    <div>
      <h1>Widget Catalog — format-driven input types (bd 4j1, bd 672)</h1>
      <p>
        Each control&apos;s native <code>type</code> is derived by{' '}
        <code>present()</code> from the field&apos;s neutral facts — the schema
        only carries <code>format</code>, never a widget name. Fill it in and
        submit to see the coerced values.
      </p>

      <form onSubmit={form.submit(setSubmitted)}>
        <SchemaFields />
        <button type="submit" style={{ marginTop: '1rem' }}>
          Submit
        </button>
      </form>

      {submitted && (
        <>
          <h2 style={{ marginTop: '2rem' }}>Submitted data</h2>
          <pre
            style={{
              background: '#f5f5f5',
              padding: '1rem',
              borderRadius: '6px',
              overflowX: 'auto',
            }}
          >
            {JSON.stringify(submitted, null, 2)}
          </pre>
        </>
      )}
    </div>
  )
}

export default App
