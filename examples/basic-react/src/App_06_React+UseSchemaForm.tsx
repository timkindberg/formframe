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
  const { form, Form } = useSchemaForm(schema)

  const handleSubmit = (data: Record<string, unknown>) => {
    console.log('Form submitted with clean data:', data)
    console.log('- Checkboxes converted to booleans')
    console.log('- Nested paths unflattened automatically')
  }

  return (
    <div>
      <h1>JSON Schema Form - useSchemaForm Hook</h1>
      <p>
        Simple API: <code>useSchemaForm(schema)</code> returns a Form component
      </p>
      <p>
        Use <code>form.submit(onSubmit)</code> to automatically transform and
        unflatten form data
      </p>

      <Form onSubmit={form.submit(handleSubmit)} />
    </div>
  )
}

export default App
