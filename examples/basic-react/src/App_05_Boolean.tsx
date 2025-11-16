import { parseSchema } from '@jsonschema-form/core'
import type { JSONSchema } from '@jsonschema-form/core'

const schema: JSONSchema = {
  type: 'object',
  properties: {
    // Basic boolean fields
    subscribe: { 
      type: 'boolean', 
      title: 'Subscribe to newsletter',
      description: 'Receive product updates and announcements'
    },
    marketing: { 
      type: 'boolean', 
      title: 'Marketing emails',
      description: 'Receive promotional offers and deals'
    },
    
    // Required boolean (e.g., terms acceptance)
    terms: { 
      type: 'boolean', 
      title: 'I accept the terms and conditions'
    },
    
    // Boolean fields in nested object (preferences)
    preferences: {
      type: 'object',
      title: 'Notification Preferences',
      description: 'Customize how you receive notifications',
      properties: {
        emailNotifications: { 
          type: 'boolean', 
          title: 'Email notifications',
          description: 'Receive notifications via email'
        },
        smsNotifications: { 
          type: 'boolean', 
          title: 'SMS notifications',
          description: 'Receive notifications via text message'
        },
        pushNotifications: { 
          type: 'boolean', 
          title: 'Push notifications',
          description: 'Receive browser push notifications'
        },
      },
      required: ['emailNotifications'] // At least email must be chosen
    },
    
    // Mixed fields showing boolean integration
    profile: {
      type: 'object',
      title: 'Profile Settings',
      properties: {
        username: { type: 'string', title: 'Username' },
        publicProfile: { type: 'boolean', title: 'Make profile public' },
        showEmail: { type: 'boolean', title: 'Show email on profile' },
      },
      required: ['username']
    },
  },
  required: ['terms']
}

const form = parseSchema(schema)

function App() {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    
    // Convert FormData to object, handling checkboxes
    const data: Record<string, any> = {}
    for (const [key, value] of formData.entries()) {
      data[key] = value
    }
    
    // Note: unchecked checkboxes don't appear in FormData
    // In a real app, you'd handle this in your form state management
    console.log('Form submitted:', data)
    console.log('Note: Unchecked checkboxes are not included in FormData')
  }

  return (
    <div>
      <h1>JSON Schema Form - Boolean Fields</h1>
      <p>Checkbox support for boolean schema types</p>

      <form onSubmit={handleSubmit}>
        {form.walk({
          field: (node) => {
            const { container, label, description, input } = node.parts
            const isCheckbox = input.attrs.type === 'checkbox'
            
            return (
              <div 
                key={container.key} 
                style={{ 
                  marginBottom: '1rem',
                  padding: isCheckbox ? '0.5rem' : '0',
                  backgroundColor: isCheckbox ? '#f8f9fa' : 'transparent',
                  borderLeft: isCheckbox ? '3px solid #007bff' : 'none',
                  paddingLeft: isCheckbox ? '0.75rem' : '0'
                }}
              >
                {isCheckbox ? (
                  // Checkbox layout: input comes before label
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <input
                      id={input.id}
                      name={input.name}
                      {...input.attrs}
                      style={{ marginTop: '0.25rem', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <label 
                        htmlFor={label.htmlFor}
                        style={{ cursor: 'pointer', fontWeight: '500' }}
                      >
                        {label.text}
                        {label.showRequired && <span style={{ color: '#dc3545' }}> *</span>}
                      </label>
                      {description && (
                        <small style={{ display: 'block', color: '#666', marginTop: '0.25rem' }}>
                          {description.text}
                        </small>
                      )}
                    </div>
                  </div>
                ) : (
                  // Regular input layout: label comes before input
                  <>
                    <label htmlFor={label.htmlFor} style={{ display: 'block', fontWeight: '500' }}>
                      {label.text}
                      {label.showRequired && <span style={{ color: '#dc3545' }}> *</span>}
                    </label>
                    
                    {description && (
                      <small style={{ display: 'block', color: '#666', marginBottom: '0.25rem' }}>
                        {description.text}
                      </small>
                    )}
                    
                    <input
                      id={input.id}
                      name={input.name}
                      {...input.attrs}
                      style={{ display: 'block', marginTop: '0.25rem', width: '100%', maxWidth: '400px' }}
                    />
                  </>
                )}
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
                style={{ 
                  marginBottom: '1.5rem', 
                  padding: '1rem', 
                  border: '2px solid #dee2e6',
                  borderRadius: '4px'
                }}
              >
                {label && <legend style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{label.text}</legend>}
                {description && (
                  <small style={{ display: 'block', marginBottom: '1rem', color: '#666' }}>
                    {description.text}
                  </small>
                )}
                {node.walk()}
              </fieldset>
            )
          },
        })}

        <button 
          type="submit"
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: 'pointer',
            marginTop: '1rem'
          }}
        >
          Submit
        </button>
      </form>

      <details style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
          Implementation Notes
        </summary>
        <div style={{ marginTop: '1rem' }}>
          <h3>Boolean Field Support</h3>
          <ul style={{ lineHeight: '1.6' }}>
            <li><strong>HTML Input Type:</strong> Boolean fields generate <code>type="checkbox"</code></li>
            <li><strong>Required Attribute:</strong> Works with checkboxes (must be checked to submit)</li>
            <li><strong>Layout:</strong> Checkboxes typically render with input before label for better UX</li>
            <li><strong>FormData Behavior:</strong> Unchecked checkboxes are not included in FormData</li>
            <li><strong>Parts API:</strong> Boolean fields work seamlessly with the parts API</li>
            <li><strong>Nested Groups:</strong> Boolean fields work in nested objects</li>
          </ul>
          
          <h3>Schema Example</h3>
          <pre style={{ backgroundColor: 'white', padding: '1rem', borderRadius: '4px', overflow: 'auto' }}>
{`{
  type: 'object',
  properties: {
    subscribe: { 
      type: 'boolean', 
      title: 'Subscribe to newsletter',
      description: 'Receive updates'
    },
    terms: { 
      type: 'boolean', 
      title: 'Accept terms'
    }
  },
  required: ['terms']
}`}
          </pre>
        </div>
      </details>

      <details style={{ marginTop: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>View Full Structure (JSON)</summary>
        <pre style={{ backgroundColor: '#f8f9fa', padding: '1rem', fontSize: '12px', overflow: 'auto', borderRadius: '4px' }}>
          {JSON.stringify(form.toJSON(), null, 2)}
        </pre>
      </details>
    </div>
  )
}

export default App

