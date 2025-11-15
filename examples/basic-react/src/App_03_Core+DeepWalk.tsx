import { parseSchema } from '@jsonschema-form/core'
import type { JSONSchema } from '@jsonschema-form/core'

const schema: JSONSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Full Name', description: 'Enter your full name.' },
    email: { type: 'string', format: 'email', title: 'Email' },
    age: { type: 'number', minimum: 0, title: 'Age' },
    address: {
      type: 'object',
      title: 'Address',
      properties: {
        street: { type: 'string', title: 'Street' },
        city: { type: 'string', title: 'City' },
        state: { type: 'string', title: 'State', maxLength: 2 },
        zip: { type: 'string', title: 'ZIP Code', pattern: '^\\d{5}$' },
        location: {
          type: 'object',
          title: 'Coordinates',
          properties: {
            latitude: { type: 'number', title: 'Latitude', minimum: -90, maximum: 90 },
            longitude: { type: 'number', title: 'Longitude', minimum: -180, maximum: 180 },
          }
        }
      },
      required: ['street', 'city']
    }
  },
  required: ['name', 'email']
}

const form = parseSchema(schema)

function App() {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData.entries())
    console.log('Form submitted:', data)
  }

  return (
    <div>
      <h1>JSON Schema Form - Deep Walk</h1>
      <p>Nested objects with recursive walk() - handlers inherit automatically</p>

      <form onSubmit={handleSubmit}>
        {form.walk({
          field: (node) => (
            <div key={node.path}>
              <label htmlFor={node.path}>
                {node.label || node.path}
                {node.required && <span> *</span>}
              </label>

              {node.description && (
                <small>{node.description}</small>
              )}

              <input
                id={node.path}
                name={node.path}
                {...node.attrs}
              />
            </div>
          ),
          
          group: (node) => {
            // Skip rendering the root group (empty path)
            if (node.path === '') {
              return <div key="root">{node.walk()}</div>
            }
            
            // Render nested groups as fieldsets
            // Add visual depth indicator
            const depth = node.path.split('.').length
            return (
              <fieldset 
                key={node.path}
                style={{ 
                  marginLeft: `${(depth - 1) * 1}rem`,
                  marginBottom: '1rem',
                  padding: '1rem',
                  border: `2px solid ${depth === 1 ? '#333' : '#999'}`
                }}
              >
                <legend style={{ fontWeight: depth === 1 ? 'bold' : 'normal' }}>
                  {node.label || node.path} {depth > 1 && <small>(nested level {depth})</small>}
                </legend>
                {/* Handlers automatically inherit to nested walk() calls */}
                {node.walk()}
              </fieldset>
            )
          },
        })}

        <button type="submit">Submit</button>
      </form>

      <details>
        <summary>View Parsed Structure (JSON)</summary>
        <pre>{JSON.stringify(form.toJSON(), null, 2)}</pre>
      </details>
    </div>
  )
}

export default App

