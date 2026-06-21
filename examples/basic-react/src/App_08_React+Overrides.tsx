import { useMemo } from 'react'
import { jsonSchemaToTree } from '@jsonschema-form/core'
import type { JSONSchema } from '@jsonschema-form/core'
import { FormRenderer } from '@jsonschema-form/react'

// The real continuation engine (ADR 010) — the typed successor to the spike.
// One primitive (`renderNode`), two granularities (node / part), three moves
// (hijack, swap-parts, place-yourself) — all the way down, fully typed.
// Each branch narrows on `node.isField`/`isGroup`/`widget` before reaching
// variant-specific members (ADR 012); no `any`.

const schema: JSONSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      title: 'Full Name',
      description: 'Enter your full name.',
    },
    email: { type: 'string', format: 'email', title: 'Email' },
    theme: {
      oneOf: [
        { const: 'light', title: 'Light' },
        { const: 'dark', title: 'Dark' },
      ],
      title: 'Theme',
    },
    address: {
      type: 'object',
      title: 'Address',
      properties: {
        street: { type: 'string', title: 'Street' },
        city: { type: 'string', title: 'City' },
        location: {
          type: 'object',
          title: 'Coordinates',
          properties: {
            latitude: { type: 'number', title: 'Latitude' },
            longitude: { type: 'number', title: 'Longitude' },
          },
        },
      },
      required: ['street', 'city'],
    },
  },
  required: ['name', 'email'],
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span title={text} style={{ marginLeft: 4, cursor: 'help', color: '#0a7' }}>
      ⓘ
    </span>
  )
}

function FancyInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        display: 'block',
        border: '2px solid royalblue',
        borderRadius: 6,
        padding: 4,
      }}
    />
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ borderBottom: '1px solid #ddd' }}>{title}</h2>
      {children}
    </div>
  )
}

export default function App() {
  const form = useMemo(() => jsonSchemaToTree(schema), [])

  return (
    <div>
      <h1>Recursive continuation renderer (ADR 010)</h1>
      <p>One primitive, two granularities, three moves — all the way down.</p>

      <Section title="1. Default whole form">
        <FormRenderer form={form} />
      </Section>

      <Section title="2. renderNode: hijack a subtree, swap parts, place-yourself, reorder">
        <FormRenderer
          form={form}
          renderNode={(node) => {
            // augment ONLY the email label (input/description stay default)
            if (
              node.isField &&
              node.widget === 'input' &&
              node.path === 'email'
            )
              return (
                <node.Default
                  parts={{
                    label: (label) => (
                      <span>
                        <label.Default />
                        <InfoTooltip text="we never share this" />
                      </span>
                    ),
                  }}
                />
              )

            // replace ONLY the street input from its part data
            if (
              node.isField &&
              node.widget === 'input' &&
              node.path === 'address.street'
            )
              return (
                <node.Default
                  parts={{ input: (input) => <FancyInput {...input.attrs} /> }}
                />
              )

            // place the city's parts yourself, custom layout
            if (
              node.isField &&
              node.widget === 'input' &&
              node.path === 'address.city'
            ) {
              const { label, input } = node.parts
              return (
                <div
                  style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                >
                  <input.Default /> <label.Default />
                </div>
              )
            }

            // take the reins on the address subtree; defaults resume via Children
            if (node.isGroup && node.path === 'address')
              return (
                <section
                  style={{
                    border: '2px dashed teal',
                    padding: 12,
                    marginBottom: 16,
                  }}
                >
                  <h3 style={{ marginTop: 0 }}>Address (hijacked wrapper)</h3>
                  <node.Children />
                </section>
              )

            // deeper still: render location's children in a custom order
            if (node.isGroup && node.path === 'address.location')
              return (
                <div style={{ display: 'flex', gap: 12 }}>
                  <node.children.longitude.Default />
                  <node.children.latitude.Default />
                </div>
              )

            return <node.Default />
          }}
        />
      </Section>

      <Section title="3. Place-yourself at the ROOT (function children)">
        <FormRenderer form={form}>
          {(root) => (
            <>
              <p style={{ color: '#666' }}>Custom top-level layout:</p>
              <root.children.name.Default />
              <root.children.email.Default />
              <hr />
              <root.children.address.Default />
              <div style={{ marginTop: 12 }}>
                <button type="submit">Submit</button>
              </div>
            </>
          )}
        </FormRenderer>
      </Section>

      <Section title="4. Recursion within recursion — root layout + a scoped renderNode subtree">
        <FormRenderer form={form}>
          {(root) => {
            const theme = root.child('theme')
            const address = root.children.address
            return (
              <>
                <p style={{ color: '#666' }}>
                  Hand-authored root; <code>theme</code> rendered dynamically by
                  name; the <code>address</code> subtree carries its own scoped{' '}
                  <code>renderNode</code>.
                </p>

                {/* static keyed children */}
                <root.children.name.Default />
                <root.children.email.Default />

                {/* dynamic child by relative path */}
                {theme && <theme.Default />}

                {/* render address default, but inject a renderNode scoped to ITS subtree */}
                {address.isGroup && (
                  <address.Default
                    renderNode={(node) => {
                      // deep: tweak just the street label
                      if (
                        node.isField &&
                        node.widget === 'input' &&
                        node.path === 'address.street'
                      )
                        return (
                          <node.Default
                            parts={{
                              label: (label) => (
                                <span>
                                  📍 <label.Default />
                                </span>
                              ),
                            }}
                          />
                        )
                      // deeper: wrap the coordinates group and reorder its children
                      if (node.isGroup && node.path === 'address.location')
                        return (
                          <div
                            style={{
                              background: '#eef6ff',
                              padding: 8,
                              borderRadius: 6,
                            }}
                          >
                            <strong>Coordinates</strong>
                            <div style={{ display: 'flex', gap: 12 }}>
                              <node.children.longitude.Default />
                              <node.children.latitude.Default />
                            </div>
                          </div>
                        )
                      return <node.Default />
                    }}
                  />
                )}

                <div style={{ marginTop: 12 }}>
                  <button type="submit">Submit</button>
                </div>
              </>
            )
          }}
        </FormRenderer>
      </Section>
    </div>
  )
}
