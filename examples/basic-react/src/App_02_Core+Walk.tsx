import { parseSchema } from '@jsonschema-form/core'
import type { JSONSchema } from '@jsonschema-form/core'

const schema: JSONSchema = {
type: 'object',
properties: {
  name: { type: 'string', title: 'Full Name', description: 'Enter your full name.' },
  email: { type: 'string', format: 'email', title: 'Email' },
  age: { type: 'number', minimum: 0, title: 'Age' },
  subscribe: { type: 'boolean', title: 'Subscribe to newsletter', description: 'Receive updates via email' },
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
      <h1>JSON Schema Form - Core + Walk API</h1>
      <p>Using the walk() method to eliminate boilerplate</p>

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
          
          group: (node) => (
            <fieldset key={node.path}>
              <legend>{node.label || node.path}</legend>
              {node.walk()}
            </fieldset>
          ),
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

