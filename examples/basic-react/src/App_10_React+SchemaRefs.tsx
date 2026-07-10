// Local $ref / $defs resolution in the Core JSON Schema front-end.
//
// The address shape lives once under $defs; shipping and billing both reuse it
// via $ref before jsonSchemaToTree compiles the form tree.
import { useState } from 'react'
import { useFormTree } from '@jsonschema-form/react'
import { jsonSchemaToTree } from '@jsonschema-form/input-jsonschema'
import type { JSONSchema } from '@jsonschema-form/input-jsonschema'

const addressDef = {
  type: 'object',
  title: 'Address',
  properties: {
    street: { type: 'string', title: 'Street' },
    city: { type: 'string', title: 'City' },
    zip: {
      type: 'string',
      title: 'Postal code',
      pattern: '^[0-9]{5}$',
    },
  },
  required: ['street', 'city'],
} as const

const schema = {
  type: 'object',
  title: 'Checkout',
  properties: {
    customerName: {
      type: 'string',
      title: 'Customer name',
    },
    shippingAddress: { $ref: '#/$defs/Address' },
    billingAddress: { $ref: '#/$defs/Address' },
  },
  required: ['customerName', 'shippingAddress'],
  $defs: {
    Address: addressDef,
  },
} as JSONSchema
const tree = jsonSchemaToTree(schema)

function App() {
  const { SchemaFields, submit } = useFormTree(tree)
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(
    null
  )

  return (
    <div>
      <h1>JSON Schema Form — Local $ref / $defs</h1>
      <p>
        The shared <code>Address</code> object is declared once under{' '}
        <code>$defs</code> and referenced twice with <code>$ref</code>. Core
        resolves those local JSON Pointer refs before{' '}
        <code>jsonSchemaToTree</code> runs, so the rendered form matches an
        equivalent inlined schema.
      </p>

      <form onSubmit={submit(setSubmitted)}>
        <SchemaFields />
        <button type="submit">Submit</button>
      </form>

      {submitted && (
        <>
          <p style={{ color: 'green' }}>Submitted:</p>
          <pre>{JSON.stringify(submitted, null, 2)}</pre>
        </>
      )}
    </div>
  )
}

export default App
