import { useState } from 'react'
import { useSchemaForm } from '@jsonschema-form/react'
import type { JSONSchema } from '@jsonschema-form/core'

// Dynamic arrays on the continuation engine (ADR 015 + 018). Two array shapes:
//   • multiselect — primitive arrays with enum/oneOf render as <select multiple>
//   • dynamic add/remove — object & primitive arrays grow/shrink via the engine.
// Two guarantees, both visible below: every existing item keeps its typed value
// across an add or remove (stable React keys → update in place, never remount),
// AND paths stay dense (ADR 018) — remove the first of two and the survivor
// re-paths from `…1` to `…0` in place, so submission is a contiguous array, never
// a sparse one with a leading hole.

const schema: JSONSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      title: 'Full Name',
      description: 'Enter your full name',
    },
    // Multiselect — primitive array with enum → <select multiple>
    skills: {
      type: 'array',
      title: 'Skills',
      description: 'Select your technical skills (hold Ctrl/Cmd for multiple)',
      minItems: 1,
      maxItems: 5,
      items: {
        type: 'string',
        enum: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Go'],
      },
    },
    // Dynamic array of strings → a text input per item, with add/remove
    hobbies: {
      type: 'array',
      title: 'Hobbies',
      description: 'Add and remove hobbies; type into one, then add another',
      items: { type: 'string', title: 'Hobby' },
    },
    // Dynamic array of objects → a sub-form per item, with add/remove
    addresses: {
      type: 'array',
      title: 'Addresses',
      description:
        'Add multiple addresses; removing one leaves the others typed',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          street: { type: 'string', title: 'Street' },
          city: { type: 'string', title: 'City' },
          type: {
            oneOf: [
              { const: 'home', title: 'Home' },
              { const: 'work', title: 'Work' },
              { const: 'other', title: 'Other' },
            ],
            title: 'Address Type',
          },
        },
        required: ['street', 'city'],
      },
    },
  },
  required: ['name', 'skills', 'addresses'],
}

function App() {
  const { form, SchemaFields } = useSchemaForm(schema)
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(
    null
  )

  return (
    <div>
      <h1>Dynamic arrays (ADR 015)</h1>
      <p style={{ color: '#555' }}>
        Add/remove items folded by the continuation engine. The trick: each item
        has a <strong>stable React key</strong> (its identity) decoupled from
        its <strong>path</strong> (its position), so adding or removing a
        sibling updates the list <em>in place</em> — every other item keeps its
        typed value with no remount, while paths stay <em>dense</em>. Type into
        a few fields, remove the first item, then submit: the survivors re-path
        to a contiguous array — no holes.
      </p>

      <form onSubmit={form.submit(setSubmitted)}>
        <SchemaFields />
        <button type="submit" style={{ marginTop: 16 }}>
          Submit
        </button>
      </form>

      <div
        style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: submitted ? '#e8f5e9' : '#f5f5f5',
          borderRadius: 4,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Submitted data</h3>
        {submitted ? (
          <pre style={{ margin: 0, overflowX: 'auto' }}>
            {JSON.stringify(submitted, null, 2)}
          </pre>
        ) : (
          <p style={{ margin: 0, color: '#777' }}>
            Submit the form to see the collected JSON.
          </p>
        )}
      </div>
    </div>
  )
}

export default App
