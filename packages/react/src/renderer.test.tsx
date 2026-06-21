import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { jsonSchemaToTree } from '@jsonschema-form/core'
import type { JSONSchema } from '@jsonschema-form/core'
import { FormRenderer } from './renderer'

const schema: JSONSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
    color: { type: 'string', title: 'Color', enum: ['red', 'green'] },
    address: {
      type: 'object',
      title: 'Address',
      properties: {
        street: { type: 'string', title: 'Street' },
      },
    },
  },
  required: ['name'],
}

describe('FormRenderer', () => {
  it('renders every node default with no renderNode', async () => {
    const form = jsonSchemaToTree(schema)
    const screen = await render(<FormRenderer form={form} />)

    await expect
      .element(screen.getByRole('textbox', { name: 'Name' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('combobox', { name: 'Color' }))
      .toBeInTheDocument()
    // nested group renders its legend
    await expect.element(screen.getByText('Address')).toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Submit' }))
      .toBeInTheDocument()
  })

  it('renderNode hijacks one node; the rest stay default', async () => {
    const form = jsonSchemaToTree(schema)
    const screen = await render(
      <FormRenderer
        form={form}
        renderNode={(node) =>
          node.isField && node.path === 'name' ? (
            <p>custom-name</p>
          ) : (
            <node.Default />
          )
        }
      />
    )

    await expect.element(screen.getByText('custom-name')).toBeInTheDocument()
    // color is untouched
    await expect
      .element(screen.getByRole('combobox', { name: 'Color' }))
      .toBeInTheDocument()
  })

  it('parts override: swap one part, keep the rest default (input variant)', async () => {
    const form = jsonSchemaToTree(schema)
    const screen = await render(
      <FormRenderer
        form={form}
        renderNode={(node) => {
          // narrowing to the input variant exposes the `input` part override
          if (node.isField && node.widget === 'input' && node.path === 'name') {
            return (
              <node.Default
                parts={{
                  input: (input) => (
                    <input {...input.attrs} data-testid="fancy-input" />
                  ),
                }}
              />
            )
          }
          return <node.Default />
        }}
      />
    )

    // overridden input is present, and the default label still renders
    await expect
      .element(screen.getByTestId('fancy-input'))
      .toBeInTheDocument()
    await expect.element(screen.getByText('Name')).toBeInTheDocument()
  })

  it('place-yourself: compose field parts by hand via part.Default', async () => {
    const form = jsonSchemaToTree(schema)
    const screen = await render(
      <FormRenderer
        form={form}
        renderNode={(node) => {
          if (node.isField && node.widget === 'input' && node.path === 'name') {
            const { label, input } = node.parts
            return (
              <div data-testid="hand-composed">
                <input.Default />
                <label.Default />
              </div>
            )
          }
          return <node.Default />
        }}
      />
    )

    await expect
      .element(screen.getByTestId('hand-composed'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('textbox', { name: 'Name' }))
      .toBeInTheDocument()
  })

  it('place-yourself at the root: custom layout via children render-prop', async () => {
    const form = jsonSchemaToTree(schema)
    const screen = await render(
      <FormRenderer form={form}>
        {(root) => (
          <>
            <root.children.color.Default />
            <p>in-between</p>
            <root.children.name.Default />
          </>
        )}
      </FormRenderer>
    )

    await expect.element(screen.getByText('in-between')).toBeInTheDocument()
    await expect
      .element(screen.getByRole('textbox', { name: 'Name' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('combobox', { name: 'Color' }))
      .toBeInTheDocument()
  })

  it('scoped renderNode applies only within a subtree', async () => {
    const form = jsonSchemaToTree(schema)
    const screen = await render(
      <FormRenderer form={form}>
        {(root) => {
          const address = root.children.address
          return address.isGroup ? (
            <address.Default
              renderNode={(node) =>
                node.isField && node.path === 'address.street' ? (
                  <p>scoped-street</p>
                ) : (
                  <node.Default />
                )
              }
            />
          ) : null
        }}
      </FormRenderer>
    )

    // the scoped override fires inside address…
    await expect.element(screen.getByText('scoped-street')).toBeInTheDocument()
  })
})
