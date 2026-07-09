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
