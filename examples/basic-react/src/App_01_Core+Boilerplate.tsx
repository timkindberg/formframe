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

// Explore the API!
console.log('=== Form Structure ===')
console.log('Root:', form)
console.log('\n=== Children ===')
console.log('Children:', form.children)
console.log('\n=== All Fields (flat) ===')
console.log('All fields:', form.getAllFields())
console.log('\n=== Get Single Field ===')
console.log('Name field:', form.getField('name'))
console.log('Email field:', form.getField('email'))
console.log('Age field:', form.getField('age'))
console.log('\n=== Field Attrs ===')
const nameField = form.getField('name')
console.log('Name field attrs:', nameField?.parts.input?.attrs)
const emailField = form.getField('email')
console.log('Email field attrs:', emailField?.parts.input?.attrs)
console.log('\n=== JSON Export ===')
console.log('JSON:', form.toJSON())

function App() {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData.entries())
    console.log('Form submitted:', data)
  }

  return (
    <div>
      <h1>JSON Schema Form - Core + Boilerplate</h1>
      <p>Manually walking the parsed tree structure (no styles, no sugar)</p>

      <form onSubmit={handleSubmit}>
        {/* Walk the tree and render fields */}
        {form.children.map((node) => {
          if (node.nodeType === 'field') {
            return (
              <div key={node.path}>
                <label htmlFor={node.path}>
                  {node.parts.label.text}
                  {node.validation.required && <span> *</span>}
                </label>

                {node.parts.description && (
                  <small>{node.parts.description.text}</small>
                )}

                {node.widget === 'select' && node.parts.select ? (
                  <select {...node.parts.select.attrs}>
                    <option value="">-- Select --</option>
                    {node.parts.select.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : node.parts.input ? (
                  <input {...node.parts.input.attrs} />
                ) : null}
              </div>
            )
          } else if (node.nodeType === 'group') {
            // Render a fieldset for nested objects
            return (
              <fieldset key={node.path}>
                <legend>{node.parts.label?.text || node.path}</legend>
                {node.children.map((childNode) => {
                  if (childNode.nodeType === 'field') {
                    return (
                      <div key={childNode.path}>
                        <label htmlFor={childNode.path}>
                          {childNode.parts.label.text}
                          {childNode.validation.required && <span> *</span>}
                        </label>
                        {childNode.widget === 'select' &&
                        childNode.parts.select ? (
                          <select {...childNode.parts.select.attrs}>
                            <option value="">-- Select --</option>
                            {childNode.parts.select.options.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : childNode.parts.input ? (
                          <input {...childNode.parts.input.attrs} />
                        ) : null}
                      </div>
                    )
                  }
                  return null
                })}
              </fieldset>
            )
          }
          return null
        })}

        <button type="submit">Submit</button>
      </form>
    </div>
  )
}

export default App
