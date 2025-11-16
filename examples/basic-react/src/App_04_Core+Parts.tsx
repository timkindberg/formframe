import { parseSchema } from '@jsonschema-form/core'
import type { JSONSchema } from '@jsonschema-form/core'

const schema: JSONSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Full Name', description: 'Enter your full name.' },
    email: { type: 'string', format: 'email', title: 'Email' },
    age: { type: 'number', minimum: 0, title: 'Age' },
    subscribe: { type: 'boolean', title: 'Subscribe to newsletter', description: 'Receive updates via email' },
    address: {
      type: 'object',
      title: 'Address',
      properties: {
        street: { type: 'string', title: 'Street' },
        city: { type: 'string', title: 'City' },
        isPrimary: { type: 'boolean', title: 'Primary address' },
      },
      required: ['street', 'city']
    },
    terms: { type: 'boolean', title: 'Accept terms and conditions' },
  },
  required: ['name', 'email', 'terms']
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
      <h1>JSON Schema Form - Parts API</h1>
      <p>Using the .parts property (framework-agnostic data)</p>

      <form onSubmit={handleSubmit}>
        {form.walk({
          field: (node) => {
            // Access parts - just data, not components
            const { container, label, description, input } = node.parts
            
            return (
              <div key={container.key} style={{ marginBottom: '1rem' }}>
                <label htmlFor={label.for}>
                  {label.text}
                  {label.showRequired && <span> *</span>}
                </label>
                
                {description && (
                  <small style={{ display: 'block', color: '#666' }}>
                    {description.text}
                  </small>
                )}
                
                <input
                  id={input.id}
                  name={input.name}
                  {...input.attrs}
                  style={{ display: 'block', marginTop: '0.25rem' }}
                />
              </div>
            )
          },
          
          group: (node) => {
            if (node.isRoot) {
              return <div key="root">{node.walk()}</div>
            }
            
            const { container, label, description } = node.parts
            
            return (
              <fieldset 
                key={container.key}
                style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #999' }}
              >
                {label && <legend>{label.text}</legend>}
                {description && (
                  <small style={{ display: 'block', marginBottom: '0.5rem', color: '#666' }}>
                    {description.text}
                  </small>
                )}
                {node.walk()}
              </fieldset>
            )
          },
        })}

        <button type="submit">Submit</button>
      </form>

      <details style={{ marginTop: '2rem' }}>
        <summary>Example: Computed Properties</summary>
        <pre style={{ background: '#f5f5f5', padding: '1rem', fontSize: '12px' }}>
{`const nameField = form.getField('name')

// Computed properties (set at parse time)
nameField.isRoot        // false
nameField.depth         // 1
nameField.displayLabel  // "Full Name"
nameField.key           // "name"
nameField.parentPath    // ""

// Parts (framework-agnostic render data)
nameField.parts.label   // { text: "Full Name", for: "name", showRequired: true }
nameField.parts.input   // { id: "name", name: "name", attrs: { type: "text", ... } }
`}
        </pre>
      </details>

      <details>
        <summary>View Full Structure (JSON)</summary>
        <pre style={{ background: '#f5f5f5', padding: '1rem', fontSize: '12px', overflow: 'auto' }}>
          {JSON.stringify(form.toJSON(), null, 2)}
        </pre>
      </details>
    </div>
  )
}

export default App

