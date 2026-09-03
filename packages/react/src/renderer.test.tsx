import { useState } from 'react'
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

  // A placement scope must be a WHOLE scope, not just the placements that go
  // through `<Default>`. Core `rebind` re-enriches the handle the callback gets,
  // so `<Children>` (and `child()` / `children.x` / `renderItem`) resolve
  // through the scoped intercept too.
  it('<Children/> inside a scoped layout resolves through that layout’s intercept', async () => {
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
                  <p>street-via-children</p>
                ) : (
                  <D of={node} />
                )
              }
              layout={(addr, { Children }) => (
                <div data-testid="addr-children">
                  <Children of={addr} />
                </div>
              )}
            />
          ) : null
        }}
      />
    )

    await expect
      .element(screen.getByTestId('addr-children'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('street-via-children'))
      .toBeInTheDocument()
    // the scoped intercept replaced it — no Street input should survive
    expect(document.querySelector('[name="address.street"]')).toBeNull()
  })

  it('a nested intercept added after first render applies to the layout scope', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    function Toggle() {
      const [on, setOn] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOn(true)}>
            enable scoped
          </button>
          <SchemaFields
            form={form}
            layout={(root, { Default }) => {
              const address = root.children.address
              return address.isGroup ? (
                <Default
                  of={address}
                  intercept={
                    on
                      ? (node, { Default: D }) =>
                          node.path === 'address.street' ? (
                            <p>toggled-street</p>
                          ) : (
                            <D of={node} />
                          )
                      : undefined
                  }
                  layout={(addr, { Children }) => <Children of={addr} />}
                />
              ) : null
            }}
          />
        </>
      )
    }
    const screen = await render(<Toggle />)
    await expect
      .element(screen.getByRole('textbox', { name: 'Street' }))
      .toBeInTheDocument()
    await screen.getByRole('button', { name: 'enable scoped' }).click()
    await expect.element(screen.getByText('toggled-street')).toBeInTheDocument()
  })

  // `parts` is a template instruction, so it deliberately wins over an ambient
  // placement intercept (the inline overlay is the more specific instruction).
  // Pinned because the two cannot compose: an intercept that replaces the node
  // outright has nowhere to apply part overrides.
  it('parts at a placement beat an ambient intercept for that node', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    const screen = await render(
      <SchemaFields
        form={form}
        intercept={{ name: () => <p>intercepted-name</p> }}
        layout={(root, { Default }) => (
          <>
            <Default
              of={root.children.name}
              parts={{ label: () => <span>overlaid-label</span> }}
            />
            <Default of={root.children.color} />
          </>
        )}
      />
    )

    await expect.element(screen.getByText('overlaid-label')).toBeInTheDocument()
    expect(screen.getByText('intercepted-name').elements()).toHaveLength(0)
    // a bare placement in the same layout still resolves through intercept
    await expect
      .element(screen.getByRole('combobox', { name: 'Color' }))
      .toBeInTheDocument()
  })

  // Placements bypass the engine's `combine`, which is what supplies child keys
  // in the normal walk. A layout that REORDERS nodes must key them itself, or
  // React reconciles by position and an uncontrolled input keeps the previous
  // field's value under the new field's name.
  it('keyed placements survive a reorder with values attached to the right field', async () => {
    const form = jsonSchemaToRuntimeTree(schema)
    function Reorderable() {
      const [flip, setFlip] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setFlip((f) => !f)}>
            flip
          </button>
          <SchemaFields
            form={form}
            layout={(root, { Default }) => {
              const order = flip
                ? ['color', 'name']
                : (['name', 'color'] as const)
              return (
                <>
                  {order.map((k) => (
                    <Default key={k} of={root.children[k]} />
                  ))}
                </>
              )
            }}
          />
        </>
      )
    }
    const screen = await render(<Reorderable />)
    await screen.getByRole('textbox', { name: 'Name' }).fill('Ada')

    await screen.getByRole('button', { name: 'flip' }).click()

    const name = document.querySelector<HTMLInputElement>('[name="name"]')
    expect(name?.value).toBe('Ada')
    // Color is still a select, not an input that inherited "Ada"
    await expect
      .element(screen.getByRole('combobox', { name: 'Color' }))
      .toBeInTheDocument()
  })
})

// A custom array layout replaces `array.root`, which is where `createRenderer`
// installs add/remove state (ADR 051 §3 / #145). Without re-installing it the
// Add button is inert and `<Children/>` renders static seed items.
describe('layout on an array keeps add/remove state', () => {
  const arraySchema: JSONSchema = {
    type: 'object',
    properties: {
      contacts: {
        type: 'array',
        title: 'Contacts',
        minItems: 1,
        items: {
          type: 'object',
          properties: { name: { type: 'string', title: 'Contact name' } },
        },
      },
    },
  }

  it('Add appends a live item into a custom array layout', async () => {
    const form = jsonSchemaToRuntimeTree(arraySchema)
    const screen = await render(
      <SchemaFields
        form={form}
        layout={(root, { Default }) => (
          <Default
            of={root.children.contacts}
            layout={(contacts, { Default: D, Children }) =>
              contacts.isArray ? (
                <section data-testid="contacts-layout">
                  <Children of={contacts} />
                  <D of={contacts.parts.addButton} />
                </section>
              ) : null
            }
          />
        )}
      />
    )

    await expect
      .element(screen.getByTestId('contacts-layout'))
      .toBeInTheDocument()

    const inputs = () =>
      document.querySelectorAll<HTMLInputElement>('input[name$=".name"]')
    await expect.poll(() => inputs().length).toBe(1)

    await screen.getByRole('textbox', { name: 'Contact name' }).fill('Alice')
    await screen.getByRole('button', { name: /add/i }).click()

    await expect.poll(() => inputs().length).toBe(2)
    expect(inputs()[0].value).toBe('Alice')
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
