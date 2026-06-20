import { jsonSchemaToTree } from '@jsonschema-form/core'
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
    country: {
      oneOf: [
        { const: 'US', title: 'United States' },
        { const: 'CA', title: 'Canada' },
        { const: 'UK', title: 'United Kingdom' },
        { const: 'AU', title: 'Australia' },
      ],
      title: 'Country',
    },
    subscribe: {
      type: 'boolean',
      title: 'Subscribe to newsletter',
      description: 'Receive updates via email',
    },
    terms: { type: 'boolean', title: 'Accept terms and conditions' },
  },
  required: ['name', 'email', 'country', 'terms'],
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
      <h1>JSON Schema Form - Core + Walk API</h1>
      <p>Using the walk() method to eliminate boilerplate</p>

      <form onSubmit={handleSubmit}>
        {form.walk({
          field: (node) => (
            <div key={node.path}>
              <label htmlFor={node.path}>
                {node.parts.label.text}
                {node.validation.required && <span> *</span>}
              </label>

              {node.parts.description && (
                <small>{node.parts.description.text}</small>
              )}

              {node.widget === 'select' ? (
                <select {...node.parts.select.attrs}>
                  <option value="">-- Select --</option>
                  {node.parts.select.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : node.widget === 'input' ? (
                <input {...node.parts.input.attrs} />
              ) : null}
            </div>
          ),

          group: (node) => (
            <fieldset key={node.path}>
              <legend>{node.parts.label?.text || node.path}</legend>
              {node.walk()}
            </fieldset>
          ),
        })}

        <button type="submit">Submit</button>
      </form>
    </div>
  )
}

export default App
