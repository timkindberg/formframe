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
    // A small array-enum → checkbox group (the multi-select choicegroup), so this
    // demo shows both sides of the archetype: `country` (radio) + `interests`.
    interests: {
      type: 'array',
      title: 'Interests',
      description: 'Select all that apply',
      items: { enum: ['sports', 'music', 'tech', 'art'] },
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
console.log('\n=== Field Control ===')
const nameField = form.getField('name')
console.log('Name field control:', nameField?.parts.control)
const emailField = form.getField('email')
console.log('Email field control:', emailField?.parts.control)
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
                {/* Neutral caption attrs, just spread: every caption has an `id`;
                    `for` is present only for a single control, absent for a
                    choicegroup (bd l8j). React's one rename is `for`→`htmlFor`. */}
                <label
                  id={node.parts.label.attrs.id}
                  htmlFor={node.parts.label.attrs.for}
                >
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
                  <div
                    role={node.parts.control.role}
                    aria-labelledby={node.parts.control.labelledBy}
                  >
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
                        <label
                          id={childNode.parts.label.attrs.id}
                          htmlFor={childNode.parts.label.attrs.for}
                        >
                          {childNode.parts.label.text}
                          {childNode.facts.constraints.required && (
                            <span> *</span>
                          )}
                        </label>
                        {childNode.parts.control.kind === 'select' ? (
                          <select {...childNode.parts.control.attrs}>
                            <option value="">-- Select --</option>
                            {childNode.parts.control.options.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : childNode.parts.control.kind === 'textarea' ? (
                          <textarea {...childNode.parts.control.attrs} />
                        ) : childNode.parts.control.kind === 'choicegroup' ? (
                          <div
                            role={childNode.parts.control.role}
                            aria-labelledby={childNode.parts.control.labelledBy}
                          >
                            {childNode.parts.control.options.map((opt) => (
                              <label key={opt.attrs.id}>
                                <input {...opt.attrs} /> {opt.label}
                              </label>
                            ))}
                          </div>
                        ) : (
                          <input {...childNode.parts.control.attrs} />
                        )}
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
