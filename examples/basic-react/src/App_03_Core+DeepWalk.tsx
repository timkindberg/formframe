import { jsonSchemaToTree } from '@jsonschema-form/input-jsonschema'
import type { JSONSchema } from '@jsonschema-form/input-jsonschema'

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
    role: {
      oneOf: [
        { const: 'user', title: 'Regular User' },
        { const: 'admin', title: 'Administrator' },
        { const: 'moderator', title: 'Moderator' },
      ],
      title: 'User Role',
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
        state: {
          type: 'string',
          enum: ['CA', 'NY', 'TX', 'FL'],
          title: 'State',
        },
        zip: { type: 'string', title: 'ZIP Code', pattern: '^\\d{5}$' },
        sameAsBilling: { type: 'boolean', title: 'Same as billing address' },
        location: {
          type: 'object',
          title: 'Coordinates',
          properties: {
            latitude: {
              type: 'number',
              title: 'Latitude',
              minimum: -90,
              maximum: 90,
            },
            longitude: {
              type: 'number',
              title: 'Longitude',
              minimum: -180,
              maximum: 180,
            },
          },
        },
      },
      required: ['street', 'city'],
    },
    terms: { type: 'boolean', title: 'Accept terms and conditions' },
  },
  required: ['name', 'email', 'terms'],
}

const form = jsonSchemaToTree(schema)

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
      <p>
        Nested objects with recursive walk() - handlers inherit automatically
      </p>

      <form onSubmit={handleSubmit}>
        {form.walk({
          field: (node) => (
            <div key={node.path}>
              <label htmlFor={node.path}>
                {node.parts.label.text}
                {node.facts.constraints.required && <span> *</span>}
              </label>

              {node.parts.description && (
                <small>{node.parts.description.text}</small>
              )}

              {/* Dispatch on the unified control archetype (ADR 029 §5). */}
              {node.parts.control.kind === 'select' ? (
                <select {...node.parts.control.attrs}>
                  <option value="">-- Select --</option>
                  {node.parts.control.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : node.parts.control.kind === 'textarea' ? (
                <textarea {...node.parts.control.attrs} />
              ) : node.parts.control.kind === 'choicegroup' ? (
                <div role={node.parts.control.role}>
                  {node.parts.control.options.map((opt) => (
                    <label key={opt.attrs.id}>
                      <input {...opt.attrs} /> {opt.label}
                    </label>
                  ))}
                </div>
              ) : (
                <input {...node.parts.control.attrs} />
              )}
            </div>
          ),

          group: (node, handlers) => {
            // Skip rendering the root group (empty path)
            if (node.path === '') {
              return <div key="root">{node.walk(handlers)}</div>
            }

            // Render nested groups as fieldsets
            // Add visual depth indicator
            const depth = node.path.split('.').length
            return (
              <fieldset
                key={node.path}
                style={{
                  marginLeft: `${depth - 1}rem`,
                  marginBottom: '1rem',
                  padding: '1rem',
                  border: `2px solid ${depth === 1 ? '#333' : '#999'}`,
                }}
              >
                <legend style={{ fontWeight: depth === 1 ? 'bold' : 'normal' }}>
                  {node.parts.label?.text || node.path}{' '}
                  {depth > 1 && <small>(nested level {depth})</small>}
                </legend>
                {/* Handlers passed through to nested walk() calls */}
                {node.walk(handlers)}
              </fieldset>
            )
          },
        })}

        <button type="submit">Submit</button>
      </form>
    </div>
  )
}

export default App
