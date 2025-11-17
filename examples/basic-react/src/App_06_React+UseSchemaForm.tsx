import { useSchemaForm } from '@jsonschema-form/react'
import type { JSONSchema } from '@jsonschema-form/core'

const schema: JSONSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      title: 'Full Name',
      description: 'Enter your full name.',
    },
    email: { type: 'string', format: 'email', title: 'Email' },
    age: { type: 'number', minimum: 0, title: 'Age' },
    theme: {
      oneOf: [
        { const: 'light', title: 'Light Mode' },
        { const: 'dark', title: 'Dark Mode' },
        { const: 'auto', title: 'Auto (System)' },
      ],
      title: 'Color Theme',
      description: 'Choose your preferred color theme',
    },
    subscribe: {
      type: 'boolean',
      title: 'Subscribe to newsletter',
      description: 'Receive updates via email',
    },
    address: {
      type: 'object',
      title: 'Address',
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
        isPrimary: { type: 'boolean', title: 'Primary address' },
      },
      required: ['street', 'city'],
    },
    terms: { type: 'boolean', title: 'Accept terms and conditions' },
  },
  required: ['name', 'email', 'theme', 'terms'],
}

function App() {
  const { Form } = useSchemaForm(schema)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData.entries())
    console.log('Form submitted:', data)
  }

  return (
    <div>
      <h1>JSON Schema Form - useSchemaForm Hook</h1>
      <p>
        Simple API: <code>useSchemaForm(schema)</code> returns a Form component
      </p>

      <Form onSubmit={handleSubmit} />

      <details style={{ marginTop: '2rem' }}>
        <summary>Compare: The Evolution</summary>
        <pre
          style={{ background: '#f5f5f5', padding: '1rem', fontSize: '12px' }}
        >
          {`// App_04: Manual walk with inline rendering (68+ lines)
<form onSubmit={handleSubmit}>
  {form.walk({
    field: (node) => { /* 30 lines of JSX */ },
    group: (node) => { /* 30 lines of JSX */ }
  })}
  <button>Submit</button>
</form>

// App_05: Using default components (4 lines)
form.walk({
  root: (node) => <DefaultRoot node={node} onSubmit={handleSubmit} />,
  field: (node) => <DefaultField node={node} />,
  group: (node) => <DefaultGroup node={node} />,
})

// App_06: useSchemaForm hook (2 lines!)
const { Form } = useSchemaForm(schema)
return <Form onSubmit={handleSubmit} />`}
        </pre>
      </details>

      <details>
        <summary>How it works</summary>
        <pre
          style={{ background: '#f5f5f5', padding: '1rem', fontSize: '12px' }}
        >
          {`useSchemaForm() does three things:

1. Parses the schema (memoized)
   const form = parseSchema(schema)

2. Creates a Form component that bundles the defaults
   - Uses DefaultRoot for form wrapper
   - Uses DefaultField for inputs
   - Uses DefaultGroup for nested objects

3. Returns { form, Form }
   - form: The parsed tree (for advanced usage)
   - Form: Ready-to-use component

Perfect for simple forms. For customization, drop down to:
- form.walk() with custom handlers (App_05)
- Manual rendering with node.parts (App_04)`}
        </pre>
      </details>
    </div>
  )
}

export default App

