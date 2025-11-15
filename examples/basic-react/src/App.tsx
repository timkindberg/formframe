import { parseSchema } from '@jsonschema-form/core'
import type { JSONSchema } from '@jsonschema-form/core'

const schema: JSONSchema = {
type: 'object',
properties: {
  name: { type: 'string', title: 'Full Name', description: 'Enter your full name.' },
  email: { type: 'string', format: 'email', title: 'Email' },
  age: { type: 'number', minimum: 0, title: 'Age' },
},
required: ['name', 'email']
}
const form = parseSchema(schema)

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
console.log('Name field attrs:', nameField?.attrs)
const emailField = form.getField('email')
console.log('Email field attrs:', emailField?.attrs)
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
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '600px' }}>
      <h1>JSON Schema Form - Basic Example</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        Manually walking the parsed tree structure
      </p>

      <form onSubmit={handleSubmit}>
        {/* Walk the tree and render fields */}
        {form.children.map((node) => {
          if (node.nodeType === 'field') {
            return (
              <div key={node.path} style={{ marginBottom: '1.5rem' }}>
                <label
                  htmlFor={node.path}
                  style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: node.required ? 'bold' : 'normal'
                  }}
                >
                  {node.title || node.path}
                  {node.required && <span style={{ color: 'red' }}> *</span>}
                </label>

                {node.description && (
                  <small style={{ color: '#666', display: 'block', marginBottom: '0.5rem' }}>
                    {node.description}
                  </small>
                )}

                <input
                  id={node.path}
                  name={node.path}
                  {...node.attrs}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    fontSize: '1rem',
                    border: '1px solid #ccc',
                    borderRadius: '4px'
                  }}
                />
              </div>
            )
          } else if (node.nodeType === 'group') {
            // Render a fieldset for nested objects
            return (
              <fieldset key={node.path} style={{ marginBottom: '1.5rem', padding: '1rem', border: '2px solid #eee' }}>
                <legend style={{ fontWeight: 'bold' }}>
                  {node.title || node.path}
                </legend>
                {node.children.map((childNode) => {
                  if (childNode.nodeType === 'field') {
                    return (
                      <div key={childNode.path} style={{ marginBottom: '1rem' }}>
                        <label
                          htmlFor={childNode.path}
                          style={{ display: 'block', marginBottom: '0.5rem' }}
                        >
                          {childNode.title || childNode.path}
                          {childNode.required && <span style={{ color: 'red' }}> *</span>}
                        </label>
                        <input
                          id={childNode.path}
                          name={childNode.path}
                          {...childNode.attrs}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            fontSize: '1rem',
                            border: '1px solid #ccc',
                            borderRadius: '4px'
                          }}
                        />
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

        <button
          type="submit"
          style={{
            padding: '0.75rem 2rem',
            fontSize: '1rem',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Submit
        </button>
      </form>

      <details style={{ marginTop: '2rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>View Parsed Structure (JSON)</summary>
        <pre style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px', fontSize: '12px', overflow: 'auto', marginTop: '1rem' }}>
          {JSON.stringify(form.toJSON(), null, 2)}
        </pre>
      </details>
    </div>
  )
}

export default App

