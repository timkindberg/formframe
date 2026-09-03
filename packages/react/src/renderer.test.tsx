import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { jsonSchemaToRuntimeTree } from '@formframe/input-jsonschema'
import type { JSONSchema } from '@formframe/input-jsonschema'
import {
  SchemaFields,
  createRenderer,
  nativeDefaults,
  mergeDefaults,
} from './renderer'

const schema: JSONSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
    // 6 options (> OPTION_COUNT_THRESHOLD) so this stays a <select> — the fixture
    // exercises the combobox/select archetype (small enums default to radio, cm7).
    color: {
      type: 'string',
      title: 'Color',
      enum: ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow'],
    },
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

describe('SchemaFields', () => {
  it('renders every node default with no renderNode', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(<SchemaFields form={form} />)

    await expect
      .element(screen.getByRole('textbox', { name: 'Name' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('combobox', { name: 'Color' }))
      .toBeInTheDocument()
    // nested group renders its legend
    await expect.element(screen.getByText('Address')).toBeInTheDocument()
  })

  it('renders content only — no <form> or submit chrome (consumer owns it)', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    await render(<SchemaFields form={form} />)
    expect(document.querySelector('form')).toBeNull()
    expect(document.querySelector('button[type="submit"]')).toBeNull()
  })

  it('renderNode hijacks one node; the rest stay default', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={(node, { Default }) =>
          node.isField && node.path === 'name' ? (
            <p>custom-name</p>
          ) : (
            <Default of={node} />
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
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={(node, { Default }) => {
          // the unified `control` part is overridable regardless of widget (v60)
          if (node.isField && node.widget === 'input' && node.path === 'name') {
            return (
              <Default
                of={node}
                parts={{
                  control: (control) =>
                    control.kind === 'input' ? (
                      <input {...control.attrs} data-testid="fancy-input" />
                    ) : null,
                }}
              />
            )
          }
          return <Default of={node} />
        }}
      />
    )

    // overridden input is present, and the default label still renders
    await expect.element(screen.getByTestId('fancy-input')).toBeInTheDocument()
    await expect.element(screen.getByText('Name')).toBeInTheDocument()
  })

  it('place-yourself: compose field parts by hand via <Default of={part}/>', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={(node, { Default }) => {
          if (node.isField && node.widget === 'input' && node.path === 'name') {
            const { label, control } = node.parts
            return (
              <div data-testid="hand-composed">
                <Default of={control} />
                <Default of={label} />
              </div>
            )
          }
          return <Default of={node} />
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

  it('place-yourself at the root: custom layout via the layout prop', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        layout={(root, { Default }) => (
          <>
            <Default of={root.children.color} />
            <p>in-between</p>
            <Default of={root.children.name} />
          </>
        )}
      />
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
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        layout={(root, { Default }) => {
          const address = root.children.address
          return address.isGroup ? (
            <Default
              of={address}
              intercept={(node, { Default }) =>
                node.isField && node.path === 'address.street' ? (
                  <p>scoped-street</p>
                ) : (
                  <Default of={node} />
                )
              }
            />
          ) : null
        }}
      />
    )

    // the scoped override fires inside address…
    await expect.element(screen.getByText('scoped-street')).toBeInTheDocument()
  })

  it('layout placements go through SchemaFields intercept', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={{
          name: () => <p>intercepted-name</p>,
        }}
        layout={(root, { Default }) => (
          <>
            <Default of={root.children.name} />
            <Default of={root.children.color} />
          </>
        )}
      />
    )

    await expect
      .element(screen.getByText('intercepted-name'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('combobox', { name: 'Color' }))
      .toBeInTheDocument()
    expect(document.querySelector('input[name="name"]')).toBeNull()
  })

  it('Default accepts layout to place a nested group (fractal SchemaFields)', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        layout={(root, { Default }) => {
          const address = root.children.address
          return address.isGroup ? (
            <Default
              of={address}
              layout={(addr, { Default: D }) => (
                <div data-testid="addr-layout">
                  <D of={addr.children.street} />
                </div>
              )}
            />
          ) : null
        }}
      />
    )

    await expect.element(screen.getByTestId('addr-layout')).toBeInTheDocument()
    await expect
      .element(screen.getByRole('textbox', { name: 'Street' }))
      .toBeInTheDocument()
    expect(document.querySelector('input[name="name"]')).toBeNull()
  })

  it('nested layout placements still go through intercept', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={{
          'address.street': () => <p>intercepted-street</p>,
        }}
        layout={(root, { Default }) => {
          const address = root.children.address
          return address.isGroup ? (
            <Default
              of={address}
              layout={(addr, { Default: D }) => (
                <div data-testid="addr-layout">
                  <D of={addr.children.street} />
                </div>
              )}
            />
          ) : null
        }}
      />
    )

    await expect.element(screen.getByTestId('addr-layout')).toBeInTheDocument()
    await expect
      .element(screen.getByText('intercepted-street'))
      .toBeInTheDocument()
  })

  it('layout + intercept on Default: layout first, intercept on placed nodes', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        layout={(root, { Default }) => {
          const address = root.children.address
          return address.isGroup ? (
            <Default
              of={address}
              intercept={(node, { Default: D }) =>
                node.isField && node.path === 'address.street' ? (
                  <p>scoped-laid-out-street</p>
                ) : (
                  <D of={node} />
                )
              }
              layout={(addr, { Default: D }) => (
                <div data-testid="addr-layout">
                  <D of={addr.children.street} />
                </div>
              )}
            />
          ) : null
        }}
      />
    )

    await expect.element(screen.getByTestId('addr-layout')).toBeInTheDocument()
    await expect
      .element(screen.getByText('scoped-laid-out-street'))
      .toBeInTheDocument()
  })
})

describe('createRenderer — the floor (ADR 013)', () => {
  it('an empty partial set renders diagnostic markers, not real inputs', async () => {
    const Floor = createRenderer({})
    const form = jsonSchemaToRuntimeTree(schema)
    await render(<Floor form={form} />)
    expect(document.querySelector('[data-jsf-not-implemented]')).not.toBeNull()
    expect(document.querySelector('input')).toBeNull()
  })

  it('a supplied entry renders for real; siblings stay diagnostic', async () => {
    const Floor = createRenderer({
      field: {
        control: (control) =>
          control.kind === 'input' ? (
            <input {...control.attrs} data-floor />
          ) : null,
      },
    })
    const form = jsonSchemaToRuntimeTree(schema)
    await render(<Floor form={form} />)
    // the implemented input is real…
    expect(document.querySelector('input[data-floor]')).not.toBeNull()
    // …but its sibling label is still a diagnostic marker
    expect(
      document.querySelector('[data-jsf-not-implemented="label"]')
    ).not.toBeNull()
  })

  it('createRenderer(nativeDefaults) is the batteries SchemaFields', async () => {
    const Floor = createRenderer(nativeDefaults)
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(<Floor form={form} />)
    await expect
      .element(screen.getByRole('textbox', { name: 'Name' }))
      .toBeInTheDocument()
  })

  it('mergeDefaults last-wins per key and leaves untouched slots on the base', () => {
    const customControl = () => <input data-merged />
    const merged = mergeDefaults(nativeDefaults, {
      field: { control: customControl },
    })
    expect(merged.field.control).toBe(customControl)
    expect(merged.field.label).toBe(nativeDefaults.field.label)
    expect(merged.group.root).toBe(nativeDefaults.group.root)
  })
})
