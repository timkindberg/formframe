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
      <h1>JSON Schema Form - Parts API</h1>
      <p>Using the .parts property (framework-agnostic data)</p>

      <form onSubmit={handleSubmit}>
        {form.walk({
          field: (node) => {
            // Access parts - just data, not components
            const { container, label, description } = node.parts

            return (
              <div key={container.key} style={{ marginBottom: '1rem' }}>
                {/* Neutral caption attrs: spread the `id`, rename `for`→`htmlFor`
                    (`for` absent for a choicegroup) — bd l8j. */}
                <label id={label.attrs.id} htmlFor={label.attrs.for}>
                  {label.text}
                  {label.showRequired && <span> *</span>}
                </label>

                {description && (
                  <small style={{ display: 'block', color: '#666' }}>
                    {description.text}
                  </small>
                )}

                {/* Dispatch on the unified control archetype (ADR 029 §5). */}
                {node.parts.control.kind === 'select' ? (
                  <select
                    {...node.parts.control.attrs}
                    style={{ display: 'block', marginTop: '0.25rem' }}
                  >
                    <option value="">-- Select --</option>
                    {node.parts.control.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : node.parts.control.kind === 'textarea' ? (
                  <textarea
                    {...node.parts.control.attrs}
                    style={{ display: 'block', marginTop: '0.25rem' }}
                  />
                ) : node.parts.control.kind === 'choicegroup' ? (
                  <div
                    role={node.parts.control.role}
                    aria-labelledby={node.parts.control.labelledBy}
                    style={{ display: 'block', marginTop: '0.25rem' }}
                  >
                    {node.parts.control.options.map((opt) => (
                      <label key={opt.attrs.id} style={{ display: 'block' }}>
                        <input {...opt.attrs} /> {opt.label}
                      </label>
                    ))}
                  </div>
                ) : (
                  <input
                    {...node.parts.control.attrs}
                    style={{ display: 'block', marginTop: '0.25rem' }}
                  />
                )}
              </div>
            )
          },

          group: (node, handlers) => {
            if (node.isRoot) {
              return <div key="root">{node.walk(handlers)}</div>
            }

            const { container, label, description } = node.parts

            return (
              <fieldset
                key={container.key}
                style={{
                  marginBottom: '1rem',
                  padding: '1rem',
                  border: '1px solid #999',
                }}
              >
                {label && <legend>{label.text}</legend>}
                {description && (
                  <small
                    style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      color: '#666',
                    }}
                  >
                    {description.text}
                  </small>
                )}
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
