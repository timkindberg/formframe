import { useSchemaForm } from '@jsonschema-form/react'
import type { JSONSchema } from '@jsonschema-form/core'

const schema: JSONSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      title: 'Full Name',
      description: 'Enter your full name',
    },
    // Multiselect - primitive array with enum
    skills: {
      type: 'array',
      title: 'Skills',
      description: 'Select your technical skills (multiselect)',
      minItems: 1,
      maxItems: 5,
      items: {
        type: 'string',
        enum: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Go'],
      },
    },
    // Multiselect - primitive array with oneOf
    interests: {
      type: 'array',
      title: 'Interests',
      description: 'Select your interests (multiselect with oneOf)',
      items: {
        oneOf: [
          { const: 'web', title: 'Web Development' },
          { const: 'mobile', title: 'Mobile Development' },
          { const: 'ml', title: 'Machine Learning' },
          { const: 'devops', title: 'DevOps' },
          { const: 'design', title: 'UI/UX Design' },
        ],
      },
    },
    // Dynamic array - array of strings
    hobbies: {
      type: 'array',
      title: 'Hobbies',
      description: 'Add/remove hobbies dynamically',
      items: {
        type: 'string',
      },
    },
    // Dynamic array - array of objects
    addresses: {
      type: 'array',
      title: 'Addresses',
      description: 'Add multiple addresses with add/remove buttons',
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
  const { form, Form } = useSchemaForm(schema)

  const handleSubmit = (data: Record<string, unknown>) => {
    console.log('Form submitted with array data:', data)
    console.log('- Multiselect fields return arrays')
    console.log(
      '- Dynamic arrays unflatten from dot notation (addresses.0.street)'
    )
    console.log('- Sparse arrays are supported')
  }

  return (
    <div>
      <h1>JSON Schema Form - Array Support</h1>

      <div
        style={{
          marginBottom: '2rem',
          backgroundColor: '#f5f5f5',
          padding: '1rem',
          borderRadius: '4px',
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>Array Field Types</h2>
        <ul style={{ marginBottom: 0 }}>
          <li>
            <strong>Multiselect</strong>: Primitive arrays (string[], number[])
            with enum/oneOf → renders as <code>&lt;select multiple&gt;</code>
          </li>
          <li>
            <strong>Dynamic Arrays</strong>: Complex arrays (objects, nested
            types) → renders with add/remove buttons
          </li>
        </ul>
      </div>

      <Form onSubmit={form.submit(handleSubmit)} />

      <div
        style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#e3f2fd',
          borderRadius: '4px',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Try it out:</h3>
        <ul style={{ marginBottom: 0 }}>
          <li>Select multiple skills (hold Ctrl/Cmd to select multiple)</li>
          <li>Add/remove hobbies and addresses with the buttons</li>
          <li>Submit to see the clean data structure in console</li>
        </ul>
      </div>
    </div>
  )
}

export default App
